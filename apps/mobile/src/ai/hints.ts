import AsyncStorage from '@react-native-async-storage/async-storage'

export type AiHintId = 'nutrition' | 'tasks'

export interface AiHintState {
  lastShownAt?: string
  closedAt?: string
  usedAt?: string
}

export type AiHintsStateMap = Partial<Record<AiHintId, AiHintState>>

const COOLDOWN_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function shouldShowHint(state: AiHintState | undefined, nowMs: number): boolean {
  if (!state) return true

  const { lastShownAt, closedAt, usedAt } = state

  if (lastShownAt) {
    const shownDate = new Date(lastShownAt)
    const nowDate = new Date(nowMs)
    if (
      shownDate.getFullYear() === nowDate.getFullYear() &&
      shownDate.getMonth() === nowDate.getMonth() &&
      shownDate.getDate() === nowDate.getDate()
    ) {
      return false // bugün zaten gösterildi
    }
  }

  if (closedAt) {
    const closedTime = new Date(closedAt).getTime()
    if (nowMs - closedTime < COOLDOWN_DAYS * MS_PER_DAY) return false
  }

  if (usedAt) {
    const usedTime = new Date(usedAt).getTime()
    if (nowMs - usedTime < COOLDOWN_DAYS * MS_PER_DAY) return false
  }

  return true
}

export function getHintStorageKey(userId: string): string {
  return `lifeos_ai_hints:${userId}`
}

export async function loadHintState(userId: string): Promise<AiHintsStateMap> {
  try {
    const str = await AsyncStorage.getItem(getHintStorageKey(userId))
    return str ? (JSON.parse(str) as AiHintsStateMap) : {}
  } catch {
    return {}
  }
}

export async function saveHintState(userId: string, state: AiHintsStateMap): Promise<void> {
  try {
    await AsyncStorage.setItem(getHintStorageKey(userId), JSON.stringify(state))
  } catch {
    // Depolama yazılamazsa ipucu bir sonraki açılışta yine çıkar; zararsız.
  }
}

export function updateHintState(
  currentState: AiHintsStateMap,
  id: AiHintId,
  action: 'show' | 'close' | 'use',
  nowISO: string
): AiHintsStateMap {
  const item = currentState[id] || {}
  const nextItem = { ...item }

  if (action === 'show') nextItem.lastShownAt = nowISO
  if (action === 'close') nextItem.closedAt = nowISO
  if (action === 'use') nextItem.usedAt = nowISO

  return { ...currentState, [id]: nextItem }
}
