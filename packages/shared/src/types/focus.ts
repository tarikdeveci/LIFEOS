export interface FocusSession {
  id: string
  user_id: string
  block_id: string | null
  task_id: string | null
  started_at: string
  ended_at: string
  minutes: number
  created_at: string
}

export interface CreateFocusSessionInput {
  /** Stable across retries to avoid recording the same work period twice. */
  id?: string
  block_id: string | null
  task_id: string | null
  started_at: string
  ended_at: string
  minutes: number
}

export interface PomodoroConfig {
  workMinutes: number
  breakMinutes: number
}

export interface PomodoroState extends PomodoroConfig {
  phase: 'work' | 'break' | 'ready' | 'stopped'
  phaseStartedAt: number
}
