// Pro kilidine dokunulan yerin somut faydası. Kilit metni genel "AI yalnızca Pro'da" yerine
// kullanıcının az önce dokunduğu özelliğin ne işe yaradığını söyler. Metinler i18nAi.ts'te.

export const AI_BENEFIT_KEYS = {
  brain_dump: 'ai_benefit_brain_dump',
  daily_report: 'ai_benefit_daily_report',
  free_limit: 'ai_benefit_free_limit',
  nutrition_chat: 'ai_benefit_nutrition_chat',
  workout_coach: 'ai_benefit_workout_coach',
  task_priority: 'ai_benefit_task_priority',
} as const

export type AiBenefitKey = (typeof AI_BENEFIT_KEYS)[keyof typeof AI_BENEFIT_KEYS] | 'ai_benefit_default'

/** Kaynak bilinmiyorsa ya da tanımsızsa genel fayda metni döner; kilit hiçbir durumda boş kalmaz. */
export function aiBenefitKey(source: string | null | undefined): AiBenefitKey {
  if (source && Object.prototype.hasOwnProperty.call(AI_BENEFIT_KEYS, source)) {
    return AI_BENEFIT_KEYS[source as keyof typeof AI_BENEFIT_KEYS]
  }
  return 'ai_benefit_default'
}

/**
 * Kalan ücretsiz AI hakkı cümlesi gösterilsin mi: yalnızca Pro olmayan ve hakkı en az 1 olan kullanıcıya.
 * null "bilinmiyor" demektir (sayaç okunamadı), bu durumda hiçbir şey söylenmez.
 */
export function shouldShowFreeLeft(isPro: boolean, freeLeft: number | null): freeLeft is number {
  return !isPro && freeLeft !== null && freeLeft > 0
}
