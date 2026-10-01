'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { CreateTaskInput, Task } from '@lifeos/shared'
import { addMinutesToClock, DEFAULT_TASK_MINUTES, parseQuickTask, relativeDateLabel, todayDate } from '@lifeos/shared/utils'
import { createTimeBlocks } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'

interface TaskDraft {
  title: string
  description: string
  scheduledDate: string
  dueDate: string
  estimatedMinutes: string
  effortScore: string
  tags: string
}

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  description: '',
  scheduledDate: '',
  dueDate: '',
  estimatedMinutes: '',
  effortScore: '',
  tags: '',
}

interface QuickTaskInputProps {
  /** Oluşan görevi döndürürse ve metinde saat varsa o güne görev bloğu da açılır. */
  onCreateTask: (input: CreateTaskInput) => Promise<Task | void>
}

export function QuickTaskInput({ onCreateTask }: QuickTaskInputProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // "N" ile yeni görev. Ctrl+K komut paletinin (arama, komut, görev oluşturma);
  // ikisi aynı tuşu dinleyince palet ve bu pencere birlikte açılıyordu.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const updateDraft = useCallback((field: keyof TaskDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (loading || !draft.title.trim()) return

      setLoading(true)

      // Türkçe doğal dil: "yarın 15:00 rapor 30dk", "cumaya kadar teklif #iş !4"
      const parsed = parseQuickTask(draft.title, todayDate())
      const parsedTitle = parsed.title
      const tags = parsed.tags
      const effortScore = parsed.effort_score
      const scheduledDate = parsed.scheduled_date
      const dueDate = parsed.due_date

      try {
        const explicitTags = draft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)

        const created = await onCreateTask({
          title: parsedTitle,
          ...(draft.description.trim() && { description: draft.description.trim() }),
          ...((tags.length > 0 || explicitTags.length > 0) && { tags: Array.from(new Set([...explicitTags, ...tags])) }),
          ...(effortScore !== undefined && { effort_score: effortScore }),
          ...(draft.effortScore && { effort_score: parseInt(draft.effortScore, 10) }),
          ...((draft.scheduledDate || scheduledDate) && {
            scheduled_date: draft.scheduledDate || scheduledDate,
            status: 'planned' as const,
          }),
          ...((draft.dueDate || dueDate) && { due_date: draft.dueDate || dueDate }),
          ...(parsed.estimated_minutes && { estimated_minutes: parsed.estimated_minutes }),
          ...(draft.estimatedMinutes && { estimated_minutes: parseInt(draft.estimatedMinutes, 10) }),
        })
        const day = draft.scheduledDate || scheduledDate
        if (created && parsed.start_time && day) {
          const minutes = (draft.estimatedMinutes && parseInt(draft.estimatedMinutes, 10)) || parsed.estimated_minutes || DEFAULT_TASK_MINUTES
          // Görev yazıldı: blok düşerse taslak yine temizlenir, yoksa tekrar denemek aynı görevi ikinci kez ekler.
          try {
            await createTimeBlocks(supabase, created.user_id, [{
              date: day, start_time: parsed.start_time, end_time: addMinutesToClock(parsed.start_time, minutes),
              block_type: 'task', label: created.title, task_id: created.id,
            }])
          } catch { showToast(t.qtask_block_error, 'error') }
        }
        setDraft(EMPTY_DRAFT)
        setOpen(false)
      } catch {
        showToast(t.plan_task_add_error, 'error')
      } finally {
        setLoading(false)
      }
    },
    [draft, loading, onCreateTask, showToast, t],
  )

  const preview = useMemo(() => {
    if (!draft.title.trim()) return null
    const p = parseQuickTask(draft.title, todayDate())
    const parts = [
      p.scheduled_date && `${relativeDateLabel(p.scheduled_date)}${p.start_time ? ` ${p.start_time}` : ''}`,
      p.due_date && `${t.qtask_due_label}: ${relativeDateLabel(p.due_date)}`,
      p.estimated_minutes && `${p.estimated_minutes} ${t.unit_min_short}`,
      ...p.tags.map((tag) => `#${tag}`),
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : null
  }, [draft.title, t.qtask_due_label, t.unit_min_short])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {t.tasks_new}
        <kbd className="ml-2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-muted">
          N
        </kbd>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} size="md">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_title_label}</label>
              <input
                ref={inputRef}
                value={draft.title}
                onChange={(e) => updateDraft('title', e.target.value)}
                placeholder={t.qtask_title_placeholder}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base text-primary outline-none placeholder:text-muted/50 focus:border-accent focus:bg-white"
                autoComplete="off"
              />
              {preview && <p className="mt-1.5 text-xs font-medium text-accent">{preview}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_desc_label}</label>
              <textarea
                value={draft.description}
                onChange={(e) => updateDraft('description', e.target.value)}
                placeholder={t.qtask_desc_placeholder}
                className="min-h-[96px] w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none placeholder:text-muted/50 focus:border-accent focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_scheduled_label}</label>
                <input
                  type="date"
                  value={draft.scheduledDate}
                  onChange={(e) => updateDraft('scheduledDate', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none focus:border-accent focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_due_label}</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => updateDraft('dueDate', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none focus:border-accent focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_minutes_label}</label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={draft.estimatedMinutes}
                  onChange={(e) => updateDraft('estimatedMinutes', e.target.value)}
                  placeholder="45"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none placeholder:text-muted/50 focus:border-accent focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_effort_label}</label>
                <select
                  value={draft.effortScore}
                  onChange={(e) => updateDraft('effortScore', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none focus:border-accent focus:bg-white"
                >
                  <option value="">{t.qtask_effort_select}</option>
                  <option value="1">{t.qtask_effort_1}</option>
                  <option value="2">{t.qtask_effort_2}</option>
                  <option value="3">{t.qtask_effort_3}</option>
                  <option value="4">{t.qtask_effort_4}</option>
                  <option value="5">{t.qtask_effort_5}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.qtask_tags_label}</label>
              <input
                value={draft.tags}
                onChange={(e) => updateDraft('tags', e.target.value)}
                placeholder={t.qtask_tags_placeholder}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none placeholder:text-muted/50 focus:border-accent focus:bg-white"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">{t.qtask_shortcuts_title}</p>
            <input
              placeholder={t.qtask_cmd_placeholder}
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-primary outline-none placeholder:text-muted/50"
              value={draft.title}
              onChange={(e) => updateDraft('title', e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-100 px-1 text-[10px]">#</kbd> {t.qtask_sc_tag}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-100 px-1 text-[10px]">!1-5</kbd> {t.qtask_sc_effort}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-100 px-1 text-[10px]">@{t.qtask_sc_date}</kbd>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-100 px-1 text-[10px]">&gt;YYYY-MM-DD</kbd> {t.qtask_sc_due}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-100 px-1 text-[10px]">Enter</kbd> {t.qtask_sc_save}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-gray-100 px-1 text-[10px]">Esc</kbd> {t.qtask_sc_cancel}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setDraft(EMPTY_DRAFT) }}>
              {t.plan_cancel}
            </Button>
            <Button type="submit" size="sm" loading={loading} disabled={!draft.title.trim()}>
              {t.qtask_create}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
