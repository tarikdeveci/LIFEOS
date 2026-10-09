import type { FocusSession, PomodoroConfig, PomodoroState } from '../types/focus'
import type { TimeBlock } from '../types/planning'
import { blockTimingForDate } from './schedule'

export const DEFAULT_POMODORO: Readonly<PomodoroConfig> = { workMinutes: 25, breakMinutes: 5 }

/** Bloğun bitimine bundan az kalsa da tur en az bu kadar sürer. */
export const MIN_FOCUS_MINUTES = 5

/**
 * Tur süresi: süren blokta bloğun bitişini aşmaz (en az MIN_FOCUS_MINUTES), blok
 * sürmüyorsa varsayılan. 15 dakikası kalan blokta 25 dakikalık tur başlıyordu.
 */
export function focusWorkMinutes(
  block: Pick<TimeBlock, 'start_time' | 'end_time' | 'date'> | null | undefined,
  now: Date = new Date(),
): number {
  const base = DEFAULT_POMODORO.workMinutes
  if (!block) return base
  const timing = blockTimingForDate(block, now)
  if (timing.phase !== 'active') return base
  return Math.min(base, Math.max(MIN_FOCUS_MINUTES, timing.remainingMinutes))
}

/**
 * Odak oturumu kimliği (UUID v4 biçimi). Güvenlik anahtarı değil, tekrar denemede aynı
 * kaydı iki kez yazmamak için. React Native'de `crypto.randomUUID` yok; yerel modül
 * eklemek OTA güncellemeyi bozacağı için o durumda Math.random ile üretilir.
 */
export function newFocusSessionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16)
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function startPomodoro(now: number, config: PomodoroConfig = DEFAULT_POMODORO): PomodoroState {
  if (!Number.isFinite(now) || ![config.workMinutes, config.breakMinutes].every(
    (minutes) => Number.isInteger(minutes) && minutes >= 1 && minutes <= 600,
  )) throw new RangeError('Invalid pomodoro configuration')
  return { ...config, phase: 'work', phaseStartedAt: now }
}

export function pomodoroDeadline(state: PomodoroState): number {
  const minutes = state.phase === 'work' ? state.workMinutes : state.breakMinutes
  return state.phaseStartedAt + minutes * 60_000
}

export function remainingFocusSeconds(state: PomodoroState, now: number): number {
  if (state.phase === 'ready' || state.phase === 'stopped') return 0
  const duration = (state.phase === 'work' ? state.workMinutes : state.breakMinutes) * 60
  return Math.min(duration, Math.max(0, Math.ceil((pomodoroDeadline(state) - now) / 1000)))
}

/** Catch up once after suspension; another work period always needs a user action. */
export function advancePomodoro(state: PomodoroState, now: number): PomodoroState {
  if (state.phase === 'ready' || state.phase === 'stopped' || now < pomodoroDeadline(state)) return state
  if (state.phase === 'break') return { ...state, phase: 'ready' }
  const rest: PomodoroState = { ...state, phase: 'break', phaseStartedAt: pomodoroDeadline(state) }
  return now >= pomodoroDeadline(rest) ? { ...rest, phase: 'ready' } : rest
}

export function stopPomodoro(state: PomodoroState): PomodoroState {
  return { ...state, phase: 'stopped' }
}

/** Only work counts, capped at its deadline, with a one minute minimum. */
export function completedFocusWork(state: PomodoroState, now: number): {
  started_at: string; ended_at: string; minutes: number
} | null {
  if (state.phase !== 'work') return null
  const end = Math.max(state.phaseStartedAt + 1, Math.min(now, pomodoroDeadline(state)))
  return {
    started_at: new Date(state.phaseStartedAt).toISOString(),
    ended_at: new Date(end).toISOString(),
    minutes: Math.max(1, Math.min(600, Math.floor((end - state.phaseStartedAt) / 60_000))),
  }
}

export function focusMinutesByBlock(sessions: readonly Pick<FocusSession, 'block_id' | 'minutes'>[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const session of sessions) {
    if (session.block_id) totals.set(session.block_id, (totals.get(session.block_id) ?? 0) + session.minutes)
  }
  return totals
}
