'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Task, TaskStatus, WsjfScores, UpdateTaskInput, ChecklistItem } from '@lifeos/shared'
import { TASK_STATUS_LABELS, describeAiError } from '@lifeos/shared'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { TaskStatusSelect } from './TaskStatusSelect'
import { WsjfSliders } from './WsjfSliders'
import { supabase } from '@/lib/supabase/client'

interface TaskDetailDrawerProps {
  task: Task | null
  open: boolean
  onClose: () => void
  onUpdate: (taskId: string, updates: UpdateTaskInput) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>
  onUpdateChecklist?: (taskId: string, checklist: ChecklistItem[]) => Promise<void>
}

export function TaskDetailDrawer({
  task,
  open,
  onClose,
  onUpdate,
  onDelete,
  onStatusChange,
  onUpdateChecklist,
}: TaskDetailDrawerProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [checklistText, setChecklistText] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)

  // Task değiştiğinde form state'ini senkronize et
  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description ?? '')
    setEditingTitle(false)
  }, [task])

  const handleSaveTitle = useCallback(async () => {
    if (!task || !title.trim()) return
    setSaving(true)
    await onUpdate(task.id, { title: title.trim() })
    setEditingTitle(false)
    setSaving(false)
  }, [task, title, onUpdate])

  const handleSaveDescription = useCallback(async () => {
    if (!task) return
    await onUpdate(task.id, { description })
  }, [task, description, onUpdate])

  const handleScoreChange = useCallback(
    async (scores: WsjfScores) => {
      if (!task) return
      await onUpdate(task.id, {
        value_score: scores.value_score,
        urgency_score: scores.urgency_score,
        risk_score: scores.risk_score,
        effort_score: scores.effort_score,
        friction_score: scores.friction_score,
      })
    },
    [task, onUpdate],
  )

  const handleAddTag = useCallback(async () => {
    if (!task || !tagInput.trim()) return
    const newTag = tagInput.trim().toLowerCase().replace(/^#/, '')
    if (task.tags.includes(newTag)) return
    await onUpdate(task.id, { tags: [...task.tags, newTag] })
    setTagInput('')
  }, [task, tagInput, onUpdate])

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!task) return
      await onUpdate(task.id, { tags: task.tags.filter((t) => t !== tag) })
    },
    [task, onUpdate],
  )

  const handleDelete = useCallback(async () => {
    if (!task) return
    if (window.confirm(`"${task.title}" görevini silmek istediğine emin misin?`)) {
      await onDelete(task.id)
      onClose()
    }
  }, [task, onDelete, onClose])

  const handleAiPriority = useCallback(async () => {
    if (!task) return
    setAiLoading(true)
    setAiReasoning(null)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data: refreshData } = await supabase.auth.refreshSession()
        session = refreshData.session
      }
      if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { type: 'task_priority', task_id: task.id },
      })
      if (error) {
        throw error
      }
      const suggestion = data as {
        suggestion?: {
          value_score?: number
          urgency_score?: number
          risk_score?: number
          effort_score?: number
          friction_score?: number
          reasoning?: string
        }
      }
      if (suggestion.suggestion) {
        const s = suggestion.suggestion
        setAiReasoning(s.reasoning ?? null)
        if (s.value_score && s.urgency_score && s.risk_score && s.effort_score && s.friction_score) {
          await onUpdate(task.id, {
            value_score: s.value_score,
            urgency_score: s.urgency_score,
            risk_score: s.risk_score,
            effort_score: s.effort_score,
            friction_score: s.friction_score,
          })
        }
      }
    } catch (err) {
      const info = await describeAiError(err)
      if (info.detail) console.error('ai-suggest task_priority:', info.status, info.detail)
      setAiReasoning(info.message)
    } finally {
      setAiLoading(false)
    }
  }, [task, onUpdate])

  if (!task) return null

  return (
    <Sheet open={open} onClose={onClose} title="Görev Detayı">
      <div className="space-y-6">
        {/* Başlık */}
        <div>
          {editingTitle ? (
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 rounded-lg border border-accent px-3 py-2 text-lg font-semibold text-primary outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
              />
              <Button size="sm" onClick={() => void handleSaveTitle()} loading={saving}>
                Kaydet
              </Button>
            </div>
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              className="cursor-pointer rounded-lg px-1 py-0.5 text-xl font-bold text-primary transition-colors hover:bg-gray-50"
            >
              {task.title}
            </h2>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Durum:</span>
          <TaskStatusSelect
            value={task.status}
            onChange={(status) => void onStatusChange(task.id, status)}
          />
        </div>

        {/* Açıklama */}
        <div>
          <Textarea
            label="Açıklama"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => void handleSaveDescription()}
            rows={3}
            placeholder="Görev hakkında notlar..."
          />
        </div>

        {/* WSJF Sliders */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">Onceliklendirme (WSJF)</h3>
            <button
              onClick={() => void handleAiPriority()}
              disabled={aiLoading}
              className="flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-40"
            >
              {aiLoading ? 'Yukleniyor' : 'AI Oner'}
            </button>
          </div>
          {aiReasoning && (
            <div className="mb-3 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-800">
              {aiReasoning}
            </div>
          )}
          <WsjfSliders
            scores={{
              value_score: task.value_score,
              urgency_score: task.urgency_score,
              risk_score: task.risk_score,
              effort_score: task.effort_score,
              friction_score: task.friction_score,
            }}
            onChange={(scores) => void handleScoreChange(scores)}
          />
        </div>

        {/* Planlama */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Son Tarih"
            type="date"
            value={task.due_date ?? ''}
            onChange={(e) => void onUpdate(task.id, { ...(e.target.value && { due_date: e.target.value }) })}
          />
          <Input
            label="Planlanan Gün"
            type="date"
            value={task.scheduled_date ?? ''}
            onChange={(e) => void onUpdate(task.id, { ...(e.target.value && { scheduled_date: e.target.value }) })}
          />
          <Input
            label="Tahmini Süre (dk)"
            type="number"
            value={task.estimated_minutes ?? ''}
            onChange={(e) =>
              void onUpdate(task.id, {
                ...(e.target.value && { estimated_minutes: parseInt(e.target.value) }),
              })
            }
            min={0}
            step={5}
          />
        </div>

        {/* Etiketler */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-primary">Etiketler</h3>
          <div className="flex flex-wrap gap-2">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-primary"
              >
                #{tag}
                <button
                  onClick={() => void handleRemoveTag(tag)}
                  className="ml-0.5 text-muted hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleAddTag()
              }}
              className="inline-flex"
            >
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Etiket ekle..."
                className="w-24 rounded-full bg-gray-50 px-2.5 py-1 text-xs outline-none focus:bg-gray-100"
              />
            </form>
          </div>
        </div>

        {/* Checklist — task_details'ten */}
        {task.task_details && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-primary">Kontrol Listesi</h3>
            <div className="space-y-1">
              {(task.task_details.checklist ?? []).map((item) => (
                <div key={item.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {
                      if (!onUpdateChecklist) return
                      const updated = (task.task_details!.checklist ?? []).map((ci) =>
                        ci.id === item.id ? { ...ci, checked: !ci.checked } : ci,
                      )
                      void onUpdateChecklist(task.id, updated)
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className={`flex-1 text-sm ${item.checked ? 'text-muted line-through' : 'text-primary'}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => {
                      if (!onUpdateChecklist) return
                      const updated = (task.task_details!.checklist ?? []).filter(
                        (ci) => ci.id !== item.id,
                      )
                      void onUpdateChecklist(task.id, updated)
                    }}
                    className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    title="Sil"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!checklistText.trim() || !onUpdateChecklist) return
                const newItem: ChecklistItem = {
                  id: crypto.randomUUID(),
                  text: checklistText.trim(),
                  checked: false,
                }
                const updated = [...(task.task_details!.checklist ?? []), newItem]
                void onUpdateChecklist(task.id, updated)
                setChecklistText('')
              }}
              className="mt-2"
            >
              <input
                value={checklistText}
                onChange={(e) => setChecklistText(e.target.value)}
                placeholder="Yeni madde ekle..."
                className="w-full rounded-lg bg-gray-50 px-3 py-2 text-sm outline-none focus:bg-gray-100"
              />
            </form>
          </div>
        )}

        {/* Meta bilgi */}
        <div className="border-t border-gray-100 pt-4 text-xs text-muted">
          <p>Oluşturulma: {new Date(task.created_at).toLocaleDateString('tr-TR')}</p>
          <p>Güncelleme: {new Date(task.updated_at).toLocaleDateString('tr-TR')}</p>
          {task.completed_at && (
            <p>Tamamlanma: {new Date(task.completed_at).toLocaleDateString('tr-TR')}</p>
          )}
        </div>

        {/* Sil */}
        <div className="border-t border-gray-100 pt-4">
          <Button variant="danger" size="sm" onClick={() => void handleDelete()}>
            Gorevi Sil
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
