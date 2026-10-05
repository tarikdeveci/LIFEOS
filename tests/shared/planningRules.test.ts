import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getPlanningRules, updatePlanningRules } from '../../packages/shared/src/supabase/profile.ts'
import { resolvePlanningRules } from '../../packages/shared/src/utils/planningRules.ts'
import { DEFAULT_PLANNING_RULES, PLANNING_ABOUT_MAX } from '../../packages/shared/src/types/user.ts'
import type { PlanningRules } from '../../packages/shared/src/types/user.ts'

// Bilerek geçersiz değerler veren çağrılar için: tip sistemi zaten reddederdi.
const loose = (value: unknown): Partial<PlanningRules> => value as Partial<PlanningRules>

test('boş girdi varsayılanları verir ve her seferinde yeni nesne döner', () => {
  for (const empty of [null, undefined, {}]) {
    assert.deepEqual(resolvePlanningRules(empty), DEFAULT_PLANNING_RULES)
  }
  const first = resolvePlanningRules(null)
  first.max_deep_tasks = 5
  assert.equal(DEFAULT_PLANNING_RULES.max_deep_tasks, 3, 'varsayılan nesne değişmemeli')
  assert.equal(resolvePlanningRules(null).max_deep_tasks, 3)
})

test('geçerli değerler olduğu gibi kalır, eksik alan varsayılanla dolar', () => {
  assert.deepEqual(
    resolvePlanningRules({ max_deep_tasks: 2, rollover: 'backlog', buffer_minutes: 30, about: 'Sabah yoga' }),
    { max_deep_tasks: 2, rollover: 'backlog', buffer_minutes: 30, about: 'Sabah yoga' },
  )
  assert.deepEqual(resolvePlanningRules({ rollover: 'backlog' }), { ...DEFAULT_PLANNING_RULES, rollover: 'backlog' })
})

test('max_deep_tasks 1..5 tam sayıya sıkışır', () => {
  const deep = (value: unknown): number => resolvePlanningRules(loose({ max_deep_tasks: value })).max_deep_tasks
  assert.equal(deep(1), 1)
  assert.equal(deep(5), 5)
  assert.equal(deep(0), 1)
  assert.equal(deep(-3), 1)
  assert.equal(deep(6), 5)
  assert.equal(deep(99), 5)
  assert.equal(deep(2.4), 2)
  assert.equal(deep(2.5), 3)
})

test('sayı olmayan ya da sonlu olmayan değer varsayılana düşer', () => {
  for (const bad of ['2', null, NaN, Infinity, -Infinity, {}, [], true]) {
    const rules = resolvePlanningRules(loose({ max_deep_tasks: bad, buffer_minutes: bad }))
    assert.equal(rules.max_deep_tasks, DEFAULT_PLANNING_RULES.max_deep_tasks, String(bad))
    assert.equal(rules.buffer_minutes, DEFAULT_PLANNING_RULES.buffer_minutes, String(bad))
  }
})

test('buffer_minutes 0..60; 0 geçerli bir değerdir, varsayılanla ezilmez', () => {
  const buffer = (value: unknown): number => resolvePlanningRules(loose({ buffer_minutes: value })).buffer_minutes
  assert.equal(buffer(0), 0)
  assert.equal(buffer(60), 60)
  assert.equal(buffer(-1), 0)
  assert.equal(buffer(61), 60)
  assert.equal(buffer(1000), 60)
  assert.equal(buffer(15.4), 15)
})

test('rollover yalnızca carry ve backlog', () => {
  const rollover = (value: unknown): string => resolvePlanningRules(loose({ rollover: value })).rollover
  assert.equal(rollover('carry'), 'carry')
  assert.equal(rollover('backlog'), 'backlog')
  for (const bad of ['weekly', 'BACKLOG', '', null, 1, undefined]) {
    assert.equal(rollover(bad), 'carry', String(bad))
  }
})

test('about kırpılır ve karakter sayısıyla kesilir', () => {
  assert.equal(resolvePlanningRules({ about: '  merhaba \n ' }).about, 'merhaba')
  assert.equal(resolvePlanningRules({ about: '   ' }).about, '')
  assert.equal(resolvePlanningRules(loose({ about: 42 })).about, '')

  const long = resolvePlanningRules({ about: 'a'.repeat(PLANNING_ABOUT_MAX + 500) }).about
  assert.equal(long.length, PLANNING_ABOUT_MAX)

  // Emoji iki UTF-16 birimidir; ortadan kesilirse JSONB'ye yarım vekil yazılır.
  const emoji = resolvePlanningRules({ about: '😀'.repeat(PLANNING_ABOUT_MAX + 10) }).about
  assert.equal(Array.from(emoji).length, PLANNING_ABOUT_MAX)
  assert.equal(emoji.length, PLANNING_ABOUT_MAX * 2)
})

test('girdiyi değiştirmez', () => {
  const input: Partial<PlanningRules> = { max_deep_tasks: 99, about: '  x  ' }
  resolvePlanningRules(input)
  assert.deepEqual(input, { max_deep_tasks: 99, about: '  x  ' })
})

// Profil sorgusu: preferences satırını tutan ve yazmaları kaydeden sahte istemci.
interface ProfileFake {
  client: SupabaseClient
  updates: Array<{ preferences: Record<string, unknown> }>
}

function profileClient(preferences: unknown, options: { row?: boolean; updateError?: boolean } = {}): ProfileFake {
  const updates: ProfileFake['updates'] = []
  const hasRow = options.row ?? true
  const client = {
    from: (table: string) => {
      assert.equal(table, 'user_profiles')
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: hasRow ? { preferences } : null, error: null }),
          }),
        }),
        update: (patch: { preferences: Record<string, unknown> }) => ({
          eq: async () => {
            updates.push(patch)
            return { error: options.updateError ? { message: 'yazilamadi' } : null }
          },
        }),
      }
    },
  }
  return { client: client as unknown as SupabaseClient, updates }
}

test('getPlanningRules: kayıt, anahtar ya da bozuk değer varsa varsayılanlarla tamamlar', async () => {
  assert.deepEqual(await getPlanningRules(profileClient({ theme: 'dark' }).client, 'u'), DEFAULT_PLANNING_RULES)
  assert.deepEqual(await getPlanningRules(profileClient(null).client, 'u'), DEFAULT_PLANNING_RULES)
  assert.deepEqual(await getPlanningRules(profileClient({}, { row: false }).client, 'u'), DEFAULT_PLANNING_RULES)
  assert.deepEqual(await getPlanningRules(profileClient({ planning: 'bozuk' }).client, 'u'), DEFAULT_PLANNING_RULES)
  assert.deepEqual(await getPlanningRules(profileClient({ planning: [1] }).client, 'u'), DEFAULT_PLANNING_RULES)
  assert.deepEqual(
    await getPlanningRules(profileClient({ planning: { rollover: 'backlog', max_deep_tasks: 99 } }).client, 'u'),
    { ...DEFAULT_PLANNING_RULES, rollover: 'backlog', max_deep_tasks: 5 },
  )
})

test('updatePlanningRules: diğer tercih anahtarlarını ezmez, yalnızca patch alanlarını değiştirir', async () => {
  const prefs = { theme: 'dark', email_morning_enabled: true, planning: { rollover: 'backlog', about: 'eski' } }
  const { client, updates } = profileClient(prefs)

  const result = await updatePlanningRules(client, 'u', { max_deep_tasks: 2 })

  assert.deepEqual(result, { max_deep_tasks: 2, rollover: 'backlog', buffer_minutes: 15, about: 'eski' })
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0]!.preferences, { theme: 'dark', email_morning_enabled: true, planning: result })
})

test('updatePlanningRules: patch sınırlanır, undefined alan mevcut değeri silmez', async () => {
  const { client, updates } = profileClient({ planning: { buffer_minutes: 30, about: 'not' } })

  const result = await updatePlanningRules(client, 'u', { max_deep_tasks: 9, buffer_minutes: undefined, about: undefined })

  assert.equal(result.max_deep_tasks, 5)
  assert.equal(result.buffer_minutes, 30)
  assert.equal(result.about, 'not')
  assert.deepEqual(updates[0]!.preferences['planning'], result)
})

test('updatePlanningRules: planning anahtarı yoksa tam nesneyi yazar', async () => {
  const { client, updates } = profileClient({ theme: 'light' })
  await updatePlanningRules(client, 'u', { rollover: 'backlog' })
  assert.deepEqual(updates[0]!.preferences, { theme: 'light', planning: { ...DEFAULT_PLANNING_RULES, rollover: 'backlog' } })
})

test('updatePlanningRules: profil satırı yoksa yazmadan hata verir', async () => {
  const { client, updates } = profileClient(null, { row: false })
  await assert.rejects(updatePlanningRules(client, 'u', { max_deep_tasks: 2 }), /profile_not_found/)
  assert.equal(updates.length, 0)
})

test('updatePlanningRules: yazma hatası yukarı fırlar', async () => {
  const { client } = profileClient({}, { updateError: true })
  await assert.rejects(updatePlanningRules(client, 'u', { max_deep_tasks: 2 }))
})
