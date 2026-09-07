import { useEffect, useState, useCallback, useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { fromDateString, shiftIsoDate, todayDate, toDateString, useTaskStore, weekStart } from '@lifeos/shared'
import type { Task } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { Input } from '@/src/components/ui/Input'
import { StatusBadge } from '@/src/components/ui/Badge'
import { TaskCheckbox } from '@/src/components/ui/TaskCheckbox'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type Tab = 'today' | 'week' | 'all'

interface Draft {
  title: string
  scheduled_date: string
  estimated_minutes: string
  value_score: number
  urgency_score: number
  effort_score: number
}

// Sabit değil fonksiyon: modül seviyesinde bir kez hesaplansaydı, uygulama gece
// yarısını açık geçtiğinde yeni görev formu hâlâ dünün tarihini önerirdi.
function emptyDraft(): Draft {
  return {
    title: '', scheduled_date: todayDate(),
    estimated_minutes: '30', value_score: 3, urgency_score: 3, effort_score: 3,
  }
}

export default function TasksScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { tasks, fetchTasks, addTask, setStatus } = useTaskStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hideDone, setHideDone] = useState(true)

  // toISOString() UTC verir: UTC+3'te gece yarısı ile 03:00 arasında bir önceki
  // günü gösteriyordu. todayDate() yerel takvim gününü döndürür.
  const todayStr = todayDate()
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'

  // Hafta = içinde bulunulan takvim haftası, pazartesi başlangıçlı. planning.tsx
  // da haftayı pazartesiden başlatıyor; iki ekran farklı hafta gösterirse
  // "bu hafta" ifadesi anlamını kaybeder.
  const weekDays = useMemo(() => {
    const start = toDateString(weekStart(new Date()))
    return Array.from({ length: 7 }, (_, i) => shiftIsoDate(start, i))
  }, [todayStr])

  const weekRange = useMemo(() => {
    const first = weekDays[0]
    const last = weekDays[6]
    if (!first || !last) return ''
    const fmt = (d: string) => fromDateString(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    return `${fmt(first)} – ${fmt(last)}`
  }, [weekDays, locale])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void fetchTasks(supabase, data.user.id) }
    })
  }, [fetchTasks])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true)
    await fetchTasks(supabase, userId)
    setRefreshing(false)
  }

  const displayed = useMemo(() => {
    let list = tasks
    if (tab === 'today') list = list.filter((t) => t.scheduled_date === todayStr)
    if (tab === 'week') list = list.filter((t) => t.scheduled_date != null && weekDays.includes(t.scheduled_date))
    if (hideDone) list = list.filter((t) => t.status !== 'done')
    // Kopya üstünde sırala: 'Tümü' sekmesinde filtre uygulanmadığında sort()
    // doğrudan store dizisini yerinde değiştiriyordu.
    return [...list].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
  }, [tasks, tab, hideDone, todayStr, weekDays])

  // Hafta düz liste olarak okunmuyor: "salı ne kadar dolu" sorusunun cevabı gün
  // gruplarında. Boş günler atlanıyor — tamamlananlar gizliyken haftanın yarısı
  // boş başlıktan ibaret kalırdı.
  const weekSections = useMemo(() => {
    if (tab !== 'week') return []
    return weekDays
      .map((date) => ({ date, items: displayed.filter((task) => task.scheduled_date === date) }))
      .filter((section) => section.items.length > 0)
  }, [tab, weekDays, displayed])

  const dayLabel = useCallback((date: string) => {
    if (date === todayStr) return t.today
    return fromDateString(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
  }, [todayStr, locale, t])

  const done = tasks.filter((t) => t.scheduled_date === todayStr && t.status === 'done').length
  const open = tasks.filter((t) => t.scheduled_date === todayStr && t.status !== 'done').length

  // Kartın üstünden tamamlama. Detay ekranına girmeden bitirilemiyordu; bir
  // görevi kapatmak üç dokunuş + iki ekran geçişi demekti, kimse yapmıyordu.
  const handleToggle = useCallback(async (task: Task) => {
    try {
      await setStatus(supabase, task.id, task.status === 'done' ? 'planned' : 'done')
    } catch {
      Alert.alert('Kaydedilemedi', 'Görev durumu güncellenemedi. Bağlantını kontrol et.')
    }
  }, [setStatus])

  async function handleAdd() {
    if (!userId || !draft.title.trim()) return
    setAdding(true)
    try {
      await addTask(supabase, userId, {
        title: draft.title.trim(),
        scheduled_date: draft.scheduled_date || undefined,
        estimated_minutes: parseInt(draft.estimated_minutes) || 30,
        value_score: draft.value_score,
        urgency_score: draft.urgency_score,
        effort_score: draft.effort_score,
        status: 'planned',
      })
      setDraft(emptyDraft())
      setShowAdd(false)
    } catch {
      Alert.alert('Hata', 'Görev eklenemedi')
    } finally {
      setAdding(false)
    }
  }

  return (
    <ScreenBackground>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.tasks_title}</Text>
            <TouchableOpacity onPress={() => setShowAdd(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
            <StatCard label={t.tasks_open} value={open} color={palette.accent} />
            <StatCard label={t.tasks_completed} value={done} color={palette.success} />
            <StatCard label={t.tasks_total} value={tasks.length} />
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[3] }}>
            {(['today', 'week', 'all'] as Tab[]).map((tabKey) => (
              <TouchableOpacity
                key={tabKey}
                onPress={() => setTab(tabKey)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: tab === tabKey ? colors.bgSurface : 'transparent', ...(tab === tabKey ? colors.shadowCard : {}) }}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: tab === tabKey ? fontWeight.semibold : fontWeight.regular, color: tab === tabKey ? colors.textPrimary : colors.textMuted }}>
                  {tabKey === 'today' ? t.today : tabKey === 'week' ? t.week : t.all}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] }}>
            <TouchableOpacity
              onPress={() => setHideDone((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: hideDone ? `${palette.accent}18` : colors.glassInner, borderWidth: 1, borderColor: hideDone ? `${palette.accent}30` : colors.border }}
            >
              <Ionicons name={hideDone ? 'eye-off-outline' : 'eye-outline'} size={13} color={hideDone ? palette.accent : colors.textMuted} />
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: hideDone ? palette.accent : colors.textMuted }}>
                {hideDone ? t.tasks_done_hidden : t.tasks_done_visible}
              </Text>
            </TouchableOpacity>

            {tab === 'week' && (
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{weekRange}</Text>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing[5], paddingBottom: bottomPadding, gap: spacing[3] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {displayed.length === 0 ? (
            <View style={{ paddingTop: spacing[10], alignItems: 'center', gap: spacing[3] }}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.textSubtle} />
              <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>
                {tab === 'week' ? t.tasks_week_empty : t.tasks_empty}
              </Text>
            </View>
          ) : tab === 'week' ? (
            weekSections.map((section) => (
              <View key={section.date} style={{ gap: spacing[3] }}>
                <DayHeader
                  label={dayLabel(section.date)}
                  count={section.items.length}
                  minutes={section.items.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0)}
                  isToday={section.date === todayStr}
                />
                {section.items.map((task) => (
                  <TaskRow key={task.id} task={task} onPress={() => router.push(`/task/${task.id}` as never)} onToggle={() => void handleToggle(task)} />
                ))}
              </View>
            ))
          ) : displayed.map((task) => (
            <TaskRow key={task.id} task={task} onPress={() => router.push(`/task/${task.id}` as never)} onToggle={() => void handleToggle(task)} />
          ))}
        </ScrollView>
      </View>

      <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)} title={t.tasks_new} scrollable>
        <View style={{ gap: spacing[3] }}>
          <Input label="Görev" value={draft.title} onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))} placeholder="Ne yapılacak?" autoFocus returnKeyType="next" />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Tarih" value={draft.scheduled_date} onChangeText={(v) => setDraft((d) => ({ ...d, scheduled_date: v }))} placeholder="2026-05-14" containerStyle={{ flex: 1 }} returnKeyType="next" />
            <Input label="Süre (dk)" value={draft.estimated_minutes} onChangeText={(v) => setDraft((d) => ({ ...d, estimated_minutes: v }))} keyboardType="number-pad" placeholder="30" containerStyle={{ flex: 1 }} returnKeyType="done" />
          </View>

          {/* Primary action — visible before WSJF so keyboard never hides it */}
          <Button label={adding ? 'Ekleniyor...' : 'Ekle'} onPress={handleAdd} loading={adding} fullWidth />

          {/* WSJF — optional, collapsible feel via section header */}
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center', marginTop: spacing[1] }}>
            WSJF skorları (opsiyonel — varsayılan 3)
          </Text>
          <ScoreRow label="Değer" value={draft.value_score} onChange={(v) => setDraft((d) => ({ ...d, value_score: v }))} />
          <ScoreRow label="Aciliyet" value={draft.urgency_score} onChange={(v) => setDraft((d) => ({ ...d, urgency_score: v }))} />
          <ScoreRow label="Çaba" value={draft.effort_score} onChange={(v) => setDraft((d) => ({ ...d, effort_score: v }))} />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}

function DayHeader({ label, count, minutes, isToday }: { label: string; count: number; minutes: number; isToday: boolean }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[2] }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: isToday ? palette.accent : colors.textSecondary }}>
        {label}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
        {count}{minutes > 0 ? ` · ${minutes}dk` : ''}
      </Text>
    </View>
  )
}

function TaskRow({ task, onPress, onToggle }: { task: Task; onPress: () => void; onToggle: () => void }) {
  const { colors } = useTheme()
  const isDone = task.status === 'done'
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <GlassCard padding={spacing[4]} noShadow style={isDone ? { opacity: 0.6 } : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
          <View style={{ paddingTop: 1 }}>
            <TaskCheckbox done={isDone} onToggle={onToggle} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={{
                fontSize: fontSize.base,
                fontWeight: fontWeight.medium,
                color: isDone ? colors.textSubtle : colors.textPrimary,
                textDecorationLine: isDone ? 'line-through' : 'none',
              }}
              numberOfLines={2}
            >
              {task.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
              <StatusBadge status={task.status as never} />
              {task.estimated_minutes && <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{task.estimated_minutes}dk</Text>}
              {task.priority_score != null && <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>WSJF {task.priority_score.toFixed(1)}</Text>}
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
          <TouchableOpacity key={n} onPress={() => onChange(n)} style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: value === n ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: value === n ? palette.accent : colors.border }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: value === n ? '#fff' : colors.textMuted }}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}
