'use client'

import { useState } from 'react'
import type { CreateTaskInput, QuickParseResult, Task } from '@lifeos/shared'
import {
  addMinutesToClock,
  BRAIN_DUMP_MAX_CHARS,
  DEFAULT_TASK_MINUTES,
  describeAiError,
  parseBrainDump,
  relativeDateLabel,
  sanitizeBrainDumpItems,
  todayDate,
} from '@lifeos/shared'
import { createTimeBlocks } from '@lifeos/shared/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase/client'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useSpeechInput } from '@/lib/hooks/useSpeechInput'
import { useLang } from '@/lib/contexts/LangContext'
import { LifeSetupModal } from './LifeSetupModal'

interface BrainDumpModalProps {
  open: boolean
  onClose: () => void
  onCreateTask: (input: CreateTaskInput) => Promise<Task | void>
  /** Verilirse "Hayat planımı kur" bağlantısı görünür. */
  userId?: string
}

/** `created`: görev yazıldı ama zaman bloğu düştüyse görev burada kalır, tekrar denemede yalnız blok yazılır. */
interface Candidate extends QuickParseResult { keep: boolean; created?: Task }

/** Aklındakileri dök: konuş ya da yaz, görevlere bölünsün, onayla ve ekle. */
export function BrainDumpModal({ open, onClose, onCreateTask, userId }: BrainDumpModalProps) {
  const { t, lang } = useLang()
  const { isPro } = useSubscription()
  const [text, setText] = useState('')
  const [items, setItems] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const speech = useSpeechInput((chunk) => setText((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${chunk}`))

  const reset = () => { setText(''); setItems(null); setError(null); speech.stop(); onClose() }

  const splitFree = () => setItems(parseBrainDump(text, todayDate()).map((r) => ({ ...r, keep: true })))

  const splitWithAi = async () => {
    setBusy('ai')
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      const { data, error: fnError } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { type: 'brain_dump', user_message: text, today: todayDate() },
      })
      if (fnError) throw fnError
      setItems(sanitizeBrainDumpItems((data as { tasks?: unknown }).tasks).map((r) => ({ ...r, keep: true })))
    } catch (err) {
      setError((await describeAiError(err, lang)).message)
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!items) return
    setBusy('save')
    setError(null)
    // Kaydedilen satırlar listeden düşer: yarıda hata olursa tekrar tıklamak
    // aynı görevleri ikinci kez eklemez.
    let remaining = items
    try {
      for (const item of items.filter((i) => i.keep && i.title.trim())) {
        const created = item.created ?? await onCreateTask({
          title: item.title.trim(),
          ...(item.tags.length > 0 && { tags: item.tags }),
          ...(item.scheduled_date && { scheduled_date: item.scheduled_date, status: 'planned' as const }),
          ...(item.due_date && { due_date: item.due_date }),
          ...(item.estimated_minutes && { estimated_minutes: item.estimated_minutes }),
          ...(item.effort_score !== undefined && { effort_score: item.effort_score }),
        })
        // Görev yazıldı: yeniden eklenmesin. Blok yazımı düşerse satır görevle birlikte listede
        // kalır ve tekrar denemede yalnız blok yazılır.
        const written = created ? { ...item, created } : item
        remaining = remaining.map((x) => (x === item ? written : x))
        if (created && item.start_time && item.scheduled_date) {
          await createTimeBlocks(supabase, created.user_id, [{
            date: item.scheduled_date,
            start_time: item.start_time,
            end_time: addMinutesToClock(item.start_time, item.estimated_minutes ?? DEFAULT_TASK_MINUTES),
            block_type: 'task', label: created.title, task_id: created.id,
          }])
        }
        remaining = remaining.filter((x) => x !== written)
      }
      reset()
    } catch {
      setItems(remaining)
      setError(t.brain_error)
    } finally {
      setBusy(null)
    }
  }

  const kept = items?.filter((i) => i.keep).length ?? 0

  return (
    <>
    <Modal open={open && !setupOpen} onClose={reset} title={t.brain_title} size="lg">
      {items === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t.brain_hint}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={BRAIN_DUMP_MAX_CHARS}
            rows={8}
            placeholder={t.brain_placeholder}
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            {speech.supported && (
              <Button variant="outline" size="sm" onClick={speech.listening ? speech.stop : speech.start}>
                {speech.listening ? `⏹ ${t.brain_stop}` : `🎤 ${t.brain_speak}`}
              </Button>
            )}
            {userId && (
              <button onClick={() => setSetupOpen(true)} className="text-xs font-medium text-accent hover:underline">
                {t.setup_link}
              </button>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={splitFree} disabled={!text.trim()}>{t.brain_split}</Button>
            {isPro && (
              <Button size="sm" onClick={() => void splitWithAi()} disabled={!text.trim() || busy !== null} loading={busy === 'ai'}>
                ✨ {t.brain_ai}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-sm text-muted">{t.brain_empty}</p>}
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-background px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={item.keep}
                  onChange={(e) => setItems((list) => list?.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)) ?? null)}
                />
                <input
                  value={item.title}
                  onChange={(e) => setItems((list) => list?.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) ?? null)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none"
                />
                <span className="shrink-0 text-[10px] text-muted">
                  {[item.scheduled_date && `${relativeDateLabel(item.scheduled_date, lang)}${item.start_time ? ` ${item.start_time}` : ''}`,
                    item.estimated_minutes && `${item.estimated_minutes} ${t.unit_min_short}`,
                    ...item.tags.map((tag) => `#${tag}`)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setItems(null)}>{t.brain_back}</Button>
            <div className="flex-1" />
            <Button size="sm" onClick={() => void save()} disabled={kept === 0 || busy !== null} loading={busy === 'save'}>
              {t.brain_add.replace('{n}', String(kept))}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </Modal>
    {userId && (
      <LifeSetupModal
        open={open && setupOpen}
        onClose={() => setSetupOpen(false)}
        onDone={() => { setSetupOpen(false); reset() }}
        userId={userId}
      />
    )}
    </>
  )
}
