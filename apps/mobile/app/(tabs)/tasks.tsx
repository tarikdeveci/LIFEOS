import { useEffect, useState, useCallback, useMemo, useReducer } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { useTaskStore } from '@lifeos/shared'
import type { Task } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { Input } from '@/src/components/ui/Input'
import { StatusBadge } from '@/src/components/ui/Badge'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type Tab = 'today' | 'all'

interface Draft {
  title: string
  scheduled_date: string
  estimated_minutes: string
  value_score: number
  urgency_score: number
  effort_score: number
}

const EMPTY: Draft = {
  title: '', scheduled_date: new Date().toISOString().split('T')[0],
  estimated_minutes: '30', value_score: 3, urgency_score: 3, effort_score: 3,
}

export default function TasksScreen() {
  const { colors } = useTheme()
  const { tasks, fetchTasks, addTask } = useTaskStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hideDone, setHideDone] = useState(true)

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void fetchTasks(data.user.id, {}) }
    })
  }, [fetchTasks])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true)
    await fetchTasks(userId, {})
    setRefreshing(false)
  }

  const displayed = useMemo(() => {
    let list = tab === 'today'
      ? tasks.filter((t) => t.scheduled_date === todayStr)
      : tasks
    if (hideDone) list = list.filter((t) => t.status !== 'done')
    return list.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
  }, [tasks, tab, hideDone, todayStr])

  const done  = tasks.filter((t) => t.scheduled_date === todayStr && t.status === 'done').length
  const open  = tasks.filter((t) => t.scheduled_date === todayStr && t.status !== 'done').length

  async function handleAdd() {
    if (!userId || !draft.title.trim()) return
    setAdding(true)
    try {
      await addTask(userId, {
        title: draft.title.trim(),
        scheduled_date: draft.scheduled_date || undefined,
        estimated_minutes: parseInt(draft.estimated_minutes) || 30,
        value_score: draft.value_score,
        urgency_score: draft.urgency_score,
        effort_score: draft.effort_score,
        status: 'planned',
      })
      setDraft(EMPTY)
      setShowAdd(false)
    } catch (e) {
      Alert.alert('Hata', 'Görev eklenemedi')
    } finally {
      setAdding(false)
    }
  }

  return (
    <ScreenBackground>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Görevler</Text>
            <TouchableOpacity
              onPress={() => setShowAdd(true)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
            <StatCard label="Bugün açık" value={open} color={palette.accent} />
            <StatCard label="Tamamlandı" value={done} color={palette.success} />
            <StatCard label="Toplam" value={tasks.length} />
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[3] }}>
            {(['today', 'all'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center',
                  backgroundColor: tab === t ? colors.bgSurface : 'transparent',
                  ...( tab === t ? colors.shadowCard : {}),
                }}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t ? fontWeight.semibold : fontWeight.regular, color: tab === t ? colors.textPrimary : colors.textMuted }}>
                  {t === 'today' ? 'Bugün' : 'Tümü'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Filter */}
          <TouchableOpacity
            onPress={() => setHideDone((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: hideDone ? `${palette.accent}18` : colors.glassInner, borderWidth: 1, borderColor: hideDone ? `${palette.accent}30` : colors.border }}
          >
            <Ionicons name={hideDone ? 'eye-off-outline' : 'eye-outline'} size={13} color={hideDone ? palette.accent : colors.textMuted} />
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: hideDone ? palette.accent : colors.textMuted }}>
              {hideDone ? 'Tamamlananlar gizli' : 'Tamamlananlar görünür'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing[5], paddingBottom: 100, gap: spacing[3] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {displayed.length === 0 ? (
            <View style={{ paddingTop: spacing[10], alignItems: 'center', gap: spacing[3] }}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.textSubtle} />
              <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Görev yok</Text>
            </View>
          ) : (
            displayed.map((task) => (
              <TaskRow key={task.id} task={task} onPress={() => router.push(`/task/${task.id}` as never)} />
            ))
          )}
        </ScrollView>
      </View>

      {/* Add modal */}
      <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Yeni Görev" scrollable>
        <View style={{ gap: spacing[3] }}>
          <Input label="Görev" value={draft.title} onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))} placeholder="Ne yapılacak?" autoFocus />
          <Input label="Tarih" value={draft.scheduled_date} onChangeText={(v) => setDraft((d) => ({ ...d, scheduled_date: v }))} placeholder="2026-05-14" />
          <Input label="Süre (dk)" value={draft.estimated_minutes} onChangeText={(v) => setDraft((d) => ({ ...d, estimated_minutes: v }))} keyboardType="number-pad" placeholder="30" />

          <ScoreRow label="Değer" value={draft.value_score} onChange={(v) => setDraft((d) => ({ ...d, value_score: v }))} />
          <ScoreRow label="Aciliyet" value={draft.urgency_score} onChange={(v) => setDraft((d) => ({ ...d, urgency_score: v }))} />
          <ScoreRow label="Çaba" value={draft.effort_score} onChange={(v) => setDraft((d) => ({ ...d, effort_score: v }))} />

          <Button label={adding ? 'Ekleniyor...' : 'Ekle'} onPress={handleAdd} loading={adding} fullWidth style={{ marginTop: spacing[2] }} />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}

function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <GlassCard padding={spacing[4]} noShadow>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }} numberOfLines={2}>
              {task.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
              <StatusBadge status={task.status as never} />
              {task.estimated_minutes && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                  {task.estimated_minutes}dk
                </Text>
              )}
              {task.priority_score != null && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                  WSJF {task.priority_score.toFixed(1)}
                </Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} style={{ marginTop: 2 }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  )
}

function ScoreRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            style={{
              width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: value === n ? palette.accent : colors.glassInner,
              borderWidth: 1, borderColor: value === n ? palette.accent : colors.border,
            }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: value === n ? '#fff' : colors.textMuted }}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}
