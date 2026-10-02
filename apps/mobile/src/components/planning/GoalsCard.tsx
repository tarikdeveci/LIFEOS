import { useCallback, useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import type { GoalCountMode } from '@lifeos/shared'
import { goalPeriodStart, goalTreeProgress, todayDate, useGoalStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { CollapsibleTitle } from '@/src/components/planning/CollapsibleTitle'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props { userId: string }

interface Draft { title: string; target: string; unit: string; tags: string; countMode: GoalCountMode }
const EMPTY: Draft = { title: '', target: '3', unit: 'gün', tags: '', countMode: 'tasks' }

/**
 * Bu haftanın hedefleri ve ilerlemesi. Ay ve çeyrek hedefleri web'de düzenlenir; burada sadece hafta.
 * Kapalı başlar: haftada bir bakılan şey günlük akışı uzatmasın.
 */
export function GoalsCard({ userId }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { goals, tasks, error, fetchGoals, addGoal, removeGoal } = useGoalStore()
  const [sheet, setSheet] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const week = goalPeriodStart('week', todayDate())

  // Sekmeye her dönüşte: başka sekmede tamamlanan bağlı görev ilerlemeye yansısın.
  useFocusEffect(useCallback(() => { void fetchGoals(supabase, userId) }, [userId, fetchGoals]))

  const progress = useMemo(() => goalTreeProgress(goals, tasks), [goals, tasks])
  const weekly = goals.filter((g) => g.horizon === 'week' && g.period_start === week && g.status !== 'dropped')
  const isDone = (g: (typeof weekly)[number]) => (progress.get(g.id)?.pct ?? 0) >= 100 || g.status === 'done'
  // Yükleme hatası boş liste gibi görünmesin: "henüz hedef yok" mevcut hedefleri saklıyordu.
  const loadFailed = error !== null && goals.length === 0
  const summary = loadFailed ? t.goals_load_error
    : weekly.length === 0
    ? t.goals_none_yet
    : t.goals_summary.replace('{done}', String(weekly.filter(isDone).length)).replace('{n}', String(weekly.length))
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const save = async () => {
    const target = parseInt(draft.target, 10)
    // Sessiz ret yok: pencere açık kalıp hiçbir şey olmaması bozuk düğme gibi görünüyordu.
    if (!draft.title.trim()) { Alert.alert(t.plan_err_name_required); return }
    if (!(target > 0)) { Alert.alert(t.goals_err_target); return }
    setSaving(true)
    try {
      await addGoal(supabase, userId, {
        horizon: 'week', title: draft.title.trim(), period_start: week, target,
        unit: draft.unit.trim() || null, count_mode: draft.countMode,
        tag_filter: draft.tags.split(',').map((x) => x.trim()).filter(Boolean),
      })
      setDraft(EMPTY)
      setSheet(false)
    } catch {
      Alert.alert(t.goals_error)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = (goalId: string) => {
    Alert.alert(t.goals_delete_confirm, undefined, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.goals_delete, style: 'destructive',
        onPress: async () => {
          try { await removeGoal(supabase, goalId) } catch { Alert.alert(t.goals_error) }
        },
      },
    ])
  }

  const chip = (active: boolean) => ({
    paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.md, borderWidth: 1,
    backgroundColor: active ? palette.accent : colors.glassInner,
    borderColor: active ? palette.accent : colors.border,
  })

  return (
    <GlassCard style={{ marginBottom: spacing[3] }}>
      <CollapsibleTitle title={t.goals_title} summary={summary} open={open} onToggle={() => setOpen((v) => !v)}
        onAdd={() => setSheet(true)} addLabel={t.goals_add} />

      {open && loadFailed && (
        <TouchableOpacity onPress={() => void fetchGoals(supabase, userId)} style={{ alignItems: 'center', paddingVertical: spacing[3] }}>
          <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>{t.retry}</Text>
        </TouchableOpacity>
      )}

      {open && !loadFailed && weekly.length === 0 && (
        <TouchableOpacity onPress={() => setSheet(true)} style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
          <Ionicons name="flag-outline" size={26} color={colors.textSubtle} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' }}>{t.goals_empty}</Text>
        </TouchableOpacity>
      )}

      {open && <View style={{ gap: spacing[3] }}>
        {weekly.map((g) => {
          const p = progress.get(g.id)
          const pct = p?.pct ?? 0
          const done = isDone(g)
          const tint = done ? palette.success : palette.accent
          return (
            <TouchableOpacity key={g.id} onLongPress={() => confirmDelete(g.id)} delayLongPress={400}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={{ width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint}18` }}>
                <Text style={{ fontSize: 18 }}>{g.icon ?? '🎯'}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }} numberOfLines={1}>{g.title}</Text>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: done ? palette.success : colors.textMuted, fontVariant: ['tabular-nums'] }}>
                    {done ? '✓ ' : ''}{p?.current ?? 0}/{p?.total ?? g.target ?? 0}{g.unit ? ` ${g.unit}` : ''}
                  </Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: `${tint}1F` }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: tint }} />
                </View>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={t.goals_add} scrollable>
        <View style={{ gap: spacing[3] }}>
          <Input label={t.goals_name} value={draft.title} onChangeText={(v) => patch({ title: v })} maxLength={200} />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label={t.goals_target} value={draft.target} keyboardType="number-pad"
              onChangeText={(v) => patch({ target: v.replace(/\D/g, '') })} containerStyle={{ flex: 1 }} />
            <Input label={t.goals_unit} value={draft.unit} onChangeText={(v) => patch({ unit: v })} containerStyle={{ flex: 1 }} />
          </View>
          <Input label={t.goals_tags} value={draft.tags} onChangeText={(v) => patch({ tags: v })} placeholder="spor, koşu" />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {(['tasks', 'hours'] as const).map((m) => (
              <TouchableOpacity key={m} onPress={() => patch({ countMode: m })} style={chip(draft.countMode === m)}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: draft.countMode === m ? '#fff' : colors.textMuted }}>
                  {m === 'tasks' ? t.goals_count_tasks : t.goals_count_hours}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Button label={t.goals_save} onPress={() => void save()} loading={saving} fullWidth />
        </View>
      </BottomSheet>
    </GlassCard>
  )
}
