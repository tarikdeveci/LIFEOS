import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ALIASES, SKIP, bucketPath, imagePathFor, matchExercises, normalizeName, publicImageUrl, startPathFor } from '../../scripts/import-exercise-images.mjs'

const slug = (name: string) => name.toLowerCase().replace(/\W+/g, '-')
const entry = (name_en: string) => ({
  name_en,
  images: { flat: { start: `images/flat/${slug(name_en)}-start.webp`, peak: `images/flat/${slug(name_en)}-peak.webp` } },
})
const ex = (id: string, name_en: string | null) => ({ id, name_en })

test('ad normalleştirme: büyük harf, tire, noktalama ve boşluk farkı yok sayılır', () => {
  assert.equal(normalizeName('Push-Up'), 'push up')
  assert.equal(normalizeName('  PUSH   up '), 'push up')
  assert.equal(normalizeName("Child's Pose"), 'child s pose')
  assert.equal(normalizeName('Squat Hold (Wall Sit)'), 'squat hold wall sit')
  assert.equal(normalizeName('---'), '')
})

test('eşleşme: birebir ad ve takma ad', () => {
  const catalog = [entry('Plank'), entry('Chin-Ups')]
  const { matched, unmatched } = matchExercises([ex('1', 'plank'), ex('2', 'Chin-Up')], catalog, { 'Chin-Up': 'Chin-Ups' }, [])
  assert.deepEqual(matched.map((m) => [m.exercise.id, m.entry.name_en]), [['1', 'Plank'], ['2', 'Chin-Ups']])
  assert.equal(unmatched.length, 0)
})

test('eşleşme: takma ad birebir addan önce gelir', () => {
  const catalog = [entry('Reverse Lunge'), entry('Bodyweight Reverse Lunge')]
  const { matched } = matchExercises([ex('1', 'Reverse Lunge')], catalog, { 'Reverse Lunge': 'Bodyweight Reverse Lunge' }, [])
  assert.equal(matched[0]!.entry.name_en, 'Bodyweight Reverse Lunge')
})

test('SKIP: adı aynı olsa da aleti farklı hareket eşleşmez', () => {
  const { matched, unmatched } = matchExercises([ex('1', 'Goblet Squat'), ex('2', 'Plank')], [entry('Goblet Squat'), entry('Plank')], {}, ['Goblet Squat'])
  assert.deepEqual(matched.map((m) => m.exercise.id), ['2'])
  assert.deepEqual(unmatched.map((e) => e.id), ['1'])
})

test('eşleşmeme: name_en yok, boş ya da katalogda karşılığı yok', () => {
  const { matched, unmatched } = matchExercises(
    [ex('1', null), ex('2', ''), ex('3', 'Zumba'), ex('4', '---')],
    [entry('Plank')],
    {},
    [],
  )
  assert.equal(matched.length, 0)
  assert.deepEqual(unmatched.map((e) => e.id), ['1', '2', '3', '4'])
})

test('görseli olmayan katalog kaydı eşleşmez', () => {
  const catalog = [{ name_en: 'Plank', images: { flat: {} } }, { name_en: 'Crunches' }, entry('Superman')]
  const { matched, unmatched } = matchExercises([ex('1', 'Plank'), ex('2', 'Crunches'), ex('3', 'Superman')], catalog, {}, [])
  assert.deepEqual(matched.map((m) => m.exercise.id), ['3'])
  assert.deepEqual(unmatched.map((e) => e.id), ['1', '2'])
})

test('kırık takma ad raporlanır ve birebir ada düşmez', () => {
  const catalog = [entry('Crunch')]
  const { matched, unmatched, brokenAliases } = matchExercises([ex('1', 'Crunch')], catalog, { Crunch: 'Crunches' }, [])
  assert.deepEqual(brokenAliases, ['Crunch'])
  assert.equal(matched.length, 0)
  assert.equal(unmatched.length, 1)
})

test('aynı ada sahip iki egzersiz aynı görseli alır', () => {
  const { matched } = matchExercises([ex('1', 'Leg Curl'), ex('2', 'Leg Curl')], [entry('Lying Leg Curl')], { 'Leg Curl': 'Lying Leg Curl' }, [])
  assert.equal(matched.length, 2)
  assert.equal(matched[0]!.entry, matched[1]!.entry)
})

test('boş girdiler', () => {
  assert.deepEqual(matchExercises([], [], {}, []), { matched: [], unmatched: [], brokenAliases: [] })
  const { unmatched, brokenAliases } = matchExercises([ex('1', 'Plank')], [], { Plank: 'Plank' }, [])
  assert.equal(unmatched.length, 1)
  assert.deepEqual(brokenAliases, ['Plank'])
})

test('tablolar: anahtarlar normalleştirildikten sonra tekil, SKIP ile takma ad çakışmaz', () => {
  const keys = Object.keys(ALIASES).map(normalizeName)
  assert.equal(new Set(keys).size, keys.length)
  for (const [ours, theirs] of Object.entries(ALIASES)) assert.ok(ours.trim() && theirs.trim(), ours)
  for (const name of SKIP) assert.ok(!keys.includes(normalizeName(name)), name)
})

test('poz seçimi: image_url tepe, tek pozluda main, yalnız start varsa start', () => {
  assert.equal(imagePathFor(entry('Lunge')), 'images/flat/lunge-peak.webp')
  assert.equal(imagePathFor({ name_en: 'Walking', images: { flat: { main: 'images/flat/walking-main.webp' } } }), 'images/flat/walking-main.webp')
  assert.equal(imagePathFor({ name_en: 'X', images: { flat: { start: 'images/flat/x-start.webp' } } }), 'images/flat/x-start.webp')
  assert.equal(imagePathFor({ name_en: 'X' }), undefined)
})

test('başlangıç pozu: yalnızca iki pozlu harekette, tek görsel ikinci kez kullanılmaz', () => {
  assert.equal(startPathFor(entry('Lunge')), 'images/flat/lunge-start.webp')
  assert.equal(startPathFor({ name_en: 'Walking', images: { flat: { main: 'images/flat/walking-main.webp' } } }), null)
  assert.equal(startPathFor({ name_en: 'X', images: { flat: { start: 'images/flat/x-start.webp' } } }), null)
  assert.equal(startPathFor({ name_en: 'X' }), null)
})

test('kova yolu ve public URL: klasör atılır, sondaki eğik çizgi tekrarlanmaz', () => {
  assert.equal(bucketPath('images/flat/push-up-peak.webp'), 'push-up-peak.webp')
  const expected = 'https://x.supabase.co/storage/v1/object/public/exercise-images/push-up-peak.webp'
  assert.equal(publicImageUrl('https://x.supabase.co/', 'images/flat/push-up-peak.webp'), expected)
  assert.equal(publicImageUrl('https://x.supabase.co', 'images/flat/push-up-peak.webp'), expected)
})
