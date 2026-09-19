'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, ChartLine, CheckSquare, CreditCard, Dumbbell, LayoutDashboard,
  MessageSquare, Plus, Salad, Search, Settings, Utensils, type LucideIcon,
} from 'lucide-react'
import { useTaskStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'
import { useTaskSearch } from '@/lib/hooks/useTaskSearch'

/** Sidebar'daki arama düğmesi paleti bu olayla açar. */
export const OPEN_COMMAND_PALETTE = 'lifeos:command-palette'

interface CommandPaletteProps { userId: string }

type Group = 'pages' | 'actions' | 'tasks'

interface Command {
  id: string
  group: Group
  label: string
  Icon: LucideIcon
  run: () => void
}

function includesText(label: string, query: string): boolean {
  return label.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))
}

/**
 * Ctrl+K (Mac'te Cmd+K) ile açılan komut paleti. Sıra sabit: eşleşen
 * sayfalar, eylemler (görev ekle, öğün kaydet, AI'a sor), sonra eşleşen
 * görevler. Görev araması geç geldiği için en sona konur; seçili satır
 * kullanıcının altından kaymaz.
 */
export function CommandPalette({ userId }: CommandPaletteProps) {
  const { t } = useLang()
  const router = useRouter()
  const { showToast } = useToast()
  const addTask = useTaskStore((state) => state.addTask)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const text = query.trim()
  const foundTasks = useTaskSearch(userId, open ? text : '')

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }, [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (open) close()
        else setOpen(true)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_PALETTE, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE, onOpen)
    }
  }, [open, close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const createTask = useCallback(async (title: string) => {
    close()
    try {
      await addTask(supabase, userId, { title })
      showToast(t.cmd_task_added.replace('{q}', title), 'success')
    } catch {
      showToast(t.cmd_task_error, 'error')
    }
  }, [addTask, close, showToast, t.cmd_task_added, t.cmd_task_error, userId])

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      close()
      router.push(href)
    }
    const pages: Array<[string, string, LucideIcon]> = [
      ['/dashboard', t.dash_today, LayoutDashboard],
      ['/tasks', t.dash_tasks, CheckSquare],
      ['/planning', t.dash_planning, CalendarDays],
      ['/review', t.nav_review, ChartLine],
      ['/nutrition', t.dash_nutrition, Salad],
      ['/workout', t.dash_workout, Dumbbell],
      ['/settings', t.dash_settings, Settings],
      ['/billing', t.dash_billing, CreditCard],
    ]
    const list: Command[] = pages
      .filter(([, label]) => !text || includesText(label, text))
      .map(([href, label, Icon]) => ({ id: `page-${href}`, group: 'pages', label, Icon, run: go(href) }))

    if (text) {
      const q = encodeURIComponent(text)
      list.push(
        { id: 'act-task', group: 'actions', label: t.cmd_add_task.replace('{q}', text), Icon: Plus, run: () => void createTask(text) },
        { id: 'act-meal', group: 'actions', label: t.cmd_log_meal.replace('{q}', text), Icon: Utensils, run: go(`/nutrition?meal=${q}`) },
        { id: 'act-ai', group: 'actions', label: t.cmd_ask_ai.replace('{q}', text), Icon: MessageSquare, run: go(`/planning?ask=${q}`) },
      )
    }
    for (const task of foundTasks) {
      list.push({ id: `task-${task.id}`, group: 'tasks', label: task.title, Icon: CheckSquare, run: go(`/tasks?task=${task.id}`) })
    }
    return list
  }, [close, createTask, foundTasks, router, t, text])

  const current = Math.min(active, commands.length - 1)
  const activeId = commands[current]?.id

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(current + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(current - 1, 0))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      commands[current]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!open) return null

  const groupLabel: Record<Group, string> = {
    pages: t.cmd_group_pages,
    actions: t.cmd_group_actions,
    tasks: t.cmd_group_tasks,
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[15vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div role="dialog" aria-modal="true" aria-label={t.cmd_open}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder={t.cmd_placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={activeId}
            className="h-12 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>

        <ul id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {commands.map((command, index) => (
            <li key={command.id} role="presentation">
              {(index === 0 || commands[index - 1]?.group !== command.group) && (
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {groupLabel[command.group]}
                </p>
              )}
              <div
                id={command.id}
                role="option"
                aria-selected={index === current}
                onMouseMove={() => { if (index !== current) setActive(index) }}
                onClick={command.run}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                  index === current ? 'bg-accent/10 text-accent' : 'text-primary'
                }`}
              >
                <command.Icon size={15} className="shrink-0" />
                <span className="truncate">{command.label}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="border-t border-border px-4 py-2 text-xs text-muted">{t.cmd_hint}</p>
      </div>
    </div>
  )
}
