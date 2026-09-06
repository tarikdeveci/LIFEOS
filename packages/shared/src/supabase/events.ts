import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/**
 * Ölçülen olaylar. Küme migration 040'taki CHECK kısıtıyla birebir aynı —
 * buraya yeni bir ad eklemek tek başına yetmez, migration da gerekir.
 *
 * Liste kasıtlı olarak kısa. Kayıt, ilk plan, tamamlanan görev ve kaydedilen
 * öğün zaten kendi tablolarında tarihleriyle duruyor; onlar `analytics`
 * şemasındaki görünümlerden okunuyor. Buraya yalnızca hiçbir tabloda izi
 * olmayan olaylar yazılır — aynı olguyu iki yere yazmak, sayılar çeliştiğinde
 * ölçümün tamamına olan güveni bitirir.
 *
 * Abonelik olayları (deneme, ödeme, iptal) da aynı gerekçeyle yok:
 * RevenueCat onları zaten ölçüyor.
 */
export type EventName =
  | 'paywall_view'
  | 'ai_used'

type EventProps = Record<string, string | number | boolean | null>

/**
 * Web'de `document` var, React Native'de yok. Web için ayrıca bir başlatma
 * çağrısı gerekmesin diye sezgiyle doldurulur; mobil açılışta
 * `configureEvents(Platform.OS)` ile 'ios'/'android' olarak ezer.
 */
let platform: string | null = typeof document === 'undefined' ? null : 'web'

/**
 * Mobil uygulama açılışında bir kez çağrılır: `configureEvents(Platform.OS)`.
 * Play yayına çıktığında iOS ve Android hunilerini ayrı okuyabilmek için
 * gerekli — tek bir birleşik oran hangi platformun tıkandığını gizler.
 */
export function configureEvents(value: string): void {
  platform = value
}

/**
 * Bir ürün olayı yaz.
 *
 * ASLA hata fırlatmaz ve çağıranı bloklamaz: ölçüm, ölçtüğü işin yan işidir.
 * Bir görevin tamamlanması, analitik isteği başarısız oldu diye başarısız
 * olamaz. Çağrı yerlerinde `void track(...)` biçiminde kullan.
 *
 * `props` içine KİŞİSEL VERİ YAZMA — görev başlığı, öğün metni, e-posta.
 * Ölçüm için sayılar ve kategoriler yeterli.
 */
export async function track(
  supabase: Supabase,
  userId: string,
  name: EventName,
  props: EventProps = {},
): Promise<void> {
  try {
    await supabase.from('events').insert({ user_id: userId, name, props, platform })
  } catch {
    // Sessiz. Ölçüm isteğinin başarısız olması, ölçtüğü işi başarısız edemez.
  }
}
