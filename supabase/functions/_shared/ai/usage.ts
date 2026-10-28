// supabase/functions/_shared/ai/usage.ts
//
// AI erişim kapısı ve maliyet defteri. ai-suggest ve parse-meal ikisi de
// buradan karar verir; kural tek yerde durur.
//
// Kurallar:
//   • Free   : yalnızca FREE_KINDS rotaları (freeKinds.ts, erişim kararının
//              tek noktası), ömür boyu 3 kez. Sayaç migration 052'deki
//              ai_allowance() içinde.
//   • Deneme : Pro gibi, bütçesi AI_TRIAL_BUDGET_USD.
//   • Pro    : aylık bütçe net gelirle ölçeklenir. Bütçe aşılınca tüm rotalar
//              yedek (ucuz) modele düşer. Bu ayki maliyet AI_ABUSE_CAP_USD'yi
//              geçerse istekler durur (429), deneme dahil.
//
// Maliyet her model yanıtının `usage` alanından hesaplanıp `events.ai_used`
// satırının props'una yazılır; ayrı tablo yok (040: aynı olgu tek yerde).

import { FREE_KINDS } from './freeKinds.ts'
import type { LlmResult } from './llm/types.ts'

interface QueryError {
  message: string
  /** PostgREST'in verdiği kod (SQLSTATE ya da PGRSTxxx). Ağ hatasında boş. */
  code?: string
}

interface QueryResult {
  data: unknown
  error: QueryError | null
  /** HTTP durumu; istek yanıtsız kaldıysa (ağ hatası) 0. */
  status?: number
}

interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<QueryResult>
      }
    }
    insert(values: Record<string, unknown>): PromiseLike<QueryResult>
  }
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<QueryResult>
}

/** ai_used satırı yazılamazsa kaç kez denensin (kota + maliyet kaydı buna bağlı). */
const LEDGER_WRITE_ATTEMPTS = 3

export type AiTier = 'free' | 'trial' | 'pro'

export type AiAccess =
  | { allowed: true; tier: AiTier; overBudget: boolean }
  | {
      allowed: false
      tier: AiTier
      status: 402 | 429
      code: 'pro_required' | 'ai_budget_exhausted'
      error: string
    }

function envNumber(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// Bütçe kullanıcının NET aylık gelirinin (vergi ve mağaza payı düşülmüş,
// subscriptions.net_monthly_usd) bu oranıdır. Net gelir bilinmiyorsa sabit
// varsayılan. Elle verilen hesaplar ai_budget_override_usd ile sabitlenir.
// Hepsi `supabase secrets set` ile koda dokunmadan ayarlanır; ayar için
// analytics.ai_cost_by_user görünümüne bakılır.
const BUDGET_SHARE = envNumber('AI_BUDGET_SHARE', 0.4)
const DEFAULT_BUDGET_USD = envNumber('AI_DEFAULT_BUDGET_USD', 0.38)
const TRIAL_BUDGET_USD = envNumber('AI_TRIAL_BUDGET_USD', 0.5)
// Sert sınır yerine kötüye kullanım koruması: bu ayki toplam maliyet bunu geçerse 429.
const ABUSE_CAP_USD = envNumber('AI_ABUSE_CAP_USD', 5)

function isActivePro(row: Record<string, unknown> | null): boolean {
  const active = row?.['status'] === 'pro_monthly' || row?.['status'] === 'pro_annual'
  const periodEnd = typeof row?.['current_period_end'] === 'string' ? row['current_period_end'] : null
  return active && periodEnd !== null && new Date(periodEnd) > new Date()
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function monthlyBudgetUsd(row: Record<string, unknown> | null): number {
  const override = positiveNumber(row?.['ai_budget_override_usd'])
  if (override !== null) return override
  const net = positiveNumber(row?.['net_monthly_usd'])
  return net !== null ? net * BUDGET_SHARE : DEFAULT_BUDGET_USD
}

interface Allowance {
  freePlansLeft: number
  monthCostUsd: number
}

function readAllowance(data: unknown): Allowance {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined
  const left = Number(row?.['free_plans_left'])
  const cost = Number(row?.['month_cost_usd'])
  return {
    freePlansLeft: Number.isFinite(left) ? left : 0,
    monthCostUsd: Number.isFinite(cost) ? cost : 0,
  }
}

/**
 * Bu kullanıcı bu rotayı şimdi kullanabilir mi, hangi katmanda?
 *
 * `supabase` kullanıcının JWT'siyle çalışan istemci olmalı: ai_allowance()
 * auth.uid() üzerinden yalnızca çağıranın satırlarını sayar. Yanlışlıkla
 * service role istemcisi geçilirse auth.uid() NULL olur ve fonksiyon 053'ten
 * beri hata fırlatır; aşağıdaki hata yolu devreye girip free kullanıcıyı
 * kapatır. Eskiden sayaç sessizce "3 hak" dönüyordu.
 *
 * Sayaç okunamazsa (052 henüz uygulanmamış, ağ hatası, kimliksiz istemci) free
 * kullanıcı için kapalı, Pro için açık davranır: bugünkü davranış korunur.
 */
export async function resolveAiAccess(supabase: SupabaseLike, userId: string, kind: string): Promise<AiAccess> {
  const client = supabase
  const [subscription, allowanceResult] = await Promise.all([
    // '*': 052'nin kolonlarını adıyla istemek, migration'dan önce deploy
    // edilirse sorguyu düşürür ve her Pro kullanıcıyı 402'ye iterdi.
    client.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    client.rpc('ai_allowance'),
  ])
  if (allowanceResult.error) console.error('ai_allowance okunamadı:', allowanceResult.error.message)

  const row = (subscription.data ?? null) as Record<string, unknown> | null
  const allowance = readAllowance(allowanceResult.error ? null : allowanceResult.data)

  if (!isActivePro(row)) {
    if (FREE_KINDS.has(kind) && allowance.freePlansLeft > 0) {
      return { allowed: true, tier: 'free', overBudget: false }
    }
    return { allowed: false, tier: 'free', status: 402, code: 'pro_required', error: 'AI access requires Pro' }
  }

  const tier: AiTier = row?.['period_type'] === 'trial' ? 'trial' : 'pro'
  const budget = tier === 'trial' ? TRIAL_BUDGET_USD : monthlyBudgetUsd(row)

  if (allowance.monthCostUsd >= ABUSE_CAP_USD) {
    return {
      allowed: false,
      tier,
      status: 429,
      code: 'ai_budget_exhausted',
      error: 'Monthly AI limit reached',
    }
  }
  return { allowed: true, tier, overBudget: allowance.monthCostUsd >= budget }
}

/** Ücretsiz katmanda başarısız çağrının `kind`'ı: FREE_KINDS dışında, hak saymaz. */
export function failedKind(kind: string): string {
  return `${kind}_failed`
}

/**
 * Bir isteğin model çağrılarını toplar ve tek `ai_used` satırı olarak yazar.
 *
 * Pro/deneme: satır ÇAĞRIDAN SONRA yazılır; model yanıt vermediyse ne maliyet
 * oluşmuştur ne de bir şey sayılmalıdır. Yazım await edilir; yanıt dönünce
 * bekleyen iş iptal edilebiliyor.
 *
 * Ücretsiz: hak kontrolü ile çağrı arasında yarış vardı (aynı anda N istek
 * hepsi geçiyordu). Bu yüzden `begin()` model çağrısından ÖNCE, reserve_ai_use
 * (065) ile kullanıcı başına kilitli ve atomik bir rezervasyon satırı yazar;
 * ai_allowance() o satırı hemen sayar. Yanıt gelince maliyet aynı satıra
 * işlenir (settle_ai_use, yalnızca service_role). Çağrı başarısızsa
 * (`markFailed`, `abandon`, max_tokens) satırın kind'ı FREE_KINDS dışına
 * çevrilir: maliyet yazılır, hak yanmaz. İstek yarıda ölürse (zaman aşımı)
 * rezervasyon açık kalır ve hak yanar: bilinmezlikte fazla saymak, bedava
 * hak vermekten iyidir.
 */
export class AiLedger {
  private calls = 0
  private inputTokens = 0
  private outputTokens = 0
  private cacheReadTokens = 0
  private cacheWriteTokens = 0
  private cost = 0
  private textChars = 0
  private readonly models = new Set<string>()
  private readonly routes = new Set<string>()
  private fellBack = false
  // Istegin tamami icin: flush partiyi sifirlar ama bildirim ve yanit modu flush'tan sonra okur.
  private requestCalls = 0
  private requestFellBack = false
  private reservationId: number | null = null
  private failed = false

  private readonly supabase: SupabaseLike
  private readonly userId: string
  private readonly kind: string
  private readonly tier: AiTier
  private readonly settleClient: SupabaseLike | null

  /**
   * `settleClient`: service role istemcisi. Yalnızca ücretsiz katmanda gerekir;
   * kullanıcının kendi JWT'siyle satır güncellenemez (events yalnızca INSERT).
   * (Alanlar açık tanımlı: Node'un strip-only modu parametre özelliği desteklemiyor.)
   */
  constructor(
    supabase: SupabaseLike,
    userId: string,
    kind: string,
    tier: AiTier,
    settleClient: SupabaseLike | null = null,
  ) {
    this.supabase = supabase
    this.userId = userId
    this.kind = kind
    this.tier = tier
    this.settleClient = settleClient
  }

  /**
   * Model çağrısından önce çağrılır. Ücretsiz katmanda hakkı atomik olarak
   * ayırır; hak yoksa ya da ayrılamadıysa false (rota 402 döner). Diğer
   * katmanlarda bir şey yapmaz.
   */
  async begin(): Promise<boolean> {
    if (this.tier !== 'free' || this.reservationId !== null) return true
    try {
      const { data, error } = await this.supabase.rpc('reserve_ai_use', { p_kind: this.kind })
      if (error) {
        console.error('reserve_ai_use basarisiz:', error.message)
        return false
      }
      const id = typeof data === 'number' || typeof data === 'string' ? Number(data) : NaN
      if (!Number.isFinite(id)) return false
      this.reservationId = id
      return true
    } catch (err) {
      console.error('reserve_ai_use basarisiz:', err instanceof Error ? err.message : err)
      return false
    }
  }

  /** Bu isteğin çağrısı kullanılamaz sonuç verdi (ayrıştırılamadı): hak yanmasın. */
  markFailed(): void {
    this.failed = true
  }

  /** Model hiç yanıt vermediyse (fırlattı): rezervasyonu hak saymayacak şekilde kapat. */
  async abandon(): Promise<void> {
    if (this.reservationId === null) return
    this.failed = true
    await this.settle(this.buildProps(true))
  }

  /** Bu istekte yedek model çalıştıysa 'fallback', yalnız birinci modelse 'primary', çağrı yoksa null. */
  mode(): 'primary' | 'fallback' | null {
    if (this.requestCalls === 0) return null
    return this.requestFellBack ? 'fallback' : 'primary'
  }

  add(result: LlmResult): void {
    this.calls += 1
    this.requestCalls += 1
    this.inputTokens += result.usage.input
    this.outputTokens += result.usage.output
    this.cacheReadTokens += result.usage.cacheRead
    this.cacheWriteTokens += result.usage.cacheWrite
    this.cost += result.costUsd
    this.textChars += result.text.length + (result.toolInput ? JSON.stringify(result.toolInput).length : 0)
    this.models.add(result.apiModel)
    this.routes.add(result.route)
    if (result.mode === 'fallback') {
      this.fellBack = true
      this.requestFellBack = true
    }
    if (result.stopReason === 'max_tokens') this.failed = true
  }

  private buildProps(reset: boolean): Record<string, unknown> {
    const props = {
      kind: this.failed && this.reservationId !== null ? failedKind(this.kind) : this.kind,
      tier: this.tier,
      model: [...this.models].join(','),
      route: [...this.routes].join(','),
      mode: this.calls === 0 ? null : this.fellBack ? 'fallback' : 'primary',
      text_chars: this.textChars,
      parse_ok: !this.failed,
      calls: this.calls,
      input_tokens: this.inputTokens,
      output_tokens: this.outputTokens,
      cache_read_tokens: this.cacheReadTokens,
      cache_write_tokens: this.cacheWriteTokens,
      // 6 hane: 1e-6 altı değerler JSON'a üslü yazılır, ondalık kalsın.
      cost_usd: Math.round(this.cost * 1_000_000) / 1_000_000,
    }
    if (reset) {
      this.calls = 0
      this.inputTokens = 0
      this.outputTokens = 0
      this.cacheReadTokens = 0
      this.cacheWriteTokens = 0
      this.cost = 0
      this.textChars = 0
      this.models.clear()
      this.routes.clear()
      this.fellBack = false
    }
    return props
  }

  async flush(): Promise<void> {
    if (this.calls === 0) return
    const props = this.buildProps(true)
    if (this.reservationId !== null) {
      await this.settle(props)
      return
    }
    if (await this.insertEvent(props)) return

    // Buraya düşmek iki şey demek: bu çağrının maliyeti hiçbir yerde yok ve
    // free kullanıcının hakkı düşmedi (kota `ai_used` satırlarından sayılıyor).
    // Satırı logda tam hâliyle bırak: gerekirse elle geri yazılabilsin.
    console.error(
      `KRITIK: ai_used yazilamadi, kota ve maliyet kaydi kayip (user ${this.userId}):`,
      JSON.stringify(props),
    )
  }

  /**
   * Rezervasyon satırına son props'u yazar. settle_ai_use idempotent (yalnızca
   * hâlâ `reserved` olan satırı günceller), bu yüzden yanıtsız kalan istekte de
   * güvenle tekrar denenir.
   */
  private async settle(props: Record<string, unknown>): Promise<void> {
    const id = this.reservationId
    const client = this.settleClient
    if (id === null) return
    this.reservationId = null
    for (let attempt = 1; client && attempt <= LEDGER_WRITE_ATTEMPTS; attempt++) {
      try {
        const { error } = await client.rpc('settle_ai_use', { p_user_id: this.userId, p_id: id, p_props: props })
        if (!error) return
        console.error(`settle_ai_use basarisiz (${attempt}/${LEDGER_WRITE_ATTEMPTS}):`, error.message)
      } catch (err) {
        console.error(
          `settle_ai_use basarisiz (${attempt}/${LEDGER_WRITE_ATTEMPTS}):`,
          err instanceof Error ? err.message : err,
        )
      }
      if (attempt < LEDGER_WRITE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
    }
    // Satır `reserved` kaldı: hak yanmış sayılır, maliyet 0. Elle düzeltilebilsin.
    console.error(
      `KRITIK: rezervasyon kapatilamadi (user ${this.userId}, satir ${id}):`,
      JSON.stringify(props),
    )
  }

  /**
   * Ölçüm satırını yazar. Tek denemede bırakmak, sunucunun geçici olarak
   * reddettiği (bağlantı havuzu dolu, serialization) durumlarda free kullanıcıya
   * sessizce fazladan hak veriyordu; kota da maliyet de bu satıra bağlı.
   *
   * YALNIZCA sunucunun yanıtladığı hatalarda tekrar denenir. Yanıtsız kalan bir
   * istek (ağ koptu, zaman aşımı) satırın yazılıp yazılmadığını bilmediğimiz tek
   * durum: orada tekrar denemek AYNI satırı ikinci kez yazabilir. Events'te
   * tekilleştirme anahtarı yok ve çift satır free kullanıcının hakkını
   * sessizce yer. Bilinmezlikte eksik saymak, fazla saymaya yeğdir.
   */
  private async insertEvent(props: Record<string, unknown>): Promise<boolean> {
    for (let attempt = 1; attempt <= LEDGER_WRITE_ATTEMPTS; attempt++) {
      let retryable = false
      try {
        const { error, status } = await this.supabase
          .from('events')
          .insert({ user_id: this.userId, name: 'ai_used', props })
        if (!error) return true
        // Sunucu yanıt verdiyse (durum + kod var) işlem geri alınmıştır.
        retryable = (status ?? 0) >= 400 && (error.code ?? '') !== ''
        console.error(`ai_used yazilamadi (${attempt}/${LEDGER_WRITE_ATTEMPTS}):`, error.message)
      } catch (err) {
        console.error(
          `ai_used yazilamadi (${attempt}/${LEDGER_WRITE_ATTEMPTS}):`,
          err instanceof Error ? err.message : err,
        )
      }
      if (!retryable) return false
      if (attempt < LEDGER_WRITE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
      }
    }
    return false
  }
}
