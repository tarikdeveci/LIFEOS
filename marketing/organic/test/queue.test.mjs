import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'queue.mjs')
const dir = mkdtempSync(join(tmpdir(), 'organic-queue-'))
const video = join(dir, 'a.mp4')
process.env.ORGANIC_DATA_DIR = join(dir, 'data')
const { approvalHash, buildItem, loadQueue, saveQueue, updateItem } = await import('../queue.mjs')

const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, ORGANIC_DATA_DIR: join(dir, 'data') },
})
const idOf = (out) => out.match(/r-\d{8}-[0-9a-f]{12}/)[0]
const CAPTION = 'Listen var, günün yok. Profildeki linkten dene.'

before(() => writeFileSync(video, 'x'))
after(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => rmSync(join(dir, 'data'), { recursive: true, force: true }))

describe('queue api', () => {
  it('dosya yoksa bos kuyruk', () => assert.deepEqual(loadQueue(), { items: [] }))

  it('saveQueue atomik: tmp dosya kalmaz, updateItem calisir', () => {
    saveQueue({ items: [{ id: 'x1', status: 'draft' }] })
    assert.deepEqual(readdirSync(join(dir, 'data')), ['queue.json'])
    assert.equal(updateItem('x1', { status: 'published' }).status, 'published')
    assert.equal(loadQueue().items[0].status, 'published')
    assert.throws(() => updateItem('yok', {}), /yok/)
  })
})

describe('queue cli', () => {
  it('add draft uretir, judge sonucunu yazar', () => {
    const r = cli('add', '--video', video, '--caption', CAPTION, '--hook', 'Günün nerede?', '--hook-id', 'h2')
    assert.equal(r.status, 0, r.stderr)
    const [item] = loadQueue().items
    assert.equal(item.status, 'draft')
    assert.equal(item.hookId, 'h2')
    assert.deepEqual(item.platforms, ['instagram'])
    assert.equal(item.judge.ok, true)
  })

  it('add --caption-file ve platforms', () => {
    const f = join(dir, 'c.txt')
    writeFileSync(f, CAPTION + '\n')
    const r = cli('add', '--video', video, '--caption-file', f, '--hook', 'Günün nerede?', '--platforms', 'instagram,facebook')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(loadQueue().items[0].platforms, ['instagram', 'facebook'])
    assert.equal(loadQueue().items[0].caption, CAPTION)
  })

  it('approve: temiz item onaylanir', () => {
    const id = idOf(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'Günün nerede?').stdout)
    const r = cli('approve', id)
    assert.equal(r.status, 0, r.stderr)
    const item = loadQueue().items[0]
    assert.equal(item.status, 'approved')
    assert.ok(item.approvedAt)
  })

  it('approve: block varsa reddeder, status draft kalir', () => {
    const id = idOf(cli('add', '--video', video, '--caption', 'Kilo ver! linke bak', '--hook', 'Günün nerede?').stdout)
    const r = cli('approve', id)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /health-claim/)
    assert.equal(loadQueue().items[0].status, 'draft')
  })

  it('approve: video sonradan silinirse yeniden judge yakalar', () => {
    const v2 = join(dir, 'b.mp4')
    writeFileSync(v2, 'x')
    const id = idOf(cli('add', '--video', v2, '--caption', CAPTION, '--hook', 'Günün nerede?').stdout)
    rmSync(v2)
    assert.equal(cli('approve', id).status, 1)
  })

  it('list --status filtreler, reject ve remove calisir', () => {
    const a = idOf(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'bir').stdout)
    const b = idOf(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'iki').stdout)
    cli('approve', a)
    assert.match(cli('list', '--status', 'approved').stdout, new RegExp(a))
    assert.doesNotMatch(cli('list', '--status', 'approved').stdout, new RegExp(b))
    cli('reject', b)
    assert.equal(loadQueue().items.find((i) => i.id === b).status, 'failed')
    cli('remove', b)
    assert.equal(loadQueue().items.length, 1)
    assert.notEqual(cli('remove', b).status, 0)
  })

  it('matrix: hook x caption kadar draft, her biri judge edilir', () => {
    const hooks = join(dir, 'h.json')
    const caps = join(dir, 'c.json')
    writeFileSync(hooks, JSON.stringify([{ id: 'h1', text: 'Günün nerede?' }, { id: 'h2', text: 'Kilo ver' }, { id: 'h3', text: 'Liste var, gün yok' }]))
    writeFileSync(caps, JSON.stringify([{ id: 'c1', text: CAPTION }, { id: 'c2', text: 'Linke bak.' }]))
    const r = cli('matrix', '--video', video, '--hooks-file', hooks, '--captions-file', caps)
    assert.equal(r.status, 0, r.stderr)
    const items = loadQueue().items
    assert.equal(items.length, 6)
    assert.equal(new Set(items.map((i) => i.id)).size, 6)
    assert.equal(new Set(items.map((i) => i.variant)).size, 6)
    assert.ok(items.every((i) => i.status === 'draft' && i.video === video))
    assert.equal(items.filter((i) => !i.judge.ok).length, 2)
    assert.match(r.stdout, /6 draft uretildi, 4 judge OK/)
  })

  it('gecersiz platform ve eksik arguman hata verir, kuyruk yazilmaz', () => {
    assert.notEqual(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'x', '--platforms', 'tiktok').status, 0)
    assert.notEqual(cli('add', '--caption', CAPTION, '--hook', 'x').status, 0)
    assert.equal(existsSync(join(dir, 'data', 'queue.json')), false)
  })

  it('approve approvalHash yazar; icerik degisince hash degisir', () => {
    const id = idOf(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'Günün nerede?').stdout)
    cli('approve', id)
    const item = loadQueue().items[0]
    assert.match(item.approvalHash, /^[0-9a-f]{64}$/)
    assert.equal(approvalHash(item), item.approvalHash)
    assert.notEqual(approvalHash({ ...item, caption: item.caption + '!' }), item.approvalHash)
    assert.notEqual(approvalHash({ ...item, consentRef: 'k1' }), item.approvalHash)
    assert.notEqual(approvalHash({ ...item, aiLabel: !item.aiLabel }), item.approvalHash)
    const v2 = join(dir, 'c.mp4')
    writeFileSync(v2, 'y')
    assert.notEqual(approvalHash({ ...item, video: v2 }), item.approvalHash)
  })

  it('realPeople: consent olmadan add draft olur ama approve reddeder', () => {
    const base = ['add', '--video', video, '--caption', CAPTION, '--hook', 'Günün nerede?', '--real-people']
    const id = idOf(cli(...base).stdout)
    assert.equal(loadQueue().items[0].realPeople, true)
    const r = cli('approve', id)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /consent-missing/)
    const id2 = idOf(cli(...base, '--consent', 'kayit/izin-1.pdf').stdout)
    assert.equal(cli('approve', id2).status, 0)
    assert.equal(loadQueue().items[1].consentRef, 'kayit/izin-1.pdf')
  })

  it('yalniz facebook reddedilir', () => {
    const r = cli('add', '--video', video, '--caption', CAPTION, '--hook', 'x', '--platforms', 'facebook')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /instagram/)
  })

  it('id uuid tabanli ve kuyrukta benzersiz', () => {
    const args = { video, caption: CAPTION, hook: 'x' }
    const taken = new Set()
    const ids = Array.from({ length: 50 }, () => buildItem(args, taken).id)
    assert.equal(new Set(ids).size, 50)
    assert.ok(ids.every((i) => /^r-\d{8}-[0-9a-f]{12}$/.test(i)))
  })

  it('uncertain: list gosterir, approve ve reject dokunmaz', () => {
    const id = idOf(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'Günün nerede?').stdout)
    updateItem(id, { status: 'uncertain' })
    assert.match(cli('list', '--status', 'uncertain').stdout, /uncertain/)
    assert.notEqual(cli('approve', id).status, 0)
    assert.notEqual(cli('reject', id).status, 0)
    assert.equal(loadQueue().items[0].status, 'uncertain')
  })

  it('reject published item uzerinde calismaz', () => {
    const id = idOf(cli('add', '--video', video, '--caption', CAPTION, '--hook', 'Günün nerede?').stdout)
    updateItem(id, { status: 'published' })
    assert.notEqual(cli('reject', id).status, 0)
  })
})
