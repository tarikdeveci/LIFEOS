// Instagram Graph API (Facebook Login) client for Reels publishing and insights.
// Zero dependencies. `fetch` is injectable so tests never touch the network.
// The token is sent only in the Authorization header and is redacted from every error message.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_VERSION = 'v27.0'
const GRAPH = 'https://graph.facebook.com'
const RUPLOAD = 'https://rupload.facebook.com'
export const REEL_METRICS = [
  'views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions',
  'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time',
]

export function dataDir() {
  return process.env.ORGANIC_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), 'data')
}

// Tiny .env parser (KEY=VALUE, # comments, optional quotes). Real process.env wins over the file.
export function loadEnv(file = join(dataDir(), '.env'), env = process.env) {
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      if (env[m[1]] === undefined || env[m[1]] === '') env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return {
    token: env.META_ACCESS_TOKEN,
    igUserId: env.META_IG_USER_ID,
    pageId: env.META_PAGE_ID || undefined,
    version: env.META_GRAPH_VERSION || DEFAULT_VERSION,
  }
}

export function createClient({ token, igUserId, pageId, version = DEFAULT_VERSION, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('META_ACCESS_TOKEN tanimli degil.')
  if (!igUserId) throw new Error('META_IG_USER_ID tanimli degil.')

  // Every error leaving the client goes through here: token and access_token=... patterns are removed.
  const sanitize = (msg) => String(msg).split(token).join('[token]')
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[token]')
    .replace(/OAuth\s+[^\s"']+/g, 'OAuth [token]')
  const fail = (msg, extra = {}) => Object.assign(new Error(sanitize(msg)), extra)

  async function call(url, { method = 'GET', headers = {}, body } = {}) {
    let res
    let text
    try {
      res = await fetchImpl(url, { method, headers: { Authorization: `OAuth ${token}`, ...headers }, body })
      text = await res.text()
    } catch (e) {
      throw fail(`ag hatasi: ${e.message}`)
    }
    let json
    try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
    if (!res.ok || json.error) {
      const e = json.error ?? {}
      throw fail(`Meta HTTP ${res.status}: ${e.message ?? json.debug_info?.message ?? text.slice(0, 300)}`, { code: e.code, retriable: json.debug_info?.retriable })
    }
    return json
  }

  const get = (path, params = {}) => call(`${GRAPH}/${version}/${path}?${new URLSearchParams(params)}`)
  const post = (path, params = {}) => call(`${GRAPH}/${version}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })

  async function rupload(url, file) {
    const size = statSync(file).size
    const r = await call(url, { method: 'POST', headers: { offset: '0', file_size: String(size), 'Content-Type': 'application/octet-stream' }, body: readFileSync(file) })
    if (r.success !== true) throw fail(`yukleme basarisiz: ${JSON.stringify(r).slice(0, 300)}`)
    return r
  }

  return {
    // { used, total } of the 24h API publishing quota.
    async publishingLimit() {
      const r = await get(`${igUserId}/content_publishing_limit`, { fields: 'quota_usage,config' })
      const d = r.data?.[0] ?? {}
      return { used: d.quota_usage ?? 0, total: d.config?.quota_total ?? 100 }
    },

    // Step 1: resumable REELS container. cover_url must be public, so local files use thumb_offset (ms).
    async createReelContainer({ caption, shareToFeed = true, thumbOffset, aiGenerated = false }) {
      const params = { media_type: 'REELS', upload_type: 'resumable', caption: caption ?? '', share_to_feed: String(shareToFeed) }
      if (aiGenerated) params.is_ai_generated = 'true'
      if (thumbOffset !== undefined) params.thumb_offset = String(thumbOffset)
      return (await post(`${igUserId}/media`, params)).id
    },

    // Step 2: push the local mp4 to rupload.
    uploadReel(containerId, file) {
      return rupload(`${RUPLOAD}/ig-api-upload/${version}/${containerId}`, file)
    },

    async containerStatus(containerId) {
      const r = await get(containerId, { fields: 'status_code,status' })
      return { code: r.status_code, detail: r.status }
    },

    // Polls IN_PROGRESS with exponential backoff (5s doubling, capped at 60s) up to maxMs.
    async waitForContainer(containerId, { maxMs = 10 * 60_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
      let waited = 0
      let delay = 5000
      for (;;) {
        const { code, detail } = await this.containerStatus(containerId)
        if (code === 'FINISHED') return
        if (code === 'ERROR' || code === 'EXPIRED') throw fail(`container ${code}${detail ? `: ${detail}` : ''}`)
        if (waited >= maxMs) throw fail(`container ${maxMs / 60_000} dk icinde hazir olmadi (son durum: ${code})`)
        await sleep(delay)
        waited += delay
        delay = Math.min(delay * 2, 60_000)
      }
    },

    async publishContainer(containerId) {
      return (await post(`${igUserId}/media_publish`, { creation_id: containerId })).id
    },

    async permalink(mediaId) {
      return (await get(mediaId, { fields: 'permalink' })).permalink
    },

    // Returns { views, reach, ... avgWatchMs, totalWatchMs }. Only "unsupported metric" errors (code 100)
    // fall back to one request per metric; auth, permission, quota and network errors propagate.
    async mediaInsights(mediaId, metrics = REEL_METRICS) {
      const parse = (data) => Object.fromEntries((data ?? []).map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value]).filter(([, v]) => v !== undefined))
      let raw
      try {
        raw = parse((await get(`${mediaId}/insights`, { metric: metrics.join(',') })).data)
      } catch (e) {
        if (e.code !== 100) throw e
        raw = {}
        for (const m of metrics) {
          try { Object.assign(raw, parse((await get(`${mediaId}/insights`, { metric: m })).data)) } catch (e2) { if (e2.code !== 100) throw e2 }
        }
      }
      const { ig_reels_avg_watch_time: avgWatchMs, ig_reels_video_view_total_time: totalWatchMs, ...rest } = raw
      return { ...rest, avgWatchMs, totalWatchMs }
    },

    // Optional Facebook Page Reel (start, rupload, finish). Needs pageId and a Page token.
    async publishFacebookReel({ file, description, aiGenerated = false }) {
      if (!pageId) throw fail('META_PAGE_ID tanimli degil.')
      const start = await post(`${pageId}/video_reels`, { upload_phase: 'start' })
      await rupload(start.upload_url ?? `${RUPLOAD}/video-upload/${start.video_id}`, file)
      await post(`${pageId}/video_reels`, {
        upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED',
        description: description ?? '', is_ai_generated: String(aiGenerated),
      })
      return start.video_id
    },
  }
}
