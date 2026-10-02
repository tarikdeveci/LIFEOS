import { test } from 'node:test'
import assert from 'node:assert/strict'

import { planExternalUpsert, todoistToExternal } from '../../packages/shared/src/utils/externalTasks.ts'
import { parseTaskImport } from '../../packages/shared/src/utils/taskImport.ts'

test('upsert planı: yeni eklenir, var olan güncellenir, tamamlanmışa dokunulmaz', () => {
  const plan = planExternalUpsert(
    [
      { title: 'Yeni', external_id: 'n1' },
      { title: 'Eski başlık', external_id: 'e1' },
      { title: 'Yeni başlık', external_id: 'e1', due_date: '2026-10-01' },
      { title: 'Bitmiş', external_id: 'd1' },
    ],
    [{ id: 'a', external_id: 'e1', status: 'planned' }, { id: 'b', external_id: 'd1', status: 'done' }],
  )
  assert.deepEqual(plan.toInsert.map((t) => t.external_id), ['n1'])
  assert.equal(plan.toUpdate.length, 1)
  assert.equal(plan.toUpdate[0]!.id, 'a')
  assert.equal(plan.toUpdate[0]!.patch.title, 'Yeni başlık')
  assert.equal(plan.toUpdate[0]!.patch.due_date, '2026-10-01')
  assert.equal(plan.skipped, 1)
})

test('Todoist: öncelik, süre, son tarih ve etiketler', () => {
  const t = todoistToExternal({
    id: 'abc', content: '  Rapor   yaz ', description: 'Q3', priority: 4,
    due: { date: '2026-10-02T09:00:00' }, deadline: { date: '2026-10-05' },
    duration: { amount: 45, unit: 'minute' }, labels: ['iş'],
  })
  assert.ok(t)
  assert.equal(t.title, 'Rapor yaz')
  assert.equal(t.due_date, '2026-10-05')
  assert.equal(t.estimated_minutes, 45)
  assert.equal(t.urgency_score, 5)
  assert.deepEqual(t.tags, ['todoist', 'iş'])
  assert.equal(t.external_url, 'https://app.todoist.com/app/task/abc')
})

test('Todoist: tamamlanmış ve boş görev alınmaz, gün birimli süre yok sayılır', () => {
  assert.equal(todoistToExternal({ id: '1', content: 'x', checked: true }), null)
  assert.equal(todoistToExternal({ id: '2', content: '   ' }), null)
  const t = todoistToExternal({ id: '3', content: 'Tatil', duration: { amount: 2, unit: 'day' }, due: { date: '2026-10-02' } })
  assert.equal(t?.estimated_minutes, undefined)
  assert.equal(t?.due_date, '2026-10-02')
})

const TICKTICK = [
  '"Date: 2026-09-29+0000"',
  '"Version: 7.1"',
  '"Status: ',
  '0 Normal',
  '1 Completed',
  '2 Archived"',
  '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"',
  '"","İş","Haftalık rapor","TEXT","","Pazartesi gönder","N","","2026-10-06T00:00:00+0000","","","3","0","","","1","Europe/Istanbul","true","false","","","list","t1",""',
  '"","Ev","Haftalık rapor","TEXT","","","N","","","","","0","2","","","2","Europe/Istanbul","true","false","","","list","t2",""',
  '"","Ev","Fikir","NOTE","","","N","","","","","0","0","","","3","Europe/Istanbul","true","false","","","list","t3",""',
].join('\n')

test('TickTick yedeği: ön satırlar atlanır, aynı başlıklı iki görev kimlikle ayrılır, not alınmaz', () => {
  const r = parseTaskImport(TICKTICK)
  assert.equal(r.source, 'ticktick')
  assert.deepEqual(r.tasks, [
    { title: 'Haftalık rapor', description: 'Pazartesi gönder', due_date: '2026-10-06', done: false, external_id: 't1' },
    { title: 'Haftalık rapor', done: true, external_id: 't2' },
  ])
})

test('Todoist CSV hâlâ düz CSV olarak okunur', () => {
  const r = parseTaskImport('TYPE,CONTENT,DESCRIPTION\ntask,Süt al,\nsection,Bölüm,\n')
  assert.equal(r.source, undefined)
  assert.deepEqual(r.tasks, [{ title: 'Süt al', done: false }])
})

test('Apple Hatırlatıcı: yerel gün, not açıklamaya, tamamlanan ve kimliksiz alınmaz', async () => {
  const { reminderToExternal } = await import('../../packages/shared/src/utils/externalTasks.ts')
  const local = new Date(2026, 9, 3, 23, 30)
  const r = reminderToExternal({ id: 'r1', title: 'Fatura öde', notes: ' elektrik ', dueDate: local.toISOString() })
  assert.equal(r?.due_date, '2026-10-03')
  assert.equal(r?.description, 'elektrik')
  assert.equal(reminderToExternal({ id: 'r2', title: 'x', completed: true }), null)
  assert.equal(reminderToExternal({ title: 'kimliksiz' }), null)
})
