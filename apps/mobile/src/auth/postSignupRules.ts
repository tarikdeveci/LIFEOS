// "Hesap açılınca paywall bir kez" kuralının saf kısmı (spec 8.7). Depolama ve gezinme dışarıda.

export type PostSignupValue = 'pending_ai' | 'shown'

/** "Hesabın kaydedildi" onayından sonra: AI kapısından gelen paywall'ı ilk AI sonucuna bekletir. */
export function afterConfirmation(reason: string | undefined): { write: PostSignupValue; openNow: boolean } {
  return reason === 'ai' ? { write: 'pending_ai', openNow: false } : { write: 'shown', openNow: true }
}

/** Bir AI sonucu ekrana geldiğinde: yalnızca bekleyen paywall bir kez açılır. */
export function afterAiResult(stored: string | null): { write: PostSignupValue | null; open: boolean } {
  return stored === 'pending_ai' ? { write: 'shown', open: true } : { write: null, open: false }
}

export function postSignupKey(userId: string): string {
  return `lifeos_post_signup_paywall:${userId}`
}
