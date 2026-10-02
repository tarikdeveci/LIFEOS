import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { View, Text, TouchableOpacity, AppState } from 'react-native'
import {
  DEFAULT_POMODORO,
  focusMinutesByBlock,
  fromDateString,
  minutesBetween,
  newFocusSessionId,
  pomodoroDeadline,
  remainingFocusSeconds,
  shiftIsoDate,
  useFocusStore,
  type TimeBlock,
} from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { scheduleFocusNotification, cancelFocusNotifications, FOCUS_WORK_END_ID, FOCUS_BREAK_END_ID } from '@/src/notifications/focus'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** Yüklü odak oturumlarından blok başına toplam dakika. */
function useFocusMinutesByBlock(): Map<string, number> {
  const sessions = useFocusStore((s) => s.sessions)
  return useMemo(() => focusMinutesByBlock(sessions), [sessions])
}

interface Props {
  userId: string
  /** Planlamada seçili gün (YYYY-MM-DD) */
  date: string
  /** Şu an içinde bulunulan blok; sadece bugün görüntülenirken dolu */
  activeBlock: TimeBlock | null
  /** Hero kart yokken kendi kartında dursun. */
  wrap?: boolean
}

/**
 * Odak zamanlayıcısı (25/5). Durum paylaşılan focusStore'da, süre zaman damgasından
 * hesaplanır: uygulama arka plandayken de doğru kalır, döndüğünde tek seferde yakalar.
 * Bitişler yerel bildirimle haber verilir. Uygulama kapatılırsa süren tur kaybolur.
 */
export function FocusCard({ userId, date, activeBlock, wrap = false }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { active, pending, saving, saveError, start, tick, finish, close, save, load } = useFocusStore()
  const minutesByBlock = useFocusMinutesByBlock()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const from = fromDateString(date).toISOString()
    const to = fromDateString(shiftIsoDate(date, 1)).toISOString()
    void load(supabase, userId, from, to)
  }, [load, userId, date])

  const phase = active?.timer.phase
  const running = phase === 'work' || phase === 'break'

  useEffect(() => {
    if (!running) return
    const step = () => { const n = Date.now(); setNow(n); tick(n) }
    const id = setInterval(step, 1000)
    // Arka plandan dönüşte bir saniye beklemeden yakala.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') step() })
    return () => { clearInterval(id); sub.remove() }
  }, [running, tick])

  useEffect(() => {
    if (pending && !saving && !saveError) void save(supabase)
  }, [pending, saving, saveError, save])

  // Tur başlarken iki bitiş birden kurulur: arka planda store ilerlemediği için
  // molanın bildirimi odak bittiğinde kurulamazdı.
  const workStartedAt = active?.timer.phase === 'work' ? active.timer.phaseStartedAt : null
  useEffect(() => {
    if (!active || workStartedAt === null) return
    const workEnd = pomodoroDeadline(active.timer)
    void scheduleFocusNotification(FOCUS_WORK_END_ID, workEnd, 'work').catch(() => undefined)
    void scheduleFocusNotification(FOCUS_BREAK_END_ID, workEnd + active.timer.breakMinutes * 60_000, 'break').catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, workStartedAt])

  function handleStart(block: TimeBlock) {
    start(newFocusSessionId(), userId, block, Date.now())
  }

  function handleFinish() {
    void cancelFocusNotifications()
    finish(Date.now())
  }

  function handleClose() {
    void cancelFocusNotifications()
    finish(Date.now())
    close()
  }

  function handleAgain() {
    if (!active) return
    finish(Date.now())
    start(newFocusSessionId(), userId, { id: active.blockId, task_id: active.taskId, block_type: active.taskId ? 'task' : 'focus', label: active.label }, Date.now())
  }

  const blocked = pending !== null || saving

  const frame = (body: ReactNode) => wrap
    ? <GlassCard style={{ marginBottom: spacing[4] }}>{body}</GlassCard>
    : <View style={{ marginTop: spacing[4] }}>{body}</View>

  if (active) {
    const remaining = remainingFocusSeconds(active.timer, now)
    const phaseLabel = phase === 'work' ? t.focus_work : phase === 'break' ? t.focus_break : phase === 'ready' ? t.focus_ready : t.focus_stopped
    return frame(
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.accent, letterSpacing: 0.6, textTransform: 'uppercase' }}>{phaseLabel}</Text>
          <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={1}>{active.label || t.focus_work}</Text>
        </View>
        {running && (
          <Text style={{ fontSize: 44, fontWeight: fontWeight.extrabold, color: colors.textPrimary, fontVariant: ['tabular-nums'], textAlign: 'center', marginVertical: spacing[1] }}>
            {clock(remaining)}
          </Text>
        )}
        {saveError && (
          <TouchableOpacity onPress={() => void save(supabase, true)} style={{ marginBottom: spacing[2] }}>
            <Text style={{ fontSize: fontSize.xs, color: palette.danger }}>{t.focus_save_error} {t.focus_retry}</Text>
          </TouchableOpacity>
        )}
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
          {running ? (
            <Button label={t.focus_stop} onPress={handleFinish} variant="secondary" style={{ flex: 1 }} />
          ) : (
            <>
              {phase === 'ready' && <Button label={t.focus_again} onPress={handleAgain} disabled={blocked} style={{ flex: 1 }} />}
              <Button label={t.focus_close} onPress={handleClose} variant="ghost" disabled={blocked} style={{ flex: 1 }} />
            </>
          )}
        </View>
      </>,
    )
  }

  if (!activeBlock || activeBlock.completed_at) return null

  const actual = minutesByBlock.get(activeBlock.id) ?? 0
  const plan = minutesBetween(activeBlock.start_time.slice(0, 5), activeBlock.end_time.slice(0, 5))
  return frame(
    <>
      <Button
        label={`▶  ${t.focus_start.replace('{n}', String(DEFAULT_POMODORO.workMinutes))}`}
        onPress={() => handleStart(activeBlock)}
        disabled={blocked}
        fullWidth
      />
      {actual > 0 && (
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing[2] }}>
          {t.focus_actual.replace('{actual}', String(actual)).replace('{plan}', String(plan))}
        </Text>
      )}
    </>,
  )
}
