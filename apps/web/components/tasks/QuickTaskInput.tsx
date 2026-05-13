'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { CreateTaskInput } from '@lifeos/shared'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
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
  onCreateTask: (input: CreateTaskInput) => Promise<void>
}

export function QuickTaskInput({ onCreateTask }: QuickTaskInputProps) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes('MAC') || /Mac/.test(navigator.userAgent))
  }, [])

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
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
      if (!draft.title.trim()) return

      setLoading(true)

      let parsedTitle = draft.title.trim()
      const tags: string[] = []
      let effortScore: number | undefined
      let scheduledDate: string | undefined
      let dueDate: string | undefined

      const tagRegex = /#(\w+)/g
      let tagMatch
      while ((tagMatch = tagRegex.exec(parsedTitle))) {
        tags.push(tagMatch[1]!)
      }
      parsedTitle = parsedTitle.replace(/#\w+/g, '').trim()

      const effortMatch = parsedTitle.match(/!([1-5])/)
      if (effortMatch) {
        effortScore = parseInt(effortMatch[1]!)
        parsedTitle = parsedTitle.replace(/![1-5]/, '').trim()
      }

      const dateMatch = parsedTitle.match(/@(\S+)/)
      if (dateMatch) {
        const dateValue = dateMatch[1]!.toLowerCase()
        if (dateValue === 'bugün' || dateValue === 'bugun' || dateValue === 'today') {
          const { todayDate } = await import('@lifeos/shared')
          scheduledDate = todayDate()
        } else if (dateValue === 'yarın' || dateValue === 'yarin' || dateValue === 'tomorrow') {
          const { todayDate, shiftIsoDate } = await import('@lifeos/shared')
          scheduledDate = shiftIsoDate(todayDate(), 1)
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          scheduledDate = dateValue
        }
        parsedTitle = parsedTitle.replace(/@\S+/, '').trim()
      }

      const dueMatch = parsedTitle.match(/>(\d{4}-\d{2}-\d{2})/)
      if (dueMatch) {
        dueDate = dueMatch[1]!
        parsedTitle = parsedTitle.replace(/>\d{4}-\d{2}-\d{2}/, '').trim()
      }

      try {
        const explicitTags = draft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)

        await onCreateTask({
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
          ...(draft.estimatedMinutes && { estimated_minutes: parseInt(draft.estimatedMinutes, 10) }),
        })
        setDraft(EMPTY_DRAFT)
        setOpen(false)
      } finally {
        setLoading(false)
      }
    },
    [draft, onCreateTask],
  )

  const shortcutLabel = isMac ? '⌘K' : 'Ctrl K'

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
          {shortcutLabel}
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
