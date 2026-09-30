import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
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

const ENERGY_LEVELS = [
  { level: 1 as const, emoji: '😴', label: 'Bitkin' },
  { level: 2 as const, emoji: '😑', label: 'Düşük' },
  { level: 3 as const, emoji: '😐', label: 'Orta' },
  { level: 4 as const, emoji: '😊', label: 'İyi' },
  { level: 5 as const, emoji: '🔥', label: 'Harika' },
]

/** Giriş adımı: enerji ve plan yolu seçimi. 0, 1, 2 ritüelin üç adımı. */
const INTRO = -1

interface Props {
  userId: string
  visible: boolean
  onClose: () => void
  /** AI yolu seçildi; pencereyi kapatıp AI sohbetini açmak çağıranın işi. */
  onAiPlan: () => void
  /** Pro durumu ve kalan ücretsiz plan sayısıyla AI düğmesinin etiketi. */
  aiLabel: string
}

/** Ritüelin durumu: adım, backlog, seçilenler, meşgul bayrağı. */
function useRitualState(visible: boolean, userId: string) {
  const [step, setStep] = useState(INTRO)
  const [backlog, setBacklog] = useState<Task[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible) return
    setStep(INTRO); setPicked(new Set()); setBacklog(null)
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
 * "Günü planla": planlamanın tek girişi. Önce enerji sorulur (AI planı ona göre kurar), sonra
 * iki yol: AI ile planla ya da sabah ritüeli (web MorningRitual ile aynı akış: dünden kalanlar,
 * backlog'dan seç, otomatik yerleştir). Ritüel bitince daily_plans.ritual_completed_at yazılır.
 */
export function RitualSheet({ userId, visible, onClose, onAiPlan, aiLabel }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { dailyPlan, flexTasks, carryoverTasks, timeBlocks, busy, fetchDayData, placeTasks, completeRitual, setEnergyLevel } = usePlanningStore()
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

  const pickEnergy = (level: 1 | 2 | 3 | 4 | 5) => {
    setEnergyLevel(supabase, level).catch(() => Alert.alert('Hata', 'Enerji seviyesi kaydedilemedi'))
  }

  const option = (icon: 'list-outline' | 'sparkles-outline', title: string, hint: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.accent}18` }}>
        <Ionicons name={icon} size={18} color={palette.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{title}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </TouchableOpacity>
  )

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing[2], padding: spacing[2], borderRadius: radius.md, backgroundColor: colors.glassInner }
  const chip = (primary: boolean) => ({ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.md, backgroundColor: primary ? `${palette.accent}18` : colors.bgSurface })
  const steps = [t.ritual_step1, t.ritual_step2, t.ritual_step3]

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t.ritual_start} scrollable>
      <View style={{ gap: spacing[3] }}>
        {s.step === INTRO && (
          <>
            {dailyPlan && (
              <>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted }}>{t.plan_energy_q}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[2] }}>
                  {ENERGY_LEVELS.map(({ level, emoji, label }) => {
                    const active = dailyPlan.energy_level === level
                    return (
                      <TouchableOpacity key={level} onPress={() => pickEnergy(level)} accessibilityLabel={label} accessibilityState={{ selected: active }}
                        style={{ alignItems: 'center', gap: 4, width: 56 }}>
                        <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? `${palette.accent}1F` : colors.glassInner, borderWidth: 2, borderColor: active ? palette.accent : 'transparent' }}>
                          <Text style={{ fontSize: 22 }}>{emoji}</Text>
                        </View>
                        <Text style={{ fontSize: fontSize.xs, color: active ? palette.accent : colors.textSubtle, fontWeight: active ? fontWeight.semibold : fontWeight.regular }}>{label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            )}
            {option('sparkles-outline', aiLabel, t.ritual_ai_hint, onAiPlan)}
            {option('list-outline', t.ritual_manual, t.ritual_manual_hint, () => s.setStep(0))}
          </>
        )}

        {s.step !== INTRO && (
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>
            {s.step + 1}/3 · {steps[s.step]}
          </Text>
        )}

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

        {s.step !== INTRO && <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
          <Button label={t.ritual_back} onPress={() => s.setStep(s.step - 1)} variant="ghost" disabled={s.busy} style={{ flex: 1 }} />
          <Button
            label={s.step === 2 ? t.ritual_finish : t.ritual_next}
            onPress={() => void (s.step === 0 ? leaveStepOne() : s.step === 1 ? leaveStepTwo() : finish())}
            loading={s.busy}
            style={{ flex: 1 }}
          />
        </View>}
      </View>
    </BottomSheet>
  )
}
