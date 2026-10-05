import type { SupabaseClient } from '@supabase/supabase-js'
import type { LifeSetupProposal } from '../types/lifeSetup'
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
): Promise<{ routines: number; goals: number; tasks: number }> {
  const setup = sanitizeLifeSetup(proposal)
  const today = todayDate()
  let tasks = 0

  // Sırayla: her createRoutine örnek üretimini tetikler, paralel çağrı aynı şablonları yarıştırır.
  for (const routine of setup.routines) {
    await createRoutine(supabase, userId, routine)
  }

  for (const input of setup.goals) {
    const goal = await createGoal(supabase, userId, {
      horizon: input.horizon,
      title: input.title,
      period_start: goalPeriodStart(input.horizon, today),
      target: input.target ?? null,
      unit: input.unit ?? null,
      count_mode: input.count_mode ?? null,
      daily_cap: input.daily_cap ?? null,
    })

    const steps = input.steps ?? []
    if (steps.length === 0) continue
    // CreateTaskInput'ta goal_id yok: adımlar önce yazılır, sonra uygulamadaki gibi
    // (task/[id].tsx) bağ ve değer puanı birlikte güncellenir.
    const created = await createTasks(supabase, userId, steps.map((title): CreateTaskInput => ({ title })))
    await Promise.all(created.map((task) => updateTask(supabase, task.id, {
      goal_id: goal.id,
      value_score: valueScoreForGoal(DEFAULT_VALUE_SCORE, goal.id),
    })))
    tasks += created.length
  }

  const standalone = await createTasks(supabase, userId, setup.tasks.map((task): CreateTaskInput => ({
    title: task.title,
    area: task.area,
    estimated_minutes: task.estimated_minutes,
  })))
  tasks += standalone.length

  if (Object.keys(setup.rules).length > 0) {
    await updatePlanningRules(supabase, userId, setup.rules)
  }

  return { routines: setup.routines.length, goals: setup.goals.length, tasks }
}
