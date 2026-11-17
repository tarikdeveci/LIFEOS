import type { ReactNode } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { Exercise, Workout, WorkoutSet, WorkoutStreak } from '@lifeos/shared'
import { Button } from '../ui/Button'
import { GlassCard } from '../ui/GlassCard'
import { Input } from '../ui/Input'
import { StatCard } from '../ui/StatCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '../../theme/tokens'
import { ExerciseImage } from './ExerciseImage'
import { LiveWorkout } from './LiveWorkout'
import { StreakCard } from './StreakCard'
import { categoryLabel, exerciseName, muscleGroupName } from './labels'

interface Props {
  workout: Workout | null
  /** Yerel takvim günü (YYYY-AA-GG): antrenmanın tarihi farklıysa dünden kalan olarak işaretlenir. */
  todayStr: string
  /** Bugünkü antrenman okunamadı: Başlat kartı yerine hata ve Tekrar dene görünür. */
  loadError: boolean
  onRetry: () => void
  userId: string | null
  /** Süren antrenmanda en az bir set var: canlı ekran açık. */
  liveActive: boolean
  setsExpanded: boolean
  onToggleSets: () => void
  onStart: () => void
  /** Aktif programın sıradaki günü (`findProgramProgress`); varsa birincil eylem o günü başlatır. */
  nextProgramDay: { program: string; day: string; /** Bugüne planlı gün (rutin ya da blok); false: sıradaki gün. */ planned: boolean; /** Hareket özeti. */ summary: string } | null
  onStartNext: () => void
  onFinish: () => void
  onDelete: () => void
  onAddSet: (exercise: Exercise) => void
  onFocusMuscle: (muscleGroupId: number | null) => void
  search: string
  onChangeSearch: (value: string) => void
  /** Hızlı aramanın sonuçları; ilk beşi gösterilir. */
  matches: Exercise[]
  /** Kas haritası kartı: antrenman sürerken canlı kartın altında, yoksa en altta. */
  muscleCard: ReactNode
  streak: WorkoutStreak
  weekCount: number
  totalCount: number
  isPro: boolean
  isCheckingPro: boolean
  onOpenCoach: () => void
}

/** Antrenman ekranının Bugün sekmesi: başlat ya da süren antrenman, seri, sayılar ve AI koç kartı. */
export function TodayTab({
  workout, todayStr, loadError, onRetry, userId, liveActive, setsExpanded, onToggleSets, onStart, nextProgramDay, onStartNext, onFinish, onDelete, onAddSet, onFocusMuscle,
  search, onChangeSearch, matches, muscleCard, streak, weekCount, totalCount, isPro, isCheckingPro, onOpenCoach,
}: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  // Bugünkü antrenman setsizse ve gün biliniyorsa kart yine görünür: Başlat mevcut boş antrenmanı kullanır.
  const emptyToday = !!workout && workout.date === todayStr && workout.status !== 'completed'
    && (workout.workout_sets?.length ?? 0) === 0 && nextProgramDay !== null
  const carriedOver = !!workout && workout.date !== todayStr && workout.status !== 'completed'

  return (
    <>
      {/* Okunamayan antrenmanı "yok" sanıp ikinci antrenman açtırmamak için hata durumu */}
      {!workout && loadError && (
        <GlassCard style={{ marginBottom: spacing[4], gap: spacing[3] }}>
          <Text accessibilityRole="alert" style={{ fontSize: fontSize.base, color: colors.textPrimary }}>{t.wkf_today_load_error}</Text>
          <Button label={t.retry} onPress={onRetry} variant="secondary" fullWidth />
        </GlassCard>
      )}

      {/* Ana eylem en üstte: antrenman yoksa başlat, varsa bugünkü antrenman */}
      {((!workout && !loadError) || emptyToday) && (
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${palette.workout}15`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="barbell-outline" size={22} color={palette.workout} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                {nextProgramDay ? (nextProgramDay.planned ? t.wkf_today_program.replace('{program}', nextProgramDay.program).replace('{day}', nextProgramDay.day) : nextProgramDay.program) : t.work_no_workout}
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                {nextProgramDay ? (nextProgramDay.planned ? nextProgramDay.summary : t.ux_wk_next_day.replace('{day}', nextProgramDay.day)) : t.work_no_workout_hint}
              </Text>
            </View>
          </View>
          {/* Aktif program varken birincil eylem sıradaki günü başlatır; boş antrenman ikincil kalır. */}
          <TouchableOpacity
            onPress={nextProgramDay ? onStartNext : onStart}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.full, backgroundColor: palette.workout }}
          >
            <Ionicons name="play-circle-outline" size={20} color="#fff" />
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: '#fff' }} numberOfLines={1}>
              {nextProgramDay ? t.ux_wk_start_day.replace('{day}', nextProgramDay.day) : t.work_start}
            </Text>
          </TouchableOpacity>
          {nextProgramDay && !workout && (
            <TouchableOpacity onPress={onStart} accessibilityRole="button" style={{ minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: spacing[1] }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>{t.ux_wk_empty_start}</Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      )}

      {workout ? (
        <GlassCard style={{ marginBottom: spacing[4] }}>
          {/* Workout header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="barbell" size={20} color={palette.workout} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{workout.name?.trim() || t.wk_workout}</Text>
                <Text style={{ fontSize: fontSize.xs, color: workout.status === 'completed' ? palette.success : colors.textMuted }}>
                  {workout.status === 'completed'
                    ? `${t.work_completed} · ${t.wk_sets_n.replace('{n}', String(workout.workout_sets?.length ?? 0))}`
                    : t.wk_in_progress_sets.replace('{n}', String(workout.workout_sets?.length ?? 0))}
                </Text>
                {carriedOver && (
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{t.wkf_from_yesterday}</Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {/* When completed: toggle sets visibility */}
              {workout.status === 'completed' && (workout.workout_sets?.length ?? 0) > 0 && (
                <TouchableOpacity
                  onPress={onToggleSets}
                  style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted }}>
                    {setsExpanded ? t.work_hide_sets : t.work_show_sets}
                  </Text>
                </TouchableOpacity>
              )}
              {workout.status !== 'completed' && (
                <TouchableOpacity onPress={onFinish} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.success}18`, borderWidth: 1, borderColor: `${palette.success}30` }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.success }}>{t.work_finish}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
                <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Süren antrenman: canlı ekran. Biten antrenman: açılır düz set listesi. */}
          {liveActive && userId && (
            <LiveWorkout
              workout={workout}
              userId={userId}
              onAddSet={onAddSet}
              onFocusMuscle={onFocusMuscle}
            />
          )}
          {workout.status !== 'completed' && (workout.workout_sets?.length ?? 0) === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>
              {t.work_exercise_search}
            </Text>
          )}
          {workout.status === 'completed' && setsExpanded && (
            <View style={{ gap: 2, marginBottom: spacing[4] }}>
              {workout.workout_sets?.map((set: WorkoutSet) => <SetRow key={set.id} set={set} />)}
            </View>
          )}

          {workout.status !== 'completed' && (
            <View style={{ gap: spacing[3] }}>
              <Input
                value={search}
                onChangeText={onChangeSearch}
                onClear={() => onChangeSearch('')}
                clearLabel={t.wk_search_clear}
                placeholder={t.work_exercise_search}
              />
              {search.trim().length > 0 && (
                <View style={{ gap: spacing[2] }}>
                  {matches.slice(0, 5).map((ex) => (
                    <TouchableOpacity
                      key={ex.id}
                      onPress={() => { onAddSet(ex); onChangeSearch('') }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
                    >
                      <ExerciseImage uri={ex.image_url} style={{ width: 44, height: 44, borderRadius: radius.sm }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{exerciseName(ex, lang, t)}</Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                          {muscleGroupName(ex.muscle_group, lang)} · {categoryLabel(ex.category, t)}
                          {ex.is_bodyweight ? ` · ${t.wk_bodyweight}` : ''}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}>
                        <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.semibold }}>+ Set</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {matches.length === 0 && (
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.work_no_results}</Text>
                  )}
                </View>
              )}
            </View>
          )}
        </GlassCard>
      ) : null}

      {/* Antrenman sürerken harita canlı kartın hemen altında: işaretlenen set orada görünür. */}
      {liveActive && muscleCard}

      <StreakCard streak={streak} />

      <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
        <StatCard label={t.work_this_week} value={weekCount} color={palette.workout} />
        <StatCard label={t.work_today_sets} value={workout?.workout_sets?.length ?? 0} color={palette.accent} />
        <StatCard label={t.work_total} value={totalCount} />
      </View>

      <GlassCard style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={isPro ? 'sparkles' : 'lock-closed-outline'} size={18} color={palette.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.coach_title}</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
              {t.coach_subtitle}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onOpenCoach}
            disabled={isCheckingPro}
            style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.full, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}35`, opacity: isPro ? 1 : 0.6 }}
          >
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
              {isPro ? t.coach_chat : 'Pro'}
            </Text>
          </TouchableOpacity>
        </View>
      </GlassCard>

      {!liveActive && muscleCard}
    </>
  )
}

function SetRow({ set }: { set: WorkoutSet }) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const name = set.exercise ? exerciseName(set.exercise, lang, t) : t.wk_exercise_n.replace('{n}', String(set.set_number))
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing[3] }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.workout }}>{set.set_number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{name}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {t.wk_reps_n.replace('{n}', String(set.reps ?? '-'))}{set.weight_kg ? ` · ${set.weight_kg}kg` : ''}
        </Text>
      </View>
    </View>
  )
}
