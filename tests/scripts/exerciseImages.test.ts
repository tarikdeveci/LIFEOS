import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ALIASES, FRAMES, imagePathFor, matchExercises, normalizeName, publicImageUrl } from '../../scripts/import-exercise-images.mjs'

const entry = (name: string, images: string[] = [`${name.replace(/\W+/g, '_')}/0.jpg`]) => ({ name, images })
const ex = (id: string, name_en: string | null) => ({ id, name_en })

test('ad normalleştirme: büyük harf, tire, noktalama ve boşluk farkı yok sayılır', () => {
  assert.equal(normalizeName('Push-Up'), 'push up')
  assert.equal(normalizeName('  PUSH   up '), 'push up')
  assert.equal(normalizeName("Child's Pose"), 'child s pose')
  assert.equal(normalizeName('Butt Lift (Bridge)'), 'butt lift bridge')
  assert.equal(normalizeName('---'), '')
})

test('eşleşme: birebir ad ve takma ad', () => {
  const catalog = [entry('Plank'), entry('Pushups')]
  const { matched, unmatched } = matchExercises([ex('1', 'plank'), ex('2', 'Push-Up')], catalog, { 'Push-Up': 'Pushups' })
  assert.deepEqual(matched.map((m) => [m.exercise.id, m.entry.name]), [['1', 'Plank'], ['2', 'Pushups']])
  assert.equal(unmatched.length, 0)
})

test('eşleşme: takma ad birebir addan önce gelir', () => {
  const catalog = [entry('Squat'), entry('Barbell Squat')]
  const { matched } = matchExercises([ex('1', 'Squat')], catalog, { Squat: 'Barbell Squat' })
  assert.equal(matched[0]!.entry.name, 'Barbell Squat')
})

test('eşleşmeme: name_en yok, boş ya da katalogda karşılığı yok', () => {
  const { matched, unmatched } = matchExercises(
    [ex('1', null), ex('2', ''), ex('3', 'Zumba'), ex('4', '---')],
    [entry('Plank')],
    {},
  )
  assert.equal(matched.length, 0)
  assert.deepEqual(unmatched.map((e) => e.id), ['1', '2', '3', '4'])
})

test('görseli olmayan katalog kaydı eşleşmez', () => {
  const catalog = [{ name: 'Plank', images: [] }, { name: 'Crunches' }, entry('Superman')]
  const { matched, unmatched } = matchExercises([ex('1', 'Plank'), ex('2', 'Crunches'), ex('3', 'Superman')], catalog, {})
  assert.deepEqual(matched.map((m) => m.exercise.id), ['3'])
  assert.deepEqual(unmatched.map((e) => e.id), ['1', '2'])
})

test('kırık takma ad raporlanır ve birebir ada düşmez', () => {
  const catalog = [entry('Crunch')]
  const { matched, unmatched, brokenAliases } = matchExercises([ex('1', 'Crunch')], catalog, { Crunch: 'Crunches' })
  assert.deepEqual(brokenAliases, ['Crunch'])
  assert.equal(matched.length, 0)
  assert.equal(unmatched.length, 1)
})

test('aynı ada sahip iki egzersiz aynı görseli alır', () => {
  const { matched } = matchExercises([ex('1', 'Leg Curl'), ex('2', 'Leg Curl')], [entry('Lying Leg Curls')], { 'Leg Curl': 'Lying Leg Curls' })
  assert.equal(matched.length, 2)
  assert.equal(matched[0]!.entry, matched[1]!.entry)
})

test('boş girdiler', () => {
  assert.deepEqual(matchExercises([], [], {}), { matched: [], unmatched: [], brokenAliases: [] })
  const { unmatched, brokenAliases } = matchExercises([ex('1', 'Plank')], [], { Plank: 'Plank' })
  assert.equal(unmatched.length, 1)
  assert.deepEqual(brokenAliases, ['Plank'])
})

test('takma ad tablosu: anahtarlar normalleştirildikten sonra da tekil', () => {
  const keys = Object.keys(ALIASES).map(normalizeName)
  assert.equal(new Set(keys).size, keys.length)
  for (const [ours, theirs] of Object.entries(ALIASES)) assert.ok(ours.trim() && theirs.trim(), ours)
})

test('kare seçimi: varsayılan ilk kare, tablodaki kare, olmayan kare ilk kareye düşer', () => {
  const two = { name: 'Lunge', images: ['Lunge/0.jpg', 'Lunge/1.jpg'] }
  assert.equal(imagePathFor(two, {}), 'Lunge/0.jpg')
  assert.equal(imagePathFor(two, { Lunge: 1 }), 'Lunge/1.jpg')
  assert.equal(imagePathFor({ name: 'Lunge', images: ['Lunge/0.jpg'] }, { Lunge: 1 }), 'Lunge/0.jpg')
  for (const name of Object.keys(FRAMES)) assert.ok(Object.values(ALIASES).includes(name), name)
})

test('public URL: sondaki eğik çizgi tekrarlanmaz', () => {
  assert.equal(
    publicImageUrl('https://x.supabase.co/', 'Pushups/0.jpg'),
    'https://x.supabase.co/storage/v1/object/public/exercise-images/Pushups/0.jpg',
  )
  assert.equal(
    publicImageUrl('https://x.supabase.co', 'Pushups/0.jpg'),
    'https://x.supabase.co/storage/v1/object/public/exercise-images/Pushups/0.jpg',
  )
})
