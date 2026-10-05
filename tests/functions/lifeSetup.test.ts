import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  LIFE_SETUP_TEXT_MAX,
  MAX_GOALS,
  MAX_ROUTINES,
  MAX_STEPS,
  MAX_TASKS,
  MAX_UNSUPPORTED,
  buildLifeSetupPrompt,
  parseLifeSetup,
} from '../../supabase/functions/_shared/ai/lifeSetup.ts'

const json = (value: unknown): string => JSON.stringify(value)

// ---------- buildLifeSetupPrompt ----------

test('prompt: uygulamanın sözlüğünü öğretir', () => {
  const { system } = buildLifeSetupPrompt({ lang: 'tr', text: 'plan' })
  const stable = system[0]?.text ?? ''
  for (const term of [
    '"block"', '"task"', '"habit"',
    'career', 'health', 'personal', 'spiritual', 'social',
    'target_count', 'start_count', 'min_minutes', 'is_protected', 'is_untracked',
    'daily_cap', 'steps', 'count_mode',
    'max_deep_tasks', 'rollover', '"backlog"', 'buffer_minutes', 'about',
    'unsupported', 'times_per_week', 'times_per_day', 'days_of_week',
  ]) {
    assert.ok(stable.includes(term), `sabit prompt ${term} içermeli`)
  }
  assert.match(stable, /1\/42 için 1/)
  assert.match(stable, /günde en çok 1 Claude görevi/)
  // Kullanıcı metni veri olarak etiketlenir.
  assert.match(stable, /<plan> etiketleri arasında/)
})

test('prompt: sabit kısım dilden bağımsız, dil yalnızca değişken kısımda', () => {
  const tr = buildLifeSetupPrompt({ lang: 'tr', text: 'a' })
  const en = buildLifeSetupPrompt({ lang: 'en', text: 'b' })
  assert.equal(tr.system[0]?.text, en.system[0]?.text)
  assert.notEqual(tr.system[1]?.text, en.system[1]?.text)
  assert.match(en.system[1]?.text ?? '', /İngilizce/)
})

test('prompt: kullanıcı metni plan etiketine sarılır, tavanlar ve tire kuralı', () => {
  const { system, messages } = buildLifeSetupPrompt({ lang: 'tr', text: 'Her gün 60 dk audit' })
  assert.deepEqual(messages, [{ role: 'user', content: '<plan>\nHer gün 60 dk audit\n</plan>' }])
  assert.match(system[0]?.text ?? '', new RegExp(`En çok ${MAX_ROUTINES} rutin, ${MAX_GOALS} hedef, ${MAX_TASKS} görev`))
  assert.doesNotMatch(JSON.stringify(system), /[\u2013\u2014]/)
})

test('metin sınırı 8000 karakter', () => {
  assert.equal(LIFE_SETUP_TEXT_MAX, 8000)
})

// ---------- parseLifeSetup: kullanıcının hayat planı ----------

// Modelin yapıştırılan hayat planı için üretmesi beklenen çıktı (kod bloğuna sarılı).
const LIFE_PLAN_REPLY = '```json\n' + json({
  summary: '6 rutin, 2 hedef ve 1 görev kuruyorum.',
  routines: [
    { title: 'Audit eğitimi', kind: 'task', area: 'career', days_of_week: [1, 2, 3, 4, 5, 6, 0], estimated_minutes: 60, min_minutes: 20, target_count: 42, start_count: 1 },
    { title: 'İş başvurusu', kind: 'task', area: 'career', days_of_week: [1, 2, 3, 4, 5], estimated_minutes: 90 },
    { title: 'Spor', kind: 'habit', area: 'health', times_per_week: 3, estimated_minutes: 45, is_protected: true },
    { title: 'Kendimle zaman', kind: 'habit', area: 'personal', times_per_week: 7, estimated_minutes: 45, is_untracked: true },
    { title: 'Cuma namazı', kind: 'block', area: 'spiritual', days_of_week: [5], start_time: '12:30', end_time: '13:30', is_untracked: true },
    { title: 'Dua', kind: 'habit', area: 'spiritual', times_per_week: 4, estimated_minutes: 10, is_untracked: true },
  ],
  goals: [
    { title: 'Haftalık başvuru', horizon: 'week', target: 10, unit: 'başvuru', count_mode: 'tasks' },
    { title: 'Claude stabilizasyonu', horizon: 'month', daily_cap: 1, steps: ['Adım 1', 'Adım 2', 'Stabilization complete'] },
  ],
  tasks: [{ title: 'Job application automation audit & improvement', area: 'career' }],
  rules: { max_deep_tasks: 3, rollover: 'backlog', buffer_minutes: 15, about: 'Kaçan iş başarısızlık değil.' },
  unsupported: ['Telefonsuz zamanı denetleyemem'],
}) + '\n```'

test('hayat planı: rutin, hedef, görev ve kurallar yapısal olarak geçer', () => {
  const proposal = parseLifeSetup(LIFE_PLAN_REPLY)
  assert.ok(proposal)

  assert.equal(proposal.summary, '6 rutin, 2 hedef ve 1 görev kuruyorum.')
  assert.equal(proposal.routines.length, 6)

  const audit = proposal.routines[0]
  assert.deepEqual(audit, {
    title: 'Audit eğitimi', kind: 'task', area: 'career',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    estimated_minutes: 60, min_minutes: 20, target_count: 42, start_count: 1,
  })
  assert.equal(proposal.routines[2]?.is_protected, true)
  assert.equal(proposal.routines[3]?.is_untracked, true)
  assert.deepEqual(proposal.routines[4], {
    title: 'Cuma namazı', kind: 'block', area: 'spiritual',
    days_of_week: [5], start_time: '12:30', end_time: '13:30', is_untracked: true,
  })

  assert.deepEqual(proposal.goals[0], { title: 'Haftalık başvuru', horizon: 'week', target: 10, count_mode: 'tasks', unit: 'başvuru' })
  assert.deepEqual(proposal.goals[1], { title: 'Claude stabilizasyonu', horizon: 'month', daily_cap: 1, steps: ['Adım 1', 'Adım 2', 'Stabilization complete'] })
  assert.deepEqual(proposal.tasks, [{ title: 'Job application automation audit & improvement', area: 'career' }])
  assert.deepEqual(proposal.rules, { max_deep_tasks: 3, rollover: 'backlog', buffer_minutes: 15, about: 'Kaçan iş başarısızlık değil.' })
  assert.deepEqual(proposal.unsupported, ['Telefonsuz zamanı denetleyemem'])
})

// ---------- parseLifeSetup: yapısal doğrulama ----------

test('doğrulama: JSON olmayan ya da tamamen boş çıktı null', () => {
  assert.equal(parseLifeSetup('Üzgünüm, yardımcı olamam.'), null)
  assert.equal(parseLifeSetup(''), null)
  assert.equal(parseLifeSetup('{"routines": [], "goals": [], "tasks": [], "rules": {}, "unsupported": []}'), null)
  assert.equal(parseLifeSetup('{"routines": "değil", "yabancı": 1}'), null)
})

test('doğrulama: yalnızca özet ya da yalnızca unsupported yeterli içeriktir', () => {
  assert.equal(parseLifeSetup(json({ summary: 'Kurulacak bir şey bulamadım.' }))?.summary, 'Kurulacak bir şey bulamadım.')
  assert.deepEqual(parseLifeSetup(json({ unsupported: ['x'] }))?.unsupported, ['x'])
})

test('doğrulama: bilinmeyen alan atılır, geçersiz enum ve aralık düşer', () => {
  const proposal = parseLifeSetup(json({
    routines: [{
      title: '  Okuma  ', kind: 'block', area: 'oyun', block_type: 'sinema',
      days_of_week: [1, 1, 9, -1, 'pzt', 3.5, 0],
      start_time: '7:05:30', end_time: '8:00',
      times_per_week: 8, times_per_day: 1, estimated_minutes: 0, min_minutes: 601,
      target_count: 1000, start_count: 5,
      is_protected: 'evet', is_untracked: 1, ekstra: 'x',
    }],
  }))
  assert.deepEqual(proposal?.routines, [{
    title: 'Okuma', kind: 'block', area: null,
    days_of_week: [0, 1],
    start_time: '07:05',
    end_time: '08:00',
  }])
})

test('doğrulama: blok saatsiz ya da saat aralığı bozuksa, görev günsüzse, habit sıklıksızsa unsupported (istemciyle aynı)', () => {
  const proposal = parseLifeSetup(json({
    routines: [
      { title: 'Saatsiz blok', kind: 'block', days_of_week: [1] },
      { title: 'Ters saat', kind: 'block', days_of_week: [1], start_time: '10:00', end_time: '09:00' },
      { title: 'Günsüz görev', kind: 'task' },
      { title: 'Sıklıksız alışkanlık', kind: 'habit' },
    ],
  }))
  assert.deepEqual(proposal?.routines, [])
  assert.deepEqual(proposal?.unsupported, ['Saatsiz blok', 'Ters saat', 'Günsüz görev', 'Sıklıksız alışkanlık'])
})

test('doğrulama: start_count hedeften küçük olmalı, 0 yazılmaz', () => {
  const read = (extra: Record<string, unknown>) =>
    parseLifeSetup(json({ routines: [{ title: 'A', kind: 'task', days_of_week: [1], ...extra }] }))?.routines[0]
  assert.deepEqual(read({ target_count: 42, start_count: 1 }), { title: 'A', kind: 'task', area: null, days_of_week: [1], target_count: 42, start_count: 1 })
  assert.equal(read({ target_count: 42, start_count: 42 })?.start_count, undefined)
  assert.equal(read({ target_count: 42, start_count: 0 })?.start_count, undefined)
  assert.equal(read({ target_count: 1, start_count: 1 })?.start_count, undefined)
  // Hedef yoksa sayaç da yok.
  assert.equal(read({ start_count: 3 })?.start_count, undefined)
})

test('doğrulama: habit alanları korunur, block_type yalnızca habit olmayanda', () => {
  const [habit, block] = parseLifeSetup(json({
    routines: [
      { title: 'Su', kind: 'habit', times_per_day: 5, times_per_week: 7, block_type: 'meal' },
      { title: 'Odak', kind: 'block', block_type: 'focus', days_of_week: [2], start_time: '09:00', end_time: '10:00' },
    ],
  }))?.routines ?? []
  assert.equal(habit?.times_per_day, 5)
  assert.equal(habit?.times_per_week, 7)
  assert.equal(habit?.block_type, undefined)
  assert.equal(block?.block_type, 'focus')
})

test('doğrulama: türü ya da ufku tanınmayan öğe unsupported listesine başlığıyla gider', () => {
  const proposal = parseLifeSetup(json({
    routines: [{ title: 'Garip rutin', kind: 'sonsuz' }, { title: 'İyi', kind: 'task', days_of_week: [1] }],
    goals: [{ title: 'Garip hedef', horizon: 'yıl' }],
    unsupported: ['Elle yazılan'],
  }))
  assert.equal(proposal?.routines.length, 1)
  assert.equal(proposal?.goals.length, 0)
  assert.deepEqual(proposal?.unsupported, ['Elle yazılan', 'Garip rutin', 'Garip hedef'])
})

test('doğrulama: başlığı olmayan ya da nesne olmayan öğe sessizce düşer', () => {
  const proposal = parseLifeSetup(json({
    routines: [null, 'x', { kind: 'task', days_of_week: [1] }, { title: '   ', kind: 'task' }],
    tasks: [{ title: 'Tek' }],
  }))
  assert.equal(proposal?.routines.length, 0)
  assert.deepEqual(proposal?.unsupported, [])
  assert.equal(proposal?.tasks.length, 1)
})

test('doğrulama: liste tavanları 20 rutin, 10 hedef, 30 görev; taşan başlık unsupported', () => {
  const many = <T,>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i))
  const proposal = parseLifeSetup(json({
    routines: many(25, (i) => ({ title: `R${i}`, kind: 'task', days_of_week: [1] })),
    goals: many(12, (i) => ({ title: `G${i}`, horizon: 'week' })),
    tasks: many(40, (i) => ({ title: `T${i}` })),
  }))
  assert.equal(proposal?.routines.length, MAX_ROUTINES)
  assert.equal(proposal?.goals.length, MAX_GOALS)
  assert.equal(proposal?.tasks.length, MAX_TASKS)
  // 5 + 2 + 10 taşan başlık var, unsupported tavanı 10.
  assert.equal(proposal?.unsupported.length, MAX_UNSUPPORTED)
  assert.equal(proposal?.unsupported[0], 'R20')
})

test('doğrulama: adım ve metin uzunlukları kırpılır', () => {
  const proposal = parseLifeSetup(json({
    summary: 's'.repeat(1500),
    goals: [{
      title: 'g'.repeat(300), horizon: 'month',
      steps: Array.from({ length: 20 }, (_, i) => `Adım ${i}`).concat(['', '   ', 7 as unknown as string]),
    }],
    unsupported: ['u'.repeat(500)],
  }))
  assert.equal(proposal?.summary.length, 1000)
  assert.equal(proposal?.goals[0]?.title.length, 200)
  assert.equal(proposal?.goals[0]?.steps?.length, MAX_STEPS)
  assert.equal(proposal?.unsupported[0]?.length, 300)
})

test('doğrulama: hedefte sayı varsa sayım biçimi görev adedine düşer, sayı yoksa ikisi de yazılmaz', () => {
  const [counted, plain, bad] = parseLifeSetup(json({
    goals: [
      { title: 'A', horizon: 'week', target: 7.5, count_mode: 'hours', unit: 'saat', daily_cap: 2 },
      { title: 'B', horizon: 'week', count_mode: 'hours', unit: 'saat', daily_cap: 99 },
      { title: 'C', horizon: 'week', target: 0, count_mode: 'tasks' },
    ],
  }))?.goals ?? []
  assert.deepEqual(counted, { title: 'A', horizon: 'week', target: 7.5, count_mode: 'hours', unit: 'saat', daily_cap: 2 })
  assert.deepEqual(plain, { title: 'B', horizon: 'week' })
  assert.deepEqual(bad, { title: 'C', horizon: 'week' })
  const defaulted = parseLifeSetup(json({ goals: [{ title: 'D', horizon: 'week', target: 3, count_mode: 'x' }] }))?.goals[0]
  assert.equal(defaulted?.count_mode, 'tasks')
})

test('doğrulama: kurallar sınırlanır, yalnızca gelen anahtarlar döner', () => {
  const rules = parseLifeSetup(json({ rules: { max_deep_tasks: 12, buffer_minutes: 500, rollover: 'carry' }, summary: 'x' }))?.rules
  assert.deepEqual(rules, { max_deep_tasks: 5, buffer_minutes: 60, rollover: 'carry' })
  const about = parseLifeSetup(json({ rules: { about: 'k'.repeat(3000) } }))?.rules.about
  assert.equal(about?.length, 2000)
})
