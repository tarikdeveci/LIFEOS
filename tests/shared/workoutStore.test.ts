import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useWorkoutStore } from '../../packages/shared/src/stores/workoutStore.ts'
import type { Workout, WorkoutSet } from '../../packages/shared/src/types/workout.ts'

// Sorgu zinciri: her çağrı aynı nesneyi döner, await edilince yanıt gelir.
interface Result { data: unknown; error: { message: string } | null }
type Responder = (table: string, op: string) => Result
interface Call { table: string; op: string; payload?: unknown }

class Query implements PromiseLike<Result> {
  private op = 'select'
  private payload: unknown
  private table: string
  private log: Call[]
  private respond: Responder
  constructor(table: string, log: Call[], respond: Responder) {
    this.table = table
    this.log = log
    this.respond = respond
  }
  select() { return this }
  insert(payload: unknown) { this.op = 'insert'; this.payload = payload; return this }
  update(payload: unknown) { this.op = 'update'; this.payload = payload; return this }
  delete() { this.op = 'delete'; return this }
  eq() { return this }
  gte() { return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  single() { return this }
  maybeSingle() { return this }
  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    this.log.push({ table: this.table, op: this.op, payload: this.payload })
    return Promise.resolve(this.respond(this.table, this.op)).then(ok, fail)
  }
}

function fakeSupabase(respond: Responder) {
  const calls: Call[] = []
  const client = { from: (table: string) => new Query(table, calls, respond) }
  return { client: client as unknown as SupabaseClient, calls }
}

const ok = (data: unknown): Result => ({ data, error: null })
const fail = (message: string): Result => ({ data: null, error: { message } })
/** Kuyruktaki mikro görevler (void fetchAnalytics) bitsin. */
const flush = () => new Promise((r) => setTimeout(r, 0))

function makeSet(id: string, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id, workout_id: 'w1', exercise_id: 'bench', set_number: 1, reps: 8, weight_kg: null,
    duration_seconds: null, distance_m: null, rest_seconds: 90, notes: null, completed: false,
    created_at: '2026-10-01T18:00:00Z', ...extra,
  }
}

function makeWorkout(sets: WorkoutSet[]): Workout {
  return {
    id: 'w1', user_id: 'u1', date: '2026-10-01', name: 'Bro Split · Göğüs', notes: null, status: 'in_progress',
    duration_minutes: null, total_calories_burned: null, ai_plan: [], created_at: '', updated_at: '', workout_sets: sets,
  }
}

const analyticsReads = (calls: Call[]) => calls.filter((c) => c.table === 'workouts' && c.op === 'select').length

beforeEach(() => {
  useWorkoutStore.setState({
    todayWorkout: makeWorkout([makeSet('s1'), makeSet('s2', { set_number: 2 })]),
    workoutHistory: [],
    analyticsSets: [], analyticsLoaded: true, analyticsError: null,
  })
})

// updateSet

test('updateSet: seti yerinde değiştirir ve işaretlemede analitiği tazeler', async () => {
  const saved = makeSet('s1', { completed: true, weight_kg: 60 })
  const { client, calls } = fakeSupabase((table) => (table === 'workout_sets' ? ok(saved) : ok([])))
  await useWorkoutStore.getState().updateSet(client, 's1', { completed: true, weight_kg: 60 })
  await flush()
  const sets = useWorkoutStore.getState().todayWorkout!.workout_sets!
  assert.deepEqual(sets.map((s) => [s.id, s.completed, s.weight_kg]), [['s1', true, 60], ['s2', false, null]])
  assert.deepEqual(calls[0], { table: 'workout_sets', op: 'update', payload: { completed: true, weight_kg: 60 } })
  assert.equal(analyticsReads(calls), 1)
})

test('updateSet: işareti kaldırmak da haritayı tazeler', async () => {
  const { client, calls } = fakeSupabase((table) => (table === 'workout_sets' ? ok(makeSet('s1')) : ok([])))
  await useWorkoutStore.getState().updateSet(client, 's1', { completed: false })
  await flush()
  assert.equal(analyticsReads(calls), 1)
})

test('updateSet: yalnızca ağırlık değişince analitik okunmaz', async () => {
  const { client, calls } = fakeSupabase(() => ok(makeSet('s1', { weight_kg: 50 })))
  await useWorkoutStore.getState().updateSet(client, 's1', { weight_kg: 50 })
  await flush()
  assert.equal(analyticsReads(calls), 0)
})

test('updateSet hata: fırlatır, state değişmez, analitik okunmaz', async () => {
  const before = useWorkoutStore.getState().todayWorkout
  const { client, calls } = fakeSupabase(() => fail('network'))
  await assert.rejects(useWorkoutStore.getState().updateSet(client, 's1', { completed: true }), { message: 'network' })
  await flush()
  assert.equal(useWorkoutStore.getState().todayWorkout, before)
  assert.equal(analyticsReads(calls), 0)
})

test('updateSet: açık antrenman yoksa çökmez, analitik okunmaz', async () => {
  useWorkoutStore.setState({ todayWorkout: null })
  const { client, calls } = fakeSupabase(() => ok(makeSet('s1', { completed: true })))
  await useWorkoutStore.getState().updateSet(client, 's1', { completed: true })
  await flush()
  assert.equal(useWorkoutStore.getState().todayWorkout, null)
  assert.equal(analyticsReads(calls), 0)
})

test('updateSet: analitik okuması düşerse hata state\'e yazılır, set yine güncel', async () => {
  const { client } = fakeSupabase((table) => (table === 'workout_sets' ? ok(makeSet('s1', { completed: true })) : fail('timeout')))
  await useWorkoutStore.getState().updateSet(client, 's1', { completed: true })
  await flush()
  const state = useWorkoutStore.getState()
  assert.ok(state.analyticsError)
  assert.equal(state.analyticsLoaded, true)
  assert.equal(state.todayWorkout!.workout_sets![0]!.completed, true)
})

// removeSet

test('removeSet: seti listeden çıkarır', async () => {
  const { client } = fakeSupabase(() => ok(null))
  await useWorkoutStore.getState().removeSet(client, 's1')
  assert.deepEqual(useWorkoutStore.getState().todayWorkout!.workout_sets!.map((s) => s.id), ['s2'])
})

test('removeSet hata: fırlatır, set listede kalır', async () => {
  const { client } = fakeSupabase(() => fail('rls'))
  await assert.rejects(useWorkoutStore.getState().removeSet(client, 's1'))
  assert.equal(useWorkoutStore.getState().todayWorkout!.workout_sets!.length, 2)
})

// removeWorkout

test('removeWorkout: antrenmanı kaldırır ve haritayı tazeler', async () => {
  const { client, calls } = fakeSupabase(() => ok([]))
  await useWorkoutStore.getState().removeWorkout(client, 'w1')
  await flush()
  assert.equal(useWorkoutStore.getState().todayWorkout, null)
  assert.equal(analyticsReads(calls), 1)
})

test('removeWorkout hata: antrenman kalır, harita okunmaz', async () => {
  const { client, calls } = fakeSupabase(() => fail('rls'))
  await assert.rejects(useWorkoutStore.getState().removeWorkout(client, 'w1'))
  await flush()
  assert.equal(useWorkoutStore.getState().todayWorkout?.id, 'w1')
  assert.equal(analyticsReads(calls), 0)
})

// finishWorkout / skipWorkout

const doneRow = { ...makeWorkout([]), status: 'completed', duration_minutes: 45 }
delete (doneRow as Partial<Workout>).workout_sets

test('finishWorkout: setler korunur ve tamamlanmış görünür, harita tazelenir', async () => {
  const { client, calls } = fakeSupabase((table, op) =>
    table === 'workouts' && op === 'update' ? ok(doneRow) : ok([]))
  await useWorkoutStore.getState().finishWorkout(client, 'w1', 45)
  await flush()
  const w = useWorkoutStore.getState().todayWorkout!
  assert.equal(w.status, 'completed')
  assert.deepEqual(w.workout_sets!.map((s) => [s.id, s.completed]), [['s1', true], ['s2', true]])
  assert.deepEqual(calls.slice(0, 2).map((c) => `${c.table}.${c.op}`), ['workout_sets.update', 'workouts.update'])
  assert.equal(analyticsReads(calls), 1)
})

test('finishWorkout: setler yazılamazsa antrenman bitmiş sayılmaz', async () => {
  const before = useWorkoutStore.getState().todayWorkout
  const { client, calls } = fakeSupabase((table) => (table === 'workout_sets' ? fail('network') : ok(doneRow)))
  await assert.rejects(useWorkoutStore.getState().finishWorkout(client, 'w1', 45))
  await flush()
  assert.equal(useWorkoutStore.getState().todayWorkout, before)
  assert.equal(calls.some((c) => c.table === 'workouts' && c.op === 'update'), false)
  assert.equal(analyticsReads(calls), 0)
})

test('finishWorkout: antrenman satırı yazılamazsa state değişmez', async () => {
  const before = useWorkoutStore.getState().todayWorkout
  const { client } = fakeSupabase((table) => (table === 'workouts' ? fail('rls') : ok([])))
  await assert.rejects(useWorkoutStore.getState().finishWorkout(client, 'w1', 45))
  assert.equal(useWorkoutStore.getState().todayWorkout, before)
})

test('skipWorkout: setler korunur, işaretleri değişmez', async () => {
  const { client } = fakeSupabase(() => ok({ ...doneRow, status: 'skipped' }))
  await useWorkoutStore.getState().skipWorkout(client, 'w1')
  const w = useWorkoutStore.getState().todayWorkout!
  assert.equal(w.status, 'skipped')
  assert.deepEqual(w.workout_sets!.map((s) => s.completed), [false, false])
})
