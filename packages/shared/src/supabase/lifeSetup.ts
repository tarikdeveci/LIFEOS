import type { SupabaseClient } from '@supabase/supabase-js'
import type { LifeSetupProposal } from '../types/lifeSetup'
import type { ReportLanguage } from './reports'
import type { CreateTaskInput } from '../types/task'
import { todayDate } from '../utils/date'
import { goalPeriodStart, valueScoreForGoal } from '../utils/goals'
import { sanitizeLifeSetup } from '../utils/lifeSetup'
import { createGoal } from './goals'
import { updatePlanningRules } from './profile'
import { createRoutine } from './routines'
import { createTasks, updateTask } from './tasks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/** Yeni görevin varsayılan değer puanı (tasks.ts toTaskInsert ile aynı). */
const DEFAULT_VALUE_SCORE = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Serbest metinden kurulum önerisi ister (ai-suggest, type: 'life_setup'). Yanıt yazmadan önce
 * sanitizeLifeSetup'tan geçer. HTTP hataları (400 text_empty/text_too_long, 402 ücretsiz hak,
 * 502) olduğu gibi fırlatılır; çağıran describeAiError ile sınıflandırır.
 */
export async function requestLifeSetup(
  supabase: Supabase,
  text: string,
  language: ReportLanguage,
): Promise<LifeSetupProposal> {
  const { data, error } = await supabase.functions.invoke('ai-suggest', {
    body: { type: 'life_setup', text, language, today: todayDate() },
  })
  if (error) throw error
  if (!isRecord(data) || !isRecord(data['proposal'])) throw new Error('ai-suggest: öneri gelmedi')
  return sanitizeLifeSetup(data['proposal'])
}

/**
 * Yazma ilerlemesi: her öğe YAZILDIKTAN sonra bir olay gelir. `index`, applyLifeSetup'a verilen
 * önerideki sıradır. Hedef iki aşamalıdır: 'goal' hedef satırı yazıldı, 'goal_steps' adımlar da yazıldı.
 */
export interface ApplyProgress {
  kind: 'routine' | 'goal' | 'goal_steps' | 'tasks' | 'rules'
  index?: number
}

/**
 * Onaylanan kurulum önerisini mevcut oluşturma fonksiyonlarıyla yazar. Öneri yazmadan önce
 * bir kez daha doğrulanır: bir kısıt ortada patlarsa yarım kurulum kalır, bu yüzden ihlal
 * yazmadan önce elenir. Sıra: rutinler (createRoutine örnekleri kendisi üretir), hedefler,
 * hedef adımları ve tekil görevler (hepsi backlog), kurallar. Hata fırlarsa o ana kadar
 * yazılanlar kalır; aynı öneriyi yeniden uygulamak onları ikiler.
 * `tasks` sayısı hedef adımlarını da içerir.
 */
export async function applyLifeSetup(
  supabase: Supabase,
  userId: string,
  proposal: LifeSetupProposal,
  onProgress?: (event: ApplyProgress) => void,
): Promise<{ routines: number; goals: number; tasks: number }> {
  const setup = sanitizeLifeSetup(proposal)
  const today = todayDate()
  let tasks = 0

  // Sırayla: her createRoutine örnek üretimini tetikler, paralel çağrı aynı şablonları yarıştırır.
  for (const [index, routine] of setup.routines.entries()) {
    await createRoutine(supabase, userId, routine)
    onProgress?.({ kind: 'routine', index })
  }

  for (const [index, input] of setup.goals.entries()) {
    const goal = await createGoal(supabase, userId, {
      horizon: input.horizon,
      title: input.title,
      period_start: goalPeriodStart(input.horizon, today),
      target: input.target ?? null,
      unit: input.unit ?? null,
      count_mode: input.count_mode ?? null,
      daily_cap: input.daily_cap ?? null,
    })

    onProgress?.({ kind: 'goal', index })
    const steps = input.steps ?? []
    if (steps.length === 0) {
      onProgress?.({ kind: 'goal_steps', index })
      continue
    }
    // CreateTaskInput'ta goal_id yok: adımlar önce yazılır, sonra uygulamadaki gibi
    // (task/[id].tsx) bağ ve değer puanı birlikte güncellenir.
    const created = await createTasks(supabase, userId, steps.map((title): CreateTaskInput => ({ title })))
    await Promise.all(created.map((task) => updateTask(supabase, task.id, {
      goal_id: goal.id,
      value_score: valueScoreForGoal(DEFAULT_VALUE_SCORE, goal.id),
    })))
    tasks += created.length
    onProgress?.({ kind: 'goal_steps', index })
  }

  const standalone = await createTasks(supabase, userId, setup.tasks.map((task): CreateTaskInput => ({
    title: task.title,
    area: task.area,
    estimated_minutes: task.estimated_minutes,
  })))
  tasks += standalone.length
  onProgress?.({ kind: 'tasks' })

  if (Object.keys(setup.rules).length > 0) {
    await updatePlanningRules(supabase, userId, setup.rules)
    onProgress?.({ kind: 'rules' })
  }

  return { routines: setup.routines.length, goals: setup.goals.length, tasks }
}
