/**
 * Edge function (ai-suggest / parse-meal) hatalarını sınıflandırır.
 *
 * Çağrı noktaları eskiden `catch { 'Bir hata oluştu' }` yazıyordu; gerçek sebep
 * hiçbir yere düşmüyordu. Anthropic kredisi bittiğinde uygulama 20 gün boyunca
 * "bir hata oluştu" dedi, kimse nedenini göremedi. Artık:
 *   - kullanıcı ayırt edici ama teknik olmayan bir mesaj görür,
 *   - ham sebep `detail` alanında döner ve konsola/loglara yazılır.
 *
 * Faturalandırma/altyapı detayı KULLANICIYA GÖSTERİLMEZ — "kredi bitti" son
 * kullanıcının sorunu değil, operatörün sorunudur.
 */

export type AiErrorKind =
  /** Oturum yok / süresi dolmuş */
  | 'auth'
  /** Pro üyelik gerekiyor (402) */
  | 'subscription'
  /** Servis geçici olarak çalışmıyor (kredi, kota, sağlayıcı arızası) */
  | 'unavailable'
  | 'unknown'

export interface AiErrorInfo {
  kind: AiErrorKind
  /** Kullanıcıya gösterilebilir metin */
  message: string
  /** Geliştirici için ham sebep — logla, ekranda gösterme */
  detail: string | null
  status: number | null
}

const MESSAGES: Record<AiErrorKind, { tr: string; en: string }> = {
  auth: {
    tr: 'Oturumun sona ermiş. Tekrar giriş yap.',
    en: 'Your session has expired. Please sign in again.',
  },
  subscription: {
    tr: 'Bu özellik LifeOS Pro üyeliği gerektiriyor.',
    en: 'This feature requires a LifeOS Pro membership.',
  },
  unavailable: {
    tr: 'AI servisi şu anda kullanılamıyor. Kısa süre sonra tekrar dene.',
    en: 'The AI service is unavailable right now. Please try again shortly.',
  },
  unknown: {
    tr: 'Bir hata oluştu, tekrar dene.',
    en: 'Something went wrong. Please try again.',
  },
}

/** supabase-js FunctionsHttpError gövdeyi `context` içinde bir Response olarak taşır */
async function readBody(error: unknown): Promise<{ status: number | null; detail: string | null }> {
  const context = (error as { context?: unknown } | null)?.context

  if (context instanceof Response) {
    let detail: string | null = null
    try {
      const body = (await context.clone().json()) as { error?: string; detail?: string }
      detail = body.detail ?? body.error ?? null
    } catch {
      detail = null
    }
    return { status: context.status, detail }
  }

  return {
    status: null,
    detail: error instanceof Error ? error.message : null,
  }
}

function classify(status: number | null, detail: string | null): AiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'subscription'

  const lower = detail?.toLowerCase() ?? ''
  // Anthropic tarafı: kredi bitti / kota doldu / geçici arıza
  if (
    lower.includes('credit balance') ||
    lower.includes('rate limit') ||
    lower.includes('overloaded') ||
    lower.includes('quota')
  ) {
    return 'unavailable'
  }

  if (status !== null && status >= 500) return 'unavailable'
  return 'unknown'
}

/**
 * Hatayı kullanıcıya gösterilecek mesaja çevirir.
 * Dönen `detail`'i çağıran taraf loglamalı — ekrana basmamalı.
 */
export async function describeAiError(
  error: unknown,
  lang: 'tr' | 'en' = 'tr',
): Promise<AiErrorInfo> {
  const { status, detail } = await readBody(error)
  const kind = classify(status, detail)
  return { kind, message: MESSAGES[kind][lang], detail, status }
}
