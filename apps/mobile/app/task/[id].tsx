import { useEffect, useState, useCallback } from 'react'
import { Alert, ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTaskStore } from '@lifeos/shared'
import type { Task, TaskStatus } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatusBadge } from '@/src/components/ui/Badge'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const STATUS_OPTIONS: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred']
const STATUS_LABELS: Record<TaskStatus, string> = { backlog: 'Backlog', planned: 'Planlandı', in_progress: 'Devam', blocked: 'Bloke', done: 'Tamam', deferred: 'Ertelendi' }
const STATUS_COLORS: Record<TaskStatus, string> = { backlog: palette.backlog, planned: palette.planned, in_progress: palette.inProgress, blocked: palette.blocked, done: palette.done, deferred: palette.deferred }

const WSJF_FIELDS = [
  { key: 'value_score' as const,    label: 'Değer',   color: palette.accent },
  { key: 'urgency_score' as const,  label: 'Aciliyet', color: palette.danger },
  { key: 'risk_score' as const,     label: 'Risk',    color: palette.warning },
  { key: 'effort_score' as const,   label: 'Efor',    color: palette.textMuted ?? palette.backlog },
  { key: 'friction_score' as const, label: 'Engel',   color: palette.backlog },
] as const

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)

  const { selectTask, updateTask, setStatus, deleteTask } = useTaskStore()

  const loadTask = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const storeTask = useTaskStore.getState().tasks.find((t) => t.id === id)
      if (storeTask) { setTask(storeTask) }
      else {
        await selectTask(supabase, id)
        setTask(useTaskStore.getState().selectedTask)
      }
    } finally { setLoading(false) }
  }, [id, selectTask])

  useEffect(() => { void loadTask() }, [loadTask])

  async function handleStatusChange(status: TaskStatus) {
    if (!task) return
    setSaving(true)
    try {
      await setStatus(supabase, task.id, status)
      setTask((p) => p ? { ...p, status } : null)
    } finally { setSaving(false) }
  }

  async function handleTitleSave() {
    if (!task || !titleDraft.trim()) return
    setSaving(true)
    try {
      await updateTask(supabase, task.id, { title: titleDraft.trim() })
      setTask((p) => p ? { ...p, title: titleDraft.trim() } : null)
      setEditingTitle(false)
    } catch { Alert.alert('Hata', 'Başlık kaydedilemedi') }
    finally { setSaving(false) }
  }

  async function handleWsjf(field: string, value: number) {
    if (!task) return
    setSaving(true)
    try {
      await updateTask(supabase, task.id, { [field]: value })
      setTask((p) => p ? { ...p, [field]: value } : null)
    } finally { setSaving(false) }
  }

  async function handleAiSuggest() {
    if (!task) return
    setAiLoading(true)
    setAiReasoning(null)
    try {
      const data = await callAiSuggest<{ suggestion?: Record<string, number | string> }>({
        type: 'task_priority', task_id: task.id,
      })
      const s = data.suggestion
      if (s) {
        setAiReasoning(typeof s['reasoning'] === 'string' ? s['reasoning'] : null)
        const fields = ['value_score', 'urgency_score', 'risk_score', 'effort_score', 'friction_score']
        const updates: Record<string, number> = {}
        for (const f of fields) { if (typeof s[f] === 'number') updates[f] = s[f] as number }
        if (Object.keys(updates).length > 0) {
          await updateTask(supabase, task.id, updates)
          setTask((p) => p ? { ...p, ...updates } : null)
        }
      }
    } catch { setAiReasoning('AI önerisi alınamadı.') }
    finally { setAiLoading(false) }
  }

  function handleDelete() {
    Alert.alert('Görevi Sil', 'Bu görevi kalıcı olarak silmek istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => { if (!task) return; await deleteTask(supabase, task.id); router.back() } },
    ])
  }

  if (loading) return (
    <ScreenBackground><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={palette.accent} /></View></ScreenBackground>
  )

  if (!task) return (
    <ScreenBackground>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
        <Text style={{ color: colors.textMuted }}>Görev bulunamadı</Text>
        <Button label="Geri Dön" onPress={() => router.back()} variant="secondary" />
      </View>
    </ScreenBackground>
  )

  return (
    <ScreenBackground edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="chevron-back" size={20} color={palette.accent} />
          <Text style={{ fontSize: fontSize.base, color: palette.accent, fontWeight: fontWeight.medium }}>Geri</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
          {saving && <ActivityIndicator size="small" color={palette.accent} />}
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={palette.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: 60, gap: spacing[4] }} showsVerticalScrollIndicator={false}>

        {/* Title */}
        <GlassCard>
          {editingTitle ? (
            <View style={{ gap: spacing[3] }}>
              <Input value={titleDraft} onChangeText={setTitleDraft} multiline autoFocus />
              <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                <Button label="İptal" onPress={() => setEditingTitle(false)} variant="ghost" style={{ flex: 1 }} />
                <Button label="Kaydet" onPress={handleTitleSave} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setTitleDraft(task.title); setEditingTitle(true) }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{task.title}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginTop: 4 }}>Düzenlemek için dokun</Text>
            </TouchableOpacity>
          )}
        </GlassCard>

        {/* Priority score */}
        <GlassCard>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>WSJF Öncelik</Text>
          <Text style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.extrabold, color: palette.accent }}>{task.priority_score?.toFixed(2) ?? '—'}</Text>
        </GlassCard>

        {/* Status */}
        <GlassCard>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>Durum</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {STATUS_OPTIONS.map((s) => {
              const active = task.status === s
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => handleStatusChange(s)}
                  style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: active ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}18`, borderWidth: 1, borderColor: active ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}35` }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: active ? '#fff' : STATUS_COLORS[s] }}>{STATUS_LABELS[s]}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </GlassCard>

        {/* WSJF */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>WSJF Parametreleri</Text>
            <TouchableOpacity
              onPress={handleAiSuggest}
              disabled={aiLoading}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.accent}15`, borderWidth: 1, borderColor: `${palette.accent}30`, opacity: aiLoading ? 0.6 : 1 }}
            >
              {aiLoading ? <ActivityIndicator size="small" color={palette.accent} /> : <Ionicons name="sparkles" size={14} color={palette.accent} />}
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>AI Öner</Text>
            </TouchableOpacity>
          </View>

          {aiReasoning && (
            <View style={{ marginBottom: spacing[4], padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{aiReasoning}</Text>
            </View>
          )}

          <View style={{ gap: spacing[4] }}>
            {WSJF_FIELDS.map((field) => {
              const value = task[field.key] as number
              return (
                <View key={field.key}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[2] }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium }}>{field.label}</Text>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: field.color }}>{value}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => handleWsjf(field.key, v)}
                        style={{ flex: 1, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: value === v ? field.color : `${field.color}18`, borderWidth: 1, borderColor: value === v ? field.color : `${field.color}30` }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: value === v ? '#fff' : field.color }}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )
            })}
          </View>
        </GlassCard>

        {/* Details */}
        <GlassCard>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>Detaylar</Text>
          <View style={{ gap: spacing[3] }}>
            {task.scheduled_date && <DetailRow label="Tarih" value={task.scheduled_date} />}
            {task.due_date && <DetailRow label="Son Tarih" value={task.due_date} color={palette.danger} />}
            {task.estimated_minutes && <DetailRow label="Süre" value={`${task.estimated_minutes} dk`} />}
            {(task.tags?.length ?? 0) > 0 && (
              <View>
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing[2] }}>Etiketler</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                  {task.tags.map((tag) => (
                    <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${palette.accent}15`, borderWidth: 1, borderColor: `${palette.accent}25` }}>
                      <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
              Oluşturuldu: {new Date(task.created_at).toLocaleDateString('tr-TR')}
            </Text>
          </View>
        </GlassCard>

      </ScrollView>
    </ScreenBackground>
  )
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color ?? colors.textPrimary }}>{value}</Text>
    </View>
  )
}
