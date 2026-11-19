// Yayin oncesi kapi: kirmizi cizgileri kontrol eder. block varsa ok=false.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BRAND_PATH = join(dirname(fileURLToPath(import.meta.url)), 'brand.json')

export function loadBrand() {
  return JSON.parse(readFileSync(BRAND_PATH, 'utf8'))
}

// tr-TR kucuk harf, sonra Turkce karakterleri sadelestir (desenler ASCII).
export function fold(text) {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
}

const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const compile =(sources) => sources.map((s) => new RegExp(s, 'u'))
const matches = (regexes, text) => regexes.some((re) => re.test(text))
const startsWith = (regexes, text) => {
  const lead = text.replace(/^[^\p{L}\p{N}]+/u, '')
  return regexes.some((re) => new RegExp(`^(?:${re.source})`, 'u').test(lead))
}
const countHashtags = (text) => (String(text ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? []).length

export function judge(item, brand = loadBrand()) {
  const issues = []
  const add = (rule, severity, message) => issues.push({ rule, severity, message })
  const { limits, patterns } = brand
  const hook = fold(item.hook)
  const caption = fold(item.caption)
  const both = `${hook}\n${caption}`
  const rx = Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, compile(v)]))

  if (matches(rx.health, both)) add('health-claim', 'block', 'Saglik/kilo iddiasi var.')
  if (matches(rx.scale, both)) add('unverified-scale', 'block', 'Dogrulanamayan olcek veya sayisal iddia var.')
  if (matches(rx.impersonation, both)) add('impersonation', 'block', 'Unlu/fenomen ima eden ifade var.')

  if (matches(rx.topics, both)) {
    const lead = startsWith(rx.topics, hook) || startsWith(rx.topics, caption)
    add('off-wedge-topic', lead ? 'block' : 'warn',
      lead ? 'Hook veya caption kalori/makro/antrenmanla basliyor.' : 'Kalori/makro/antrenman geciyor, kama disi.')
  }

  if (item.syntheticHuman && !item.aiLabel) {
    add('ai-label-missing', 'block', 'Sentetik insan var ama aiLabel false.')
  }

  if (item.realPeople && !String(item.consentRef ?? '').trim()) {
    add('consent-missing', 'block', 'Gercek kisi var ama consentRef bos (yazili riza kaydi olmadan girmez).')
  }

  const video = String(item.video ?? '')
  if (!video.toLowerCase().endsWith('.mp4')) add('video-format', 'block', 'Video .mp4 degil.')
  else if (!existsSync(video)) add('video-missing', 'block', 'Video dosyasi bulunamadi.')

  const captionLen = [...String(item.caption ?? '')].length
  if (captionLen > limits.captionMax) add('caption-length', 'block', `Caption ${captionLen} karakter (limit ${limits.captionMax}).`)
  const tags = countHashtags(item.caption)
  if (tags > limits.hashtagMax) add('hashtag-limit', 'block', `${tags} hashtag (limit ${limits.hashtagMax}).`)
  else if (tags > limits.hashtagWarn) add('hashtag-many', 'warn', `${tags} hashtag (onerilen en fazla ${limits.hashtagWarn}).`)

  const hookLen = [...String(item.hook ?? '')].length
  if (hookLen > limits.hookWarn) add('hook-length', 'warn', `Hook ${hookLen} karakter (onerilen en fazla ${limits.hookWarn}).`)
  if (!matches(rx.cta, caption)) add('cta-missing', 'warn', 'Caption icinde CTA yok (indir, dene, link, profil).')
  if (LONG_DASH.test(`${item.hook ?? ''}${item.caption ?? ''}`)) add('long-dash', 'warn', 'Uzun tire kullanilmis.')

  return { ok: !issues.some((i) => i.severity === 'block'), issues }
}
