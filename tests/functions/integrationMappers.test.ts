import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  jiraToTask, msTodoToTask, notionFilter, notionToTask, planSync, type SyncedTask,
} from '../../supabase/functions/_shared/integrations/mappers.ts'
import { detectNotionMapping } from '../../packages/shared/src/utils/notionMapping.ts'

const task = (id: string, title = id): SyncedTask => ({
  external_id: id, title, description: null, due_date: null, urgency_score: 3,
  external_url: null, external_updated_at: null, tags: [],
})

test('senkron planı: yeni, güncel, kapanan; LifeOS\'ta bitmişe dokunulmaz', () => {
  const plan = planSync(
    [task('a'), task('b', 'yeni başlık'), task('d')],
    [
      { id: '1', external_id: 'b', status: 'planned' },
      { id: '2', external_id: 'c', status: 'backlog' },
      { id: '3', external_id: 'd', status: 'done' },
      { id: '4', external_id: 'e', status: 'done' },
    ],
  )
  assert.deepEqual(plan.toInsert.map((t) => t.external_id), ['a'])
  assert.deepEqual(plan.toUpdate.map((u) => [u.id, u.task.title]), [['1', 'yeni başlık']])
  // c kaynakta yok ve açık: kapanır. d ve e LifeOS'ta bitmiş: ne güncellenir ne kapanır.
  assert.deepEqual(plan.toClose, ['2'])
})

test('Jira: anahtar başlıkta, öncelik aciliyete, site kimliği dış kimlikte', () => {
  const t = jiraToTask({
    id: '10001', key: 'APP-12',
    fields: { summary: '  Giriş  hatası ', duedate: '2026-10-03', priority: { name: 'Highest' }, project: { key: 'APP' }, updated: '2026-09-28T10:00:00.000+0000' },
  }, 'https://acme.atlassian.net/')
  assert.ok(t)
  assert.equal(t.title, 'APP-12 Giriş hatası')
  assert.equal(t.external_id, 'acme.atlassian.net:10001')
  assert.equal(t.external_url, 'https://acme.atlassian.net/browse/APP-12')
  assert.equal(t.urgency_score, 5)
  assert.equal(t.due_date, '2026-10-03')
  assert.deepEqual(t.tags, ['jira', 'app'])
  assert.equal(jiraToTask({ id: '1', key: 'X-1', fields: { summary: ' ' } }, 'https://a.atlassian.net'), null)
})

test('Microsoft To Do: tamamlanan atlanır, önem ve gün taşınır', () => {
  assert.equal(msTodoToTask({ id: 'x', title: 'bitti', status: 'completed' }, 'Görevler'), null)
  const t = msTodoToTask({
    id: 'AAMk', title: 'Fatura öde', importance: 'high',
    dueDateTime: { dateTime: '2026-10-05T00:00:00.0000000' },
    body: { content: 'elektrik', contentType: 'text' },
  }, 'Ev')
  assert.ok(t)
  assert.equal(t.urgency_score, 5)
  assert.equal(t.due_date, '2026-10-05')
  assert.equal(t.description, 'elektrik')
  assert.deepEqual(t.tags, ['microsoft todo', 'ev'])
})

test('Notion: şemadan eşleme, filtre ve sayfa dönüşümü', () => {
  const mapping = detectNotionMapping({
    Ad: { type: 'title' }, Sorumlu: { type: 'people' }, Durum: { type: 'status' },
    Bitti: { type: 'checkbox' }, Tarih: { type: 'date' },
  })
  assert.deepEqual(mapping, {
    title: 'Ad', people: 'Sorumlu', status: { name: 'Durum', type: 'status' }, date: 'Tarih',
  })
  assert.equal(detectNotionMapping({ Not: { type: 'rich_text' } }), null)

  assert.deepEqual(notionFilter(mapping!, 'u1'), {
    and: [
      { property: 'Durum', status: { does_not_equal: 'Complete' } },
      { property: 'Sorumlu', people: { contains: 'u1' } },
    ],
  })
  // Kişi özelliği varken sahip bilinmiyorsa sadece durum filtresi.
  assert.deepEqual(notionFilter(mapping!, null), { property: 'Durum', status: { does_not_equal: 'Complete' } })
  assert.equal(notionFilter({ title: 'Ad' }, 'u1'), undefined)

  const t = notionToTask({
    id: 'p1', url: 'https://www.notion.so/p1',
    properties: { Ad: { type: 'title', title: [{ plain_text: 'Blog ' }, { plain_text: 'yazısı' }] }, Tarih: { type: 'date', date: { start: '2026-10-08T09:00:00.000+03:00' } } },
  }, mapping!)
  assert.ok(t)
  assert.equal(t.title, 'Blog yazısı')
  assert.equal(t.due_date, '2026-10-08')
  assert.equal(notionToTask({ id: 'p2', in_trash: true, properties: {} }, mapping!), null)
})
