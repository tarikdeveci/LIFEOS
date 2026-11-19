import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createClient, loadEnv } from '../meta.mjs'
import { acquireLock, reconcile, runPublish } from '../publish.mjs'
import { collectInsights, formatReport, hookReport } from '../insights.mjs'

const TOKEN = 'SECRET_TOKEN_123'
const HOUR = 3600_000
const dir = mkdtempSync(join(tmpdir(), 'organic-'))
const video = join(dir, 'a.mp4')
writeFileSync(video, Buffer.from('fakevideo'))

const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })

// Routes by URL substring (first match wins); records every call.
function mockFetch(routes) {
  const calls = []
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), ...opts })
    const key = Object.keys(routes).find((k) => String(url).includes(k))
    if (!key) throw new Error(`unrouted ${url}`)
    const r = routes[key]
    return typeof r === 'function' ? r(String(url), opts) : r
  }
  fn.calls = calls
  return fn
}

const igRoutes = (extra = {}) => ({
  content_publishing_limit: reply({ data: [{ quota_usage: 2, config: { quota_total: 100 } }] }),
  '/IG/media_publish': reply({ id: 'MEDIA1' }),
  '/IG/media': reply({ id: 'CONT1' }),
  'rupload.facebook.com/ig-api-upload': reply({ success: true }),
  'CONT1?': reply({ status_code: 'FINISHED' }),
  'MEDIA1?': reply({ permalink: 'https://instagram.com/reel/x' }),
  ...extra,
})

const mk = (fetch, extra = {}) => createClient({ token: TOKEN, igUserId: 'IG', fetch, ...extra })

test('createClient requires token and user id', () => {
  assert.throws(() => createClient({ igUserId: 'IG' }), /META_ACCESS_TOKEN/)
  assert.throws(() => createClient({ token: TOKEN }), /META_IG_USER_ID/)
})

test('loadEnv parses file, process env wins, defaults version', () => {
  const f = join(dir, '.env')
  writeFileSync(f, '# c\nMETA_ACCESS_TOKEN="abc"\nMETA_IG_USER_ID=42\nMETA_PAGE_ID=\n')
  const r = loadEnv(f, { META_IG_USER_ID: '7' })
  assert.deepEqual(r, { token: 'abc', igUserId: '7', pageId: undefined, version: 'v27.0' })
})

test('reel flow: container, resumable upload headers, publish, token only in header', async () => {
  const f = mockFetch(igRoutes())
  const c = mk(f, { version: 'v27.0' })
  assert.equal(await c.createReelContainer({ caption: 'hi', thumbOffset: 1500 }), 'CONT1')
  const body = new URLSearchParams(f.calls[0].body)
  assert.equal(body.get('media_type'), 'REELS')
  assert.equal(body.get('upload_type'), 'resumable')
  assert.equal(body.get('share_to_feed'), 'true')
  assert.equal(body.get('thumb_offset'), '1500')
  await c.uploadReel('CONT1', video)
  const up = f.calls[1]
  assert.equal(up.url, 'https://rupload.facebook.com/ig-api-upload/v27.0/CONT1')
  assert.equal(up.headers.offset, '0')
  assert.equal(up.headers.file_size, '9')
  assert.equal(up.headers.Authorization, `OAuth ${TOKEN}`)
  assert.equal(await c.publishContainer('CONT1'), 'MEDIA1')
  assert.ok(f.calls.every((x) => !x.url.includes(TOKEN)))
  assert.ok(!String(f.calls[0].body).includes(TOKEN))
})

test('waitForContainer backs off, fails on ERROR and on timeout', async () => {
  const seq = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED']
  const sleeps = []
  await mk(mockFetch({ 'CONT1?': () => reply({ status_code: seq.shift() }) })).waitForContainer('CONT1', { sleep: async (ms) => sleeps.push(ms) })
  assert.deepEqual(sleeps, [5000, 10000])

  const bad = mk(mockFetch({ 'CONT1?': reply({ status_code: 'ERROR' }) }))
  await assert.rejects(bad.waitForContainer('CONT1', { sleep: async () => {} }), /ERROR/)

  const slow = mk(mockFetch({ 'CONT1?': reply({ status_code: 'IN_PROGRESS' }) }))
  await assert.rejects(slow.waitForContainer('CONT1', { maxMs: 20000, sleep: async () => {} }), /dk icinde/)
})

test('API errors are redacted', async () => {
  const c = mk(mockFetch({ content_publishing_limit: reply({ error: { message: `bad ${TOKEN}`, code: 190 } }, 400) }))
  await assert.rejects(c.publishingLimit(), (e) => !e.message.includes(TOKEN) && e.code === 190)
})

test('mediaInsights maps watch time and falls back per metric', async () => {
  const f = mockFetch({
    insights: (u) => {
      const m = new URL(u).searchParams.get('metric')
      if (m.includes(',') || m === 'shares') return reply({ error: { message: 'unsupported', code: 100 } }, 400)
      const v = { views: 100, reach: 80, saved: 5, ig_reels_avg_watch_time: 4200 }[m]
      return reply({ data: v === undefined ? [] : [{ name: m, values: [{ value: v }] }] })
    },
  })
  const r = await mk(f).mediaInsights('M')
  assert.equal(r.views, 100)
  assert.equal(r.avgWatchMs, 4200)
  assert.equal(r.shares, undefined)
})

function queueStub(items) {
  const q = { items }
  return {
    loadQueue: () => q,
    updateItem: (id, patch) => Object.assign(q.items.find((i) => i.id === id), patch),
  }
}
const item = (o = {}) => ({ id: 'a', video, caption: 'c', hookId: 'h1', platforms: ['instagram'], status: 'approved', approvalHash: 'H', ...o })
const okJudge = () => ({ ok: true, issues: [] })
const hash = () => 'H'
const live = { live: true }
const quiet = { log: () => {}, sleep: async () => {} }

test('dry run uploads nothing and changes nothing', async () => {
  const f = mockFetch(igRoutes())
  const qs = queueStub([item()])
  const logs = []
  const r = await runPublish({ client: mk(f), ...qs, judge: okJudge, approvalHash: hash, args: {}, log: (l) => logs.push(l) })
  assert.deepEqual(r, [])
  assert.equal(qs.loadQueue().items[0].status, 'approved')
  assert.ok(f.calls.every((c) => c.url.includes('content_publishing_limit')))
  assert.ok(logs.some((l) => l.includes('DRY RUN')))
})

test('live publish marks item published', async () => {
  const qs = queueStub([item()])
  await runPublish({ client: mk(mockFetch(igRoutes())), ...qs, judge: okJudge, approvalHash: hash, args: live, ...quiet })
  const it = qs.loadQueue().items[0]
  assert.equal(it.status, 'published')
  assert.equal(it.igMediaId, 'MEDIA1')
  assert.equal(it.permalink, 'https://instagram.com/reel/x')
  assert.ok(it.publishedAt)
})

test('judge block leaves item approved; --max and --id respected', async () => {
  const qs = queueStub([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })])
  const judge = (i) => (i.id === 'a' ? { ok: false, issues: [{ rule: 'r', severity: 'block', message: 'm' }] } : okJudge())
  await runPublish({ client: mk(mockFetch(igRoutes())), ...qs, judge, approvalHash: hash, args: { ...live, max: 1 }, ...quiet })
  assert.deepEqual(qs.loadQueue().items.map((i) => i.status), ['approved', 'published', 'approved'])

  const qs2 = queueStub([item({ id: 'a' }), item({ id: 'b' })])
  await runPublish({ client: mk(mockFetch(igRoutes())), ...qs2, judge: okJudge, approvalHash: hash, args: { ...live, id: 'b' }, ...quiet })
  assert.deepEqual(qs2.loadQueue().items.map((i) => i.status), ['approved', 'published'])
})

test('failure sets failed with redacted error', async () => {
  const f = mockFetch(igRoutes({ 'rupload.facebook.com/ig-api-upload': reply({ debug_info: { message: `boom ${TOKEN}`, retriable: false } }, 400) }))
  const qs = queueStub([item()])
  await runPublish({ client: mk(f), ...qs, judge: okJudge, approvalHash: hash, args: live, ...quiet })
  const it = qs.loadQueue().items[0]
  assert.equal(it.status, 'failed')
  assert.ok(it.error.includes('boom') && !it.error.includes(TOKEN))
})

test('facebook reel only when platforms include facebook', async () => {
  const routes = () => igRoutes({
    '/PAGE/video_reels': (u, o) => reply(new URLSearchParams(o.body).get('upload_phase') === 'start' ? { video_id: 'V1', upload_url: 'https://rupload.facebook.com/video-upload/V1' } : { success: true }),
    'video-upload/V1': reply({ success: true }),
  })
  const q1 = queueStub([item({ platforms: ['instagram', 'facebook'] })])
  await runPublish({ client: mk(mockFetch(routes()), { pageId: 'PAGE' }), ...q1, judge: okJudge, approvalHash: hash, args: live, ...quiet })
  assert.equal(q1.loadQueue().items[0].fbVideoId, 'V1')

  const f2 = mockFetch(routes())
  await runPublish({ client: mk(f2, { pageId: 'PAGE' }), ...queueStub([item()]), judge: okJudge, approvalHash: hash, args: live, ...quiet })
  assert.ok(f2.calls.every((c) => !c.url.includes('video_reels')))
})


const pubRoutes = () => igRoutes({
  '/PAGE/video_reels': (u, o) => reply(new URLSearchParams(o.body).get('upload_phase') === 'start' ? { video_id: 'V1', upload_url: 'https://rupload.facebook.com/video-upload/V1' } : { success: true }),
  'video-upload/V1': reply({ success: true }),
})
const deps = { judge: okJudge, approvalHash: hash }

test('rupload accepts only success === true and masks everything else', async () => {
  const c = mk(mockFetch({ rupload: reply({ ok: 1, note: `x access_token=${TOKEN}&y` }) }))
  await assert.rejects(c.uploadReel('CONT1', video), (e) => /yukleme basarisiz/.test(e.message) && !e.message.includes(TOKEN))
})

test('sanitize strips access_token patterns and OAuth strings from container status errors', async () => {
  const c = mk(mockFetch({ 'CONT1?': reply({ status_code: 'ERROR', status: 'bad access_token=abc123&z OAuth zzz' }) }))
  await assert.rejects(c.waitForContainer('CONT1', { sleep: async () => {} }), (e) => !/abc123|zzz/.test(e.message))
})

test('aiLabel sets is_ai_generated on the container and the facebook finish', async () => {
  const f = mockFetch(pubRoutes())
  const qs = queueStub([item({ platforms: ['instagram', 'facebook'], aiLabel: true })])
  await runPublish({ client: mk(f, { pageId: 'PAGE' }), ...qs, ...deps, args: live, ...quiet })
  const media = f.calls.find((c) => c.url.endsWith('/IG/media'))
  assert.equal(new URLSearchParams(media.body).get('is_ai_generated'), 'true')
  const finish = f.calls.filter((c) => c.url.includes('/PAGE/video_reels')).map((c) => new URLSearchParams(c.body)).find((b) => b.get('upload_phase') === 'finish')
  assert.equal(finish.get('is_ai_generated'), 'true')
})

test('fresh check: hash mismatch becomes draft, changed status is skipped', async () => {
  const qs = queueStub([item({ id: 'a', approvalHash: 'OLD' }), item({ id: 'b' })])
  const logs = []
  await runPublish({ client: mk(mockFetch(igRoutes())), ...qs, ...deps, args: { ...live, max: 5 }, log: (l) => logs.push(l), sleep: async () => {} })
  const [a, b] = qs.loadQueue().items
  assert.equal(a.status, 'draft')
  assert.equal(a.approvalHash, undefined)
  assert.equal(b.status, 'published')
  assert.ok(logs.some((l) => l.includes('icerik degisti')))

  const f2 = mockFetch(igRoutes())
  const inner = queueStub([item()])
  let reads = 0
  const loadQueue = () => { reads++; if (reads > 2) inner.loadQueue().items[0].status = 'draft'; return inner.loadQueue() }
  await runPublish({ client: mk(f2), loadQueue, updateItem: inner.updateItem, ...deps, args: live, ...quiet })
  assert.ok(f2.calls.every((c) => c.url.includes('content_publishing_limit')))
})

test('dry run does not demote hash mismatches', async () => {
  const qs = queueStub([item({ approvalHash: 'OLD' })])
  await runPublish({ client: mk(mockFetch(igRoutes())), ...qs, ...deps, args: {}, ...quiet })
  assert.equal(qs.loadQueue().items[0].status, 'approved')
})

test('containerId is saved; errors before media_publish are failed, after are uncertain', async () => {
  const qs = queueStub([item()])
  await runPublish({ client: mk(mockFetch(igRoutes({ 'rupload.facebook.com/ig-api-upload': reply({ error: { message: 'x' } }, 500) }))), ...qs, ...deps, args: live, ...quiet })
  assert.equal(qs.loadQueue().items[0].status, 'failed')
  assert.equal(qs.loadQueue().items[0].containerId, 'CONT1')

  const qs2 = queueStub([item()])
  const lost = () => { throw new Error('timeout') }
  await runPublish({ client: mk(mockFetch(igRoutes({ '/IG/media_publish': lost }))), ...qs2, ...deps, args: live, ...quiet })
  assert.equal(qs2.loadQueue().items[0].status, 'uncertain')
  assert.match(qs2.loadQueue().items[0].error, /timeout/)
})

test('dry run lists publishing/uncertain items as warnings', async () => {
  const logs = []
  await runPublish({ client: undefined, ...queueStub([item({ id: 'u', status: 'uncertain', containerId: 'C9' })]), ...deps, args: {}, log: (l) => logs.push(l) })
  assert.ok(logs.some((l) => l.includes('UYARI u') && l.includes('C9')))
})

test('reconcile: PUBLISHED marks published without media id, otherwise failed, never republishes', async () => {
  const f = mockFetch({ 'P1?': reply({ status_code: 'PUBLISHED' }), 'F1?': reply({ status_code: 'FINISHED' }) })
  const qs = queueStub([
    item({ id: 'p', status: 'uncertain', containerId: 'P1' }),
    item({ id: 'f', status: 'publishing', containerId: 'F1' }),
    item({ id: 'n', status: 'uncertain' }),
    item({ id: 'ok', status: 'approved' }),
  ])
  await reconcile({ client: mk(f), ...qs, log: () => {} })
  const st = Object.fromEntries(qs.loadQueue().items.map((i) => [i.id, i.status]))
  assert.deepEqual(st, { p: 'published', f: 'failed', n: 'failed', ok: 'approved' })
  assert.match(qs.loadQueue().items[0].error, /elle kontrol/)
  assert.ok(f.calls.every((c) => !c.url.includes('media_publish')))
})

test('publish lock is exclusive and released', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'lock-')), 'publish.lock')
  const release = acquireLock(file, () => {})
  assert.ok(existsSync(file))
  assert.throws(() => acquireLock(file, () => {}), /Baska yayinci/)
  release()
  assert.ok(!existsSync(file))
  acquireLock(file, () => {})()
})

test('insights: auth errors propagate and are not recorded; empty results are not recorded', async () => {
  await assert.rejects(mk(mockFetch({ insights: reply({ error: { message: 'expired', code: 190 } }, 401) })).mediaInsights('M'), /expired/)
  const t0 = Date.parse('2026-11-01T00:00:00Z')
  const base = () => queueStub([{ id: 'a', status: 'published', igMediaId: 'M1', publishedAt: new Date(t0).toISOString() }])
  const now = t0 + 30 * HOUR

  const q1 = base()
  assert.equal(await collectInsights({ client: mk(mockFetch({ insights: reply({ error: { message: 'tok', code: 190 } }, 401) })), ...q1, now, log: () => {} }), 0)
  assert.equal(q1.loadQueue().items[0].metrics, undefined)

  const q2 = base()
  assert.equal(await collectInsights({ client: mk(mockFetch({ insights: reply({ data: [] }) })), ...q2, now, log: () => {} }), 0)
  assert.equal(q2.loadQueue().items[0].metrics, undefined)
})

test('collectInsights windows: h24 at 24-72h, d7 at 7-10d, missed recorded, ageHours written', async () => {
  const t0 = Date.parse('2026-11-01T00:00:00Z')
  const f = mockFetch({ insights: reply({ data: [{ name: 'views', values: [{ value: 10 }] }] }) })
  const qs = queueStub([
    { id: 'a', status: 'published', igMediaId: 'M1', publishedAt: new Date(t0).toISOString() },
    { id: 'b', status: 'published', igMediaId: 'M2', publishedAt: new Date(t0).toISOString(), metrics: { h24: { views: 1 } } },
  ])
  const client = mk(f)
  const run = (h) => collectInsights({ client, ...qs, now: t0 + h * HOUR, log: () => {} })
  assert.equal(await run(1), 0)
  assert.equal(await run(25), 1)
  assert.equal(qs.loadQueue().items[0].metrics.h24.views, 10)
  assert.equal(qs.loadQueue().items[0].metrics.h24.ageHours, 25)
  assert.equal(await run(7 * 24 + 1), 2)
  const [a, b] = qs.loadQueue().items
  assert.equal(a.metrics.d7.views, 10)
  assert.equal(b.metrics.h24.views, 1)

  const late = queueStub([{ id: 'c', status: 'published', igMediaId: 'M3', publishedAt: new Date(t0).toISOString() }])
  assert.equal(await collectInsights({ client, ...late, now: t0 + 11 * 24 * HOUR, log: () => {} }), 0)
  const c = late.loadQueue().items[0].metrics
  assert.deepEqual(c.h24, { missed: true, ageHours: 264 })
  assert.deepEqual(c.d7, { missed: true, ageHours: 264 })
})

test('hookReport groups by hook for the chosen window, ignores missed, sorts by views', () => {
  const items = [
    { hookId: 'h1', metrics: { d7: { views: 100, reach: 50, saved: 5, shares: 1, avgWatchMs: 3000 }, h24: { views: 9999 } } },
    { hookId: 'h2', metrics: { d7: { views: 300, reach: 100, saved: 20, shares: 4, avgWatchMs: 6000 } } },
    { hookId: 'h2', metrics: { d7: { views: 100, reach: 100, saved: 0, shares: 0, avgWatchMs: 0 } } },
    { hookId: 'h3', metrics: { d7: { missed: true, ageHours: 300 } } },
    { hookId: 'h4' },
  ]
  const rows = hookReport(items)
  assert.deepEqual(rows.map((r) => r.hookId), ['h2', 'h1'])
  assert.equal(rows[0].n, 2)
  assert.equal(rows[0].views, 200)
  assert.equal(rows[1].saveRate, 0.1)
  assert.equal(hookReport(items, 'h24')[0].views, 9999)
  assert.match(formatReport(rows), /^hookId/)
})
