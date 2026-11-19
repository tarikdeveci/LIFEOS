// Publishes approved Reels to Instagram (and optionally a Facebook Page).
// Default is a DRY RUN; nothing is uploaded without --live. Never republishes automatically.
// Usage: node marketing/organic/publish.mjs [--live] [--id <id>] [--max N] [--reconcile]

import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from '../lib/capture.mjs'
import { createClient, dataDir, loadEnv } from './meta.mjs'

const errMsg = (e) => (e instanceof Error ? e.message : String(e))
const STALE_LOCK_MS = 2 * 3600_000

// Exclusive lock so two publishers never run at once. A stale lock only warns: delete it by hand.
export function acquireLock(file = join(dataDir(), 'publish.lock'), log = console.log) {
  mkdirSync(join(file, '..'), { recursive: true })
  try {
    const fd = openSync(file, 'wx')
    writeSync(fd, `${process.pid} ${new Date().toISOString()}`)
    closeSync(fd)
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
    const ageMs = Date.now() - statSync(file).mtimeMs
    if (ageMs > STALE_LOCK_MS) log(`UYARI: ${file} ${Math.round(ageMs / 3600_000)} saattir duruyor, eski olabilir. Kontrol edip elle sil.`)
    throw new Error(`Baska yayinci calisiyor (kilit: ${file}).`)
  }
  return () => { try { unlinkSync(file) } catch { /* already gone */ } }
}

// Stages: before media_publish a failure is "failed"; from the moment media_publish is sent the
// outcome is unknown, so any error becomes "uncertain" (the reel may be live).
async function publishOne({ client, item, updateItem, log, sleep }) {
  updateItem(item.id, { status: 'publishing', error: undefined })
  let sent = false
  try {
    if (!existsSync(item.video)) throw new Error(`video dosyasi yok: ${item.video}`)
    const aiGenerated = Boolean(item.aiLabel)
    const container = await client.createReelContainer({ caption: item.caption, shareToFeed: true, thumbOffset: item.thumbOffset, aiGenerated })
    updateItem(item.id, { containerId: container })
    await client.uploadReel(container, item.video)
    await client.waitForContainer(container, { sleep })
    sent = true
    const igMediaId = await client.publishContainer(container)
    const permalink = await client.permalink(igMediaId).catch(() => undefined)
    updateItem(item.id, { status: 'published', publishedAt: new Date().toISOString(), igMediaId, permalink })
    log(`  yayinlandi: ${permalink ?? igMediaId}`)

    if (item.platforms.includes('facebook')) {
      try {
        const fbVideoId = await client.publishFacebookReel({ file: item.video, description: item.caption, aiGenerated })
        updateItem(item.id, { fbVideoId })
        log(`  facebook reel: ${fbVideoId}`)
      } catch (e) {
        updateItem(item.id, { error: `facebook: ${errMsg(e)}` })
        log(`  UYARI facebook basarisiz (instagram yayinda kaldi): ${errMsg(e)}`)
      }
    }
    return true
  } catch (e) {
    const status = sent ? 'uncertain' : 'failed'
    updateItem(item.id, { status, error: errMsg(e) })
    log(sent ? `  BELIRSIZ: media_publish sonucu bilinmiyor, Instagram'i kontrol et, sonra --reconcile calistir (${errMsg(e)})` : `  HATA: ${errMsg(e)}`)
    return false
  }
}

// Checks judge and approval hash against the current item. Returns null when fine, else a reason.
function precheck(item, { judge, approvalHash, log }) {
  const verdict = judge(item)
  if (!verdict.ok) {
    log(`ATLANDI ${item.id}: judge bloke etti, approved'da birakildi`)
    for (const i of verdict.issues ?? []) log(`    [${i.severity}] ${i.rule}: ${i.message}`)
    return 'judge'
  }
  if (item.syntheticHuman && !item.aiLabel) log(`UYARI ${item.id}: syntheticHuman=true ama aiLabel yok`)
  let hash
  try { hash = approvalHash(item) } catch (e) { log(`ATLANDI ${item.id}: onay ozeti hesaplanamadi (${errMsg(e)})`); return 'hash-error' }
  if (hash !== item.approvalHash) return 'hash'
  return null
}

// publishing/uncertain items: ask Meta what became of the container. PUBLISHED is recorded without a
// media id (the container status does not return one); anything else is failed. No republishing.
export async function reconcile({ client, loadQueue, updateItem, log = console.log }) {
  for (const item of loadQueue().items.filter((i) => ['publishing', 'uncertain'].includes(i.status))) {
    if (!item.containerId) { updateItem(item.id, { status: 'failed', error: 'reconcile: containerId yok, yayin olmadi sayildi' }); log(`${item.id}: containerId yok -> failed`); continue }
    let code
    try { code = (await client.containerStatus(item.containerId)).code } catch (e) { log(`${item.id}: durum okunamadi, degistirilmedi (${errMsg(e)})`); continue }
    if (code === 'PUBLISHED') {
      updateItem(item.id, { status: 'published', publishedAt: new Date().toISOString(), error: 'igMediaId bilinmiyor: permalink icin Instagram\'da elle kontrol et' })
      log(`${item.id}: PUBLISHED (igMediaId bulunamadi, permalink icin elle kontrol et)`)
    } else {
      updateItem(item.id, { status: 'failed', error: `reconcile: container durumu ${code}, yayinlanmadi` })
      log(`${item.id}: ${code} -> failed`)
    }
  }
}

// Dependencies are injected so tests can run without queue/judge files or network.
export async function runPublish({ client, loadQueue, updateItem, judge, approvalHash, args = {}, log = console.log, sleep }) {
  const live = args.live === true
  const max = Number.isInteger(Number(args.max)) && Number(args.max) > 0 ? Number(args.max) : 1
  const wanted = (i) => args.id === undefined || i.id === String(args.id)
  const ctx = { judge, approvalHash, log }

  const stuck = loadQueue().items.filter((i) => ['publishing', 'uncertain'].includes(i.status))
  for (const i of stuck) log(`UYARI ${i.id}: durum ${i.status}${i.containerId ? ` (container ${i.containerId})` : ''}, Instagram'i kontrol et, sonra --reconcile calistir`)

  let quota
  if (client) {
    try { quota = await client.publishingLimit(); log(`Kota: ${quota.used}/${quota.total} (24 saat)`) } catch (e) { log(`Kota okunamadi: ${errMsg(e)}`) }
  }
  if (live && !client) throw new Error('Canli yayin icin META_ACCESS_TOKEN ve META_IG_USER_ID gerekli.')

  const candidates = loadQueue().items.filter((i) => i.status === 'approved' && wanted(i))
  const results = []
  let attempted = 0
  const picked = []
  for (const c of candidates) {
    if (attempted >= max) break
    // Fresh read right before acting: the queue may have changed since the listing.
    const item = loadQueue().items.find((i) => i.id === c.id)
    if (!item || item.status !== 'approved') { log(`ATLANDI ${c.id}: durum degisti`); continue }
    const reason = precheck(item, ctx)
    if (reason === 'hash') {
      if (live) updateItem(item.id, { status: 'draft', approvalHash: undefined })
      log(`ATLANDI ${item.id}: onaydan sonra icerik degisti, yeniden onayla${live ? ' (draft yapildi)' : ''}`)
      continue
    }
    if (reason) continue
    attempted++
    if (!live) { picked.push(item); continue }
    if (quota && quota.used >= quota.total) { log('Kota doldu, duruldu.'); break }
    log(`Yayinlaniyor: ${item.id}`)
    if (await publishOne({ client, item, updateItem, log, sleep })) results.push(item.id)
    if (quota) quota.used++
  }

  if (!live) {
    log(`DRY RUN: ${picked.length} item yayinlanacak (max ${max})`)
    for (const i of picked) log(`  ${i.id} [${i.platforms.join(',')}] ${i.hookId ?? ''} ${i.video}`)
    log('Gercek yayin icin --live ekle.')
  }
  return results
}

async function main() {
  const args = parseArgs()
  const env = loadEnv()
  const { loadQueue, updateItem, approvalHash } = await import('./queue.mjs')
  const { judge } = await import('./judge.mjs')
  const client = env.token && env.igUserId ? createClient(env) : undefined

  if (args.live === true || args.reconcile === true) {
    if (!client) throw new Error('META_ACCESS_TOKEN ve META_IG_USER_ID gerekli.')
    const release = acquireLock()
    try {
      if (args.reconcile === true) await reconcile({ client, loadQueue, updateItem })
      else await runPublish({ client, loadQueue, updateItem, judge, approvalHash, args })
    } finally { release() }
  } else {
    await runPublish({ client, loadQueue, updateItem, judge, approvalHash, args })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(errMsg(e)); process.exit(1) })
}
