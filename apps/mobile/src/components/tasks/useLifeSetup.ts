import { useRef, useState } from 'react'
import {
  describeAiError,
  LIFE_SETUP_TEXT_MAX,
  useGoalStore,
  useRoutineStore,
  useTaskStore,
  type LifeSetupProposal,
  type PlanningRules,
} from '@lifeos/shared'
import { applyLifeSetup, requestLifeSetup, type ApplyProgress } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'

export type RuleKey = keyof PlanningRules

/** Öğe bazında tik durumu. Sıralar öneri listeleriyle aynıdır. */
export interface Selection {
  routines: boolean[]
  goals: boolean[]
  tasks: boolean[]
  rules: Partial<Record<RuleKey, boolean>>
}

/** Yazılanlar. Hedef: 1 = satır yazıldı, adımlar yazılmadı; 2 = adımlarıyla birlikte tamam. */
export interface Written {
  routines: boolean[]
  goals: Array<0 | 1 | 2>
  tasks: boolean[]
  rules: Partial<Record<RuleKey, boolean>>
}

const RULE_KEYS: RuleKey[] = ['max_deep_tasks', 'rollover', 'buffer_minutes', 'about']

export function ruleKeysOf(proposal: LifeSetupProposal): RuleKey[] {
  return RULE_KEYS.filter((key) => proposal.rules[key] !== undefined)
}

function initialSelection(p: LifeSetupProposal): Selection {
  return {
    routines: p.routines.map(() => true),
    goals: p.goals.map(() => true),
    tasks: p.tasks.map(() => true),
    rules: Object.fromEntries(ruleKeysOf(p).map((key) => [key, true])),
  }
}

function emptyWritten(p: LifeSetupProposal): Written {
  return {
    routines: p.routines.map(() => false),
    goals: p.goals.map(() => 0),
    tasks: p.tasks.map(() => false),
    rules: {},
  }
}

function cloneWritten(w: Written): Written {
  return { routines: [...w.routines], goals: [...w.goals], tasks: [...w.tasks], rules: { ...w.rules } }
}

/** Seçili ve henüz yazılmamış satırların sıraları. */
function pending(selected: boolean[], done: boolean[]): number[] {
  return selected.flatMap((on, i) => (on && !done[i] ? [i] : []))
}

/** Hedef 2'ye (adımlarıyla tamam) kadar bekler; 1 olan hedefin yalnızca adımları yeniden yazılır. */
function pendingGoals(selected: boolean[], done: Array<0 | 1 | 2>): number[] {
  return selected.flatMap((on, i) => (on && done[i]! < 2 ? [i] : []))
}

function countPending(p: LifeSetupProposal, sel: Selection, w: Written): number {
  const rules = ruleKeysOf(p).filter((key) => sel.rules[key] && !w.rules[key]).length
  return pending(sel.routines, w.routines).length + pendingGoals(sel.goals, w.goals).length
    + pending(sel.tasks, w.tasks).length + rules
}

function anyWritten(w: Written): boolean {
  return w.routines.some(Boolean) || w.goals.some((x) => x > 0) || w.tasks.some(Boolean)
    || Object.values(w.rules).some(Boolean)
}

/** Kurulum akışının tüm durumu: metin, öneri, tikler, yazılanlar, meşgul ve hata. */
export function useLifeSetup(userId: string | null, requirePro: (source?: string) => boolean, onDone: () => void) {
  const { t, lang } = useLang()
  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<LifeSetupProposal | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [written, setWritten] = useState<Written | null>(null)
  const [busy, setBusy] = useState<'ai' | 'apply' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // State güncellemesi bir sonraki render'da görünür; çift dokunuş bu kilide takılır.
  const lock = useRef(false)
  // Hedef satırı yazılmış, adımları yazılamamış hedeflerin kimliği (önerideki sıraya göre).
  const goalIds = useRef<Array<string | null>>([])

  function reset() {
    setText(''); setProposal(null); setSelection(null); setWritten(null); setError(null); setBusy(null)
    lock.current = false
    goalIds.current = []
  }

  function backToText() {
    if (lock.current) return
    goalIds.current = []
    setProposal(null); setSelection(null); setWritten(null); setError(null)
  }

  async function extract() {
    if (lock.current) return
    const trimmed = text.trim()
    if (!trimmed) { setError(t.setup_err_empty); return }
    lock.current = true
    setBusy('ai')
    setError(null)
    try {
      const result = await requestLifeSetup(supabase, trimmed, lang)
      goalIds.current = []
      setProposal(result)
      setSelection(initialSelection(result))
      setWritten(emptyWritten(result))
    } catch (err) {
      const info = await describeAiError(err, lang)
      const detail = info.detail ?? ''
      if (info.status === 400 && detail.includes('text_too_long')) setError(t.setup_err_too_long)
      else if (info.status === 400 && detail.includes('text_empty')) setError(t.setup_err_empty)
      else if (info.kind === 'subscription') {
        // Ücretsiz hak bitti: paywall uyarısı. Pro kullanıcıya düşerse genel mesaj.
        setError(requirePro('life_setup') ? t.setup_err_generic : null)
      } else if (info.status === 502 || info.kind === 'unknown') setError(t.setup_err_generic)
      else setError(info.message)
    } finally {
      lock.current = false
      setBusy(null)
    }
  }

  function toggle(group: 'routines' | 'goals' | 'tasks', index: number) {
    setSelection((s) => s && { ...s, [group]: s[group].map((on, i) => (i === index ? !on : on)) })
  }

  function toggleRule(key: RuleKey) {
    setSelection((s) => s && { ...s, rules: { ...s.rules, [key]: !s.rules[key] } })
  }

  async function refreshStores(uid: string) {
    await Promise.allSettled([
      useRoutineStore.getState().fetchRoutines(supabase, uid),
      useGoalStore.getState().fetchGoals(supabase, uid),
      useTaskStore.getState().fetchBacklog(supabase, uid),
      useTaskStore.getState().fetchTasks(supabase, uid),
    ])
  }

  async function apply() {
    if (lock.current || !userId || !proposal || !selection || !written) return
    lock.current = true
    setBusy('apply')
    setError(null)

    const r = pending(selection.routines, written.routines)
    const g = pendingGoals(selection.goals, written.goals)
    const k = pending(selection.tasks, written.tasks)
    const ruleKeys = ruleKeysOf(proposal).filter((key) => selection.rules[key] && !written.rules[key])
    const sub: LifeSetupProposal = {
      summary: '',
      routines: r.map((i) => proposal.routines[i]!),
      goals: g.map((i) => proposal.goals[i]!),
      tasks: k.map((i) => proposal.tasks[i]!),
      rules: Object.fromEntries(ruleKeys.map((key) => [key, proposal.rules[key]])) as Partial<PlanningRules>,
      unsupported: [],
    }

    // Olaylar gelir gelmez işlenir: hata ortada çıksa da yazılanlar ekranda kalır.
    const next = cloneWritten(written)
    const onProgress = (event: ApplyProgress) => {
      const i = event.index ?? 0
      if (event.kind === 'routine') next.routines[r[i]!] = true
      else if (event.kind === 'goal') {
        next.goals[g[i]!] = 1
        if (event.goal_id) goalIds.current[g[i]!] = event.goal_id
      }
      else if (event.kind === 'goal_steps') next.goals[g[i]!] = 2
      else if (event.kind === 'tasks') k.forEach((idx) => { next.tasks[idx] = true })
      else ruleKeys.forEach((key) => { next.rules[key] = true })
      setWritten(cloneWritten(next))
    }

    let failed = false
    try {
      await applyLifeSetup(supabase, userId, sub, onProgress, { goal_ids: g.map((i) => goalIds.current[i] ?? null) })
    } catch {
      failed = true
    }
    // Yazılanlar yenilenemese de akış başarısız sayılmaz: veri yerinde.
    await refreshStores(userId)
    lock.current = false
    setBusy(null)
    if (!failed) { reset(); onDone(); return }
    setError(anyWritten(next) ? t.setup_err_apply : t.setup_err_apply_none)
  }

  const remaining = proposal && selection && written ? countPending(proposal, selection, written) : 0

  return {
    text, setText, textMax: LIFE_SETUP_TEXT_MAX, proposal, selection, written, busy, error,
    remaining, wroteSome: written ? anyWritten(written) : false, reset, backToText, extract, toggle, toggleRule, apply,
  }
}
