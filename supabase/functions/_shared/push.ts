// Expo push gönderimi ve ölü token temizliği — iki cron fonksiyonunun ortak hattı.
//
// Eskiden daily-digest de event-notifications da fetch'in yanıtını hiç okumuyordu.
// Expo, geçersiz bir token için HTTP 200 gövdesinde ticket başına hata döndürür;
// okunmadığı için silinmiş/yeniden kurulmuş uygulamaların token'ları push_tokens
// tablosunda sonsuza kadar birikiyordu. Aynı kullanıcının birden çok token satırı
// olması, aynı bildirimin birden çok kez düşmesi demektir — kullanıcının bir
// sabah aynı metni üç kez almasının en olası sebeplerinden biri buydu.
//
// Ticket seviyesindeki hata her ölü token'ı yakalamaz (Expo bir kısmını ancak
// receipt aşamasında bildirir, o da 15 dakika sonra ayrı bir uçtan sorulur).
// Receipt döngüsü bilerek kapsam dışı: ticket seviyesi DeviceNotRegistered'ın
// büyük çoğunluğunu zaten temizliyor ve birikimi durduruyor.

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send'
const CHUNK_SIZE = 100

export interface PushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, string>
  sound?: string
}

interface Ticket {
  status?: string
  message?: string
  details?: { error?: string }
}

// Supabase client'ı yapısal olarak tipliyoruz (npm import yok), _shared/nutrition
// içindeki SupabaseLike ile aynı gerekçe: bu dosya çağıranın client sürümüne
// bağlanmasın.
interface DeleteBuilder extends PromiseLike<{ error: { message: string } | null }> {
  in(column: string, values: readonly string[]): DeleteBuilder
}

export interface PushSupabase {
  from(table: string): { delete(): DeleteBuilder }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  )
}

export interface PushResult {
  /** Expo'nun "ok" ticket'ı döndürdüğü mesaj sayısı. */
  sent: number
  /** Ölü olduğu anlaşılıp push_tokens'tan silinen token sayısı. */
  dropped: number
  /**
   * Teslimi DOĞRULANAMAYAN token'lar — ağ hatası, HTTP hatası ya da ölü token
   * dışında bir ticket hatası. Çağıran bunları gönderilmemiş sayıp idempotans
   * kilidini geri almalı, yoksa bildirim kalıcı olarak kaybolur.
   */
  failed: string[]
}

/**
 * Mesajları Expo'ya gönderir, ölü token'ları push_tokens'tan siler.
 *
 * Gönderim hatası ASLA fırlatılmaz: bir cron koşusunun tamamı tek bir ağ hatası
 * yüzünden düşerse o turdaki bütün kullanıcılar bildirimini kaybeder. Hata
 * yutulmaz da — teslim edilemeyen token'lar `failed` ile geri bildirilir.
 */
export async function sendExpoPush(
  messages: PushMessage[],
  supabase: PushSupabase,
): Promise<PushResult> {
  if (messages.length === 0) return { sent: 0, dropped: 0, failed: [] }

  const deadTokens = new Set<string>()
  const failedTokens = new Set<string>()
  let sent = 0

  for (const chunk of chunkArray(messages, CHUNK_SIZE)) {
    try {
      const response = await fetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })

      if (!response.ok) {
        console.error(`Expo push ${response.status}: ${await response.text()}`)
        for (const message of chunk) failedTokens.add(message.to)
        continue
      }

      const body = await response.json() as { data?: Ticket[] }
      const tickets = Array.isArray(body.data) ? body.data : []

      // Yanıt gövdesi beklenen biçimde değilse hiçbir teslim doğrulanmış sayılmaz.
      if (tickets.length !== chunk.length) {
        console.error(`Expo ticket sayisi uyusmuyor: ${tickets.length} != ${chunk.length}`)
        for (const message of chunk) failedTokens.add(message.to)
        continue
      }

      // Ticket'lar istek sırasıyla birebir hizalı gelir.
      tickets.forEach((ticket, index) => {
        const token = chunk[index]!.to
        if (ticket.status === 'ok') {
          sent++
          return
        }
        if (ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.add(token)
          return
        }
        // Kalıcı mı geçici mi ayırt edilemez (MessageRateExceeded geçicidir).
        // Gönderilmemiş sayılır: bir sonraki koşu yeniden dener.
        console.error(`Expo ticket hatası: ${ticket.details?.error ?? ticket.message}`)
        failedTokens.add(token)
      })
    } catch (error) {
      console.error('Expo push gönderilemedi:', error)
      for (const message of chunk) failedTokens.add(message.to)
    }
  }

  if (deadTokens.size > 0) {
    const { error } = await supabase.from('push_tokens').delete().in('token', [...deadTokens])
    if (error) console.error('Ölü token silinemedi:', error.message)
  }

  return { sent, dropped: deadTokens.size, failed: [...failedTokens] }
}
