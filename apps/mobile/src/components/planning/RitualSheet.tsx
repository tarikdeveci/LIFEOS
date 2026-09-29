import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import type { Task } from '@lifeos/shared'
import { autoPlace, minutesOfDay, todayDate, usePlanningStore, useTaskStore } from '@lifeos/shared'
import { assignTaskToDate, getBacklogTasks } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { Button } from '@/src/components/ui/Button'
import { TaskCheckbox } from '@/src/components/ui/TaskCheckbox'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props {
  userId: string
  visible: boolean
  onClose: () => void
}

/** Ritüelin durumu: adım, backlog, seçilenler, meşgul bayrağı. */
function useRitualState(visible: boolean, userId: string) {
  const [step, setStep] = useState(0)
  const [backlog, setBacklog] = useState<Task[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible) return
    setStep(0); setPicked(new Set()); setBacklog(null)
    void (async () => {
      try {
        const tasks = await getBacklogTasks(supabase, userId)
        setBacklog([...tasks].sort((a, b) => b.priority_score - a.priority_score))
      } catch { setBacklog([]) }
    })()
  }, [visible, userId])

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  return { step, setStep, backlog, picked, toggle, busy, setBusy }
}

/**
 * Sabah ritüeli (web MorningRitual ile aynı akış): dünden kalanlar, backlog'dan seç,
 * otomatik yerleştir. Bitince daily_plans.ritual_completed_at yazılır.
 */
export function RitualSheet({ userId, visible, onClose }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { flexTasks, carryoverTasks, timeBlocks, busy, fetchDayData, placeTasks, completeRitual } = usePlanningStore()
  const { updateTask } = useTaskStore()
  const s = useRitualState(visible, userId)
  const [handled, setHandled] = useState<Set<string>>(new Set())
  useEffect(() => { if (visible) setHandled(new Set()) }, [visible])

  const today = todayDate()
  const carried = [...carryoverTasks, ...flexTasks.filter((task) => task.carry_count > 0)]
  const pending = carried.filter((task) => !handled.has(task.id))
  const unblocked = flexTasks.filter((task) => !timeBlocks.some((b) => b.task_id === task.id))

  const guard = async (fn: () => Promise<void>) => {
    s.setBusy(true)
    try { await fn() } catch { Alert.alert(t.ritual_error) } finally { s.setBusy(false) }
  }

  const decide = (task: Task, keep: boolean) => {
    setHandled((prev) => new Set(prev).add(task.id))
    void guard(() => updateTask(supabase, task.id, keep
      ? { status: 'planned', scheduled_date: today, carry_count: 0 }
      : { status: 'backlog', scheduled_date: null }))
  }

  // Karar verilmeyen devredenler bugüne alınır; sayaçları sıfırlanmaz.
  const leaveStepOne = () => guard(async () => {
    await Promise.all(pending.filter((task) => task.scheduled_date !== today)
      .map((task) => updateTask(supabase, task.id, { status: 'planned', scheduled_date: today })))
    s.setStep(1)
  })

  const leaveStepTwo = () => guard(async () => {
    await Promise.all([...s.picked].map((id) => assignTaskToDate(supabase, id, today)))
    await fetchDayData(supabase, userId, today)
    s.setStep(2)
  })

  const place = () => guard(async () => {
    const { placements, unplaced } = autoPlace(unblocked, timeBlocks, { from: minutesOfDay(), gap: 10, busy })
    const n = await placeTasks(supabase, userId, placements, Object.fromEntries(unblocked.map((task) => [task.id, task.title])))
    const msg = [t.ritual_placed.replace('{n}', String(n))]
    if (unplaced.length > 0) msg.push(t.ritual_unplaced.replace('{n}', String(unplaced.length)))
    Alert.alert(msg.join('\n'))
  })

  const finish = async () => {
    try { await completeRitual(supabase) } catch { /* kapanış yazılamazsa ritüel yarın değil bugün tekrar sorulur */ }
    onClose()
  }

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing[2], padding: spacing[2], borderRadius: radius.md, backgroundColor: colors.glassInner }
  const chip = (primary: boolean) => ({ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.md, backgroundColor: primary ? `${palette.accent}18` : colors.bgSurface })
  const steps = [t.ritual_step1, t.ritual_step2, t.ritual_step3]

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t.ritual_title} scrollable>
      <View style={{ gap: spacing[3] }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>
          {s.step + 1}/3 · {steps[s.step]}
        </Text>

        {s.step === 0 && (pending.length === 0
          ? <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle }}>{t.ritual_step1_empty}</Text>
          : pending.map((task) => (
            <View key={task.id} style={row}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{task.title}</Text>
              <TouchableOpacity onPress={() => decide(task, true)} style={chip(true)}>
                <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>{t.ritual_keep}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => decide(task, false)} style={chip(false)}>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium }}>{t.ritual_backlog}</Text>
              </TouchableOpacity>
            </View>
          )))}

        {s.step === 1 && (s.backlog === null
          ? <ActivityIndicator color={palette.accent} />
          : s.backlog.length === 0
            ? <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle }}>{t.ritual_step2_empty}</Text>
            : s.backlog.slice(0, 20).map((task) => (
              <TouchableOpacity key={task.id} onPress={() => s.toggle(task.id)} style={row}>
                <TaskCheckbox done={s.picked.has(task.id)} onToggle={() => s.toggle(task.id)} />
                <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{task.title}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{task.priority_score.toFixed(1)}</Text>
              </TouchableOpacity>
            )))}

        {s.step === 2 && (
          <>
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.ritual_step3_hint}</Text>
            <Button label={`${t.ritual_auto_place} (${unblocked.length})`} onPress={() => void place()} variant="secondary"
              disabled={s.busy || unblocked.length === 0} />
          </>
        )}

        <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
          {s.step > 0 && <Button label={t.ritual_back} onPress={() => s.setStep(s.step - 1)} variant="ghost" disabled={s.busy} style={{ flex: 1 }} />}
          <Button
            label={s.step === 2 ? t.ritual_finish : t.ritual_next}
            onPress={() => void (s.step === 0 ? leaveStepOne() : s.step === 1 ? leaveStepTwo() : finish())}
            loading={s.busy}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </BottomSheet>
  )
}
