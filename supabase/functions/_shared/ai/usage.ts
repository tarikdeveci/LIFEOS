// supabase/functions/_shared/ai/usage.ts
//
// AI erişim kapısı ve maliyet defteri. ai-suggest ve parse-meal ikisi de
// buradan karar verir; kural tek yerde durur.
//
// Kurallar:
//   • Free   : yalnızca FREE_KINDS rotaları, ömür boyu 3 kez. Sayaç
//              migration 052'deki ai_allowance() içinde.
//   • Deneme : Pro gibi, bütçesi AI_TRIAL_BUDGET_USD.
//   • Pro    : aylık bütçe kullanıcının ödediği fiyatla ölçeklenir. Bütçe
//              aşılınca sohbetler ucuz modele, öğün ayrıştırma kural katmanına
//              düşer. Bütçenin AI_HARD_CAP_FACTOR katında sohbetler durur (429).
//
// Maliyet her model yanıtının `usage` alanından hesaplanıp `events.ai_used`
// satırının props'una yazılır; ayrı tablo yok (040: aynı olgu tek yerde).

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
  rpc(name: string): PromiseLike<QueryResult>
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

// Ücretsiz kullanıcıya açık rotalar: ürünün vaadi olan gün planı. Sohbet ve
// antrenman koçu açılmıyor, çünkü onlar "bir kez görüp anlama" özelliği değil.
const FREE_KINDS = new Set(['replan'])

// Kullanıcının ödediği AYLIK fiyatın (USD) bu oranı AI'a gidebilir. Fiyat
// bilinmiyorsa (web/PayTR, fiyatı henüz yazılmamış eski abonelik) taban bütçe.
// Hepsi `supabase secrets set` ile koda dokunmadan ayarlanır; ayar için
// analytics.ai_cost_by_user görünümüne bakılır.
const BUDGET_SHARE = envNumber('AI_BUDGET_SHARE', 0.5)
const MIN_BUDGET_USD = envNumber('AI_MIN_BUDGET_USD', 1)
const TRIAL_BUDGET_USD = envNumber('AI_TRIAL_BUDGET_USD', 0.5)
const HARD_CAP_FACTOR = envNumber('AI_HARD_CAP_FACTOR', 3)

function isActivePro(row: Record<string, unknown> | null): boolean {
  const active = row?.['status'] === 'pro_monthly' || row?.['status'] === 'pro_annual'
  const periodEnd = typeof row?.['current_period_end'] === 'string' ? row['current_period_end'] : null
  return active && periodEnd !== null && new Date(periodEnd) > new Date()
}

function monthlyBudgetUsd(row: Record<string, unknown> | null): number {
  const price = Number(row?.['price_usd'])
  if (!Number.isFinite(price) || price <= 0) return MIN_BUDGET_USD
  const monthly = row?.['status'] === 'pro_annual' ? price / 12 : price
  return Math.max(MIN_BUDGET_USD, monthly * BUDGET_SHARE)
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

  if (allowance.monthCostUsd >= budget * HARD_CAP_FACTOR) {
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

/** Anthropic yanıtının maliyet için gereken kısmı. */
export interface MeteredMessage {
  model: string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
}

// USD / 1M token. Önbellek yazımı (5 dk) girdi fiyatının 1,25 katı, okuması
// 0,1 katı. Düşünme token'ları çıktıya dahil gelir ve çıktı fiyatından ödenir.
function pricePerMTok(model: string): { input: number; output: number } {
  if (/opus-(4-[5-9]|5)/.test(model)) return { input: 5, output: 25 }
  if (/sonnet-5/.test(model)) return { input: 2, output: 10 }
  if (/sonnet/.test(model)) return { input: 3, output: 15 }
  if (/haiku/.test(model)) return { input: 1, output: 5 }
  // Bilinmeyen ya da eski Opus: pahalı say, bütçe sessizce gevşemesin.
  return { input: 15, output: 75 }
}

export function costUsd(message: MeteredMessage): number {
  const price = pricePerMTok(message.model)
  const usage = message.usage
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  return (
    usage.input_tokens * price.input
    + cacheWrite * price.input * 1.25
    + cacheRead * price.input * 0.1
    + usage.output_tokens * price.output
  ) / 1_000_000
}

/**
 * Bir isteğin model çağrılarını toplar ve tek `ai_used` satırı olarak yazar.
 *
 * Satır ÇAĞRIDAN SONRA yazılır: model yanıt vermediyse ne maliyet oluşmuştur
 * ne de free kullanıcının hakkı harcanmalıdır. Yazım await edilir; yanıt
 * dönünce bekleyen iş iptal edilebiliyor.
 */
export class AiLedger {
  private calls = 0
  private inputTokens = 0
  private outputTokens = 0
  private cacheReadTokens = 0
  private cacheWriteTokens = 0
  private cost = 0
  private readonly models = new Set<string>()

  constructor(
    private readonly supabase: SupabaseLike,
    private readonly userId: string,
    private readonly kind: string,
    private readonly tier: AiTier,
  ) {}

  add(message: MeteredMessage): void {
    this.calls += 1
    this.inputTokens += message.usage.input_tokens
    this.outputTokens += message.usage.output_tokens
    this.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0
    this.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0
    this.cost += costUsd(message)
    this.models.add(message.model)
  }

  async flush(): Promise<void> {
    if (this.calls === 0) return
    const props = {
      kind: this.kind,
      tier: this.tier,
      model: [...this.models].join(','),
      calls: this.calls,
      input_tokens: this.inputTokens,
      output_tokens: this.outputTokens,
      cache_read_tokens: this.cacheReadTokens,
      cache_write_tokens: this.cacheWriteTokens,
      // 6 hane: 1e-6 altı değerler JSON'a üslü yazılır, ondalık kalsın.
      cost_usd: Math.round(this.cost * 1_000_000) / 1_000_000,
    }
    this.calls = 0
    this.inputTokens = 0
    this.outputTokens = 0
    this.cacheReadTokens = 0
    this.cacheWriteTokens = 0
    this.cost = 0
    this.models.clear()
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

  /** Tek çağrılı rotalar için: ekle ve hemen yaz. */
  async record(message: MeteredMessage): Promise<void> {
    this.add(message)
    await this.flush()
  }
}
