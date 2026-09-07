// Gömme (embedding) adaptörü.
//
// Neden Anthropic değil: Anthropic'in bir embeddings uç noktası yok. Claude bu
// hatta üç iş yapıyor (çıkarım, doğrulama, tahmin) ama metni vektöre çeviremez.
// O yüzden semantik katman ayrı bir sağlayıcıya bağlı ve ANAHTARSIZ ÇALIŞMALI:
// OPENAI_API_KEY tanımlı değilse embedder hiç kurulmaz, repo boş dizi döndürür,
// merdiven bir aday kaynağı eksik olarak çalışmaya devam eder.
//
// Boyut 512: text-embedding-3-small Matryoshka eğitimli, `dimensions` ile
// kısaltılan vektör yeniden normalize edilmiş olarak döner. 1536 yerine 512
// kullanmak korpusta 89 MB yerine 30 MB yer tutuyor. Bu sayı migration
// 042'deki vector(512) ile AYNI olmak zorunda — biri değişirse diğeri de.

import type { Embedder } from '../types.ts'

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 512

/** Tek istekte gömülecek azami metin — sorgu tarafında bir kelimeden ibaret. */
const MAX_INPUT_CHARS = 800

interface EmbeddingResponse {
  data?: { embedding?: number[] }[]
  error?: { message?: string }
}

export interface OpenAIEmbedderOptions {
  apiKey: string
  model?: string
  dimensions?: number
  /** Ağ takılırsa öğün çözümlemesi beklemesin. */
  timeoutMs?: number
}

export function createOpenAIEmbedder(options: OpenAIEmbedderOptions): Embedder {
  const model = options.model ?? EMBEDDING_MODEL
  const dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS
  const timeoutMs = options.timeoutMs ?? 5000

  return {
    name: `openai:${model}`,

    async embed(text: string): Promise<number[] | null> {
      const input = text.trim().slice(0, MAX_INPUT_CHARS)
      if (!input) return null

      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), timeoutMs)
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, input, dimensions }),
          signal: abort.signal,
        })

        if (!response.ok) {
          console.error(`embedding isteği başarısız (${response.status}):`, await response.text())
          return null
        }

        const payload = await response.json() as EmbeddingResponse
        const vector = payload.data?.[0]?.embedding
        if (!Array.isArray(vector) || vector.length !== dimensions) {
          // Boyut uyuşmazlığı sessiz geçilemez: pgvector reddedeceği için arama
          // her seferinde boş döner ve sebebi görünmez olur.
          console.error(`embedding boyutu beklenenden farklı: ${vector?.length} ≠ ${dimensions}`)
          return null
        }
        return vector
      } catch (error) {
        console.error('embedding alınamadı:', error)
        return null
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
