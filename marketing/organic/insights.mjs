// Pulls Reels insights 24h and 7d after publishing, and prints a per-hook report.
// Usage: node marketing/organic/insights.mjs [--report] [--window h24|d7]

import { fileURLToPath } from 'node:url'
import { parseArgs } from '../lib/capture.mjs'
import { createClient, loadEnv } from './meta.mjs'

const HOUR = 3600_000
// Collect only while the window is open: h24 at 24-72h of age, d7 at 7-10 days. Later = missed.
const WINDOWS = { h24: [24, 72], d7: [168, 240] }
const errMsg = (e) => (e instanceof Error ? e.message : String(e))
const hasData = (m) => Object.values(m).some((v) => typeof v === 'number')

export async function collectInsights({ client, loadQueue, updateItem, now = Date.now(), log = console.log }) {
  let n = 0
  for (const item of loadQueue().items) {
    if (item.status !== 'published' || !item.igMediaId || !item.publishedAt) continue
    const ageHours = Math.round(((now - Date.parse(item.publishedAt)) / HOUR) * 10) / 10
    for (const [key, [from, to]] of Object.entries(WINDOWS)) {
      if (item.metrics?.[key] || ageHours < from) continue
      let record
      if (ageHours > to) {
        record = { missed: true, ageHours }
      } else {
        try {
          const m = await client.mediaInsights(item.igMediaId)
          if (!hasData(m)) { log(`${item.id} ${key}: bos sonuc, sonraki calistirmada tekrar denenecek`); continue }
          record = { ...m, ageHours, fetchedAt: new Date(now).toISOString() }
        } catch (e) {
          log(`HATA ${item.id} ${key}: ${errMsg(e)}`)
          continue
        }
      }
      item.metrics = updateItem(item.id, { metrics: { ...item.metrics, [key]: record } }).metrics
      log(record.missed ? `${item.id} ${key}: pencere kacti (${ageHours} saat)` : `${item.id} ${key}: views ${record.views ?? '-'}, reach ${record.reach ?? '-'}`)
      if (!record.missed) n++
    }
  }
  return n
}

// Aggregates by hookId for one window (default d7); missed records are ignored.
export function hookReport(items, window = 'd7') {
  const groups = new Map()
  for (const item of items) {
    const m = item.metrics?.[window]
    if (!m || m.missed) continue
    const g = groups.get(item.hookId ?? '(yok)') ?? []
    g.push(m)
    groups.set(item.hookId ?? '(yok)', g)
  }
  const avg = (arr, k) => {
    const v = arr.map((m) => m[k]).filter((x) => typeof x === 'number')
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
  }
  return [...groups].map(([hookId, ms]) => {
    const reach = avg(ms, 'reach')
    return {
      hookId, n: ms.length, views: avg(ms, 'views'), reach, saves: avg(ms, 'saved'), shares: avg(ms, 'shares'),
      watchSec: avg(ms, 'avgWatchMs') / 1000, saveRate: reach ? avg(ms, 'saved') / reach : 0,
    }
  }).sort((a, b) => b.views - a.views)
}

export function formatReport(rows) {
  if (!rows.length) return 'Henuz olcum yok.'
  const head = ['hookId', 'n', 'views', 'reach', 'saves', 'shares', 'izlenme sn', 'kayit/erisim']
  const body = rows.map((r) => [r.hookId, r.n, r.views.toFixed(0), r.reach.toFixed(0), r.saves.toFixed(1), r.shares.toFixed(1), r.watchSec.toFixed(1), `${(r.saveRate * 100).toFixed(1)}%`].map(String))
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)))
  const line = (cells) => cells.map((c, i) => c.padEnd(w[i])).join('  ')
  return [line(head), ...body.map(line)].join('\n')
}

async function main() {
  const args = parseArgs()
  const env = loadEnv()
  const window = args.window === 'h24' ? 'h24' : 'd7'
  const { loadQueue, updateItem } = await import('./queue.mjs')
  if (env.token || !args.report) {
    const client = createClient(env)
    console.log(`${await collectInsights({ client, loadQueue, updateItem })} olcum yazildi.`)
  }
  if (args.report) console.log(`
${formatReport(hookReport(loadQueue().items, window))}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(errMsg(e)); process.exit(1) })
}
