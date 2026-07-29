import { useEffect, useState, useCallback, useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { usePlanningStore } from '@lifeos/shared'
import type { TimeBlock } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { useCalendarStore } from '@/src/stores/calendarStore'
import { useCalendarAutoSync } from '@/src/hooks/useCalendarAutoSync'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useProGate } from '@/src/hooks/useProGate'
import type { LocalCalendarEvent } from '@/src/utils/calendarSync'

type BlockType = 'task' | 'routine' | 'break' | 'focus' | 'meal' | 'workout'
const BLOCK_COLORS: Record<BlockType, string> = { task: palette.task, routine: palette.routine, break: palette.break, focus: palette.focus, meal: palette.meal, workout: palette.workout }
const BLOCK_LABELS: Record<BlockType, string> = { task: 'Görev', routine: 'Rutin', break: 'Mola', focus: 'Odak', meal: 'Yemek', workout: 'Antrenman' }
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

const ENERGY_LEVELS = [
  { level: 1 as const, emoji: '😴', label: 'Bitkin' },
  { level: 2 as const, emoji: '😑', label: 'Düşük' },
  { level: 3 as const, emoji: '😐', label: 'Orta' },
  { level: 4 as const, emoji: '😊', label: 'İyi' },
  { level: 5 as const, emoji: '🔥', label: 'Harika' },
]

function localIsoDate(date = new Date()): string {
  const tzOffsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10)
}

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  const day = anchor.getDay()
  start.setDate(anchor.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}

interface AiAction { action: 'add' | 'remove' | 'move'; block_id?: string; block?: Partial<TimeBlock> & { date?: string } }
interface AiChatMsg { role: 'user' | 'assistant'; content: string }

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + days)
  return localIsoDate(next)
}

function inferRequestedDate(input: string, fallbackDate: string): string {
  const normalized = input.toLocaleLowerCase('tr-TR')
  if (/\b(bugun|bugün|today)\b/.test(normalized)) return localIsoDate()
  if (/\b(yarin|yarın|tomorrow)\b/.test(normalized)) return addDays(localIsoDate(), 1)
  if (/\b(ertesi gun|ertesi gün|after tomorrow)\b/.test(normalized)) return addDays(localIsoDate(), 2)
  return fallbackDate
}

export default function PlanningScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { timeBlocks, dailyPlan, fetchDayData, addTimeBlock, updateTimeBlock, removeTimeBlock, setEnergyLevel } = usePlanningStore()
  const { localEvents, isSyncing, hasPermission, initialize, syncEvents } = useCalendarStore()
  const [userId, setUserId] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)
  const [selectedDate, setSelectedDate] = useState(() => localIsoDate())
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ label: '', start_time: '09:00', end_time: '10:00', block_type: 'focus' as BlockType })
  const [adding, setAdding] = useState(false)
  const [showAiChat, setShowAiChat] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiChatMsgs, setAiChatMsgs] = useState<AiChatMsg[]>([])

  // Foreground'a her dönüşte takvimi senkronize et
  useCalendarAutoSync()

  const todayStr = localIsoDate()
  const weekDays = getWeekDays(weekAnchor)
  const weekStart = weekDays[0]
  const weekEnd = weekDays[6]

  // Seçili güne ait local takvim etkinlikleri
  const localEventsForDate = useMemo(
    // localDate ile eşleştir: startsAt UTC'dir, ilk 10 karakteri gece yarısından
    // sonraki etkinlikleri bir önceki güne düşürüyordu.
    () => localEvents.filter((e) => e.localDate === selectedDate),
    [localEvents, selectedDate],
  )

  const load = useCallback(async (uid: string, date: string) => {
    await fetchDayData(supabase, uid, date)
  }, [fetchDayData])

  useEffect(() => {
    // Takvim iznini başlat (ilk açılışta)
    void initialize()

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id, selectedDate) }
    })
  }, [load, selectedDate, initialize])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true)
    await Promise.all([load(userId, selectedDate), syncEvents()])
    setRefreshing(false)
  }

  async function handleManualCalendarSync() {
    try {
      await syncEvents()
      if (!hasPermission) {
        Alert.alert('Takvim Senkronu', 'Takvim izni verilmedi. Ayarlar ekranından izin verin.')
        return
      }
      // Okunamayan takvimi sessizce yutma — kullanıcı senkronun neden boş
      // olduğunu göremiyordu.
      const error = useCalendarStore.getState().lastSyncError
      Alert.alert('Takvim Senkronu', error ? `Takvim senkronize edildi, ancak ${error}.` : 'Takvim senkronize edildi.')
    } catch {
      Alert.alert('Takvim Senkronu', 'Senkronizasyon başarısız')
    }
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
    } catch { Alert.alert('Hata', 'Blok eklenemedi') }
    finally { setAdding(false) }
  }

  async function handleAiReplan() {
    if (!userId || !aiInput.trim()) return
    if (!requirePro()) return
    const userMessage = aiInput.trim()
    const requestedDate = inferRequestedDate(userMessage, selectedDate)
    setAiChatMsgs((messages) => [...messages, { role: 'user', content: userMessage }])
    setAiInput('')
    setAiLoading(true)
    try {
      const { data: targetBlocks } = await supabase
        .from('time_blocks')
        .select('id, start_time, end_time, label')
        .eq('user_id', userId)
        .eq('date', requestedDate)
        .order('start_time')

      const data = await callAiSuggest<{ message?: string; actions?: AiAction[] }>({
        type: 'replan',
        current_time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        date: requestedDate,
        existing_blocks: (targetBlocks ?? []).map((b) => ({ id: b.id, start: b.start_time, end: b.end_time, label: b.label ?? '' })),
        user_message: userMessage,
      })
      setAiChatMsgs((messages) => [...messages, { role: 'assistant', content: data.message ?? 'Yanit alinamadi.' }])
      // Apply AI actions
      if (data.actions && userId) {
        let affectedDate = requestedDate
        for (const action of data.actions) {
          if (action.action === 'remove' && action.block_id) {
            await removeTimeBlock(supabase, action.block_id)
          } else if (action.action === 'move' && action.block_id && action.block) {
            const b = action.block
            const blockDate = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : requestedDate
            affectedDate = blockDate
            await updateTimeBlock(supabase, action.block_id, {
              date: blockDate,
              start_time: b.start_time,
              end_time: b.end_time,
            })
          } else if (action.action === 'add' && action.block) {
            const b = action.block
            if (b.label && b.start_time && b.end_time && b.block_type) {
              const blockDate = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : requestedDate
              affectedDate = blockDate
              await addTimeBlock(supabase, userId, {
                date: blockDate,
                label: b.label,
                start_time: b.start_time,
                end_time: b.end_time,
                block_type: b.block_type as BlockType,
              })
            }
          }
        }
        setSelectedDate(affectedDate)
        await load(userId, affectedDate)
      }
    } catch {
      setAiChatMsgs((messages) => [...messages, { role: 'assistant', content: 'AI planlama basarisiz. Pro aboneligini ve baglantini kontrol et.' }])
    }
    finally { setAiLoading(false) }
  }

  async function handleEnergyLevel(level: 1 | 2 | 3 | 4 | 5) {
    if (!userId) return
    try { await setEnergyLevel(supabase, level) }
    catch { Alert.alert('Hata', 'Enerji seviyesi kaydedilemedi') }
  }

  const dayBlocks = timeBlocks
    .filter((b) => b.date === selectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.plan_title}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <TouchableOpacity onPress={() => void handleManualCalendarSync()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.info}18`, borderWidth: 1, borderColor: `${palette.info}30`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={isSyncing ? 'sync-outline' : 'calendar-outline'} size={18} color={palette.info} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { if (requirePro()) setShowAiChat(true) }} disabled={isCheckingPro} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}30`, alignItems: 'center', justifyContent: 'center', opacity: isPro ? 1 : 0.55 }}>
              <Ionicons name={isPro ? 'sparkles-outline' : 'lock-closed-outline'} size={18} color={palette.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Energy level */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.plan_energy}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {ENERGY_LEVELS.map(({ level, emoji, label }) => {
              const active = dailyPlan?.energy_level === level
              return (
                <TouchableOpacity
                  key={level}
                  onPress={() => handleEnergyLevel(level)}
                  style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing[3], marginHorizontal: 2, borderRadius: radius.lg, backgroundColor: active ? `${palette.accent}18` : 'transparent', borderWidth: active ? 1 : 0, borderColor: palette.accent }}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: active ? palette.accent : colors.textSubtle, fontWeight: active ? fontWeight.semibold : fontWeight.regular }}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </GlassCard>

        {/* Week navigation */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
          <TouchableOpacity onPress={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d) }}>
            <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
            {weekStart?.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) ?? ''} – {weekEnd?.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) ?? ''}
          </Text>
          <TouchableOpacity onPress={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d) }}>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Week days */}
        <GlassCard style={{ marginBottom: spacing[5] }} padding={spacing[3]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {weekDays.map((day, i) => {
              const dateStr = localIsoDate(day)
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

        {/* Day blocks */}
        {dayBlocks.length === 0 && localEventsForDate.length === 0 ? (
          <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
            <Ionicons name="calendar-outline" size={48} color={colors.textSubtle} />
            <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>{t.plan_no_blocks}</Text>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <Button label={t.plan_add_block_btn} onPress={() => setShowAdd(true)} variant="secondary" />
              <Button label={isPro ? t.plan_ai_plan : `Pro · ${t.plan_ai_plan}`} onPress={() => { if (requirePro()) setShowAiChat(true) }} variant="secondary" />
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing[3] }}>
            {/* LifeOS zaman blokları */}
            {dayBlocks.map((block) => (
              <BlockRow key={block.id} block={block} onDelete={() => removeTimeBlock(supabase, block.id)} />
            ))}
            {/* Yerel takvim etkinlikleri (read-only) */}
            {localEventsForDate.map((event) => (
              <CalendarEventRow key={event.id} event={event} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add block modal */}
      <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)} title={t.plan_new_block} scrollable>
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

      {/* AI Chat modal */}
      <BottomSheet visible={showAiChat} onClose={() => setShowAiChat(false)} title={t.plan_ai_planning} scrollable>
        <View style={{ gap: spacing[4] }}>
          {aiChatMsgs.length === 0 && (
            <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
                Mevcut blokların ve görevlerin bağlamında planlama yap. Örnek: "Bugünü yeniden düzenle", "Öğleden sonra 2 saatlik odak bloğu ekle", "Akşam 8'den sonra tüm blokları kaldır"
              </Text>
            </View>
          )}
          {aiChatMsgs.map((msg, index) => (
            <View
              key={`${msg.role}-${index}`}
              style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: spacing[3], borderRadius: radius.lg, backgroundColor: msg.role === 'user' ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: msg.role === 'user' ? palette.accent : colors.border }}
            >
              <Text style={{ fontSize: fontSize.sm, color: msg.role === 'user' ? '#fff' : colors.textSecondary, lineHeight: 20 }}>{msg.content}</Text>
            </View>
          ))}
          {aiLoading && (
            <View style={{ alignSelf: 'flex-start', padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Planlaniyor...</Text>
            </View>
          )}
          <Input
            label="Ne yapmak istiyorsun?"
            value={aiInput}
            onChangeText={setAiInput}
            placeholder="Bugünü yeniden planla..."
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
            autoFocus
          />
          <Button label={aiLoading ? 'Planlanıyor...' : isPro ? '✦ Planla' : 'Pro · Planla'} onPress={handleAiReplan} loading={aiLoading} fullWidth />
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

function CalendarEventRow({ event }: { event: LocalCalendarEvent }) {
  const { colors } = useTheme()
  const startTime = event.isAllDay
    ? 'Tüm gün'
    : new Date(event.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const endTime = event.isAllDay
    ? ''
    : ` – ${new Date(event.endsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <GlassCard padding={spacing[4]} noShadow style={{ opacity: 0.8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 3, height: 44, borderRadius: 2, backgroundColor: colors.textSubtle }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
            <Ionicons name="calendar-outline" size={12} color={colors.textSubtle} />
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textSecondary }} numberOfLines={1}>
              {event.title}
            </Text>
          </View>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
            {startTime}{endTime}
          </Text>
          <View style={{ marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.glassInner }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontWeight: fontWeight.medium }}>Takvim</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  )
}
