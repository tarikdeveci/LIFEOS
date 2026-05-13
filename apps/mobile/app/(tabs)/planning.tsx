import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_LABELS,
  fromDateString,
  relativeDateLabel,
  shiftIsoDate,
  todayDate,
  toDateString,
  type BlockType,
  type TimeBlock,
  usePlanningStore,
  useTaskStore,
  weekStart,
} from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import {
  getCalendarIntegrationState,
  importCalendarEventsForDate,
  type CalendarIntegrationState,
} from '@/src/lib/calendarIntegration'
import { GlassCard } from '@/src/components/GlassCard'
import { GradientBackground } from '@/src/components/GradientBackground'
import { HEADER_BTN, MODAL_SHEET, T } from '@/src/theme'

const BLOCK_TYPES: BlockType[] = ['task', 'routine', 'break', 'focus', 'meal', 'workout']
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const HOUR_HEIGHT = 56
const ENERGY_EMOJIS = ['', '😴', '😕', '😐', '😊', '🚀']
const ENERGY_LABELS = ['', 'Düşük', 'Az', 'Orta', 'İyi', 'Yüksek']
const ENERGY_COLORS = ['', '#EF4444', '#F97316', '#F59E0B', '#10B981', '#6366F1']

interface WeekDayPlan {
  date: string
  dayLabel: string
  blocksCount: number
  plannedMinutes: number
  doneTasks: number
  allTasks: number
}

interface ReplanAction {
  action: 'add' | 'remove' | 'move'
  block_id?: string
  block?: {
    start_time?: string
    end_time?: string
    block_type?: BlockType
    label?: string
    task_id?: string
  }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  actions?: ReplanAction[]
}

function timeToMinutes(t: string): number {
  const [h = 0, m = 0] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

function getNextHour(offset = 0): string {
  const now = new Date()
  const base = now.getMinutes() > 0 ? now.getHours() + 1 : now.getHours()
  return `${String(Math.min(base + offset, 23)).padStart(2, '0')}:00`
}

function buildWeekDates(dateIso: string): string[] {
  const start = toDateString(weekStart(fromDateString(dateIso)))
  return Array.from({ length: 7 }, (_, i) => shiftIsoDate(start, i))
}

interface DayTimelineProps {
  timeBlocks: TimeBlock[]
  currentTime: string
  showNow: boolean
}

function DayTimeline({ timeBlocks, currentTime, showNow }: DayTimelineProps) {
  const startHour = 7
  const endHour = 23
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT
  const nowMin = timeToMinutes(currentTime)
  const nowTop = ((nowMin - startHour * 60) / 60) * HOUR_HEIGHT

  return (
    <View style={{ position: 'relative', height: totalHeight + 12 }}>
      {Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).map((h) => (
        <View key={h} style={{ position: 'absolute', top: (h - startHour) * HOUR_HEIGHT, left: 0, right: 0, height: 1 }}>
          <Text style={{ position: 'absolute', width: 32, top: -7, fontSize: 10, textAlign: 'right', color: T.text.subtle, fontWeight: '500' }}>
            {String(h).padStart(2, '0')}
          </Text>
          <View style={{ position: 'absolute', left: 40, right: 0, top: 0, height: 0.5, backgroundColor: 'rgba(15,23,42,0.07)' }} />
        </View>
      ))}

      {timeBlocks.map((block) => {
        const sMin = timeToMinutes(block.start_time)
        const eMin = timeToMinutes(block.end_time)
        const top = ((sMin - startHour * 60) / 60) * HOUR_HEIGHT
        const height = Math.max(((eMin - sMin) / 60) * HOUR_HEIGHT - 2, 26)
        const color = BLOCK_TYPE_COLORS[block.block_type]
        const isNowBlock = sMin <= nowMin && eMin > nowMin

        return (
          <View
            key={block.id}
            style={{
              position: 'absolute',
              left: 46,
              right: 0,
              top,
              height,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isNowBlock ? `${color}3A` : `${color}20`,
              borderLeftWidth: 3,
              borderLeftColor: color,
              backgroundColor: isNowBlock ? `${color}18` : `${color}0E`,
              paddingHorizontal: 10,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.text.primary }} numberOfLines={1}>
              {block.label ?? BLOCK_TYPE_LABELS[block.block_type]}
            </Text>
            {height > 36 && (
              <Text style={{ marginTop: 2, fontSize: 10, color: T.text.subtle }}>
                {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
              </Text>
            )}
          </View>
        )
      })}

      {showNow && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
        <View style={{ position: 'absolute', top: nowTop, left: 40, right: 0, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
          <View style={{ flex: 1, height: 1.5, backgroundColor: '#EF4444', opacity: 0.65 }} />
        </View>
      )}
    </View>
  )
}

export default function PlanningScreen() {
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayDate())
  const [refreshing, setRefreshing] = useState(false)

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [blockStartTime, setBlockStartTime] = useState('')
  const [blockEndTime, setBlockEndTime] = useState('')
  const [blockType, setBlockType] = useState<BlockType>('focus')
  const [blockLabel, setBlockLabel] = useState('')
  const [addingBlock, setAddingBlock] = useState(false)

  const [chatLoading, setChatLoading] = useState(false)
  const [weekLoading, setWeekLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [pendingActions, setPendingActions] = useState<ReplanAction[] | null>(null)
  const [weekData, setWeekData] = useState<WeekDayPlan[]>([])
  const [calendarState, setCalendarState] = useState<CalendarIntegrationState>({
    autoImportEnabled: false,
    selectedLocalCalendarIds: [],
    localPermission: 'undetermined',
    googleConnected: false,
    outlookConnected: false,
  })
  const autoImportKeyRef = useRef('')

  const {
    timeBlocks,
    dailyPlan,
    loading: planLoading,
    fetchDayData,
    setEnergyLevel,
    addTimeBlock,
    removeTimeBlock,
  } = usePlanningStore()
  const { tasks, fetchTasks, setStatus } = useTaskStore()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    void getCalendarIntegrationState().then(setCalendarState)
  }, [])

  const loadDay = useCallback(async (uid: string, date: string) => {
    await Promise.all([
      fetchDayData(supabase, uid, date),
      fetchTasks(supabase, uid, { scheduled_date: date }),
    ])
  }, [fetchDayData, fetchTasks])

  const loadWeek = useCallback(async (uid: string, date: string) => {
    setWeekLoading(true)
    try {
      const weekDates = buildWeekDates(date)
      const from = weekDates[0]
      const to = weekDates[6]

      const [{ data: weekBlocks, error: weekBlocksError }, { data: weekTasks, error: weekTasksError }] = await Promise.all([
        supabase
          .from('time_blocks')
          .select('id, date, start_time, end_time')
          .eq('user_id', uid)
          .gte('date', from)
          .lte('date', to),
        supabase
          .from('tasks')
          .select('scheduled_date, status')
          .eq('user_id', uid)
          .gte('scheduled_date', from)
          .lte('scheduled_date', to),
      ])

      if (weekBlocksError) throw weekBlocksError
      if (weekTasksError) throw weekTasksError

      const mapped: WeekDayPlan[] = weekDates.map((d) => {
        const blocks = (weekBlocks ?? []).filter((b) => b.date === d)
        const tasksInDay = (weekTasks ?? []).filter((t) => t.scheduled_date === d)
        return {
          date: d,
          dayLabel: new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(fromDateString(d)),
          blocksCount: blocks.length,
          plannedMinutes: blocks.reduce((sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0),
          doneTasks: tasksInDay.filter((t) => t.status === 'done').length,
          allTasks: tasksInDay.length,
        }
      })

      setWeekData(mapped)
    } catch {
      setWeekData([])
    } finally {
      setWeekLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    void loadDay(userId, selectedDate)
    void loadWeek(userId, selectedDate)
  }, [userId, selectedDate, loadDay, loadWeek])

  const onRefresh = useCallback(async () => {
    if (!userId) return
    setRefreshing(true)
    const nextCalendarState = await getCalendarIntegrationState()
    setCalendarState(nextCalendarState)
    await Promise.all([loadDay(userId, selectedDate), loadWeek(userId, selectedDate)])
    setRefreshing(false)
  }, [loadDay, loadWeek, selectedDate, userId])

  const runAutoImport = useCallback(async () => {
    if (!userId) return
    try {
      const nextCalendarState = await getCalendarIntegrationState()
      setCalendarState(nextCalendarState)
      if (!nextCalendarState.autoImportEnabled) return
      const hasAnySource = nextCalendarState.localPermission === 'granted' || nextCalendarState.googleConnected || nextCalendarState.outlookConnected
      if (!hasAnySource) return
      await importCalendarEventsForDate(supabase, userId, selectedDate)
      await Promise.all([loadDay(userId, selectedDate), loadWeek(userId, selectedDate)])
    } catch {
      // silent auto-import — do not show errors to user
    }
  }, [loadDay, loadWeek, selectedDate, userId])

  useEffect(() => {
    if (!userId || !calendarState.autoImportEnabled) return
    const key = `${userId}:${selectedDate}`
    if (autoImportKeyRef.current === key) return
    autoImportKeyRef.current = key
    void runAutoImport()
  }, [calendarState.autoImportEnabled, runAutoImport, selectedDate, userId])

  const handleAddBlock = useCallback(async () => {
    if (!TIME_RE.test(blockStartTime) || !TIME_RE.test(blockEndTime)) {
      Alert.alert('Hata', 'Geçerli saat formatı girin (örn: 09:00)')
      return
    }
    if (!userId || blockEndTime <= blockStartTime) {
      Alert.alert('Hata', 'Bitiş saati başlangıçtan sonra olmalı')
      return
    }

    setAddingBlock(true)
    try {
      await addTimeBlock(supabase, userId, {
        date: selectedDate,
        start_time: blockStartTime,
        end_time: blockEndTime,
        block_type: blockType,
        ...(blockLabel.trim() && { label: blockLabel.trim() }),
      })
      setShowAddBlock(false)
      setBlockLabel('')
      await Promise.all([loadDay(userId, selectedDate), loadWeek(userId, selectedDate)])
    } catch {
      Alert.alert('Hata', 'Zaman bloğu eklenemedi')
    } finally {
      setAddingBlock(false)
    }
  }, [addTimeBlock, blockEndTime, blockLabel, blockStartTime, blockType, loadDay, loadWeek, selectedDate, userId])

  const handleEnergyChange = useCallback(async (level: number) => {
    if (!dailyPlan) return
    await setEnergyLevel(supabase, level as 1 | 2 | 3 | 4 | 5)
  }, [dailyPlan, setEnergyLevel])

  const handleMarkTaskDone = useCallback(async (taskId: string) => {
    try {
      await setStatus(supabase, taskId, 'done')
      if (userId) {
        await Promise.all([loadDay(userId, selectedDate), loadWeek(userId, selectedDate)])
      }
    } catch {
      Alert.alert('Hata', 'Görev tamamlanamadı')
    }
  }, [loadDay, loadWeek, selectedDate, setStatus, userId])

  const handleSendChat = useCallback(async () => {
    const userMessage = chatInput.trim()
    if (!userMessage || chatLoading || !userId) return

    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', text: userMessage }])
    setChatLoading(true)

    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        session = refreshed.session
      }
      if (!session) throw new Error('No session')

      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'replan',
          date: selectedDate,
          user_message: userMessage,
          current_time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false }),
          existing_blocks: timeBlocks.map((b) => ({
            id: b.id,
            start: b.start_time.slice(0, 5),
            end: b.end_time.slice(0, 5),
            label: b.label ?? b.block_type,
          })),
        },
      })

      if (error) throw error
      const result = data as { message: string; actions?: ReplanAction[] }
      const actions = result.actions?.filter((a) =>
        (a.action === 'add' && a.block?.start_time && a.block?.end_time) ||
        (a.action === 'remove' && a.block_id) ||
        (a.action === 'move' && a.block_id && a.block?.start_time && a.block?.end_time),
      ) ?? []

      setChatMessages((prev) => [...prev, { role: 'assistant', text: result.message, actions }])
      if (actions.length > 0) {
        setPendingActions(actions)
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Bir hata oluştu, tekrar dene.' }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, selectedDate, timeBlocks, userId])

  const handleApplyPendingActions = useCallback(async () => {
    if (!pendingActions || !userId) return
    let added = 0
    let removed = 0
    let moved = 0
    const removedIds = new Set<string>()

    try {
      for (const action of pendingActions) {
        if (action.action === 'remove' && action.block_id && !removedIds.has(action.block_id)) {
          await removeTimeBlock(supabase, action.block_id)
          removedIds.add(action.block_id)
          removed++
        } else if (action.action === 'move' && action.block_id && action.block?.start_time && action.block?.end_time) {
          await usePlanningStore.getState().updateTimeBlock(supabase, action.block_id, {
            start_time: action.block.start_time,
            end_time: action.block.end_time,
          })
          moved++
        }
      }

      for (const action of pendingActions) {
        if (action.action !== 'add' || !action.block?.start_time || !action.block?.end_time) continue

        const latestBlocks = usePlanningStore.getState().timeBlocks
        const conflicts = latestBlocks.filter(
          (b) => !removedIds.has(b.id) && b.start_time.slice(0, 5) < action.block!.end_time! && b.end_time.slice(0, 5) > action.block!.start_time!,
        )
        for (const conflict of conflicts) {
          await removeTimeBlock(supabase, conflict.id)
          removedIds.add(conflict.id)
          removed++
        }

        await addTimeBlock(supabase, userId, {
          date: selectedDate,
          start_time: action.block.start_time,
          end_time: action.block.end_time,
          block_type: action.block.block_type ?? 'task',
          label: action.block.label,
          ...(action.block.task_id && { task_id: action.block.task_id }),
        })
        added++
      }

      await Promise.all([loadDay(userId, selectedDate), loadWeek(userId, selectedDate)])
      setPendingActions(null)
      Alert.alert('Tamam', `${added} blok eklendi, ${removed} blok değiştirildi, ${moved} blok taşındı`)
    } catch {
      Alert.alert('Hata', 'AI değişiklikleri uygulanamadı')
    }
  }, [addTimeBlock, loadDay, loadWeek, pendingActions, removeTimeBlock, selectedDate, userId])

  const currentDate = todayDate()
  const isTodaySelected = selectedDate === currentDate
  const selectedDateLabel = relativeDateLabel(selectedDate)
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.status !== 'deferred'),
    [tasks],
  )
  const firstTasks = openTasks.slice(0, 4)
  const plannedHours = useMemo(
    () => Math.round((timeBlocks.reduce((sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)), 0) / 60) * 10) / 10,
    [timeBlocks],
  )
  const inputStyle = {
    borderWidth: 1,
    borderColor: T.input.border,
    borderRadius: T.input.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: T.input.text,
    backgroundColor: T.input.bg,
  }

  return (
    <GradientBackground>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={{ paddingHorizontal: 18, paddingTop: 56, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: T.text.primary, letterSpacing: -0.6 }}>Planlama</Text>
            <Text style={{ marginTop: 2, fontSize: 13, color: T.text.muted }}>{selectedDateLabel} · {selectedDate}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setBlockStartTime(getNextHour(0))
              setBlockEndTime(getNextHour(1))
              setShowAddBlock(true)
            }}
            style={HEADER_BTN}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>+ Blok</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setSelectedDate((d) => shiftIsoDate(d, -7))} style={{ flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: T.btn.secondary.bg }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary }}>{'<'} Hafta</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(todayDate())} style={{ flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: isTodaySelected ? T.btn.secondary.bg : 'rgba(15,23,42,0.05)' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: isTodaySelected ? T.text.accent : T.text.secondary }}>Bugun</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate((d) => shiftIsoDate(d, 7))} style={{ flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: T.btn.secondary.bg }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary }}>Hafta {'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 18 }}
        contentContainerStyle={{ paddingTop: 2, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        <GlassCard padding={16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text.primary }}>Hafta Şeridi</Text>
            {weekLoading ? <ActivityIndicator size="small" color={T.accent} /> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {weekData.map((day) => {
              const selected = day.date === selectedDate
              const hours = Math.round((day.plannedMinutes / 60) * 10) / 10
              return (
                <TouchableOpacity
                  key={day.date}
                  onPress={() => setSelectedDate(day.date)}
                  style={{
                    width: 92,
                    marginRight: 8,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    backgroundColor: selected ? 'rgba(79,70,229,0.12)' : 'rgba(15,23,42,0.03)',
                    borderWidth: 1,
                    borderColor: selected ? 'rgba(79,70,229,0.30)' : 'rgba(15,23,42,0.09)',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? '#4F46E5' : T.text.primary }}>{day.dayLabel}</Text>
                  <Text style={{ marginTop: 1, fontSize: 10, color: T.text.subtle }}>{day.date.slice(5)}</Text>
                  <Text style={{ marginTop: 7, fontSize: 16, fontWeight: '800', color: T.text.primary }}>{hours}h</Text>
                  <Text style={{ fontSize: 10, color: T.text.muted }}>{day.blocksCount} blok</Text>
                  <Text style={{ fontSize: 10, color: T.text.muted }}>{day.doneTasks}/{day.allTasks} görev</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </GlassCard>

        <GlassCard padding={16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text.primary }}>Günün Çizelgesi</Text>
            <Text style={{ fontSize: 11, color: T.text.muted }}>{plannedHours}h planlı</Text>
          </View>
          {timeBlocks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 22 }}>
              <Text style={{ fontSize: 36 }}>📭</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: T.text.muted }}>Bu gün planlı blok yok</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <DayTimeline timeBlocks={timeBlocks} currentTime={nowTime} showNow={isTodaySelected} />
            </ScrollView>
          )}
          {planLoading && <ActivityIndicator style={{ marginTop: 8 }} size="small" color={T.accent} />}
        </GlassCard>

        <GlassCard padding={16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text.primary }}>AI Planlama Asistanı</Text>
          </View>

          {chatMessages.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              {chatMessages.map((msg, i) => (
                <View
                  key={`${msg.role}-${i}`}
                  style={{
                    marginBottom: 8,
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '92%',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: msg.role === 'user' ? 'rgba(79,70,229,0.12)' : 'rgba(15,23,42,0.05)',
                  }}
                >
                  <Text style={{ fontSize: 12, color: T.text.primary }}>{msg.text}</Text>
                  {msg.actions && msg.actions.length > 0 && (
                    <View style={{ marginTop: 4 }}>
                      {msg.actions.map((a, ai) => (
                        <Text key={`${a.action}-${ai}`} style={{ fontSize: 10, color: T.text.muted }}>
                          {a.action === 'remove' ? 'Sil: ' : a.action === 'move' ? 'Taşı: ' : 'Ekle: '}
                          {a.block?.start_time && a.block?.end_time ? `${a.block.start_time}-${a.block.end_time} ` : ''}
                          {a.block?.label ?? a.block?.block_type ?? ''}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
              {chatLoading && <Text style={{ marginBottom: 8, fontSize: 11, color: T.text.subtle }}>AI düşünüyor...</Text>}
            </View>
          ) : (
            <Text style={{ marginTop: 10, fontSize: 12, color: T.text.muted }}>Örn: "15:00 sonrası odağı artır, çakışanları yeniden planla"</Text>
          )}

          {pendingActions && pendingActions.length > 0 && (
            <View style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.08)', padding: 10 }}>
              <Text style={{ marginBottom: 8, fontSize: 11, fontWeight: '700', color: '#059669' }}>{pendingActions.length} değişiklik önerildi</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => void handleApplyPendingActions()} style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: '#10B981' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Uygula</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPendingActions(null)} style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.08)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.text.secondary }}>İptal</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Planı düzenle..."
              placeholderTextColor={T.input.placeholder}
              style={{ ...inputStyle, flex: 1 }}
              onSubmitEditing={() => void handleSendChat()}
            />
            <TouchableOpacity onPress={() => void handleSendChat()} disabled={chatLoading || !chatInput.trim()} style={{ borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: T.accent, opacity: chatLoading || !chatInput.trim() ? 0.45 : 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Gönder</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        <GlassCard padding={16}>
          <Text style={{ marginBottom: 10, fontSize: 13, fontWeight: '700', color: T.text.primary }}>Enerji Seviyesi</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4, 5].map((level) => {
              const selected = dailyPlan?.energy_level === level
              return (
                <TouchableOpacity
                  key={level}
                  onPress={() => void handleEnergyChange(level)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    borderRadius: 12,
                    paddingVertical: 9,
                    backgroundColor: selected ? `${ENERGY_COLORS[level]}17` : 'rgba(15,23,42,0.03)',
                    borderWidth: selected ? 1.5 : 1,
                    borderColor: selected ? `${ENERGY_COLORS[level]}58` : 'rgba(15,23,42,0.08)',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{ENERGY_EMOJIS[level]}</Text>
                  <Text style={{ marginTop: 3, fontSize: 10, fontWeight: selected ? '700' : '500', color: selected ? ENERGY_COLORS[level] : T.text.subtle }}>
                    {ENERGY_LABELS[level]}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </GlassCard>

        <GlassCard padding={16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text.primary }}>Esnek Görevler</Text>
            <Text style={{ fontSize: 11, color: T.text.muted }}>{openTasks.length} acik</Text>
          </View>
          {firstTasks.length === 0 ? (
            <Text style={{ fontSize: 12, color: T.text.muted }}>Seçili günde açık görev yok.</Text>
          ) : (
            firstTasks.map((task) => (
              <View key={task.id} style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', backgroundColor: 'rgba(15,23,42,0.02)' }}>
                <View style={{ marginRight: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: task.priority_score >= 1.5 ? '#EF4444' : task.priority_score >= 1 ? '#F59E0B' : '#94A3B8' }} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: T.text.primary }} numberOfLines={1}>{task.title}</Text>
                <TouchableOpacity onPress={() => void handleMarkTaskDone(task.id)} style={{ borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(16,185,129,0.12)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>Bitti</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </GlassCard>
      </ScrollView>

      <Modal visible={showAddBlock} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.36)' }}>
          <View style={MODAL_SHEET}>
            <View style={{ width: 38, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: 'rgba(15,23,42,0.14)', marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: T.text.primary, marginBottom: 20 }}>Zaman Bloğu Ekle</Text>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              {['Başlangıç', 'Bitiş'].map((label, idx) => (
                <View key={label} style={{ flex: 1 }}>
                  <Text style={{ marginBottom: 6, fontSize: 11, fontWeight: '600', color: T.text.muted }}>{label}</Text>
                  <TextInput
                    value={idx === 0 ? blockStartTime : blockEndTime}
                    onChangeText={idx === 0 ? setBlockStartTime : setBlockEndTime}
                    placeholder={idx === 0 ? '09:00' : '10:00'}
                    placeholderTextColor={T.input.placeholder}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={inputStyle}
                  />
                </View>
              ))}
            </View>

            <Text style={{ marginBottom: 8, fontSize: 11, fontWeight: '600', color: T.text.muted }}>Blok Tipi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {BLOCK_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setBlockType(type)}
                  style={{
                    marginRight: 8,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    backgroundColor: blockType === type ? BLOCK_TYPE_COLORS[type] : `${BLOCK_TYPE_COLORS[type]}12`,
                    borderWidth: 1,
                    borderColor: blockType === type ? 'transparent' : `${BLOCK_TYPE_COLORS[type]}25`,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: blockType === type ? 'white' : BLOCK_TYPE_COLORS[type] }}>
                    {BLOCK_TYPE_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={{ marginBottom: 6, fontSize: 11, fontWeight: '600', color: T.text.muted }}>Etiket (opsiyonel)</Text>
            <TextInput value={blockLabel} onChangeText={setBlockLabel} placeholder="Orn: Derin calisma" placeholderTextColor={T.input.placeholder} style={{ ...inputStyle, marginBottom: 20 }} />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => { setShowAddBlock(false); setBlockLabel('') }} style={{ flex: 1, borderRadius: T.btn.radius, borderWidth: 1, borderColor: T.btn.secondary.border, paddingVertical: T.btn.secondary.paddingVertical + 2, alignItems: 'center' }}>
                <Text style={{ fontWeight: '600', color: T.text.muted }}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleAddBlock()}
                disabled={addingBlock || !blockStartTime || !blockEndTime}
                style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: T.accent, opacity: addingBlock || !blockStartTime || !blockEndTime ? 0.4 : 1 }}
              >
                {addingBlock ? <ActivityIndicator size="small" color="white" /> : <Text style={{ fontWeight: '700', color: 'white' }}>Ekle</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  )
}
