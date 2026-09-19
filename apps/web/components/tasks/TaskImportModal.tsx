'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { TASK_IMPORT_LIMIT, type ImportedTask } from '@lifeos/shared'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'
import { readImportFile, useTaskImport } from '@/lib/hooks/useTaskImport'

interface TaskImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (tasks: ImportedTask[]) => Promise<void>
}

const FIELD_CLASS = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-primary outline-none placeholder:text-muted/50 focus:border-accent focus:bg-white'

/** Düz liste ya da CSV'den görevleri önizleyip backlog'a toplu ekler. */
export function TaskImportModal({ open, onClose, onImport }: TaskImportModalProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const flow = useTaskImport()

  const close = () => {
    if (importing) return
    flow.reset()
    onClose()
  }

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const content = await readImportFile(file)
      flow.setText(content)
      flow.preview(content)
    } catch {
      showToast(t.tasks_import_file_error, 'error')
    }
  }

  const handleImport = async () => {
    if (flow.chosen.length === 0) return
    setImporting(true)
    try {
      await onImport(flow.chosen)
      showToast(t.tasks_import_success.replace('{n}', String(flow.chosen.length)), 'success')
      flow.reset()
      onClose()
    } catch {
      showToast(t.tasks_import_error, 'error')
    } finally {
      setImporting(false)
    }
  }

  const result = flow.result

  return (
    <Modal open={open} onClose={close} title={t.tasks_import_title} size="lg">
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t.tasks_import_hint}</p>
          <textarea
            value={flow.text}
            onChange={(e) => flow.setText(e.target.value)}
            placeholder={t.tasks_import_placeholder}
            className={`${FIELD_CLASS} min-h-[220px] font-mono`}
            autoFocus
          />
          <div className="flex items-center justify-between gap-3">
            <input ref={fileRef} type="file" accept=".csv,.txt,.md,.tsv,text/csv,text/plain" className="hidden"
              onChange={(e) => void handleFile(e)} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {t.tasks_import_file}
            </Button>
            <Button onClick={() => flow.preview(flow.text)} disabled={!flow.text.trim()}>
              {t.tasks_import_next}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {result.tasks.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-muted">{t.tasks_import_empty}</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {t.tasks_import_selected
                    .replace('{selected}', String(flow.selected.size))
                    .replace('{total}', String(result.tasks.length))}
                </span>
                <div className="flex gap-3">
                  <button type="button" onClick={flow.selectAll} className="font-medium hover:text-primary">{t.tasks_import_select_all}</button>
                  <button type="button" onClick={flow.selectNone} className="font-medium hover:text-primary">{t.tasks_import_select_none}</button>
                </div>
              </div>
              <ul className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                {result.tasks.map((task, index) => (
                  <li key={`${index}-${task.title}`}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <input type="checkbox" checked={flow.selected.has(index)} onChange={() => flow.toggle(index)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${task.done ? 'text-muted line-through' : 'text-primary'}`}>{task.title}</span>
                        {(task.description || task.due_date || task.done) && (
                          <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                            {task.due_date && <span>{task.due_date}</span>}
                            {task.done && <span>{t.tasks_import_done_badge}</span>}
                            {task.description && <span className="truncate">{task.description}</span>}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {result.overLimit > 0 && (
                <p className="text-xs text-amber-600">
                  {t.tasks_import_over_limit
                    .replace('{n}', String(result.overLimit))
                    .replace('{limit}', String(TASK_IMPORT_LIMIT))}
                </p>
              )}
            </>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={flow.back} disabled={importing}>{t.tasks_import_back}</Button>
            <Button onClick={() => void handleImport()} loading={importing} disabled={flow.chosen.length === 0}>
              {t.tasks_import_submit.replace('{n}', String(flow.chosen.length))}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
