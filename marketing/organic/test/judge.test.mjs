import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fold, judge, loadBrand } from '../judge.mjs'

const dir = mkdtempSync(join(tmpdir(), 'organic-judge-'))
const video = join(dir, 'a.mp4')
writeFileSync(video, 'x')
after(() => rmSync(dir, { recursive: true, force: true }))

const good = () => ({
  video, hook: 'Akşam 22:00\'de listede kaç madde kaldı?',
  caption: 'Listen var, günün yok. Profildeki linkten dene. #lifeos',
  platforms: ['instagram'], syntheticHuman: false, aiLabel: false,
})
const rules = (item, sev) => judge(item).issues.filter((i) => !sev || i.severity === sev).map((i) => i.rule)

describe('judge', () => {
  it('temiz item gecer', () => {
    const r = judge(good())
    assert.equal(r.ok, true)
    assert.deepEqual(r.issues, [])
  })

  it('brand.json okunur ve winningPatterns bos', () => {
    const b = loadBrand()
    assert.deepEqual(b.winningPatterns, [])
    assert.equal(b.limits.captionMax, 2200)
  })

  it('fold: Turkce buyuk/kucuk harf ve karakter duyarsiz', () => {
    assert.equal(fold('KİLO ÇIĞ ŞÖÜ'), 'kilo cig sou')
  })

  it('saglik iddiasi block (buyuk harf ve Turkce karakter)', () => {
    for (const text of ['KİLO VER hemen', 'Yağ yak', '5 kg ver', 'Lose weight fast', 'weight loss']) {
      assert.ok(rules({ ...good(), hook: text }, 'block').includes('health-claim'), text)
    }
  })

  it('olcek iddiasi block', () => {
    for (const text of ['10K+ kullanıcı', '%90 daha verimli', 'Binlerce kullanıcı seviyor', '3 kat daha verimli, 90% faster']) {
      assert.ok(rules({ ...good(), caption: `${text} indir` }, 'block').includes('unverified-scale'), text)
    }
  })

  it('kalori ile baslayan hook block, ortada gecerse warn', () => {
    const lead = rules({ ...good(), hook: 'Kalori saymaktan yoruldun mu?' })
    assert.ok(lead.includes('off-wedge-topic'))
    assert.equal(judge({ ...good(), hook: 'Kalori saymaktan yoruldun mu?' }).ok, false)
    const mid = judge({ ...good(), caption: 'Günün planı, antrenman da dahil. Linke bak.' })
    assert.equal(mid.ok, true)
    assert.ok(mid.issues.some((i) => i.rule === 'off-wedge-topic' && i.severity === 'warn'))
  })

  it('sentetik insan etiketsiz block, etiketliyse gecer', () => {
    assert.ok(rules({ ...good(), syntheticHuman: true }, 'block').includes('ai-label-missing'))
    assert.equal(judge({ ...good(), syntheticHuman: true, aiLabel: true }).ok, true)
  })

  it('gercek kisi consent olmadan block', () => {
    assert.ok(rules({ ...good(), realPeople: true }, 'block').includes('consent-missing'))
    assert.ok(rules({ ...good(), realPeople: true, consentRef: '  ' }, 'block').includes('consent-missing'))
    assert.equal(judge({ ...good(), realPeople: true, consentRef: 'izin-1' }).ok, true)
  })

  it('video yok veya mp4 degil block', () => {
    assert.ok(rules({ ...good(), video: join(dir, 'yok.mp4') }, 'block').includes('video-missing'))
    assert.ok(rules({ ...good(), video: join(dir, 'a.mov') }, 'block').includes('video-format'))
  })

  it('caption ve hashtag limitleri', () => {
    assert.ok(rules({ ...good(), caption: 'a'.repeat(2201) + ' link' }, 'block').includes('caption-length'))
    const tags31 = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ')
    assert.ok(rules({ ...good(), caption: `link ${tags31}` }, 'block').includes('hashtag-limit'))
    const tags6 = Array.from({ length: 6 }, (_, i) => `#t${i}`).join(' ')
    const r = judge({ ...good(), caption: `link ${tags6}` })
    assert.equal(r.ok, true)
    assert.ok(r.issues.some((i) => i.rule === 'hashtag-many' && i.severity === 'warn'))
  })

  it('unlu/fenomen taklidi block', () => {
    assert.ok(rules({ ...good(), caption: 'Ünlü fenomen kullanıyor, linke bak' }, 'block').includes('impersonation'))
  })

  it('warn kurallari: uzun hook, CTA yok, uzun tire', () => {
    const r = judge({ ...good(), hook: 'a'.repeat(91), caption: `Sadece bir cümle ${String.fromCharCode(0x2014)} bitti.` })
    assert.equal(r.ok, true)
    const warns = r.issues.map((i) => i.rule)
    for (const w of ['hook-length', 'cta-missing', 'long-dash']) assert.ok(warns.includes(w), w)
    assert.ok(r.issues.every((i) => i.severity === 'warn'))
  })
})
