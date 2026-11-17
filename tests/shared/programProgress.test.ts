import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findProgramProgress, pickTodayProgramDay, planProgramDayStart, reorderProgramExercises, settleAll } from '../../packages/shared/src/utils/programProgress.ts'
import type { ProgramDay, ProgramExercise, Workout, WorkoutProgram } from '../../packages/shared/src/types/workout.ts'

const day = (id: string, n: number, name: string, is_rest = false): ProgramDay =>
  ({ id, program_id: 'p', day_number: n, day_name: name, is_rest })

const program = (id: string, name: string, user_id: string | null, days: ProgramDay[]): WorkoutProgram =>
  ({ id, user_id, name, description: null, split_type: 'custom', frequency_per_week: days.length, created_at: '', days })

const workout = (date: string, name: string | null, created_at = `${date}T10:00:00Z`): Workout =>
  ({ id: date + name, user_id: 'u', date, name, notes: null, status: 'completed', duration_minutes: null, total_calories_burned: null, ai_plan: [], created_at, updated_at: created_at })

const label = (d: ProgramDay) => d.day_name || `Gün ${d.day_number}`
const ppl = program('ppl', 'PPL', 'u', [day('a', 1, 'Push'), day('b', 2, 'Pull'), day('r', 3, 'Dinlenme', true), day('c', 4, 'Legs')])

test('programProgress: son program antrenmanından sonraki gün sıradadır', () => {
  const res = findProgramProgress([ppl], [workout('2026-11-14', 'PPL · Pull')], '2026-11-15', label)
  assert.equal(res?.program.id, 'ppl')
  assert.equal(res?.nextDay.id, 'c')
  assert.equal(res?.lastDate, '2026-11-14')
})

test('programProgress: son günden sonra başa döner, dinlenme günü atlanır', () => {
  const res = findProgramProgress([ppl], [workout('2026-11-14', 'PPL · Legs')], '2026-11-15', label)
  assert.equal(res?.nextDay.id, 'a')
})

test('programProgress: programsız antrenmanlar atlanır, eski program antrenmanı bulunur', () => {
  const history = [workout('2026-11-14', 'Koşu'), workout('2026-11-12', null), workout('2026-11-10', 'PPL · Push')]
  assert.equal(findProgramProgress([ppl], history, '2026-11-15', label)?.nextDay.id, 'b')
})

test('programProgress: süre aşılınca ya da eşleşme yoksa aktif program yok', () => {
  assert.equal(findProgramProgress([ppl], [workout('2026-10-01', 'PPL · Push')], '2026-11-15', label), null)
  assert.equal(findProgramProgress([ppl], [workout('2026-11-14', 'Bacak günü')], '2026-11-15', label), null)
  assert.equal(findProgramProgress([], [], '2026-11-15', label), null)
})

test('programProgress: aynı adlı şablon yerine kullanıcının kopyası seçilir', () => {
  const template = program('tpl', 'PPL', null, [day('x', 1, 'Push'), day('y', 2, 'Pull')])
  const res = findProgramProgress([template, ppl], [workout('2026-11-14', 'PPL · Push')], '2026-11-15', label)
  assert.equal(res?.program.id, 'ppl')
})

test('programProgress: gün adı eşleşmezse programın ilk günü', () => {
  const res = findProgramProgress([ppl], [workout('2026-11-14', 'PPL · Eski ad')], '2026-11-15', label)
  assert.equal(res?.nextDay.id, 'a')
})

test('reorderProgramExercises: hareket taşınır, yalnız değişen satırlar döner', () => {
  const rows = [{ id: 'a', order_index: 1 }, { id: 'b', order_index: 2 }, { id: 'c', order_index: 3 }]
  assert.deepEqual(reorderProgramExercises(rows, 'c', 1), [{ id: 'c', order_index: 1 }, { id: 'a', order_index: 2 }, { id: 'b', order_index: 3 }])
  assert.deepEqual(reorderProgramExercises(rows, 'a', 2), [{ id: 'b', order_index: 1 }, { id: 'a', order_index: 2 }])
  assert.deepEqual(reorderProgramExercises(rows, 'b', 2), [])
  assert.deepEqual(reorderProgramExercises(rows, 'z', 1), [])
})

test('reorderProgramExercises: boşluklu ve tekrarlı sıra düzelir', () => {
  const rows = [{ id: 'a', order_index: 1 }, { id: 'b', order_index: 1 }, { id: 'c', order_index: 5 }]
  assert.deepEqual(reorderProgramExercises(rows, 'a', 1), [{ id: 'b', order_index: 2 }, { id: 'c', order_index: 3 }])
})

test('programProgress: atlanan ve ileri tarihli antrenman sırayı ilerletmez', () => {
  const skipped = { ...workout('2026-11-14', 'PPL · Pull'), status: 'skipped' as const }
  const history = [workout('2026-11-20', 'PPL · Legs'), skipped, workout('2026-11-13', 'PPL · Push')]
  assert.equal(findProgramProgress([ppl], history, '2026-11-15', label)?.nextDay.id, 'b')
})

test('settleAll: bütün yazmalar bitmeden hata fırlatmaz', async () => {
  let lateDone = false
  const late = new Promise<void>((resolve) => setTimeout(() => { lateDone = true; resolve() }, 20))
  await assert.rejects(settleAll([Promise.reject(new Error('x')), late]), /x/)
  assert.equal(lateDone, true)
  await settleAll([Promise.resolve(1)])
})

test('pickTodayProgramDay: rutin bağı önceliklidir, blok adı sonra, yoksa null', () => {
  const other = program('x', 'Alt', 'u', [day('x1', 1, 'A')])
  const pull = ppl.days![1]!
  const fromRoutine = pickTodayProgramDay([ppl, other], [{ program: ppl, day: pull }], ['Alt · A'], label)
  assert.equal(fromRoutine?.source, 'routine')
  assert.equal(fromRoutine?.day.id, 'b')
  const fromBlock = pickTodayProgramDay([ppl, other], [], ['Spor', 'Alt · A'], label)
  assert.equal(fromBlock?.source, 'block')
  assert.equal(fromBlock?.program.id, 'x')
  assert.equal(fromBlock?.day.id, 'x1')
  assert.equal(pickTodayProgramDay([ppl], [], ['Spor', 'PPL · Yok', 'PPL · Dinlenme'], label), null)
  assert.equal(pickTodayProgramDay([ppl], [], [], label), null)
})

const ex = (exercise_id: string): ProgramExercise =>
  ({ id: 'pe' + exercise_id, program_day_id: 'a', exercise_id, order_index: 1, sets: 3, reps: 10, rest_seconds: 60 }) as ProgramExercise

test('planProgramDayStart: antrenman yoksa açılır ve hepsi yazılır', () => {
  const plan = planProgramDayStart(null, 'PPL · Push', [ex('e1'), ex('e2')])
  assert.deepEqual([plan.create, plan.rename, plan.exercises.length], [true, null, 2])
})

test('planProgramDayStart: aynı gün ikinci kez başlatılınca set eklenmez', () => {
  const plan = planProgramDayStart({ name: 'PPL · Push', workout_sets: [{ exercise_id: 'e1' }] }, 'PPL · Push', [ex('e1'), ex('e2')])
  assert.deepEqual([plan.create, plan.rename, plan.exercises.length], [false, null, 0])
})

test('planProgramDayStart: farklı adlı setli antrenmanda ad korunur, yalnız eksik hareketler eklenir', () => {
  const plan = planProgramDayStart({ name: 'Sabah', workout_sets: [{ exercise_id: 'e1' }] }, 'PPL · Push', [ex('e1'), ex('e2')])
  assert.equal(plan.rename, null)
  assert.deepEqual(plan.exercises.map((e) => e.exercise_id), ['e2'])
})

test('planProgramDayStart: setsiz boş antrenman program gününün adını alır', () => {
  const plan = planProgramDayStart({ name: 'Antrenman', workout_sets: [] }, 'PPL · Push', [ex('e1')])
  assert.deepEqual([plan.create, plan.rename, plan.exercises.length], [false, 'PPL · Push', 1])
})
