'use client'

import { useEffect, useState } from 'react'
import { ArrowRightCircle, ChevronRight } from 'lucide-react'
import type { Task } from '@lifeos/shared'
import { nearestPendingTask, relativeDateLabel, taskDateKey, todayDate, useTaskStore } from '@lifeos/shared'
import { getTasks } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'

interface NextTaskRowProps {
  userId: string
  onOpen: (task: Task) => void
}

/**
 * En yakın bekleyen görev (#33), mobildeki ile aynı: tarihi en yakın (gecikmiş önce), tarihsizse
 * en öncelikli. Pano yalnız bugünün görevlerini okuduğu için listeyi kendisi çeker; bulamazsa görünmez.
 */
export function NextTaskRow({ userId, onOpen }: NextTaskRowProps) {
  const { t, lang } = useLang()
  const [task, setTask] = useState<Task | null>(null)
  // Çekmecede tamamlanan, silinen veya değişen görev pano deposunu değiştirir; öneri yeniden hesaplanır.
  const storeTasks = useTaskStore((s) => s.tasks)

  useEffect(() => {
    let alive = true
    getTasks(supabase, userId, { status: ['backlog', 'planned', 'in_progress'], include_details: true })
      .then((rows) => { if (alive) setTask(nearestPendingTask(rows)) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [userId, storeTasks])

  if (!task) return null
  const key = taskDateKey(task)
  const overdue = key !== null && key < todayDate()
  const when = key === null ? null : overdue ? t.ux_next_task_overdue : relativeDateLabel(key, lang)

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="mt-3 flex min-h-[44px] w-full items-center gap-3 rounded-xl bg-border/30 px-3 py-2 text-left hover:bg-border/50"
    >
      <ArrowRightCircle size={18} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">{t.ux_next_task}</span>
        <span className="block truncate text-base font-medium text-primary">{task.title}</span>
      </span>
      {when && <span className={`text-sm font-medium ${overdue ? 'text-danger' : 'text-muted'}`}>{when}</span>}
      <ChevronRight size={14} className="shrink-0 text-muted" />
    </button>
  )
}
