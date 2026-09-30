'use client'

import { useEffect, useMemo, useState } from 'react'
import type { TimeBlock } from '@lifeos/shared'
import {
  DEFAULT_POMODORO,
  focusMinutesByBlock,
  minutesBetween,
  newFocusSessionId,
  remainingFocusSeconds,
  shiftIsoDate,
  todayDate,
  useFocusStore,
} from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useLang } from '@/lib/contexts/LangContext'

/** Yerel günün başı, UTC anı olarak. `YYYY-MM-DDT00:00` Z'siz yazılınca tarayıcı yerel saatle okur. */
function localDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString()
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface FocusTimerProps {
  userId: string
}

/**
 * Sağ alttaki odak zamanlayıcısı (25/5). Korumalı düzende bir kez durur, sayfa değişse de
 * sayar. Durum paylaşılan focusStore'da; bu bileşen saniyede bir ilerletir ve biten odak
 * süresini `focus_sessions`'a yazar. Sayfa yenilenirse süren tur kaybolur (bellekte tutuluyor).
 */
export function FocusTimer({ userId }: FocusTimerProps) {
  const { t } = useLang()
  const { active, pending, saving, saveError, tick, finish, close, save, start } = useFocusStore()
  const [now, setNow] = useState(() => Date.now())

  const running = active !== null && (active.timer.phase === 'work' || active.timer.phase === 'break')
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => { const n = Date.now(); setNow(n); tick(n) }, 1000)
    return () => window.clearInterval(id)
  }, [running, tick])

  // Biten odak süresi kaydedilmeyi bekliyor: hata yoksa hemen yaz.
  useEffect(() => {
    if (pending && !saving && !saveError) void save(supabase)
  }, [pending, saving, saveError, save])

  const remaining = active ? remainingFocusSeconds(active.timer, now) : 0
  const phase = active?.timer.phase

  // Sekme başlığında kalan süre: başka sekmedeyken de görünsün.
  useEffect(() => {
    if (!running) return
    const original = document.title
    document.title = `${clock(remaining)} · ${phase === 'work' ? t.focus_work : t.focus_break}`
    return () => { document.title = original }
  }, [running, remaining, phase, t.focus_work, t.focus_break])

  if (!active) return null

  const again = () => {
    finish(Date.now())
    start(newFocusSessionId(), userId, { id: active.blockId, task_id: active.taskId, block_type: active.taskId ? 'task' : 'focus', label: active.label }, Date.now())
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-64 rounded-2xl border border-border bg-surface p-4 shadow-2xl" role="timer" aria-live="polite">
      <p className="truncate text-xs text-muted">{active.label || t.focus_work}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
        {phase === 'work' ? t.focus_work : phase === 'break' ? t.focus_break : phase === 'ready' ? t.focus_ready : t.focus_stopped}
      </p>
      {running && <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-primary">{clock(remaining)}</p>}
      {saveError && (
        <p className="mt-2 text-xs text-danger">
          {t.focus_save_error}{' '}
          <button className="underline" onClick={() => void save(supabase, true)}>{t.focus_retry}</button>
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={() => finish(Date.now())}>{t.focus_stop}</Button>
        ) : (
          <>
            {phase === 'ready' && <Button size="sm" onClick={again} disabled={pending !== null || saving}>{t.focus_again}</Button>}
            <Button size="sm" variant="ghost" disabled={pending !== null || saving} onClick={() => { finish(Date.now()); close() }}>{t.focus_close}</Button>
          </>
        )}
      </div>
    </div>
  )
}

interface FocusBlockActionProps {
  block: TimeBlock
  userId: string
  onStarted: () => void
}

/** Blok ayrıntısında "Odaklan" düğmesi ve o bloğa ait gerçek / plan odak süresi. */
export function FocusBlockAction({ block, userId, onStarted }: FocusBlockActionProps) {
  const { t } = useLang()
  const { active, pending, saving, sessions, start, load } = useFocusStore()
  // Oturumlar bloğun gününe göre yüklenir; store birleştirerek tutar.
  useEffect(() => {
    void load(supabase, userId, localDayStartIso(block.date), localDayStartIso(shiftIsoDate(block.date, 1)))
  }, [load, userId, block.date])
  const actual = useMemo(() => focusMinutesByBlock(sessions).get(block.id) ?? 0, [sessions, block.id])
  const plan = minutesBetween(block.start_time.slice(0, 5), block.end_time.slice(0, 5))
  const busy = pending !== null || saving || (active !== null && (active.timer.phase === 'work' || active.timer.phase === 'break'))
  const isToday = block.date === todayDate()

  return (
    <div className="space-y-1.5">
      {actual > 0 && (
        <p className="text-xs text-muted">{t.focus_actual.replace('{actual}', String(actual)).replace('{plan}', String(plan))}</p>
      )}
      {isToday && !block.completed_at && (
        <button
          disabled={busy}
          onClick={() => { start(newFocusSessionId(), userId, block, Date.now()); onStarted() }}
          className="w-full rounded-xl bg-accent/10 py-2.5 text-sm font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          title={busy ? t.focus_busy : undefined}
        >
          ▶ {t.focus_start.replace('{n}', String(DEFAULT_POMODORO.workMinutes))}
        </button>
      )}
    </div>
  )
}
