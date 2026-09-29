import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import type { BlockType, CreateRoutineInput, Routine, RoutineKind, Weekday } from '@lifeos/shared'
import { todayDate } from '@lifeos/shared'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

/** Ekranda Pazartesi başlangıçlı sıra. */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface Props {
  visible: boolean
  /** null = yeni rutin */
  routine: Routine | null
  onClose: () => void
  onSave: (input: CreateRoutineInput) => Promise<void>
  onDelete?: () => Promise<void>
}

interface FormState {
  title: string
  kind: RoutineKind
  days: Weekday[]
  biweekly: boolean
  timesPerWeek: string
  start: string
  end: string
}

function toForm(r: Routine | null): FormState {
  return {
    title: r?.title ?? '',
    kind: r?.kind ?? 'block',
    days: r?.days_of_week ?? [new Date().getDay() as Weekday],
    biweekly: (r?.every_n_weeks ?? 1) === 2,
    timesPerWeek: String(r?.times_per_week ?? 3),
    start: r?.start_time?.slice(0, 5) ?? (r ? '' : '09:00'),
    end: r?.end_time?.slice(0, 5) ?? (r ? '' : '10:00'),
  }
}

/** Formu doğrular; hata varsa mesaj, yoksa kayda hazır girdi döner. */
function toInput(f: FormState, isNew: boolean, blockType: BlockType): CreateRoutineInput | string {
  const title = f.title.trim()
  if (!title) return 'Ad gerekli'
  if (f.kind === 'habit') {
    const n = Math.min(7, Math.max(1, Number(f.timesPerWeek) || 1))
    return { title, kind: 'habit', days_of_week: [], times_per_week: n }
  }
  if (f.days.length === 0) return 'En az bir gün seç'
  const hasTime = f.start !== '' || f.end !== ''
  if (f.kind === 'block' && !hasTime) return 'Saat gerekli'
  if (hasTime && (!TIME_RE.test(f.start) || !TIME_RE.test(f.end))) return 'Saat SS:DD biçiminde olmalı'
  if (hasTime && f.end <= f.start) return 'Bitiş saati başlangıçtan sonra olmalı'
  return {
    title,
    kind: f.kind,
    block_type: f.kind === 'block' ? blockType : 'task',
    days_of_week: [...f.days].sort(),
    every_n_weeks: f.biweekly ? 2 : 1,
    ...(hasTime && { start_time: f.start, end_time: f.end }),
    // İki haftalık parite starts_on'a çapalı; düzenlemede eski çapa korunur.
    ...(isNew && { starts_on: todayDate() }),
  }
}

export function RoutineSheet({ visible, routine, onClose, onSave, onDelete }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [form, setForm] = useState<FormState>(() => toForm(routine))
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (visible) setForm(toForm(routine)) }, [visible, routine])

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))
  const names = t.routines_day_names.split(',')

  const handleSave = async () => {
    const input = toInput(form, routine === null, routine?.block_type ?? 'routine')
    if (typeof input === 'string') { Alert.alert(input); return }
    setSaving(true)
    try { await onSave(input); onClose() }
    catch { Alert.alert(t.routines_error) }
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
          <Input label={t.routines_times_per_week} value={form.timesPerWeek} keyboardType="number-pad"
            onChangeText={(v) => patch({ timesPerWeek: v.replace(/\D/g, '').slice(0, 1) })} />
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
              <Input label={t.routines_start} value={form.start} onChangeText={(v) => patch({ start: v })} placeholder="09:00" containerStyle={{ flex: 1 }} />
              <Input label={t.routines_end} value={form.end} onChangeText={(v) => patch({ end: v })} placeholder="10:00" containerStyle={{ flex: 1 }} />
            </View>
            {form.kind === 'task' && <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.routines_time_optional}</Text>}
          </>
        )}

        <Button label={t.routines_save} onPress={() => void handleSave()} loading={saving} fullWidth style={{ marginTop: spacing[2] }} />
        {routine && onDelete && <Button label={t.routines_delete} onPress={handleDelete} variant="danger" fullWidth />}
      </View>
    </BottomSheet>
  )
}
