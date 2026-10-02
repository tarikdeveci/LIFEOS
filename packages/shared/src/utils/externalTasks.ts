/**
 * Dış kaynaktan gelen görevlerin upsert planı. Saf fonksiyon: hangi görev yeni,
 * hangisi güncellenecek, hangisine dokunulmayacak.
 *
 * Kural: LifeOS'ta tamamlanmış görev güncellenmez (kullanıcının kararı kaynağın
 * önüne geçer). Güncellemede sadece kaynağın sahip olduğu alanlar yazılır; LifeOS'ta
 * verilen WSJF puanları, planlanan gün ve etiketler korunur.
 */

import type { ExternalTaskInput } from '../types/integration'

export interface ExistingExternalTask {
  id: string
  external_id: string
  status: string
}

export interface ExternalTaskPatch {
  title: string
  description: string | null
  due_date: string | null
  estimated_minutes?: number
  external_url: string | null
  external_updated_at: string | null
}

export interface ExternalUpsertPlan {
  toInsert: ExternalTaskInput[]
  toUpdate: { id: string; patch: ExternalTaskPatch }[]
  skipped: number
}

export function planExternalUpsert(
  incoming: readonly ExternalTaskInput[],
  existing: readonly ExistingExternalTask[],
): ExternalUpsertPlan {
  const byExternal = new Map(existing.map((e) => [e.external_id, e]))
  // Aynı istekte aynı kimlik birden çok kez geldiyse sonuncusu geçerli.
  const latest = new Map<string, ExternalTaskInput>()
  for (const item of incoming) latest.set(item.external_id, item)

  const plan: ExternalUpsertPlan = { toInsert: [], toUpdate: [], skipped: 0 }
  for (const item of latest.values()) {
    const found = byExternal.get(item.external_id)
    if (!found) { plan.toInsert.push(item); continue }
    if (found.status === 'done') { plan.skipped++; continue }
    plan.toUpdate.push({
      id: found.id,
      patch: {
        title: item.title,
        description: item.description ?? null,
        due_date: item.due_date ?? null,
        ...(item.estimated_minutes ? { estimated_minutes: item.estimated_minutes } : {}),
        external_url: item.external_url ?? null,
        external_updated_at: item.external_updated_at ?? null,
      },
    })
  }
  return plan
}

/** Todoist v1 görevinin içe aktarmada kullanılan kısmı (GET /api/v1/tasks). */
export interface TodoistTask {
  id: string
  content: string
  description?: string | null
  due?: { date: string } | null
  deadline?: { date: string } | null
  duration?: { amount: number; unit: 'minute' | 'day' } | null
  /** 1 normal .. 4 acil (arayüzdeki P1 = 4). */
  priority?: number
  labels?: string[]
  checked?: boolean
}

const TODOIST_URGENCY: Record<number, number> = { 4: 5, 3: 4, 2: 3, 1: 3 }

/**
 * Todoist görevini LifeOS görevine çevirir. Son tarih önce deadline, yoksa due
 * (tekrarlayan görevde bir sonraki gün). Öncelik aciliyet puanına gider, etiketler korunur.
 */
export function todoistToExternal(task: TodoistTask): ExternalTaskInput | null {
  const title = task.content.replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!title || task.checked) return null
  const due = (task.deadline?.date ?? task.due?.date ?? '').slice(0, 10)
  const minutes = task.duration?.unit === 'minute' ? Math.round(task.duration.amount) : undefined
  const description = task.description?.trim()
  return {
    title,
    external_id: task.id,
    external_url: `https://app.todoist.com/app/task/${task.id}`,
    status: 'backlog',
    ...(description ? { description: description.slice(0, 5000) } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(due) ? { due_date: due } : {}),
    ...(minutes && minutes > 0 && minutes <= 1440 ? { estimated_minutes: minutes } : {}),
    urgency_score: TODOIST_URGENCY[task.priority ?? 1] ?? 3,
    tags: ['todoist', ...(task.labels ?? []).slice(0, 19)],
  }
}

/** expo-calendar Reminder'ının içe aktarmada kullanılan kısmı (iOS Hatırlatıcılar). */
export interface ReminderLike {
  id?: string
  title?: string
  notes?: string | null
  dueDate?: string | Date | null
  completed?: boolean
}

/**
 * Apple Hatırlatıcısını LifeOS görevine çevirir. Son tarih cihazın yerel gününe
 * göre alınır (Hatırlatıcılar saatli tarih verir; UTC'ye çevirmek günü kaydırır).
 */
export function reminderToExternal(reminder: ReminderLike): ExternalTaskInput | null {
  const title = (reminder.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!reminder.id || !title || reminder.completed) return null
  const due = reminder.dueDate ? new Date(reminder.dueDate) : null
  const dueDate = due && !Number.isNaN(due.getTime())
    ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
    : undefined
  const notes = reminder.notes?.trim()
  return {
    title,
    external_id: reminder.id,
    status: 'backlog',
    ...(notes ? { description: notes.slice(0, 5000) } : {}),
    ...(dueDate ? { due_date: dueDate } : {}),
    tags: ['hatırlatıcı'],
  }
}
