import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, RefreshControl,
  TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTaskStore, todayDate, TASK_STATUS_LABELS } from '@lifeos/shared'
import type { CreateTaskInput, Task, TaskStatus } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { T, HEADER_BTN, MODAL_SHEET, GLASS_CARD } from '@/src/theme'
import { GradientBackground } from '@/src/components/GradientBackground'

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:     T.status.backlog.bg,
  planned:     T.status.planned.bg,
  in_progress: T.status.in_progress.bg,
  blocked:     T.status.blocked.bg,
  done:        T.status.done.bg,
  deferred:    T.status.deferred.bg,
}

const STATUS_TEXT: Record<TaskStatus, string> = {
  backlog:     T.status.backlog.text,
  planned:     T.status.planned.text,
  in_progress: T.status.in_progress.text,
  blocked:     T.status.blocked.text,
  done:        T.status.done.text,
  deferred:    T.status.deferred.text,
}

const ROUTINE_TAGS = ['spor', 'yazılım', 'must-do', 'sağlık', 'kariyer']

type SortKey = 'priority' | 'effort' | 'date' | 'status'
const SORT_LABELS: Record<SortKey, string> = {
  priority: 'Oncelik', effort: 'Sure', date: 'Tarih', status: 'Durum',
}

interface TaskDraft {
  title: string
  description: string
  scheduledDate: string
  dueDate: string
  estimatedMinutes: string
  effortScore: string
  tags: string
}

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  description: '',
  scheduledDate: '',
  dueDate: '',
  estimatedMinutes: '',
  effortScore: '',
  tags: '',
}

function sortTasks(tasks: Task[], key: SortKey, asc: boolean): Task[] {
  return [...tasks].sort((a, b) => {
    let diff = 0
    if (key === 'priority') diff = a.priority_score - b.priority_score
    else if (key === 'effort') diff = a.effort_score - b.effort_score
    else if (key === 'date') diff = (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '')
    else if (key === 'status') diff = a.status.localeCompare(b.status)
    return asc ? diff : -diff
  })
}

export default function TasksScreen() {
  const today = todayDate()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)
  const [activeTab, setActiveTab] = useState<'today' | 'all'>('today')
  const [hideRoutine, setHideRoutine] = useState(true)
  const [hideDone, setHideDone] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)

  const { tasks, loading, fetchTasks, fetchBacklog, addTask, setStatus } = useTaskStore()

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) }) }, [])

  const loadTasks = useCallback(async (uid: string) => {
    try {
      await Promise.all([fetchTasks(supabase, uid, { scheduled_date: today }), fetchBacklog(supabase, uid)])
    } catch {
      // stores handle their own error state
    }
  }, [today, fetchTasks, fetchBacklog])

  useEffect(() => { if (userId) void loadTasks(userId) }, [userId, loadTasks])

  const onRefresh = useCallback(async () => {
    if (!userId) return; setRefreshing(true); await loadTasks(userId); setRefreshing(false)
  }, [userId, loadTasks])

  const updateDraft = useCallback((field: keyof TaskDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const handleAddTask = useCallback(async () => {
    if (!userId || !draft.title.trim()) return
    setAdding(true)
    try {
      const input: CreateTaskInput = {
        title: draft.title.trim(),
        ...(draft.description.trim() && { description: draft.description.trim() }),
        ...((draft.scheduledDate || activeTab === 'today') && { scheduled_date: draft.scheduledDate || today, status: 'planned' }),
        ...(draft.dueDate && { due_date: draft.dueDate }),
        ...(draft.estimatedMinutes && { estimated_minutes: parseInt(draft.estimatedMinutes, 10) }),
        ...(draft.effortScore && { effort_score: parseInt(draft.effortScore, 10) }),
        ...(draft.tags.trim() && { tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean) }),
      }
      await addTask(supabase, userId, input)
      setDraft(EMPTY_DRAFT); setShowAddModal(false)
    } catch { Alert.alert('Hata', 'Görev eklenemedi') }
    finally { setAdding(false) }
  }, [userId, draft, addTask, activeTab, today])

  const handleStatusChange = useCallback(async (taskId: string, currentStatus: TaskStatus) => {
    if (currentStatus === 'done') {
      Alert.alert('Görevi Sıfırla', 'Bu görevi tamamlanmamış olarak işaretlemek istiyor musun?', [
        { text: 'Hayır', style: 'cancel' },
        { text: 'Evet', onPress: () => void setStatus(supabase, taskId, 'backlog') },
      ]); return
    }
    const nextStatus: Record<TaskStatus, TaskStatus> = {
      backlog: 'planned', planned: 'in_progress', in_progress: 'done',
      blocked: 'planned', done: 'backlog', deferred: 'planned',
    }
    await setStatus(supabase, taskId, nextStatus[currentStatus])
  }, [setStatus])

  const isRoutineTask = (tags: string[]) => hideRoutine && tags.some((tag) => ROUTINE_TAGS.includes(tag))
  const base = tasks.filter((t) => !isRoutineTask(t.tags ?? []) && !(hideDone && (t.status === 'done' || t.status === 'deferred')))
  const todayTasks = sortTasks(base.filter((t) => t.scheduled_date === today), sortKey, sortAsc)
  const allActiveTasks = sortTasks(base, sortKey, sortAsc)
  const displayTasks = activeTab === 'today' ? todayTasks : allActiveTasks
  const hiddenRoutineCount = tasks.filter((t) => isRoutineTask(t.tags ?? [])).length
  const hiddenDoneCount = tasks.filter((t) => t.status === 'done' || t.status === 'deferred').length

  return (
    <GradientBackground>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: T.text.primary, letterSpacing: -0.5 }}>Görevler</Text>
          <TouchableOpacity onPress={() => setShowAddModal(true)}
            style={HEADER_BTN}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="add" size={16} color="white" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: 'white' }}>Yeni Gorev</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tab + Sort */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1, flexDirection: 'row', borderRadius: T.btn.radius, backgroundColor: T.btn.pill.bg, borderWidth: 1, borderColor: 'transparent', padding: 4 }}>
            {([{ key: 'today' as const, label: 'Bugün' }, { key: 'all' as const, label: 'Tümü' }]).map((tab) => (
              <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: T.btn.pill.paddingVertical, borderRadius: T.btn.radius - 2, backgroundColor: activeTab === tab.key ? T.btn.pill.active_bg : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: activeTab === tab.key ? '700' : '400', color: activeTab === tab.key ? T.btn.pill.active_text : T.text.muted }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setShowSortMenu((s) => !s)}
            style={{ borderRadius: T.btn.radius, paddingHorizontal: T.btn.secondary.paddingHorizontal, paddingVertical: T.btn.secondary.paddingVertical, backgroundColor: showSortMenu ? T.accent : T.btn.secondary.bg, borderWidth: 1, borderColor: showSortMenu ? T.accent : T.btn.secondary.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="swap-vertical" size={14} color={showSortMenu ? 'white' : T.btn.secondary.text} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: showSortMenu ? 'white' : T.btn.secondary.text }}>
                {SORT_LABELS[sortKey]} {sortAsc ? '↑' : '↓'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sort menu */}
        {showSortMenu && (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.90)', borderRadius: 16, padding: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.90)', marginBottom: 10, shadowColor: T.card.shadowColor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: T.text.muted, paddingHorizontal: 8, paddingVertical: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sıralama</Text>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <TouchableOpacity key={key} onPress={() => { if (sortKey === key) setSortAsc((a) => !a); else { setSortKey(key); setSortAsc(false) }; setShowSortMenu(false) }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: sortKey === key ? 'rgba(129,140,248,0.15)' : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: sortKey === key ? '600' : '400', color: sortKey === key ? T.accent : T.text.secondary }}>{SORT_LABELS[key]}</Text>
                {sortKey === key && <Text style={{ fontSize: 12, color: T.accent, fontWeight: '600' }}>{sortAsc ? '↑ Artan' : '↓ Azalan'}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Filtre chip'leri */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { label: hideRoutine ? 'Rutin gizli' : 'Rutin goster', active: hideRoutine, onPress: () => setHideRoutine((h) => !h), activeColor: T.accent, icon: 'repeat' as const },
            { label: hideDone ? 'Bitmis gizli' : 'Bitmis goster', active: hideDone, onPress: () => setHideDone((h) => !h), activeColor: T.success, icon: 'checkmark-done' as const },
          ].map((chip) => (
            <TouchableOpacity key={chip.label} onPress={chip.onPress}
              style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: chip.active ? chip.activeColor + '50' : 'rgba(255,255,255,0.12)', backgroundColor: chip.active ? chip.activeColor + '15' : 'rgba(255,255,255,0.06)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={chip.icon} size={12} color={chip.active ? chip.activeColor : T.text.muted} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: chip.active ? chip.activeColor : T.text.muted }}>{chip.label}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        {((hideRoutine && hiddenRoutineCount > 0) || (hideDone && hiddenDoneCount > 0)) && (
          <Text style={{ marginTop: 6, fontSize: 11, color: T.text.muted }}>
            {[hideRoutine && hiddenRoutineCount > 0 && `${hiddenRoutineCount} rutin`, hideDone && hiddenDoneCount > 0 && `${hiddenDoneCount} tamamlanan`].filter(Boolean).join(' · ')} gizlendi
          </Text>
        )}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingTop: 4, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.text.secondary} />}>
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={T.accent} style={{ marginTop: 40 }} />
        ) : displayTasks.length === 0 ? (
          <View style={{ marginTop: 60, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle-outline" size={40} color={T.text.muted} />
            <Text style={{ marginTop: 12, textAlign: 'center', fontSize: 14, color: T.text.muted }}>
              {activeTab === 'today' ? 'Bugün için görev yok' : 'Açık görev yok'}
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 32, paddingTop: 4 }}>
            {displayTasks.map((task) => (
              <TouchableOpacity key={task.id} onPress={() => router.push(`/task/${task.id}`)} style={[GLASS_CARD, { marginBottom: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: T.text.primary }} numberOfLines={2}>{task.title}</Text>
                  <TouchableOpacity onPress={() => void handleStatusChange(task.id, task.status)}
                    style={{ marginLeft: 10, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: STATUS_COLORS[task.status] }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: STATUS_TEXT[task.status] }}>{TASK_STATUS_LABELS[task.status]}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: task.priority_score >= 1.5 ? T.text.danger : task.priority_score >= 1.0 ? T.text.warning : T.text.muted }} />
                    <Text style={{ fontSize: 11, color: T.text.muted }}>{task.priority_score.toFixed(1)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={12} color={T.text.muted} />
                    <Text style={{ fontSize: 11, color: T.text.muted }}>{task.effort_score}h</Text>
                  </View>
                  {task.tags.length > 0 && <Text style={{ fontSize: 11, color: T.accent, fontWeight: '500' }}>#{task.tags[0]}</Text>}
                  {task.scheduled_date && <Text style={{ fontSize: 11, color: T.text.muted }}>{task.scheduled_date === today ? 'Bugün' : task.scheduled_date}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' }}>
          <View style={MODAL_SHEET}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(15,23,42,0.12)', alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: T.text.primary, marginBottom: 16 }}>Yeni Görev</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Başlık</Text>
              <TextInput value={draft.title} onChangeText={(value) => updateDraft('title', value)} placeholder="Ne yapilacak?" placeholderTextColor={T.input.placeholder}
                style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, marginBottom: 14, backgroundColor: T.input.bg }}
                autoFocus multiline />

              <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Açıklama</Text>
              <TextInput value={draft.description} onChangeText={(value) => updateDraft('description', value)} placeholder="Beklenen çıktı, notlar, baglam" placeholderTextColor={T.input.placeholder}
                style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, marginBottom: 14, backgroundColor: T.input.bg, minHeight: 92, textAlignVertical: 'top' }}
                multiline />

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Planlanan gün</Text>
                  <TextInput value={draft.scheduledDate} onChangeText={(value) => updateDraft('scheduledDate', value)} placeholder="2026-04-30" placeholderTextColor={T.input.placeholder}
                    style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, backgroundColor: T.input.bg }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Son tarih</Text>
                  <TextInput value={draft.dueDate} onChangeText={(value) => updateDraft('dueDate', value)} placeholder="2026-05-02" placeholderTextColor={T.input.placeholder}
                    style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, backgroundColor: T.input.bg }} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Tahmini süre (dk)</Text>
                  <TextInput value={draft.estimatedMinutes} onChangeText={(value) => updateDraft('estimatedMinutes', value)} keyboardType="numeric" placeholder="45" placeholderTextColor={T.input.placeholder}
                    style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, backgroundColor: T.input.bg }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Efor skoru (1-5)</Text>
                  <TextInput value={draft.effortScore} onChangeText={(value) => updateDraft('effortScore', value)} keyboardType="numeric" placeholder="3" placeholderTextColor={T.input.placeholder}
                    style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, backgroundColor: T.input.bg }} />
                </View>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.secondary, marginBottom: 6 }}>Etiketler</Text>
              <TextInput value={draft.tags} onChangeText={(value) => updateDraft('tags', value)} placeholder="is, derin-calisma, saglik" placeholderTextColor={T.input.placeholder}
                style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: T.input.text, marginBottom: 20, backgroundColor: T.input.bg }} />
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setDraft(EMPTY_DRAFT) }}
                style={{ flex: 1, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)', paddingVertical: 14 }}>
                <Text style={{ fontWeight: '600', color: T.text.muted }}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleAddTask()} disabled={!draft.title.trim() || adding}
                style={{ flex: 1, alignItems: 'center', borderRadius: 16, backgroundColor: T.accent, paddingVertical: 14, opacity: !draft.title.trim() || adding ? 0.4 : 1, shadowColor: T.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10 }}>
                {adding ? <ActivityIndicator size="small" color="white" /> : <Text style={{ fontWeight: '700', color: 'white' }}>Ekle</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  )
}
