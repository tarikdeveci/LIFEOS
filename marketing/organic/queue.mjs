// Organik yayin kuyrugu: dosya tabanli, insan onay kapisi (otomatik onay yolu yok).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from '../lib/capture.mjs'
import { judge } from './judge.mjs'

const dataDir = () => process.env.ORGANIC_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'data')
const queuePath = () => join(dataDir(), 'queue.json')
const PLATFORMS = ['instagram', 'facebook']

export function loadQueue() {
  if (!existsSync(queuePath())) return { items: [] }
  return JSON.parse(readFileSync(queuePath(), 'utf8'))
}

export function saveQueue(q) {
  mkdirSync(dataDir(), { recursive: true })
  const tmp = `${queuePath()}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(q, null, 2))
  renameSync(tmp, queuePath())
}

export function updateItem(id, patch) {
  const q = loadQueue()
  const item = q.items.find((i) => i.id === id)
  if (!item) throw new Error(`Kuyrukta yok: ${id}`)
  Object.assign(item, patch)
  saveQueue(q)
  return item
}

function newId(taken) {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  let id
  do id = `r-${day}-${randomUUID().replaceAll('-', '').slice(0, 12)}`
  while (taken.has(id))
  taken.add(id)
  return id
}

// Onay icerige baglidir: video baytlari + metin + platform + etiket + riza kaydi.
// publish ani bunu yeniden hesaplayip item.approvalHash ile karsilastirir.
export function approvalHash(item) {
  const text = [item.caption, item.hook, item.platforms.join(','), `${!!item.syntheticHuman}${!!item.aiLabel}${!!item.realPeople}`, item.consentRef ?? '']
  const NL = String.fromCharCode(10)
  return createHash('sha256').update(readFileSync(item.video)).update(NL + text.join(NL)).digest('hex')
}

export function buildItem({ video, caption, hook, hookId = 'h1', variant, platforms = ['instagram'], syntheticHuman = false, aiLabel = false, realPeople = false, consentRef }, taken = new Set()) {
  if (!video) throw new Error('--video gerekli')
  if (!caption) throw new Error('caption gerekli (--caption veya --caption-file)')
  if (!hook) throw new Error('--hook gerekli')
  if (!platforms.length || platforms.some((p) => !PLATFORMS.includes(p))) throw new Error(`platforms su degerlerden olmali: ${PLATFORMS}`)
  if (!platforms.includes('instagram')) throw new Error('platforms icinde instagram olmali (yalniz Facebook desteklenmiyor)')
  const item = {
    id: newId(taken), video: resolve(video), caption, hook, hookId, platforms,
    syntheticHuman: Boolean(syntheticHuman), aiLabel: Boolean(aiLabel),
    realPeople: Boolean(realPeople),
    status: 'draft', createdAt: new Date().toISOString(),
  }
  if (variant) item.variant = variant
  if (consentRef) item.consentRef = consentRef
  item.judge = judge(item)
  return item
}

export function approveItem(id) {
  const item = loadQueue().items.find((i) => i.id === id)
  if (!item) throw new Error(`Kuyrukta yok: ${id}`)
  if (item.status !== 'draft') throw new Error(`Sadece draft onaylanir (simdi: ${item.status})`)
  const result = judge(item)
  if (!result.ok) return { approved: false, item: updateItem(id, { judge: result }) }
  return { approved: true, item: updateItem(id, { judge: result, status: 'approved', approvedAt: new Date().toISOString(), approvalHash: approvalHash(item) }) }
}

const takenIds = (q) => new Set(q.items.map((i) => i.id))
const readText = (path) => readFileSync(path, 'utf8').trim()
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const str = (v) => (typeof v === 'string' ? v : undefined)

function commonFields(a) {
  return {
    platforms: str(a.platforms) ? a.platforms.split(',').map((p) => p.trim()) : undefined,
    syntheticHuman: a['synthetic-human'] === true,
    aiLabel: a['ai-label'] === true,
    realPeople: a['real-people'] === true,
    consentRef: str(a.consent),
  }
}

const verdict = (item) => {
  const lines = item.judge.issues.map((i) => `  [${i.severity}] ${i.rule}: ${i.message}`)
  return [`${item.id}  ${item.status}  judge ${item.judge.ok ? 'OK' : 'BLOK'}`, ...lines].join('\n')
}

function cmdAdd(a) {
  const caption = str(a.caption) ?? (str(a['caption-file']) ? readText(a['caption-file']) : undefined)
  const fields = { video: str(a.video), caption, hook: str(a.hook), hookId: str(a['hook-id']), variant: str(a.variant), ...commonFields(a) }
  const q = loadQueue()
  q.items.push(buildItem(fields, takenIds(q)))
  saveQueue(q)
  console.log(verdict(q.items.at(-1)))
}

function cmdMatrix(a) {
  if (!str(a['hooks-file']) || !str(a['captions-file'])) throw new Error('--hooks-file ve --captions-file gerekli')
  const hooks = readJson(a['hooks-file'])
  const captions = readJson(a['captions-file'])
  const q = loadQueue()
  const taken = takenIds(q)
  const made = hooks.flatMap((h) => captions.map((c) =>
    buildItem({ video: str(a.video), caption: c.text, hook: h.text, hookId: h.id, variant: `${h.id}x${c.id}`, ...commonFields(a) }, taken)))
  q.items.push(...made)
  saveQueue(q)
  made.forEach((i) => console.log(`${i.id}  ${i.variant}  judge ${i.judge.ok ? 'OK' : 'BLOK'}  (${i.judge.issues.length} bulgu)`))
  console.log(`${made.length} draft uretildi, ${made.filter((i) => i.judge.ok).length} judge OK`)
}

function cmdList(a) {
  const items = loadQueue().items.filter((i) => !a.status || i.status === a.status)
  if (!items.length) return console.log('Kuyruk bos.')
  for (const i of items) {
    console.log([i.id.padEnd(18), i.status.padEnd(10), (i.judge?.ok ? 'OK' : 'BLOK').padEnd(5), (i.variant ?? '-').padEnd(8), i.hook.slice(0, 50)].join(' '))
  }
}

function cmdRemove(id) {
  const q = loadQueue()
  if (!q.items.some((i) => i.id === id)) throw new Error(`Kuyrukta yok: ${id}`)
  q.items = q.items.filter((i) => i.id !== id)
  saveQueue(q)
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv
  const a = parseArgs(rest)
  const id = rest.find((x) => !x.startsWith('--'))
  if (cmd === 'add') cmdAdd(a)
  else if (cmd === 'matrix') cmdMatrix(a)
  else if (cmd === 'list') cmdList(a)
  else if (cmd === 'approve' && id) {
    const { approved, item } = approveItem(id)
    console.log(approved ? `Onaylandi: ${id}` : `Reddedildi, block var:\n${verdict(item)}`)
    if (!approved) process.exitCode = 1
  } else if (cmd === 'reject' && id) {
    const current = loadQueue().items.find((i) => i.id === id)
    if (!current) throw new Error(`Kuyrukta yok: ${id}`)
    if (!['draft', 'approved'].includes(current.status)) throw new Error(`Sadece draft/approved reddedilir (simdi: ${current.status})`)
    updateItem(id, { status: 'failed', error: 'rejected' })
    console.log(`Reddedildi: ${id}`)
  } else if (cmd === 'remove' && id) {
    cmdRemove(id)
    console.log(`Silindi: ${id}`)
  } else {
    console.error('Kullanim: add | list [--status x] | approve <id> | reject <id> | remove <id> | matrix')
    process.exitCode = 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (e) { console.error(e.message); process.exitCode = 1 }
}
