import { useEffect, useState, useCallback } from 'react'
import { Alert, ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useTaskStore, TASK_STATUS_LABELS, WSJF_SCORE_LABELS } from '@lifeos/shared'
import type { Task, TaskStatus } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { T } from '@/src/theme'

const STATUS_OPTIONS: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred']
const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:     T.status.backlog.text,
  planned:     T.status.planned.text,
  in_progress: T.status.in_progress.text,
  blocked:     T.status.blocked.text,
  done:        T.status.done.text,
  deferred:    T.status.deferred.text,
}

const WSJF_FIELDS = [
  { key: 'value_score' as const, label: '💎 Değer', color: T.blockType.workout },
  { key: 'urgency_score' as const, label: '⏰ Aciliyet', color: T.danger },
  { key: 'risk_score' as const, label: '⚠️ Risk', color: T.warning },
  { key: 'effort_score' as const, label: '🔧 Efor', color: T.text.muted },
  { key: 'friction_score' as const, label: '🚧 Engel', color: T.text.subtle },
]

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
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
      // Store'dan bak, yoksa fetch et
      const storeTask = useTaskStore.getState().tasks.find((t) => t.id === id)
      if (storeTask) {
        setTask(storeTask)
      } else {
        await selectTask(supabase, id)
        const fetched = useTaskStore.getState().selectedTask
        setTask(fetched)
      }
    } finally {
      setLoading(false)
    }
  }, [id, selectTask])

  useEffect(() => {
    void loadTask()
  }, [loadTask])

  const handleStatusChange = useCallback(async (status: TaskStatus) => {
    if (!task) return
    setSaving(true)
    try {
      await setStatus(supabase, task.id, status)
      setTask((prev) => prev ? { ...prev, status } : null)
    } finally {
      setSaving(false)
    }
  }, [task, setStatus])

  const handleTitleSave = useCallback(async () => {
    if (!task || !titleDraft.trim()) return
    setSaving(true)
    try {
      await updateTask(supabase, task.id, { title: titleDraft.trim() })
      setTask((prev) => prev ? { ...prev, title: titleDraft.trim() } : null)
      setEditingTitle(false)
    } catch {
      Alert.alert('Hata', 'Başlık kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [task, titleDraft, updateTask])

  const handleWsjfChange = useCallback(async (field: keyof Task, value: number) => {
    if (!task) return
    setSaving(true)
    try {
      await updateTask(supabase, task.id, { [field]: value })
      setTask((prev) => prev ? { ...prev, [field]: value } : null)
    } catch {
      Alert.alert('Hata', 'Skor güncellenemedi')
    } finally {
      setSaving(false)
    }
  }, [task, updateTask])

  const handleAiPriority = useCallback(async () => {
    if (!task) return
    setAiLoading(true)
    setAiReasoning(null)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data: refreshData } = await supabase.auth.refreshSession()
        session = refreshData.session
      }
      if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      const response = await fetch(
        `${process.env['EXPO_PUBLIC_SUPABASE_URL']}/functions/v1/ai-suggest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ type: 'task_priority', task_id: task.id }),
        },
      )
      if (!response.ok) throw new Error(`AI suggest failed: ${response.status}`)
      const data = await response.json()
      const s = (data as { suggestion?: Record<string, number | string> }).suggestion
      if (s) {
        setAiReasoning(typeof s['reasoning'] === 'string' ? s['reasoning'] : null)
        const fields = ['value_score','urgency_score','risk_score','effort_score','friction_score'] as const
        const updates: Record<string, number> = {}
        for (const f of fields) {
          if (typeof s[f] === 'number') updates[f] = s[f] as number
        }
        if (Object.keys(updates).length > 0) {
          await updateTask(supabase, task.id, updates)
          setTask((prev) => prev ? { ...prev, ...updates } : null)
        }
      }
    } catch {
      setAiReasoning('AI önerisi alınamadı.')
    } finally {
      setAiLoading(false)
    }
  }, [task, updateTask])

  const handleDelete = useCallback(() => {
    Alert.alert('Görevi Sil', 'Bu görevi kalıcı olarak silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          if (!task) return
          await deleteTask(supabase, task.id)
          router.back()
        },
      },
    ])
  }, [task, deleteTask])

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    )
  }

  if (!task) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted">Görev bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-accent">← Geri Dön</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-gray-100 px-5 pb-4 pt-14">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-accent">← Geri</Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-3">
          {saving && <ActivityIndicator size="small" color={T.accent} />}
          <TouchableOpacity onPress={handleDelete}>
            <Text className="text-danger">Sil</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 py-4">
        {/* Başlık */}
        {editingTitle ? (
          <View className="mb-4">
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              className="rounded-xl border border-accent px-4 py-3 text-lg font-bold text-primary"
              multiline
              autoFocus
            />
            <View className="mt-2 flex-row gap-2">
              <TouchableOpacity
                onPress={() => setEditingTitle(false)}
                className="flex-1 items-center rounded-xl border border-gray-200 py-2"
              >
                <Text className="text-muted">İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleTitleSave()}
                className="flex-1 items-center rounded-xl bg-accent py-2"
              >
                <Text className="font-semibold text-white">Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => { setTitleDraft(task.title); setEditingTitle(true) }}
            className="mb-4"
          >
            <Text className="text-xl font-bold text-primary">{task.title}</Text>
            <Text className="mt-0.5 text-xs text-muted">Düzenlemek için dokun</Text>
          </TouchableOpacity>
        )}

        {/* Öncelik Skoru */}
        <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
          <Text className="mb-1 text-xs font-medium text-muted">WSJF Öncelik Skoru</Text>
          <Text className="text-3xl font-bold text-accent">
            {task.priority_score.toFixed(2)}
          </Text>
        </View>

        {/* Durum */}
        <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
          <Text className="mb-3 font-semibold text-primary">📊 Durum</Text>
          <View className="flex-row flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => void handleStatusChange(s)}
                className="rounded-xl px-3 py-1.5"
                style={{
                  backgroundColor: task.status === s ? STATUS_COLORS[s] : STATUS_COLORS[s] + '22',
                }}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: task.status === s ? 'white' : STATUS_COLORS[s] }}
                >
                  {TASK_STATUS_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* WSJF Skorları */}
        <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-semibold text-primary">⚡ WSJF Parametreleri</Text>
            <TouchableOpacity
              onPress={() => void handleAiPriority()}
              disabled={aiLoading}
              style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: `${T.blockType.workout}15`, opacity: aiLoading ? 0.5 : 1 }}
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color={T.blockType.workout} />
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.blockType.workout }}>🤖 AI Öner</Text>
              )}
            </TouchableOpacity>
          </View>
          {aiReasoning && (
            <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: `${T.blockType.workout}10`, padding: 12 }}>
              <Text style={{ fontSize: 12, color: T.text.secondary }}>{aiReasoning}</Text>
            </View>
          )}
          {WSJF_FIELDS.map((field) => {
            const value = task[field.key] as number
            return (
              <View key={field.key} className="mb-3">
                <View className="mb-1 flex-row justify-between">
                  <Text className="text-sm text-primary">{field.label}</Text>
                  <Text className="text-sm font-semibold" style={{ color: field.color }}>
                    {value} — {WSJF_SCORE_LABELS[value as 1 | 2 | 3 | 4 | 5]}
                  </Text>
                </View>
                <View className="flex-row gap-1">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => void handleWsjfChange(field.key, v)}
                      className="flex-1 items-center rounded-lg py-2"
                      style={{
                        backgroundColor: value === v ? field.color : field.color + '22',
                      }}
                    >
                      <Text
                        className="text-sm font-bold"
                        style={{ color: value === v ? 'white' : field.color }}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )
          })}
        </View>

        {/* Meta Bilgiler */}
        <View className="mb-8 rounded-2xl border border-gray-100 bg-surface p-4">
          <Text className="mb-3 font-semibold text-primary">📋 Detaylar</Text>
          {task.scheduled_date && (
            <View className="mb-2 flex-row justify-between">
              <Text className="text-sm text-muted">Planlanan Tarih</Text>
              <Text className="text-sm text-primary">{task.scheduled_date}</Text>
            </View>
          )}
          {task.due_date && (
            <View className="mb-2 flex-row justify-between">
              <Text className="text-sm text-muted">Son Tarih</Text>
              <Text className="text-sm text-primary">{task.due_date}</Text>
            </View>
          )}
          {task.estimated_minutes && (
            <View className="mb-2 flex-row justify-between">
              <Text className="text-sm text-muted">Tahmini Süre</Text>
              <Text className="text-sm text-primary">{task.estimated_minutes} dk</Text>
            </View>
          )}
          {task.tags.length > 0 && (
            <View className="mb-2">
              <Text className="mb-1 text-sm text-muted">Etiketler</Text>
              <View className="flex-row flex-wrap gap-2">
                {task.tags.map((tag) => (
                  <View key={tag} className="rounded-full bg-accent/10 px-3 py-1">
                    <Text className="text-xs text-accent">#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted">
              Oluşturulma: {new Date(task.created_at).toLocaleDateString('tr-TR')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
