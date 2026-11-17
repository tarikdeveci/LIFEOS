import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { findProgramProgress, isExerciseAvailable, todayDate, fromDateString, useWorkoutStore } from '@lifeos/shared'
import type { Exercise } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { EquipmentSheet } from '@/src/components/workout/EquipmentSheet'
import { AdaptProgramView } from '@/src/components/workout/AdaptProgramView'
import { MuscleInsightsCard } from '@/src/components/workout/MuscleInsightsCard'
import { AddSetSheet } from '@/src/components/workout/AddSetSheet'
import { TodayTab } from '@/src/components/workout/TodayTab'
import { LibraryTab } from '@/src/components/workout/LibraryTab'
import { ProgramsTab } from '@/src/components/workout/ProgramsTab'
import { HistoryTab } from '@/src/components/workout/HistoryTab'
import { ProgramDaysView } from '@/src/components/workout/ProgramDaysView'
import { programDayLabel } from '@/src/components/workout/programDays'
import { exerciseName } from '@/src/components/workout/labels'
import { useTodayProgramDay } from '@/src/hooks/useTodayProgramDay'
import { ProgramExercisePickerView } from '@/src/components/workout/ProgramExercisePickerView'
import { ProgramPlannerView } from '@/src/components/workout/ProgramPlannerView'
import { CreateProgramSheet } from '@/src/components/workout/CreateProgramSheet'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { ScreenHeader } from '@/src/components/ui/ScreenHeader'
import { AiChatSheet } from '@/src/components/ai/AiChatSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useProGate } from '@/src/hooks/useProGate'
import { useWorkoutSession } from '@/src/hooks/useWorkoutSession'
import { useWorkoutPrograms } from '@/src/hooks/useWorkoutPrograms'
import { useProgramPlanner } from '@/src/hooks/useProgramPlanner'
import { useProgramEditor } from '@/src/hooks/useProgramEditor'
import { ProgramEditView } from '@/src/components/workout/ProgramEditView'
import { useWorkoutCoach } from '@/src/hooks/useWorkoutCoach'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

type WorkoutTab = 'today' | 'library' | 'programs' | 'history'

export default function WorkoutScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { exercises, muscleGroups, todayWorkout, workoutHistory, programs: allPrograms, streak, equipment, equipmentLoaded, analyticsSets, analyticsLoaded, analyticsError, analyticsBodyWeightKg, analyticsGender, fetchLibrary, fetchTodayWorkout, fetchHistory, fetchStreak, fetchPrograms, fetchEquipment, fetchAnalytics, saveEquipment } = useWorkoutStore()
  const [userId, setUserId] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)
  const [tab, setTab] = useState<WorkoutTab>('today')
  const [refreshing, setRefreshing] = useState(false)
  const [setsExpanded, setSetsExpanded] = useState(false)
  /** Canlı ekrandaki hareketin ana kası; kas haritası onu seçili gösterir. */
  const [liveMuscleId, setLiveMuscleId] = useState<number | null>(null)

  // Add set: selectedExercise stores the exercise object from DB
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)

  // Library search + filter
  const [search, setSearch] = useState('')
  // Bugün sekmesinin hızlı araması ayrı: kütüphanenin metni ve kas grubu süzgeci ona taşınmasın.
  const [todaySearch, setTodaySearch] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null)
  /** Kütüphane ve hareket seçicide yalnızca eldeki aletlerle yapılabilenler. */
  const [onlyAvailable, setOnlyAvailable] = useState(false)

  // Ekipman seçimi
  const [showEquipment, setShowEquipment] = useState(false)

  // toISOString() UTC verir; UTC+3'te gece yarısı ile 03:00 arası bir önceki günü
  // gösteriyordu. todayDate() yerel takvim günü.
  const todayStr = todayDate()

  const programs = useWorkoutPrograms(userId)
  const { liveProgram } = programs
  const editor = useProgramEditor(userId, liveProgram)
  const planner = useProgramPlanner({
    userId,
    liveProgram,
    onScheduled: () => programs.setSelectedProgram(null),
  })
  const session = useWorkoutSession({
    userId,
    todayStr,
    onProgramDayAccepted: () => { programs.setSelectedProgram(null); programs.setExpandedDay(null) },
    onProgramDayStarted: () => setTab('today'),
  })
  const coach = useWorkoutCoach({
    userId,
    requirePro,
    onProgramSaved: (program) => {
      setTab('programs')
      programs.setSelectedProgram(program)
      planner.openProgramPlanner(program)
    },
  })

  const load = useCallback(async (uid: string) => {
    await Promise.all([fetchLibrary(supabase), fetchTodayWorkout(supabase, uid, todayStr), fetchHistory(supabase, uid), fetchStreak(supabase, uid), fetchPrograms(supabase, uid), fetchEquipment(supabase, uid), fetchAnalytics(supabase, uid)])
  }, [todayStr, fetchLibrary, fetchTodayWorkout, fetchHistory, fetchStreak, fetchPrograms, fetchEquipment, fetchAnalytics])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id) }
    })
  }, [load])

  async function handleRefresh() {
    if (!userId) return
    // Aşağı çekince katalog da tazelenir (yeni görseller, düzeltilen adlar); açılışta önbellek yeter.
    setRefreshing(true); await Promise.all([load(userId), fetchLibrary(supabase, { force: true })]); setRefreshing(false)
  }

  // Süzgeç yalnızca seçim varken anlamlı; seçim yokken hiçbir şey elenmez.
  const equipmentFilterActive = equipment !== null && onlyAvailable

  const matchesName = (e: Exercise, query: string) =>
    !query || e.name.toLowerCase().includes(query.toLowerCase()) || (e.name_en ?? '').toLowerCase().includes(query.toLowerCase())
  const matchesEquipment = (e: Exercise) => !equipmentFilterActive || isExerciseAvailable(e, equipment)

  const filteredExercises = exercises.filter((e) =>
    matchesName(e, search) && (!filterGroupId || e.muscle_group_id === filterGroupId) && matchesEquipment(e))

  const todayMatches = exercises.filter((e) => matchesName(e, todaySearch) && matchesEquipment(e))

  const pickerExercises = exercises
    .filter((e) => matchesName(e, programs.pickerSearch) && matchesEquipment(e))
    .slice(0, 25)

  const canAddSet = todayWorkout !== null && todayWorkout.status !== 'completed'
  const liveActive = canAddSet && (todayWorkout.workout_sets?.length ?? 0) > 0
  const openSetModal = (ex: Exercise) => setSelectedExercise(ex)
  const muscleCard = (
    <MuscleInsightsCard
      sets={analyticsSets}
      muscleGroups={muscleGroups}
      bodyWeightKg={analyticsBodyWeightKg}
      gender={analyticsGender}
      loading={!analyticsLoaded}
      error={analyticsError}
      focusMuscleId={liveActive ? liveMuscleId : null}
    />
  )

  // Aktif program: en son programdan başlatılan antrenman; hareketi olmayan gün başlatılamaz.
  const progress = findProgramProgress(allPrograms, workoutHistory, todayStr, (d) => programDayLabel(d, t))
  const nextReady = progress && (progress.nextDay.exercises?.length ?? 0) > 0 ? progress : null
  // Bugüne planlı gün (rutin bağı ya da blok adı) varsa o, yoksa sıradaki gün.
  const planned = useTodayProgramDay(userId, todayWorkout?.id ?? '')
  const plannedReady = planned && (planned.day.exercises?.length ?? 0) > 0 ? planned : null
  const startTarget = plannedReady
    ? { program: plannedReady.program, day: plannedReady.day, planned: true }
    : nextReady ? { program: nextReady.program, day: nextReady.nextDay, planned: false } : null
  const targetNames = [...(startTarget?.day.exercises ?? [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map((e) => exerciseName(e.exercise, lang, t))
  const targetSummary = targetNames.length > 3
    ? `${targetNames.slice(0, 3).join(', ')} ${t.wkf_more_n.replace('{n}', String(targetNames.length - 3))}`
    : targetNames.join(', ')

  const weekCount = workoutHistory.filter((w) => {
    const diff = (Date.now() - fromDateString(w.date).getTime()) / 86400000
    return diff <= 7
  }).length

  const TABS: { key: WorkoutTab; label: string }[] = [
    { key: 'today',    label: t.work_tab_today },
    { key: 'programs', label: t.work_tab_programs },
    { key: 'library',  label: t.work_tab_library },
    { key: 'history',  label: t.work_tab_history },
  ]

  return (
    <ScreenBackground>
      <ScreenHeader
        title={t.work_title}
        right={
          tab === 'today' && todayWorkout && todayWorkout.status !== 'completed' ? (
            <TouchableOpacity onPress={() => setTab('library')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[4], paddingVertical: 10, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}>
              <Ionicons name="search-outline" size={14} color={palette.workout} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>{t.wk_add_exercise_btn}</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.workout} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Tabs */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[5] }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} style={{ flex: 1, minHeight: MIN_TOUCH, justifyContent: 'center', borderRadius: radius.md, alignItems: 'center', backgroundColor: tab === t.key ? colors.bgSurface : 'transparent', ...(tab === t.key ? colors.shadowCard : {}) }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t.key ? fontWeight.semibold : fontWeight.regular, color: tab === t.key ? colors.textPrimary : colors.textMuted }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── TODAY ── */}
        {tab === 'today' && (
          <TodayTab
            workout={todayWorkout}
            userId={userId}
            liveActive={liveActive}
            setsExpanded={setsExpanded}
            onToggleSets={() => setSetsExpanded((v) => !v)}
            onStart={() => session.setShowStart(true)}
            nextProgramDay={startTarget ? { program: startTarget.program.name, day: programDayLabel(startTarget.day, t), planned: startTarget.planned, summary: targetSummary } : null}
            onStartNext={() => { if (startTarget) void session.handleStartFromProgramDay(startTarget.program, startTarget.day.id) }}
            onFinish={() => session.setShowFinish(true)}
            onDelete={session.handleDeleteWorkout}
            onAddSet={openSetModal}
            onFocusMuscle={setLiveMuscleId}
            search={todaySearch}
            onChangeSearch={setTodaySearch}
            matches={todayMatches}
            muscleCard={muscleCard}
            streak={streak}
            weekCount={weekCount}
            totalCount={workoutHistory.length}
            isPro={isPro}
            isCheckingPro={isCheckingPro}
            onOpenCoach={() => { if (requirePro('workout_coach')) coach.setShowCoach(true) }}
          />
        )}

        {/* ── LIBRARY ── */}
        {tab === 'library' && (
          <LibraryTab
            exercises={filteredExercises}
            totalCount={exercises.length}
            muscleGroups={muscleGroups}
            equipment={equipment}
            search={search}
            onChangeSearch={setSearch}
            filterGroupId={filterGroupId}
            onChangeFilterGroup={setFilterGroupId}
            onlyAvailable={onlyAvailable}
            onToggleOnlyAvailable={() => setOnlyAvailable((v) => !v)}
            canAddSet={canAddSet}
            onAddSet={openSetModal}
          />
        )}

        {/* ── PROGRAMS ── */}
        {tab === 'programs' && (
          <ProgramsTab
            programs={programs.sortedPrograms}
            fitByProgram={programs.fitByProgram}
            equipment={equipment}
            equipmentLoaded={equipmentLoaded}
            onEditEquipment={() => setShowEquipment(true)}
            onCreate={programs.openCreateProgram}
            onOpen={(program) => { programs.setSelectedProgram(program); programs.setExpandedDay(null) }}
            active={progress ? { programId: progress.program.id, nextDay: programDayLabel(progress.nextDay, t) } : null}
          />
        )}

        {/* ── HISTORY ── */}
        {tab === 'history' && <HistoryTab history={workoutHistory} />}
      </ScrollView>

      {/* Start workout */}
      <BottomSheet visible={session.showStart} onClose={() => session.setShowStart(false)} title={t.work_start_modal}>
        <View style={{ gap: spacing[4] }}>
          <Input label={t.wk_workout_name} value={session.workoutName} onChangeText={session.setWorkoutName} placeholder={t.wk_workout_name_ph} autoFocus />
          <Button label={session.starting ? t.wk_starting : t.wk_start} onPress={session.handleStart} loading={session.starting} fullWidth />
        </View>
      </BottomSheet>

      {/* Add set (exercise selected from library) */}
      {todayWorkout && <AddSetSheet exercise={selectedExercise} workout={todayWorkout} onClose={() => setSelectedExercise(null)} />}

      {/* Finish */}
      <BottomSheet visible={session.showFinish} onClose={() => session.setShowFinish(false)} title={t.wk_finish_title}>
        <View style={{ gap: spacing[4] }}>
          <Input label={t.wk_total_minutes} value={session.duration} onChangeText={session.setDuration} keyboardType="number-pad" placeholder="45" autoFocus />
          <Button label={session.finishing ? t.wk_saving : t.wk_finish} onPress={session.handleFinish} loading={session.finishing} fullWidth />
        </View>
      </BottomSheet>

      {/*
        Program detayı ve hareket seçici AYNI sayfada, iç içe geçmiş iki
        BottomSheet olarak değil: iOS zaten görünür bir modalin üstüne ikinci
        modal açmıyor ("Hareket Ekle"ye basınca hiçbir şey olmuyordu). Seçici
        açıkken gün listesinin yerini alıyor, geri düğmesiyle dönülüyor.
      */}
      <BottomSheet
        visible={!!programs.selectedProgram}
        onClose={() => { programs.setSelectedProgram(null); programs.setExpandedDay(null); programs.setAddingToDay(null); planner.setPlanningProgram(false); programs.setAdaptingProgram(false); editor.close() }}
        title={editor.mode?.kind === 'names' ? t.ux_wk_edit_names : editor.mode?.kind === 'exercise' ? t.ux_wk_edit_exercise : programs.addingToDay ? t.wk_add_movement : planner.planningProgram ? t.wk_plan_program : programs.adaptingProgram ? t.wk_adapt_title : (liveProgram ? liveProgram.name : t.wk_program)}
        scrollable
        onBack={
          editor.open ? editor.close
            : programs.adaptingProgram && liveProgram && equipment !== null ? () => programs.setAdaptingProgram(false)
            : programs.addingToDay ? programs.closeExercisePicker
              : planner.planningProgram ? () => planner.setPlanningProgram(false)
                : undefined
        }
      >
        {editor.open ? (
          <ProgramEditView editor={editor} />
        ) : programs.adaptingProgram && liveProgram && equipment !== null ? (
          <AdaptProgramView
            program={liveProgram}
            catalog={exercises}
            owned={equipment}
            applying={programs.applyingAdaptation}
            onBack={() => programs.setAdaptingProgram(false)}
            onApply={(adaptation) => void programs.handleApplyAdaptation(adaptation)}
          />
        ) : programs.addingToDay ? (
          <ProgramExercisePickerView
            exercises={pickerExercises}
            equipment={equipment}
            sets={programs.pickerSets}
            onChangeSets={programs.setPickerSets}
            reps={programs.pickerReps}
            onChangeReps={programs.setPickerReps}
            search={programs.pickerSearch}
            onChangeSearch={programs.setPickerSearch}
            onlyAvailable={onlyAvailable}
            onToggleOnlyAvailable={() => setOnlyAvailable((v) => !v)}
            onBack={programs.closeExercisePicker}
            onPick={(exerciseId) => void programs.handleAddExerciseToDay(exerciseId)}
          />
        ) : planner.planningProgram ? (
          <ProgramPlannerView
            program={liveProgram}
            startDate={planner.planStartDate}
            onChangeStartDate={planner.setPlanStartDate}
            time={planner.planTime}
            onChangeTime={planner.setPlanTime}
            weeks={planner.planWeeks}
            onChangeWeeks={planner.setPlanWeeks}
            weekdays={planner.planWeekdays}
            onPickWeekday={planner.pickWeekday}
            toBlocks={planner.planToBlocks}
            onToggleBlocks={() => planner.setPlanToBlocks((v) => !v)}
            toCalendar={planner.planToCalendar}
            onToggleCalendar={() => planner.setPlanToCalendar((v) => !v)}
            scheduling={planner.scheduling}
            onSchedule={() => void planner.handleScheduleProgram()}
            onBack={() => planner.setPlanningProgram(false)}
          />
        ) : (
          <ProgramDaysView
            program={liveProgram}
            equipment={equipment}
            fit={programs.liveFit}
            canAdapt={programs.canAdapt}
            isOwnProgram={programs.isOwnProgram}
            expandedDay={programs.expandedDay}
            onExpandDay={programs.setExpandedDay}
            hasOpenWorkout={canAddSet}
            starting={session.starting}
            onAdapt={() => programs.setAdaptingProgram(true)}
            onPlan={() => planner.openProgramPlanner()}
            onAddMovement={programs.openExercisePicker}
            onRemoveExercise={(rowId) => void programs.handleRemoveProgramExercise(rowId)}
            onEditExercise={editor.openExercise}
            onEditNames={editor.openNames}
            onStartDay={(program, dayId) => void session.handleStartFromProgramDay(program, dayId)}
            onDelete={programs.handleDeleteProgram}
          />
        )}
      </BottomSheet>

      {/* Kendi programını oluştur */}
      <CreateProgramSheet
        visible={programs.showCreateProgram}
        onClose={() => programs.setShowCreateProgram(false)}
        name={programs.newProgramName}
        onChangeName={programs.setNewProgramName}
        dayNames={programs.newDayNames}
        onChangeDayNames={programs.setNewDayNames}
        saving={programs.savingProgram}
        onSave={() => void programs.handleCreateProgram()}
      />

      <AiChatSheet
        visible={coach.showCoach}
        onClose={() => coach.setShowCoach(false)}
        title={t.coach_title}
        accent={palette.accent}
        messages={coach.coachMsgs}
        loading={coach.coachLoading}
        input={coach.coachInput}
        onChangeInput={coach.setCoachInput}
        onSend={() => { void coach.sendCoach(coach.coachInput) }}
        placeholder={t.coach_placeholder}
        emptyHint={t.coach_empty_hint}
        suggestions={coach.coachSuggestions}
        onSuggestionPress={(text) => { void coach.sendCoach(text) }}
      />

      <EquipmentSheet
        visible={showEquipment}
        onClose={() => setShowEquipment(false)}
        initial={equipment}
        onSave={async (keys) => { if (userId) await saveEquipment(supabase, userId, keys) }}
      />
    </ScreenBackground>
  )
}
