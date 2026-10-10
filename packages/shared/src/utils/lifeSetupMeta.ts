// "Hayat planımı kur" onay ekranındaki satır metinleri. Saf: çeviri tablosu dışarıdan gelir,
// web ve mobil aynı cümleleri kurar.

import type { LifeSetupProposal, SetupGoal, SetupRoutine, SetupTask } from '../types/lifeSetup'
import type { PlanningRules } from '../types/user'

type T = Record<string, string>

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replace(`{${key}}`, String(value)), template)
}

/** Rutin satırının alt yazısı: alan, sıklık, saat, süre, program. */
export function lifeSetupRoutineMeta(r: SetupRoutine, t: T): string {
  const days = t['routines_day_names']!.split(',')
  const freq = r.times_per_day ? fill(t['setup_freq_day']!, { n: r.times_per_day })
    : r.times_per_week ? fill(t['setup_freq_week']!, { n: r.times_per_week })
      : !r.days_of_week || r.days_of_week.length === 0 || r.days_of_week.length === 7 ? t['setup_freq_daily']!
        : r.days_of_week.map((d) => days[d] ?? '').join(' ')
  return [
    r.area ? t[`setup_area_${r.area}`] : null,
    freq,
    r.start_time ? (r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time) : null,
    r.estimated_minutes ? fill(t['setup_minutes']!, { n: r.estimated_minutes }) : null,
    r.target_count ? fill(t['setup_program_days']!, { n: r.target_count }) : null,
    r.target_count && r.start_count ? fill(t['setup_program_start']!, { n: r.start_count }) : null,
  ].filter(Boolean).join(' · ')
}

/** Hedef satırının alt yazısı: ufuk, hedef sayı, adım sayısı. */
export function lifeSetupGoalMeta(g: SetupGoal, t: T): string {
  return [
    t[`setup_horizon_${g.horizon}`],
    g.target ? fill(t['setup_goal_target']!, { n: g.target, unit: g.unit ?? '' }).trim() : null,
    g.steps && g.steps.length > 0 ? fill(t['setup_steps']!, { n: g.steps.length }) : null,
  ].filter(Boolean).join(' · ')
}

/** Planlama kuralının okunur hali. */
export function lifeSetupRuleText(proposal: LifeSetupProposal, key: keyof PlanningRules, t: T): string {
  const rules = proposal.rules
  if (key === 'max_deep_tasks') return fill(t['setup_rule_max_deep_tasks']!, { n: rules.max_deep_tasks ?? '' })
  if (key === 'buffer_minutes') return fill(t['setup_rule_buffer_minutes']!, { n: rules.buffer_minutes ?? '' })
  if (key === 'rollover') return t[`setup_rule_rollover_${rules.rollover}`] ?? ''
  return fill(t['setup_rule_about']!, { text: rules.about ?? '' })
}

/** Görev satırının alt yazısı: alan ve süre. */
export function lifeSetupTaskMeta(task: SetupTask, t: T): string {
  return [
    task.area ? t[`setup_area_${task.area}`] : null,
    task.estimated_minutes ? fill(t['setup_minutes']!, { n: task.estimated_minutes }) : null,
  ].filter(Boolean).join(' · ')
}
