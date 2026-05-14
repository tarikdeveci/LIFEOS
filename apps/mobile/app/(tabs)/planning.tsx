import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { usePlanningStore } from '@lifeos/shared'
import type { TimeBlock } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type BlockType = 'task' | 'routine' | 'break' | 'focus' | 'meal' | 'workout'
const BLOCK_COLORS: Record<BlockType, string> = { task: palette.task, routine: palette.routine, break: palette.break, focus: palette.focus, meal: palette.meal, workout: palette.workout }
const BLOCK_LABELS: Record<BlockType, string> = { task: 'Görev', routine: 'Rutin', break: 'Mola', focus: 'Odak', meal: 'Yemek', workout: 'Antrenman' }
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  const day = anchor.getDay()
  start.setDate(anchor.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}

export default function PlanningScreen() {
  const { colors } = useTheme()
  const { timeBlocks, fetchDayData, addTimeBlock, removeTimeBlock } = usePlanningStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ label: '', start_time: '09:00', end_time: '10:00', block_type: 'focus' as BlockType })
  const [adding, setAdding] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]
  const weekDays = getWeekDays(weekAnchor)

  const load = useCallback(async (uid: string, date: string) => {
    await fetchDayData(supabase, uid, date)
  }, [fetchDayData])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id, selectedDate) }
    })
  }, [load, selectedDate])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true)
    await load(userId, selectedDate)
    setRefreshing(false)
  }

  async function handleAdd() {
    if (!userId || !draft.label.trim()) return
    setAdding(true)
    try {
      await addTimeBlock(supabase, userId, {
        date: selectedDate,
        label: draft.label.trim(),
        start_time: draft.start_time + ':00',
        end_time: draft.end_time + ':00',
        block_type: draft.block_type,
      })
      setDraft({ label: '', start_time: '09:00', end_time: '10:00', block_type: 'focus' })
      setShowAdd(false)
    } catch {
      Alert.alert('Hata', 'Blok eklenemedi')
    } finally {
      setAdding(false)
    }
  }

  const dayBlocks = timeBlocks.filter((b) => b.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Planlama</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Week nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
          <TouchableOpacity onPress={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d) }}>
            <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
            {weekDays[0].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – {weekDays[6].toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </Text>
          <TouchableOpacity onPress={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d) }}>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Week days */}
        <GlassCard style={{ marginBottom: spacing[5] }} padding={spacing[3]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {weekDays.map((day, i) => {
              const dateStr = day.toISOString().split('T')[0]
              const isSelected = dateStr === selectedDate
              const isToday = dateStr === todayStr
              const hasBlocks = timeBlocks.some((b) => b.date === dateStr)
              return (
                <TouchableOpacity key={dateStr} onPress={() => setSelectedDate(dateStr)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontWeight: fontWeight.medium }}>{DAY_LABELS[i]}</Text>
                  <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? palette.accent : isToday ? `${palette.accent}18` : 'transparent', borderWidth: isToday && !isSelected ? 1 : 0, borderColor: palette.accent }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: isSelected ? '#fff' : isToday ? palette.accent : colors.textSecondary }}>{day.getDate()}</Text>
                  </View>
                  {hasBlocks && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? palette.accent : colors.textSubtle }} />}
                </TouchableOpacity>
              )
            })}
          </View>
        </GlassCard>

        {/* Blocks */}
        {dayBlocks.length === 0 ? (
          <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
            <Ionicons name="calendar-outline" size={48} color={colors.textSubtle} />
            <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Bu gün için blok yok</Text>
            <Button label="Blok ekle" onPress={() => setShowAdd(true)} variant="secondary" />
          </View>
        ) : (
          <View style={{ gap: spacing[3] }}>
            {dayBlocks.map((block) => <BlockRow key={block.id} block={block} onDelete={() => removeTimeBlock(supabase, block.id)} />)}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Yeni Blok" scrollable>
        <View style={{ gap: spacing[3] }}>
          <Input label="Başlık" value={draft.label} onChangeText={(v) => setDraft((d) => ({ ...d, label: v }))} placeholder="Odak çalışması" autoFocus />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Başlangıç" value={draft.start_time} onChangeText={(v) => setDraft((d) => ({ ...d, start_time: v }))} placeholder="09:00" containerStyle={{ flex: 1 }} />
            <Input label="Bitiş" value={draft.end_time} onChangeText={(v) => setDraft((d) => ({ ...d, end_time: v }))} placeholder="10:00" containerStyle={{ flex: 1 }} />
          </View>
          <View>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>Tür</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
                <TouchableOpacity key={type} onPress={() => setDraft((d) => ({ ...d, block_type: type }))} style={{ paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.md, backgroundColor: draft.block_type === type ? BLOCK_COLORS[type] : colors.glassInner, borderWidth: 1, borderColor: draft.block_type === type ? BLOCK_COLORS[type] : colors.border }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: draft.block_type === type ? '#fff' : colors.textMuted }}>{BLOCK_LABELS[type]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Button label={adding ? 'Ekleniyor...' : 'Ekle'} onPress={handleAdd} loading={adding} fullWidth style={{ marginTop: spacing[2] }} />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}

function BlockRow({ block, onDelete }: { block: TimeBlock; onDelete: () => void }) {
  const { colors } = useTheme()
  const color = BLOCK_COLORS[block.block_type as BlockType] ?? palette.accent
  return (
    <GlassCard padding={spacing[4]} noShadow>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 3, height: 44, borderRadius: 2, backgroundColor: color }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }} numberOfLines={1}>{block.label}</Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}</Text>
          <View style={{ marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: `${color}18` }}>
            <Text style={{ fontSize: fontSize.xs, color, fontWeight: fontWeight.medium }}>{BLOCK_LABELS[block.block_type as BlockType] ?? block.block_type}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
        </TouchableOpacity>
      </View>
    </GlassCard>
  )
}
