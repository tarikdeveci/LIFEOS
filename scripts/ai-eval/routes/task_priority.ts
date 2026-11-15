// task_priority değerlendirmesi: tek görev için WSJF puan önerisi.
// İstek ve ayrıştırma üretimdeki fonksiyonlarla aynı (ai-suggest/tasks.ts).

import { parseTaskPriority, taskPriorityRequest } from '../../../supabase/functions/ai-suggest/tasks.ts'
import type { PriorityTask } from '../../../supabase/functions/ai-suggest/tasks.ts'
import type { RouteEval } from '../run.ts'

const SCORES = ['value_score', 'urgency_score', 'risk_score', 'effort_score', 'friction_score'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isScore(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5
}

export const taskPriorityEval: RouteEval<PriorityTask> = {
  route: 'task_priority',
  fixture(raw) {
    if (!isRecord(raw) || typeof raw['title'] !== 'string') throw new Error('task_priority vakası title içermeli')
    const tags = raw['tags']
    return {
      title: raw['title'],
      description: optionalString(raw['description']),
      tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : null,
      due_date: optionalString(raw['due_date']),
    }
  },
  build: (task) => taskPriorityRequest(task, 'tr'),
  check(result) {
    const suggestion = parseTaskPriority(result.text)
    const record = isRecord(suggestion) ? suggestion : {}
    const keys = Object.keys(record)
    // Üretimde bozuk JSON metnin kendisi `reasoning` olarak döner: ayrıştırma sayılmaz.
    const fallback = keys.length === 1 && record['reasoning'] === result.text
    const parsed = keys.length > 0 && !fallback
    const checks: Record<string, boolean> = {}
    for (const score of SCORES) checks[score] = parsed && isScore(record[score])
    return { parsed, checks }
  },
}
