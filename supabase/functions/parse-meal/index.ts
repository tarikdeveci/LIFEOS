// supabase/functions/parse-meal/index.ts
// Serbest Türkçe metin girişini parse ederek besin değerlerini döndürür
// Önce local food_items tablosundan eşleşme arar, eşleşmeyenler için Claude API'ye gönderir

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lifeos.tr',
  'https://www.lifeos.tr',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  }
}

interface MealItem {
  name: string
  amount: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  food_item_id?: string
}

interface ParseRequest {
  raw_input: string
  user_id: string
}

// Tek bir öğün kaleminin makul üst sınırı. Bunun üstü model halüsinasyonudur;
// toplamı bozmasın diye eleriz.
const MAX_ITEM_KCAL = 10_000

/**
 * Claude'dan gelen ham JSON bir sistem sınırıdır — tip iddiası yeterli değil.
 * Sayı yerine string ("250"), eksik alan veya saçma değer gelebiliyor; bunlar
 * doğrudan toplama girerse kalori toplamı string'e dönüşüp bozuluyor.
 */
function sanitizeAiItem(raw: unknown): MealItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
  if (!name) return null

  const num = (value: unknown): number => {
    const n = typeof value === 'number'
      ? value
      : typeof value === 'string' ? parseFloat(value.replace(',', '.')) : NaN
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  const calories = Math.round(num(o['calories']))
  if (calories > MAX_ITEM_KCAL) {
    console.error('AI kalemi makul sınırın üstünde, atlandı:', name, calories)
    return null
  }

  const round1 = (value: unknown) => Math.round(num(value) * 10) / 10

  return {
    name,
    amount: round1(o['amount']),
    unit: typeof o['unit'] === 'string' && o['unit'].trim() ? o['unit'].trim() : 'g',
    calories,
    protein: round1(o['protein']),
    carbs: round1(o['carbs']),
    fat: round1(o['fat']),
    fiber: round1(o['fiber']),
  }
}

async function isProUser(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  const active = data?.status === 'pro_monthly' || data?.status === 'pro_annual'
  const periodEnd = typeof data?.current_period_end === 'string' ? data.current_period_end : null
  const notExpired = periodEnd !== null && new Date(periodEnd) > new Date()

  return active && notExpired
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth token doğrulama
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Yetkisiz erişim' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Auth kullanıcıyı doğrula
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Yetkisiz erişim' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { raw_input, user_id }: ParseRequest = await req.json()

    if (!raw_input || !user_id) {
      return new Response(
        JSON.stringify({ error: 'raw_input ve user_id gerekli' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Sadece kendi user_id'si ile işlem yapabilir
    if (user.id !== user_id) {
      return new Response(
        JSON.stringify({ error: 'Yetkisiz erişim' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Supabase client (service role ile — RLS bypass)
    const allowed = await isProUser(authClient, user.id)
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'AI access requires Pro' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. food_items tablosundan local match ara
    const { data: foodItems } = await supabase
      .from('food_items')
      .select('*')
      .or(`user_id.is.null,user_id.eq.${user_id}`)

    const allFoodItems = foodItems ?? []
    const inputLower = raw_input.toLowerCase()

    // Girişi parçala: önce virgül/satırsonu, yoksa miktar+birim sınırlarından
    function splitMealInput(text: string): string[] {
      const bySeparator = text.split(/[,\n]+/).map((p) => p.trim()).filter(Boolean)
      if (bySeparator.length > 1) return bySeparator
      // Tek satır: "100 gram X 2 tane Y" → her yeni miktar ifadesinden önce böl
      const byUnit = text
        .split(/(?=\b\d+(?:[.,]\d+)?\s*(?:gram|gr|g(?=\s)|adet|tane|ml|litre?|lt|kg|porsiyon)\s)/i)
        .map((p) => p.trim())
        .filter(Boolean)
      return byUnit.length > 1 ? byUnit : [text]
    }

    const parts = splitMealInput(inputLower)

    // DB eşleşmesi: isim/alias part'ın önemli bir bölümünü oluşturmalı (min 4 karakter)
    // ve kısa generic alias'lar (örn. "tavuk") için tam isim eşleşmesi öncelikli
    const matchedItems: MealItem[] = []
    const unmatchedParts: string[] = []

    // Ağırlık/hacim birimleri. Birim de yakalanır: kg/litre gram/ml'ye çevrilir.
    // (Eskiden yalnızca sayı yakalanıyordu; "1 kg tavuk" 1 gram sayılıp 1000 kat
    //  düşük kalori veriyordu.) Uzun alternatifler önce gelmeli ki "kg" → "g" olmasın.
    const WEIGHT_UNIT_RE = /\b(\d+(?:[.,]\d+)?)\s*(kilogram|kg|gram|gr|g|mililitre|ml|litre|lt|l)\b/i
    const UNIT_TO_BASE: Record<string, number> = {
      kilogram: 1000, kg: 1000, gram: 1, gr: 1, g: 1,
      mililitre: 1, ml: 1, litre: 1000, lt: 1000, l: 1000,
    }
    // Porsiyon birimleri → serving_size'ın ne olduğundan bağımsız olarak N × serving
    const PORTION_UNIT_RE = /\b(porsiyon|paket|kutu|şişe|bardak|kap|tabak|kaşık|yk|tk)\b/i
    // Adet birimleri → yalnızca serving_size tek parçaysa (is_countable) N × serving
    const PIECE_UNIT_RE   = /\b(adet|tane|dilim[i]?|parça)\b/i

    // null → miktar güvenle çözülemedi, AI'ya devret
    function resolveAmount(
      part: string,
      servingSize: number,
      isCountable: boolean,
    ): { amount: number; ratio: number } | null {
      const weightMatch = part.match(WEIGHT_UNIT_RE)
      if (weightMatch) {
        const unit = weightMatch[2]!.toLowerCase()
        const grams = parseFloat(weightMatch[1]!.replace(',', '.')) * (UNIT_TO_BASE[unit] ?? 1)
        return { amount: grams, ratio: servingSize > 0 ? grams / servingSize : grams }
      }

      const numMatch = part.match(/(\d+(?:[.,]\d+)?)/)
      const rawNum  = numMatch ? parseFloat(numMatch[1]!.replace(',', '.')) : 1

      // "2 porsiyon pilav" → porsiyon zaten serving_size'ın kendisi
      if (PORTION_UNIT_RE.test(part)) {
        return { amount: rawNum * servingSize, ratio: rawNum }
      }

      // Adet ifadesi ya da çıplak küçük sayı ("3 yumurta", "10 badem")
      if (PIECE_UNIT_RE.test(part) || rawNum <= 10) {
        // serving_size tek parçaysa çarpmak doğru: 3 × 60g yumurta
        if (isCountable) return { amount: rawNum * servingSize, ratio: rawNum }
        // Değilse tahmin yürütme: 10 × 30g badem = 300g olurdu (gerçek ~12g).
        // Model porsiyon kurallarını biliyor, ona bırak.
        return null
      }

      // Çıplak büyük sayı (>10) → gram/ml kabul et: "150 pilav"
      return { amount: rawNum, ratio: servingSize > 0 ? rawNum / servingSize : rawNum }
    }

    for (const part of parts) {
      let matched = false

      // Önce tam isim eşleşmesi dene (daha güvenilir)
      // Eşleşme için: gıdanın adı/alias en az 4 char ve part'ın %40+ olmak zorunda (veya tam eşleşme)
      let bestMatch: (typeof allFoodItems)[0] | null = null
      let bestScore = 0

      for (const food of allFoodItems) {
        const nameLower = food.name.toLowerCase()
        
        // Tam eşleşme kontrolü (part'ın başında veya yanında tam kelime)
        const nameWords = nameLower.split(/\s+/)
        const partWords = part.split(/\s+/)
        
        // Eğer food adının önemli kelimelerinin çoğu part'ta varsa iyi bir eşleşme
        const matchingWords = nameWords.filter((w) => w.length >= 3 && partWords.some((pw) => pw.includes(w) || w.includes(pw)))
        if (nameWords.length > 0 && matchingWords.length / nameWords.length >= 0.6 && nameLower.length >= 4) {
          const matchScore = matchingWords.length / nameWords.length
          if (matchScore > bestScore) {
            bestScore = matchScore
            bestMatch = food
          }
        }
      }

      // English name match (name_en)
      if (!bestMatch || bestScore < 0.8) {
        for (const food of allFoodItems) {
          const nameEnLower = (food.name_en ?? '').toLowerCase()
          if (!nameEnLower || nameEnLower.length < 4) continue
          const nameEnWords = nameEnLower.split(/\s+/)
          const partWords = part.split(/\s+/)
          const matchingWords = nameEnWords.filter((w) => w.length >= 3 && partWords.some((pw) => pw.includes(w) || w.includes(pw)))
          if (nameEnWords.length > 0 && matchingWords.length / nameEnWords.length >= 0.5 && nameEnLower.length >= 4) {
            const matchScore = matchingWords.length / nameEnWords.length
            if (matchScore > bestScore) {
              bestScore = matchScore
              bestMatch = food
            }
          }
        }
      }

      // Alias eşleşmesi (sadece eğer tam isim eşleşmesi iyi değilse)
      if (!bestMatch || bestScore < 0.8) {
        for (const food of allFoodItems) {
          const aliasesLower = (food.aliases ?? []).map((a: string) => a.toLowerCase())

          for (const alias of aliasesLower) {
            // Alias en az 5 karakter ve part'ta yer almalı (substring, prefix match tercih)
            if (alias.length >= 5 && part.includes(alias)) {
              const aliasScore = Math.min(1, alias.length / part.length * 1.5)
              if (aliasScore > bestScore) {
                bestScore = aliasScore
                bestMatch = food
              }
            }
          }
        }
      }

      if (bestMatch && bestScore >= 0.5) {
        const resolved = resolveAmount(part, bestMatch.serving_size, bestMatch.is_countable === true)
        if (resolved) {
          const { amount, ratio } = resolved
          matchedItems.push({
            name: bestMatch.name, amount, unit: bestMatch.serving_unit,
            calories: Math.round(bestMatch.calories * ratio),
            protein: Math.round(bestMatch.protein * ratio * 10) / 10,
            carbs: Math.round(bestMatch.carbs * ratio * 10) / 10,
            fat: Math.round(bestMatch.fat * ratio * 10) / 10,
            fiber: Math.round(bestMatch.fiber * ratio * 10) / 10,
            food_item_id: bestMatch.id,
          })
          matched = true
        }
      }

      if (!matched) {
        unmatchedParts.push(part)
      }
    }

    // 2. Eşleşmeyen parçalar için Claude API
    let aiItems: MealItem[] = []

    if (unmatchedParts.length > 0) {
      const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

      const response = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: `Sen bir beslenme asistanısın. Kullanıcı Türk mutfağı ağırlıklı yemek giriyor.
Her satır/parça ayrı bir yiyecek öğesidir.

MİKTAR KURALLARI (çok önemli):
- "1 adet / 2 tane / 1 porsiyon" → o yiyeceğin ORTALAMA PORSİYONU kadar gram/ml kullan (1g DEĞİL)
  Örnekler: 1 adet bisküvi ≈ 12g, 1 simit ≈ 120g, 1 bardak süt = 200ml, 1 dilim ekmek ≈ 30g, 1 burger ≈ 150-200g
- Gram/ml belirtilmişse direkt kullan
- Miktar yoksa 1 porsiyon varsay

BESIN DEĞERLERİ:
- GERÇEKÇİ değerler kullan, gerçek gıda verilerini biliyorsan onları kullan
- amount alanına HER ZAMAN gram veya ml cinsinden değer gir
- Tavuk kalça ≠ göğsü, tam buğday ≠ beyaz un, pâté ≠ patates, mango ≠ patates
- UYARI: Çok yüksek kalori hesaplaması yapma! Patates 77 kcal/100g, hamburger 250-280 kcal/100g

Sadece JSON array döndür, başka metin yazma.`,
        messages: [
          {
            role: 'user',
            content: `Şu yiyecekleri parse et:\n${unmatchedParts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Format (sadece array):
[{"name": "ad", "amount": gram_sayı, "unit": "g", "calories": kcal, "protein": g, "carbs": g, "fat": g, "fiber": g}]`,
          },
        ],
      })

      // Claude yanıtını parse et
      const textBlock = response.content.find((block) => block.type === 'text')
      if (textBlock && textBlock.type === 'text') {
        try {
          // JSON array'i yakala (bazen markdown code block içinde döner)
          const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const parsed: unknown = JSON.parse(jsonMatch[0])
            aiItems = Array.isArray(parsed)
              ? parsed.map(sanitizeAiItem).filter((item): item is MealItem => item !== null)
              : []
          }
        } catch {
          console.error('Claude yanıtı parse edilemedi:', textBlock.text)
        }
      }
    }

    // 3. Sonuçları birleştir
    const allItems = [...matchedItems, ...aiItems]

    return new Response(
      JSON.stringify({
        items: allItems,
        matched_from_db: matchedItems.length,
        estimated_by_ai: aiItems.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('parse-meal error:', error)
    return new Response(
      JSON.stringify({ error: 'Öğün parse edilirken bir hata oluştu' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
