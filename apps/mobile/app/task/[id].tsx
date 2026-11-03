import { useEffect, useState, useCallback } from 'react'
import { Alert, ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTaskStore, valueScoreForGoal, todayDate, shiftIsoDate } from '@lifeos/shared'
import { TaskGoalPicker } from '@/src/components/tasks/TaskGoalPicker'
import type { Task, TaskStatus } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { recordValueMoment } from '@/src/lib/review'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatusBadge } from '@/src/components/ui/Badge'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useProGate } from '@/src/hooks/useProGate'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const STATUS_OPTIONS: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred']
const STATUS_LABELS: Record<TaskStatus, string> = { backlog: 'Backlog', planned: 'Planlandı', in_progress: 'Devam', blocked: 'Bloke', done: 'Tamam', deferred: 'Ertelendi' }
const STATUS_COLORS: Record<TaskStatus, string> = { backlog: palette.backlog, planned: palette.planned, in_progress: palette.inProgress, blocked: palette.blocked, done: palette.done, deferred: palette.deferred }

const WSJF_FIELDS = [
  { key: 'value_score' as const,    label: 'Değer',   color: palette.accent },
  { key: 'urgency_score' as const,  label: 'Aciliyet', color: palette.danger },
  { key: 'risk_score' as const,     label: 'Risk',    color: palette.warning },
  { key: 'effort_score' as const,   label: 'Efor',    color: palette.backlog },
  { key: 'friction_score' as const, label: 'Engel',   color: palette.backlog },
] as const

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const [userId, setUserId] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingDuration, setEditingDuration] = useState(false)
  const [durationDraft, setDurationDraft] = useState('')
  // UX.md 2: hata uyarıyla değil, ilgili alanın altında gösterilir.
  const [inlineError, setInlineError] = useState<{ at: 'wsjf' | 'date' | 'duration'; message: string } | null>(null)
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    void loadTask()
  }, [loadTask])

  async function handleStatusChange(status: TaskStatus) {
    if (!task) return
    setSaving(true)
    try {
      await setStatus(supabase, task.id, status)
      setTask((p) => p ? { ...p, status } : null)
      // Görev tamamlandı — planlama tarafındaki değer anı. Öğün kaydı zaten
      // sayılıyordu ama yalnızca beslenme sekmesinde: görev/plan için gelen
      // kullanıcıya hiç puan sorulmuyordu. Beklenmez, kaydı geciktirmemeli.
      if (status === 'done') void recordValueMoment()
    } finally { setSaving(false) }
  }

  async function handleTitleSave() {
    if (!task || !titleDraft.trim()) return
    setSaving(true)
    try {
      const updated = await updateTask(supabase, task.id, { title: titleDraft.trim() })
      setTask(updated)
      setEditingTitle(false)
    } catch { Alert.alert('Hata', 'Başlık kaydedilemedi') }
    finally { setSaving(false) }
  }

  async function handleWsjf(field: string, value: number) {
    if (!task) return
    setSaving(true)
    setInlineError(null)
    try {
      const updated = await updateTask(supabase, task.id, { [field]: value })
      setTask(updated)
    } catch { setInlineError({ at: 'wsjf', message: 'Değer kaydedilemedi, tekrar dene.' }) }
    finally { setSaving(false) }
  }

  async function handleGoal(goalId: string | null) {
    if (!task) return
    const patch = { goal_id: goalId, value_score: valueScoreForGoal(task.value_score, goalId) }
    setSaving(true)
    try {
      const updated = await updateTask(supabase, task.id, patch)
      setTask(updated)
    } catch { Alert.alert('Hata', 'Hedef kaydedilemedi') }
    finally { setSaving(false) }
  }

  async function handleAiSuggest() {
    if (!task) return
    if (!requirePro()) return
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
          const updated = await updateTask(supabase, task.id, updates)
          setTask(updated)
        }
      }
    } catch { setAiReasoning('AI önerisi alınamadı.') }
    finally { setAiLoading(false) }
  }

  async function handleDate(dateStr: string | null) {
    if (!task) return
    setSaving(true)
    setInlineError(null)
    try {
      const updated = await updateTask(supabase, task.id, { scheduled_date: dateStr })
      setTask(updated)
    } catch { setInlineError({ at: 'date', message: 'Tarih kaydedilemedi, tekrar dene.' }) }
    finally { setSaving(false) }
  }

  async function handleDurationSave() {
    if (!task) return
    const val = Number(durationDraft.trim())
    if (!Number.isInteger(val) || val < 5 || val > 600) {
      setInlineError({ at: 'duration', message: 'Süre 5 ile 600 dakika arasında olmalı.' })
      return
    }
    setSaving(true)
    setInlineError(null)
    try {
      const updated = await updateTask(supabase, task.id, { estimated_minutes: val })
      setTask(updated)
      setEditingDuration(false)
    } catch { setInlineError({ at: 'duration', message: 'Süre kaydedilemedi, tekrar dene.' }) }
    finally { setSaving(false) }
  }

  const errorFor = (at: 'wsjf' | 'date' | 'duration') =>
    inlineError?.at === at
      ? <Text style={{ fontSize: fontSize.xs, color: palette.danger, marginTop: spacing[1] }}>{inlineError.message}</Text>
      : null

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

      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: 60, gap: spacing[4] }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
              disabled={aiLoading || isCheckingPro}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.accent}15`, borderWidth: 1, borderColor: `${palette.accent}30`, opacity: aiLoading || !isPro ? 0.6 : 1 }}
            >
              {aiLoading ? <ActivityIndicator size="small" color={palette.accent} /> : <Ionicons name={isPro ? 'sparkles' : 'lock-closed-outline'} size={14} color={palette.accent} />}
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{isPro ? 'AI Öner' : 'Pro · AI Öner'}</Text>
            </TouchableOpacity>
          </View>

          {aiReasoning && (
            <View style={{ marginBottom: spacing[4], padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{aiReasoning}</Text>
            </View>
          )}
          {errorFor('wsjf')}

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
            {/* Tarih - Faz 3'te DatePicker eklenecek */}
            <View>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing[2] }}>Tarih</Text>
              <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
                {(() => {
                  const todayStr = todayDate()
                  const tomorrowStr = shiftIsoDate(todayStr, 1)
                  const isToday = task.scheduled_date === todayStr
                  const isTomorrow = task.scheduled_date === tomorrowStr
                  const isNone = !task.scheduled_date
                  // Süre formu açıkken anında kayıt Kaydet/İptal ile karışmasın (UX.md 3).
                  const chipsDisabled = editingDuration || saving

                  return (
                    <>
                      {!isNone && !isToday && !isTomorrow && (
                        <View style={{ minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: '#fff' }}>{task.scheduled_date}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        disabled={chipsDisabled}
                        onPress={() => handleDate(todayStr)}
                        style={{ minWidth: 44, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: isToday ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: isToday ? palette.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: isToday ? '#fff' : colors.textPrimary }}>Bugün</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={chipsDisabled}
                        onPress={() => handleDate(tomorrowStr)}
                        style={{ minWidth: 44, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: isTomorrow ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: isTomorrow ? palette.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: isTomorrow ? '#fff' : colors.textPrimary }}>Yarın</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={chipsDisabled}
                        onPress={() => handleDate(null)}
                        style={{ minWidth: 44, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: isNone ? colors.bgSurface : colors.glassInner, borderWidth: 1, borderColor: isNone ? colors.border : colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: isNone ? colors.textPrimary : colors.textMuted }}>Tarihsiz</Text>
                      </TouchableOpacity>
                    </>
                  )
                })()}
              </View>
              {errorFor('date')}
            </View>

            {task.due_date && <DetailRow label="Son Tarih" value={task.due_date} color={palette.danger} />}

            {editingDuration ? (
              <View style={{ gap: spacing[2] }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Süre (dakika)</Text>
                <Input value={durationDraft} onChangeText={setDurationDraft} keyboardType="number-pad" autoFocus />
                {errorFor('duration')}
                <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                  <Button label="İptal" onPress={() => { setEditingDuration(false); setInlineError(null) }} variant="ghost" style={{ flex: 1 }} />
                  <Button label="Kaydet" onPress={handleDurationSave} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setDurationDraft(String(task.estimated_minutes ?? 30)); setEditingDuration(true) }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <DetailRow label="Süre" value={task.estimated_minutes ? `${task.estimated_minutes} dk` : 'Belirtilmedi'} />
              </TouchableOpacity>
            )}

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
            {userId && <TaskGoalPicker userId={userId} goalId={task.goal_id ?? null} onChange={(g) => void handleGoal(g)} />}
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
