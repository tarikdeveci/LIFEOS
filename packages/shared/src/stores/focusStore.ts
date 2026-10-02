import { create } from 'zustand'
import { createFocusSession, getFocusSessionsBetween } from '../supabase/focus'
import type { CreateFocusSessionInput, FocusSession, PomodoroState } from '../types/focus'
import { advancePomodoro, completedFocusWork, startPomodoro, stopPomodoro } from '../utils/focus'

interface FocusBlock {
  id: string
  task_id: string | null
  block_type: string
  label: string | null
}

interface ActiveFocus {
  id: string
  userId: string
  blockId: string
  taskId: string | null
  label: string
  timer: PomodoroState
}

interface PendingFocus {
  userId: string
  input: CreateFocusSessionInput
}

type FocusClient = Parameters<typeof createFocusSession>[0]

interface FocusStore {
  active: ActiveFocus | null
  pending: PendingFocus | null
  sessions: FocusSession[]
  sessionsUserId: string | null
  loading: boolean
  saving: boolean
  loadError: boolean
  saveError: boolean
  loadRequest: number
  start: (id: string, userId: string, block: FocusBlock, now: number) => void
  tick: (now: number) => void
  finish: (now: number) => void
  close: () => void
  save: (client: FocusClient, retry?: boolean) => Promise<void>
  load: (client: FocusClient, userId: string, from: string, to: string) => Promise<void>
  /** Çıkışta: süren tur ve oturumlar sonraki hesaba geçmesin. */
  reset: () => void
}

function pendingWork(active: ActiveFocus, now: number): PendingFocus | null {
  const work = completedFocusWork(active.timer, now)
  return work ? {
    userId: active.userId,
    input: { ...work, id: active.id, block_id: active.blockId, task_id: active.taskId },
  } : null
}

/** One active work period per app, shared by timer and planning rows. */
export const useFocusStore = create<FocusStore>((set, get) => ({
  active: null,
  pending: null,
  sessions: [],
  sessionsUserId: null,
  loading: false,
  saving: false,
  loadError: false,
  saveError: false,
  loadRequest: 0,
  reset: () => set((state) => ({
    active: null, pending: null, sessions: [], sessionsUserId: null, loading: false,
    saving: false, loadError: false, saveError: false,
    // Uçuştaki yüklemenin sonucu yok sayılsın.
    loadRequest: state.loadRequest + 1,
  })),
  start: (id, userId, block, now) => {
    const { active, pending, saving } = get()
    if (pending || saving || (active && active.timer.phase !== 'ready' && active.timer.phase !== 'stopped')) return
    set({
      active: {
        id, userId, blockId: block.id,
        taskId: block.block_type === 'task' ? block.task_id : null,
        label: block.label ?? '', timer: startPomodoro(now),
      }, saveError: false,
    })
  },
  tick: (now) => {
    const { active } = get()
    if (!active) return
    const timer = advancePomodoro(active.timer, now)
    if (timer === active.timer) return
    set({ active: { ...active, timer }, pending: get().pending ?? pendingWork(active, now) })
  },
  finish: (now) => {
    const { active } = get()
    if (!active) return
    // Bir dakikadan kısa odak yanlışlıkla başlatılmış sayılır ve kaydedilmez;
    // yoksa en az bir dakika kuralı her yanlış dokunuşu kayda çevirirdi.
    const accidental = active.timer.phase === 'work' && now - active.timer.phaseStartedAt < 60_000
    set({
      active: { ...active, timer: stopPomodoro(active.timer) },
      pending: get().pending ?? (accidental ? null : pendingWork(active, now)),
    })
  },
  close: () => {
    const { active, pending, saving } = get()
    if (!pending && !saving && active?.timer.phase === 'stopped') set({ active: null })
  },
  save: async (client, retry = false) => {
    const { pending, saving, saveError } = get()
    if (!pending || saving || (saveError && !retry)) return
    set({ saving: true, saveError: false })
    // Yanıt gelene kadar store sıfırlanmış (hesap değişmiş) ya da başka kayıt beklemeye girmiş
    // olabilir: eski yanıt yeni bekleyen kaydı silmesin, onun kilidini de açmasın.
    const current = () => get().pending?.input.id === pending.input.id
    try {
      const session = await createFocusSession(client, pending.userId, pending.input)
      if (!current()) return
      set((state) => ({
        pending: null, saving: false,
        sessions: state.sessionsUserId === session.user_id
          ? [...state.sessions.filter((item) => item.id !== session.id), session]
          : state.sessions,
      }))
    } catch (err) {
      if (!current()) return
      // Odak sürerken blok ya da görev silindiyse kayıt FK/RLS'e takılır ve hiç geçmez;
      // pending kalınca zamanlayıcı kilitlenirdi. Bağlantısız olarak bir kez daha dene.
      const code = (err as { code?: string } | null)?.code
      const linked = pending.input.block_id !== null || pending.input.task_id !== null
      if (linked && (code === '23503' || code === '42501')) {
        set({ saving: false, pending: { ...pending, input: { ...pending.input, block_id: null, task_id: null } } })
        return get().save(client, true)
      }
      set({ saving: false, saveError: true })
    }
  },
  load: async (client, userId, from, to) => {
    const request = get().loadRequest + 1
    set((state) => ({
      loadRequest: request, loading: true, loadError: false, sessionsUserId: userId,
      sessions: state.sessionsUserId === userId ? state.sessions : [],
    }))
    try {
      const sessions = await getFocusSessionsBetween(client, userId, from, to)
      if (get().loadRequest !== request) return
      // Keep locally saved sessions if this fetch began before their insert completed.
      set((state) => ({
        sessions: [...new Map([...sessions, ...state.sessions].map((session) => [session.id, session])).values()],
        loading: false,
      }))
    } catch {
      if (get().loadRequest === request) set({ loading: false, loadError: true })
    }
  },
}))

const FOCUS_KEY = 'lifeos.focus.v1'

interface FocusStorage {
  getItem: (key: string) => string | null | Promise<string | null>
  setItem: (key: string, value: string) => unknown
  removeItem: (key: string) => unknown
}

/**
 * Süren odak ve kaydedilmeyi bekleyen süre yalnız bellekteydi: uygulama kapanınca ya da sayfa
 * yenilenince çalışılan süre kayboluyordu. Oturum açılınca bir kez çağrılır: aynı kullanıcının
 * kaydını geri yükler (zamanlayıcı mutlak zamanla çalıştığı için kaldığı yerden sürer), sonra
 * her değişikliği depoya yazar. Dönen fonksiyon aboneliği bitirir.
 */
export async function persistFocus(storage: FocusStorage, userId: string): Promise<() => void> {
  try {
    const raw = await storage.getItem(FOCUS_KEY)
    const saved = raw ? (JSON.parse(raw) as { active?: ActiveFocus | null; pending?: PendingFocus | null }) : null
    const { active, pending } = useFocusStore.getState()
    if (saved && !active && !pending) {
      useFocusStore.setState({
        active: saved.active?.userId === userId ? saved.active : null,
        pending: saved.pending?.userId === userId ? saved.pending : null,
      })
    }
  } catch { /* bozuk kayıt: yok say, aşağıdaki ilk yazma üzerine yazar */ }

  let last: string | null = null
  const write = ({ active, pending }: Pick<FocusStore, 'active' | 'pending'>) => {
    const next = active || pending ? JSON.stringify({ active, pending }) : ''
    if (next === last) return
    last = next
    // Depo hatası (dolu, gizli sekme) odak akışını durdurmasın: yalnız kalıcılık kaybolur.
    try {
      void Promise.resolve(next ? storage.setItem(FOCUS_KEY, next) : storage.removeItem(FOCUS_KEY)).catch(() => undefined)
    } catch { /* yukarıdaki not */ }
  }
  write(useFocusStore.getState())
  return useFocusStore.subscribe(write)
}
