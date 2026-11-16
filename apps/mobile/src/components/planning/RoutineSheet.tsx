import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import type { BlockType, CreateRoutineInput, Routine, RoutineDayOverride, RoutineKind, Weekday } from '@lifeos/shared'
import { findSimilarRoutine, todayDate, useRoutineStore } from '@lifeos/shared'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { Input } from '@/src/components/ui/Input'
import { TimeField } from '@/src/components/ui/PickerField'
import { Button } from '@/src/components/ui/Button'
import { TaskGoalPicker } from '@/src/components/tasks/TaskGoalPicker'
import { RoutineProgramPicker } from './RoutineProgramPicker'
import { RoutineDayOverridesEditor, useRoutineDayOverrides } from './RoutineDayOverrides'
import { toDayRows, toOverrides } from '@/src/planning/dayRows'
import type { DayRows } from '@/src/planning/dayRows'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

/** Ekranda Pazartesi başlangıçlı sıra. */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface Props {
  userId: string
  visible: boolean
  /** null = yeni rutin */
  routine: Routine | null
  onClose: () => void
  /** overrides: güne göre saatler (082); undefined = dokunma, [] = hepsini kaldır. */
  onSave: (input: CreateRoutineInput, overrides?: RoutineDayOverride[]) => Promise<void>
  onDelete?: () => Promise<void>
  /** Yeni rutinde seçili gelen tür (alışkanlık kartından açılınca 'habit'). */
  defaultKind?: RoutineKind
}

interface FormState {
  title: string
  kind: RoutineKind
  days: Weekday[]
  biweekly: boolean
  /** Alışkanlık hedefi: günde N kez ya da haftada N gün. */
  habitMode: 'daily' | 'weekly'
  timesPerWeek: string
  timesPerDay: string
  start: string
  end: string
  /** Bağlı hedef; blok rutininde yok. */
  goalId: string | null
  /** Bağlı antrenman programı; yalnız blok rutininde, seçilince blok türü workout olur. */
  programId: string | null
  /** Asgari günde (081) de kalır; ad AI planlayıcının dokunmadığı rutinle aynı alan. */
  isProtected: boolean
  /** Asgari günde gösterilen süre (dk); boş = blok süresi. */
  minMinutes: string
  /** "Günlere göre farklı" açık mı; satırlar kayıtlı override'lardan dolar. */
  perDay: boolean
  dayRows: DayRows
}

function toForm(r: Routine | null, defaultKind: RoutineKind): FormState {
  return {
    title: r?.title ?? '',
    kind: r?.kind ?? defaultKind,
    days: r?.days_of_week ?? [new Date().getDay() as Weekday],
    biweekly: (r?.every_n_weeks ?? 1) === 2,
    habitMode: r && r.kind === 'habit' && r.times_per_day === null && r.times_per_week !== 7 ? 'weekly' : 'daily',
    timesPerWeek: String(r?.times_per_week ?? 3),
    timesPerDay: String(r?.times_per_day ?? 1),
    start: r?.start_time?.slice(0, 5) ?? (r ? '' : '09:00'),
    end: r?.end_time?.slice(0, 5) ?? (r ? '' : '10:00'),
    goalId: r?.goal_id ?? null,
    programId: r?.workout_program_id ?? null,
    isProtected: r?.is_protected ?? false,
    minMinutes: r?.min_minutes ? String(r.min_minutes) : '',
    perDay: false,
    dayRows: {},
  }
}

type FormError =
  | 'plan_err_name_required' | 'plan_err_pick_day' | 'plan_err_time_required'
  | 'plan_err_time_invalid' | 'plan_err_end_after_start' | 'routines_err_per_week' | 'routines_err_per_day' | 'routines_err_min_minutes'
  | 'routines_err_day_minutes'

/** Formu doğrular; hata varsa çeviri anahtarı, yoksa kayda hazır girdi döner. */
function toInput(f: FormState, isNew: boolean, blockType: BlockType): CreateRoutineInput | FormError {
  const title = f.title.trim()
  if (!title) return 'plan_err_name_required'
  if (f.kind === 'habit') {
    // Aralık dışı sayı sessizce kırpılmaz: 9 yazıp 7'ye düşen hedef rutini "her gün" moduna da geçiriyordu.
    if (f.habitMode === 'weekly') {
      const n = Number(f.timesPerWeek)
      if (!Number.isInteger(n) || n < 1 || n > 7) return 'routines_err_per_week'
      return { title, kind: 'habit', days_of_week: [], times_per_week: n, times_per_day: null, goal_id: f.goalId }
    }
    // Her gün: hafta hedefi 7 gün, gün sayaç N'ye ulaşınca tamam (1 = tek işaret).
    const n = Number(f.timesPerDay)
    if (!Number.isInteger(n) || n < 1 || n > 20) return 'routines_err_per_day'
    return { title, kind: 'habit', days_of_week: [], times_per_week: 7, times_per_day: n > 1 ? n : null, goal_id: f.goalId }
  }
  if (f.days.length === 0) return 'plan_err_pick_day'
  const hasTime = f.start !== '' || f.end !== ''
  if (f.kind === 'block' && !hasTime) return 'plan_err_time_required'
  if (hasTime && (!TIME_RE.test(f.start) || !TIME_RE.test(f.end))) return 'plan_err_time_invalid'
  if (hasTime && f.end === f.start) return 'plan_err_end_after_start'
  const minMinutes = f.isProtected && f.minMinutes !== '' ? Number(f.minMinutes) : null
  if (minMinutes !== null && (!Number.isInteger(minMinutes) || minMinutes < 1 || minMinutes > 600)) return 'routines_err_min_minutes'
  const blockKind: BlockType = f.kind === 'block' && f.programId ? 'workout' : blockType
  return {
    title,
    kind: f.kind,
    block_type: f.kind === 'block' ? blockKind : 'task',
    days_of_week: [...f.days].sort(),
    every_n_weeks: f.biweekly ? 2 : 1,
    ...(hasTime && { start_time: f.start, end_time: f.end }),
    // İki haftalık parite starts_on'a çapalı; düzenlemede eski çapa korunur.
    ...(isNew && { starts_on: todayDate() }),
    goal_id: f.kind === 'task' ? f.goalId : null,
    workout_program_id: f.kind === 'block' && blockKind === 'workout' ? f.programId : null,
    is_protected: f.isProtected,
    min_minutes: minMinutes,
  }
}

export function RoutineSheet({ userId, visible, routine, onClose, onSave, onDelete, defaultKind = 'block' }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [form, setForm] = useState<FormState>(() => toForm(routine, defaultKind))
  const [saving, setSaving] = useState(false)
  // Hata ve benzer rutin uyarısı formun içinde görünür (UX 2: bilgi için Alert açılmaz).
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null)
  const [warnedId, setWarnedId] = useState<string | null>(null)
  const dayOverrides = useRoutineDayOverrides(routine, visible)

  useEffect(() => {
    if (!visible) return
    setForm(toForm(routine, defaultKind))
    setNotice(null)
    setWarnedId(null)
  }, [visible, routine, defaultKind])

  // Kayıtlı satırlar gelince form onlarla açılır; yoksa anahtar kapalı kalır.
  useEffect(() => {
    if (!visible || dayOverrides.status !== 'ready' || dayOverrides.overrides.length === 0) return
    setForm((f) => ({ ...f, perDay: true, dayRows: toDayRows(dayOverrides.overrides) }))
  }, [visible, dayOverrides])

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))
  const names = t.routines_day_names.split(',')

  const handleSave = async () => {
    const input = toInput(form, routine === null, routine?.block_type ?? 'routine')
    if (typeof input === 'string') { setNotice({ text: t[input], warn: false }); return }
    // Yüklenemediyse ya da hâlâ yükleniyorsa kayıtlı satırlara dokunulmaz.
    let overrides: RoutineDayOverride[] | undefined
    if (form.kind !== 'habit' && dayOverrides.status === 'ready') {
      const days = input.days_of_week ?? []
      const next = form.perDay ? toOverrides(form.dayRows, days) : []
      if (typeof next === 'string') { setNotice({ text: t[next], warn: false }); return }
      overrides = next.length > 0 || dayOverrides.overrides.length > 0 ? next : undefined
    }
    // Aynı iş iki kez girilmesin: benzer rutin varsa önce söylenir, ikinci Kaydet yine kaydeder.
    const similar = findSimilarRoutine(input, useRoutineStore.getState().routines, routine?.id ?? null)
    if (similar && similar.id !== warnedId) {
      setWarnedId(similar.id)
      setNotice({ text: t.ux_routine_similar.replace('{title}', similar.title), warn: true })
      return
    }
    setNotice(null)
    setSaving(true)
    try { await onSave(input, overrides); onClose() }
    catch { setNotice({ text: t.routines_error, warn: false }) }
    finally { setSaving(false) }
  }

  const handleDelete = () => {
    if (!onDelete) return
    Alert.alert(t.routines_delete_confirm, undefined, [
      { text: t.routines_cancel, style: 'cancel' },
      {
        text: t.routines_delete, style: 'destructive', onPress: async () => {
          try { await onDelete(); onClose() }
          catch { Alert.alert(t.routines_error) }
        },
      },
    ])
  }

  const chip = (active: boolean, disabled = false) => ({
    paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.md, borderWidth: 1,
    backgroundColor: active ? palette.accent : colors.glassInner,
    borderColor: active ? palette.accent : colors.border,
    opacity: disabled ? 0.4 : 1,
  })
  const chipText = (active: boolean) => ({ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: active ? '#fff' : colors.textMuted })

  const kinds: [RoutineKind, string][] = [
    ['block', t.routines_kind_block], ['task', t.routines_kind_task], ['habit', t.routines_kind_habit],
  ]

  return (
    <BottomSheet visible={visible} onClose={onClose} title={routine ? t.routines_edit : t.routines_add} scrollable>
      <View style={{ gap: spacing[3] }}>
        <Input label={t.routines_name} value={form.title} onChangeText={(v) => patch({ title: v })} placeholder={t.routines_name_placeholder} />

        {/* Tür, var olan rutinde değişmez: örnekler farklı tablolarda. */}
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {kinds.map(([k, lbl]) => {
            const locked = routine !== null && routine.kind !== k
            return (
              <TouchableOpacity key={k} disabled={locked} onPress={() => patch({ kind: k })} style={chip(form.kind === k, locked)}>
                <Text style={chipText(form.kind === k)}>{lbl}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {form.kind === 'habit' ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {(['daily', 'weekly'] as const).map((m) => (
                <TouchableOpacity key={m} onPress={() => patch({ habitMode: m })} style={chip(form.habitMode === m)}>
                  <Text style={chipText(form.habitMode === m)}>{m === 'daily' ? t.routines_habit_daily : t.routines_habit_weekly}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.habitMode === 'daily' ? (
              <Input label={t.routines_times_per_day} value={form.timesPerDay} keyboardType="number-pad"
                onChangeText={(v) => patch({ timesPerDay: v.replace(/\D/g, '').slice(0, 2) })} />
            ) : (
              <Input label={t.routines_times_per_week} value={form.timesPerWeek} keyboardType="number-pad"
                onChangeText={(v) => patch({ timesPerWeek: v.replace(/\D/g, '').slice(0, 1) })} />
            )}
          </>
        ) : (
          <>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted }}>{t.routines_days}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {WEEKDAY_ORDER.map((d) => {
                const on = form.days.includes(d)
                return (
                  <TouchableOpacity key={d} onPress={() => patch({ days: on ? form.days.filter((x) => x !== d) : [...form.days, d] })} style={chip(on)}>
                    <Text style={chipText(on)}>{names[d]}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <TouchableOpacity onPress={() => patch({ biweekly: !form.biweekly })} style={[chip(form.biweekly), { alignSelf: 'flex-start' }]}>
              <Text style={chipText(form.biweekly)}>{t.routines_biweekly}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <TimeField label={t.routines_start} value={form.start} onChange={(v) => patch({ start: v })} defaultTime="09:00" onClear={form.kind === 'task' ? () => patch({ start: '', end: '' }) : undefined} containerStyle={{ flex: 1 }} />
              <TimeField label={t.routines_end} value={form.end} onChange={(v) => patch({ end: v })} defaultTime={form.start || '10:00'} onClear={form.kind === 'task' ? () => patch({ start: '', end: '' }) : undefined} containerStyle={{ flex: 1 }} />
            </View>
            {form.kind === 'task' && <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.routines_time_optional}</Text>}
            {form.days.length > 1 && dayOverrides.status === 'ready' && (
              <TouchableOpacity
                onPress={() => patch({ perDay: !form.perDay })}
                accessibilityRole="switch"
                accessibilityState={{ checked: form.perDay }}
                style={[chip(form.perDay), { alignSelf: 'flex-start' }]}
              >
                <Text style={chipText(form.perDay)}>{t.routines_per_day}</Text>
              </TouchableOpacity>
            )}
            {dayOverrides.status === 'error' && (
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.routines_per_day_load_error}</Text>
            )}
            {form.perDay && form.days.length > 1 && dayOverrides.status === 'ready' && (
              <RoutineDayOverridesEditor
                days={WEEKDAY_ORDER.filter((d) => form.days.includes(d))}
                rows={form.dayRows}
                onChange={(dayRows) => patch({ dayRows })}
                start={form.start}
                end={form.end}
              />
            )}
            <TouchableOpacity
              onPress={() => patch({ isProtected: !form.isProtected })}
              accessibilityRole="switch"
              accessibilityState={{ checked: form.isProtected }}
              style={[chip(form.isProtected), { alignSelf: 'flex-start' }]}
            >
              <Text style={chipText(form.isProtected)}>{t.routines_protected}</Text>
            </TouchableOpacity>
            {form.isProtected && (
              <Input label={t.routines_min_minutes} value={form.minMinutes} keyboardType="number-pad"
                onChangeText={(v) => patch({ minMinutes: v.replace(/\D/g, '').slice(0, 3) })} />
            )}
          </>
        )}

        {form.kind !== 'block' && (
          <TaskGoalPicker userId={userId} goalId={form.goalId} onChange={(goalId) => patch({ goalId })} />
        )}
        {form.kind === 'block' && (
          <RoutineProgramPicker userId={userId} programId={form.programId} onChange={(programId) => patch({ programId })} />
        )}

        {notice && (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: notice.warn ? palette.warning : palette.danger }}>{notice.text}</Text>
        )}
        <Button label={notice?.warn ? t.ux_routine_save_anyway : t.routines_save} onPress={() => void handleSave()} loading={saving} fullWidth style={{ marginTop: spacing[2] }} />
        {routine && onDelete && <Button label={t.routines_delete} onPress={handleDelete} variant="danger" fullWidth />}
      </View>
    </BottomSheet>
  )
}
