import { useEffect, useState, useCallback } from 'react'
import { Alert, ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useGoBack } from '@/src/navigation/useGoBack'
import { hasCustomPriority, useTaskStore, valueScoreForGoal, todayDate, shiftIsoDate } from '@lifeos/shared'
import { TaskGoalPicker } from '@/src/components/tasks/TaskGoalPicker'
import { priorityWord } from '@/src/components/tasks/PriorityLabel'
import type { Task, TaskStatus } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { recordValueMoment } from '@/src/lib/review'
import { ScreenHeader, HeaderIconButton } from '@/src/components/ui/ScreenHeader'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { DateField } from '@/src/components/ui/PickerField'
import { Button } from '@/src/components/ui/Button'
import { StatusBadge } from '@/src/components/ui/Badge'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useProGate } from '@/src/hooks/useProGate'
import { palette, fontSize, fontWeight, spacing, radius, hitSlopFor } from '@/src/theme/tokens'

const STATUS_OPTIONS: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred']
const getStatusLabels = (t: any): Record<TaskStatus, string> => ({ backlog: t.misc_status_backlog, planned: t.misc_status_planned, in_progress: t.misc_status_in_progress, blocked: t.misc_status_blocked, done: t.misc_status_done, deferred: t.misc_status_deferred })
const STATUS_COLORS: Record<TaskStatus, string> = { backlog: palette.backlog, planned: palette.planned, in_progress: palette.inProgress, blocked: palette.blocked, done: palette.done, deferred: palette.deferred }

const getWsjfFields = (t: any) => [
  { key: 'value_score' as const,    label: t.misc_wsjf_value,   color: palette.accent },
  { key: 'urgency_score' as const,  label: t.misc_wsjf_urgency, color: palette.danger },
  { key: 'risk_score' as const,     label: t.misc_wsjf_risk,    color: palette.warning },
  { key: 'effort_score' as const,   label: t.misc_wsjf_effort,    color: palette.backlog },
  { key: 'friction_score' as const, label: t.misc_wsjf_friction,   color: palette.backlog },
] as const

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const goBack = useGoBack()
  const { colors } = useTheme()
  const [userId, setUserId] = useState<string | null>(null)
  const { t, lang } = useLang()
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
  // Öncelik ayarları varsayılan katlı (#21); AI önerisi gelince açılır ki değişen skor görünsün.
  const [priorityOpen, setPriorityOpen] = useState(false)

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
    } catch {
      // Store eski durumu geri yükledi; sessiz kalırsa kullanıcı görevi bitti sanar.
      Alert.alert(t.task_save_failed, t.task_status_error)
    } finally { setSaving(false) }
  }

  async function handleTitleSave() {
    if (!task || !titleDraft.trim()) return
    setSaving(true)
    try {
      const updated = await updateTask(supabase, task.id, { title: titleDraft.trim() })
      setTask(updated)
      setEditingTitle(false)
    } catch { Alert.alert(t.misc_error, t.misc_title_save_error) }
    finally { setSaving(false) }
  }

  async function handleWsjf(field: string, value: number) {
    if (!task) return
    setSaving(true)
    setInlineError(null)
    try {
      const updated = await updateTask(supabase, task.id, { [field]: value })
      setTask(updated)
    } catch { setInlineError({ at: 'wsjf', message: t.misc_wsjf_save_error }) }
    finally { setSaving(false) }
  }

  async function handleGoal(goalId: string | null) {
    if (!task) return
    const patch = { goal_id: goalId, value_score: valueScoreForGoal(task.value_score, goalId) }
    setSaving(true)
    try {
      const updated = await updateTask(supabase, task.id, patch)
      setTask(updated)
    } catch { Alert.alert(t.misc_error, t.misc_goal_save_error) }
    finally { setSaving(false) }
  }

  async function handleAiSuggest() {
    if (!task) return
    if (!requirePro('task_priority')) return
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
          setPriorityOpen(true)
        }
      }
    } catch { setAiReasoning(t.misc_ai_suggest_error) }
    finally { setAiLoading(false) }
  }

  async function handleDate(dateStr: string | null) {
    if (!task) return
    setSaving(true)
    setInlineError(null)
    try {
      const updated = await updateTask(supabase, task.id, { scheduled_date: dateStr })
      setTask(updated)
    } catch { setInlineError({ at: 'date', message: t.misc_date_save_error }) }
    finally { setSaving(false) }
  }

  async function handleDurationSave() {
    if (!task) return
    const val = Number(durationDraft.trim())
    if (!Number.isInteger(val) || val < 5 || val > 600) {
      setInlineError({ at: 'duration', message: t.misc_duration_limit_error })
      return
    }
    setSaving(true)
    setInlineError(null)
    try {
      const updated = await updateTask(supabase, task.id, { estimated_minutes: val })
      setTask(updated)
      setEditingDuration(false)
    } catch { setInlineError({ at: 'duration', message: t.misc_duration_save_error }) }
    finally { setSaving(false) }
  }

  const errorFor = (at: 'wsjf' | 'date' | 'duration') =>
    inlineError?.at === at
      ? <Text style={{ fontSize: fontSize.xs, color: palette.danger, marginTop: spacing[1] }}>{inlineError.message}</Text>
      : null

  function handleDelete() {
    Alert.alert(t.misc_task_delete_title, t.misc_task_delete_body, [
      { text: t.misc_cancel, style: 'cancel' },
      { text: t.misc_delete, style: 'destructive', onPress: async () => { if (!task) return; await deleteTask(supabase, task.id); goBack() } },
    ])
  }

  if (loading) return (
    <ScreenBackground><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={palette.accent} /></View></ScreenBackground>
  )

  if (!task) return (
    <ScreenBackground>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
        <Text style={{ color: colors.textMuted }}>{t.misc_task_not_found}</Text>
        <Button label={t.misc_go_back} onPress={goBack} variant="secondary" />
      </View>
    </ScreenBackground>
  )

  return (
    <ScreenBackground edges={['top']}>
      <ScreenHeader
        title=""
        back
        onBack={goBack}
        right={
          <>
            {saving && <ActivityIndicator size="small" color={palette.accent} />}
            <HeaderIconButton icon="trash-outline" label={t.misc_delete_task_a11y} onPress={handleDelete} color={palette.danger} />
          </>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing[5], paddingTop: spacing[3], paddingBottom: 60, gap: spacing[4] }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Title */}
        <GlassCard>
          {editingTitle ? (
            <View style={{ gap: spacing[3] }}>
              <Input value={titleDraft} onChangeText={setTitleDraft} multiline autoFocus />
              <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                <Button label={t.misc_cancel} onPress={() => setEditingTitle(false)} variant="ghost" style={{ flex: 1 }} />
                <Button label={t.misc_save} onPress={handleTitleSave} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => { setTitleDraft(task.title); setEditingTitle(true) }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{task.title}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginTop: 4 }}>{t.misc_tap_to_edit}</Text>
            </TouchableOpacity>
          )}
        </GlassCard>

        {/* Tamamlama ekranın birincil eylemi: durum çipleri arasında aranmıyor (kullanıcı isteği 2026-11-16). */}
        <Button
          label={task.status === 'done' ? t.misc_uncheck_done : t.misc_check_done}
          icon={task.status === 'done' ? 'arrow-undo-outline' : 'checkmark-circle'}
          variant={task.status === 'done' ? 'secondary' : 'primary'}
          onPress={() => void handleStatusChange(task.status === 'done' ? 'planned' : 'done')}
          disabled={saving}
          fullWidth
        />

        {/* Priority score */}
        <GlassCard>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSubtle, marginBottom: 4 }}>{t.task_priority}</Text>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: palette.accent }}>
            {task.priority_score != null && hasCustomPriority(task) ? priorityWord(t, task.priority_score) : t.task_priority_unset}
          </Text>
        </GlassCard>

        {/* Status */}
        <GlassCard>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.misc_status}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {STATUS_OPTIONS.map((s) => {
              const active = task.status === s
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => handleStatusChange(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: active ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}18`, borderWidth: 1, borderColor: active ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}35` }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: active ? '#fff' : STATUS_COLORS[s] }}>{getStatusLabels(t)[s]}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </GlassCard>

        {/* WSJF */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] }}>
            <TouchableOpacity
              onPress={() => setPriorityOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={t.task_priority_set}
              accessibilityState={{ expanded: priorityOpen }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
            >
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.task_priority_set}</Text>
              <Ionicons name={priorityOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSubtle} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAiSuggest}
              disabled={aiLoading || isCheckingPro}
              accessibilityRole="button"
              accessibilityState={{ disabled: aiLoading || isCheckingPro, busy: aiLoading }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: `${palette.accent}15`, borderWidth: 1, borderColor: `${palette.accent}30`, opacity: aiLoading || !isPro ? 0.6 : 1 }}
            >
              {aiLoading ? <ActivityIndicator size="small" color={palette.accent} /> : <Ionicons name={isPro ? 'sparkles' : 'lock-closed-outline'} size={14} color={palette.accent} />}
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{isPro ? t.misc_ai_suggest : t.misc_pro_ai_suggest}</Text>
            </TouchableOpacity>
          </View>

          {priorityOpen && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing[2], marginBottom: spacing[4] }}>{t.task_priority_explain}</Text>
          )}
          {aiReasoning && (
            <View style={{ marginBottom: spacing[4], padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{aiReasoning}</Text>
            </View>
          )}
          {errorFor('wsjf')}

          {priorityOpen && <View style={{ gap: spacing[4] }}>
            {getWsjfFields(t).map((field) => {
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
                        hitSlop={hitSlopFor(44, 36)}
                        accessibilityRole="button"
                        accessibilityLabel={`${field.label} ${v}`}
                        accessibilityState={{ selected: value === v }}
                        style={{ flex: 1, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: value === v ? field.color : `${field.color}18`, borderWidth: 1, borderColor: value === v ? field.color : `${field.color}30` }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: value === v ? '#fff' : field.color }}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )
            })}
          </View>}
        </GlassCard>

        {/* Details */}
        <GlassCard>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.misc_details}</Text>
          <View style={{ gap: spacing[3] }}>
            {/* Tarih: hızlı seçimler ve takvimden seçme (#18) */}
            <View>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing[2] }}>{t.misc_date}</Text>
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
                      <TouchableOpacity
                        disabled={chipsDisabled}
                        onPress={() => handleDate(todayStr)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isToday, disabled: chipsDisabled }}
                        style={{ minWidth: 44, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: isToday ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: isToday ? palette.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: isToday ? '#fff' : colors.textPrimary }}>{t.misc_today}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={chipsDisabled}
                        onPress={() => handleDate(tomorrowStr)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isTomorrow, disabled: chipsDisabled }}
                        style={{ minWidth: 44, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: isTomorrow ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: isTomorrow ? palette.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: isTomorrow ? '#fff' : colors.textPrimary }}>{t.misc_tomorrow}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={chipsDisabled}
                        onPress={() => handleDate(null)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isNone, disabled: chipsDisabled }}
                        style={{ minWidth: 44, minHeight: 44, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: isNone ? colors.bgSurface : colors.glassInner, borderWidth: 1, borderColor: isNone ? colors.border : colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: isNone ? colors.textPrimary : colors.textMuted }}>{t.misc_no_date}</Text>
                      </TouchableOpacity>
                    </>
                  )
                })()}
              </View>
              <DateField
                value={task.scheduled_date ?? ''}
                onChange={(v) => void handleDate(v)}
                disabled={editingDuration || saving}
                containerStyle={{ marginTop: spacing[2] }}
              />
              {errorFor('date')}
            </View>

            {task.due_date && <DetailRow label={t.misc_due_date} value={task.due_date} color={palette.danger} />}

            {editingDuration ? (
              <View style={{ gap: spacing[2] }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.misc_duration_min}</Text>
                <Input value={durationDraft} onChangeText={setDurationDraft} keyboardType="number-pad" autoFocus />
                {errorFor('duration')}
                <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                  <Button label={t.misc_cancel} onPress={() => { setEditingDuration(false); setInlineError(null) }} variant="ghost" style={{ flex: 1 }} />
                  <Button label={t.misc_save} onPress={handleDurationSave} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setDurationDraft(String(task.estimated_minutes ?? 30)); setEditingDuration(true) }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <DetailRow label={t.misc_duration} value={task.estimated_minutes ? `${task.estimated_minutes} ${t.misc_min_short}` : t.misc_not_specified} />
              </TouchableOpacity>
            )}

            {(task.tags?.length ?? 0) > 0 && (
              <View>
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing[2] }}>{t.misc_tags}</Text>
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
              {t.misc_created}: {new Date(task.created_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US')}
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
