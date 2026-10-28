#!/usr/bin/env node
// Persona ajanının emülatördeki eli ve gözü: ekranı metin olarak döker, numarayla dokunur.
// Ekran görüntüsü kullanılmaz (kota kuralı). Her eylemden sonra yeni ekranı basar ve adım sayar.
//
//   node ekran.mjs                 ekranı dök
//   node ekran.mjs dokun <n>       son dökümdeki n numaralı öğeye dokun
//   node ekran.mjs dokun <x> <y>   koordinata dokun
//   node ekran.mjs yaz "<metin>"   odaktaki alana yaz (önce alana dokun)
//   node ekran.mjs geri            Android geri tuşu
//   node ekran.mjs kaydir asagi|yukari
//   node ekran.mjs ac              uygulamayı aç (tr.lifeos.app)
//   node ekran.mjs sifirla         adım sayacını sıfırla (her senaryo başında)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAKET = 'tr.lifeos.app'
const DIZIN = join(dirname(fileURLToPath(import.meta.url)), 'raporlar')
const DURUM = join(DIZIN, '.son-ekran.json')
const CIHAZ_XML = '/sdcard/lifeos-ui.xml'

const sdk = process.env.ANDROID_HOME || (process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'))
const ADB = sdk && existsSync(join(sdk, 'platform-tools', 'adb.exe')) ? join(sdk, 'platform-tools', 'adb.exe') : 'adb'
const MAESTRO = join(process.env.USERPROFILE || process.env.HOME || '', '.maestro', 'maestro', 'bin', process.platform === 'win32' ? 'maestro.bat' : 'maestro')

function adb(...args) {
  return execFileSync(ADB, args, { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] })
}

function bekle(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function durumOku() {
  return existsSync(DURUM) ? JSON.parse(readFileSync(DURUM, 'utf8')) : { adim: 0, ogeler: [] }
}

function durumYaz(d) {
  mkdirSync(DIZIN, { recursive: true })
  writeFileSync(DURUM, JSON.stringify(d))
}

// uiautomator XML'i ve Maestro JSON'u aynı düz listeye çevrilir.
function xmlOgeleri(xml) {
  const ogeler = []
  for (const etiket of xml.match(/<node [^>]*>/g) ?? []) {
    const a = {}
    for (const [, k, v] of etiket.matchAll(/([\w-]+)="([^"]*)"/g)) a[k] = v
    ogeler.push({ metin: a.text, aciklama: a['content-desc'], ipucu: a.hint, sinif: a.class, bounds: a.bounds,
      tiklanir: a.clickable === 'true', secili: a.checked === 'true' || a.selected === 'true',
      odak: a.focused === 'true', pasif: a.enabled === 'false', kayar: a.scrollable === 'true' })
  }
  return ogeler
}

function maestroOgeleri(dugum, liste = []) {
  const a = dugum.attributes ?? {}
  if (a.bounds) liste.push({ metin: a.text, aciklama: a.accessibilityText, ipucu: a.hintText, sinif: a.class, bounds: a.bounds,
    tiklanir: a.clickable === 'true', secili: a.checked === 'true' || a.selected === 'true',
    odak: a.focused === 'true', pasif: a.enabled === 'false', kayar: a.scrollable === 'true' })
  for (const c of dugum.children ?? []) maestroOgeleri(c, liste)
  return liste
}

function hamDokum() {
  // "could not get idle state" eski XML'i bırakır: önce sil, sonra boş mu diye bak.
  for (let deneme = 0; deneme < 3; deneme++) {
    try {
      adb('shell', 'rm', '-f', CIHAZ_XML)
      adb('shell', 'uiautomator', 'dump', CIHAZ_XML)
      const xml = adb('exec-out', 'cat', CIHAZ_XML)
      if (xml.includes('<hierarchy')) return xmlOgeleri(xml)
    } catch { /* tekrar dene */ }
    bekle(1000)
  }
  if (existsSync(MAESTRO)) {
    const cikti = execFileSync(MAESTRO, ['hierarchy'], { encoding: 'utf8', timeout: 60000, shell: process.platform === 'win32' })
    return maestroOgeleri(JSON.parse(cikti.slice(cikti.indexOf('{'))))
  }
  throw new Error('Ekran dökülemedi (uiautomator 3 kez başarısız, Maestro yok). Biraz bekleyip tekrar dene.')
}

function merkez(bounds) {
  const s = bounds.match(/\d+/g).map(Number)
  return { x: Math.round((s[0] + s[2]) / 2), y: Math.round((s[1] + s[3]) / 2), w: s[2] - s[0], h: s[3] - s[1] }
}

function dok() {
  const d = durumOku()
  // 44 dp sınırı piksele çevrilir; yoğunluk cihazdan bir kez okunur.
  d.olcek ??= Number(adb('shell', 'wm', 'density').match(/(\d+)\s*$/m)?.[1] ?? 160) / 160
  const ogeler = []
  let sonDokunulur = null
  for (const o of hamDokum()) {
    // İkon fontları (Ionicons) özel kullanım alanı karakterleriyle gelir; okunacak metin değil.
    const temiz = (s) => s?.replace(/[-]/g, '').trim()
    const ikon = /[-]/.test(o.metin ?? '')
    const etiket = [temiz(o.metin), temiz(o.aciklama), o.ipucu && `ipucu: ${o.ipucu}`].filter(Boolean).join(' | ')
    if (!etiket && !ikon && !o.tiklanir && !o.kayar) continue
    const m = merkez(o.bounds)
    if (m.w <= 0 || m.h <= 0) continue
    // Dokunulur öğenin içindeki aynı metni ikinci kez listeleme.
    const s = sonDokunulur
    if (!o.tiklanir && s && m.x >= s.x - s.w / 2 && m.x <= s.x + s.w / 2 && m.y >= s.y - s.h / 2 && m.y <= s.y + s.h / 2
      && (!etiket || s.etiket.includes(etiket))) continue
    const tur = o.sinif?.includes('EditText') ? 'alan' : o.tiklanir ? 'dokunulur' : o.kayar ? 'kayar' : 'metin'
    const bayrak = [o.secili && 'seçili', o.odak && 'odakta', o.pasif && 'pasif', o.tiklanir && (m.w < 44 * d.olcek || m.h < 44 * d.olcek) && 'küçük hedef'].filter(Boolean)
    const ad = etiket || (ikon ? '(ikon, etiketsiz)' : '(etiketsiz)')
    if (o.tiklanir) sonDokunulur = { ...m, etiket }
    ogeler.push({ ...m, satir: `"${ad}" ${tur}${bayrak.length ? ' [' + bayrak.join(', ') + ']' : ''} @${m.x},${m.y}` })
  }
  d.ogeler = ogeler.map(({ x, y }) => ({ x, y }))
  durumYaz(d)
  console.log(`adım ${d.adim} | ${ogeler.length} öğe`)
  ogeler.forEach((o, i) => console.log(`[${i}] ${o.satir}`))
}

// adb "input text" ASCII dışını yazamıyor; Türkçe harfler en yakın ASCII'ye çevrilir.
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' }

function eylem(fn) {
  const d = durumOku()
  fn(d)
  d.adim += 1
  durumYaz(d)
  bekle(1200)
  dok()
}

const [komut, ...arg] = process.argv.slice(2)
switch (komut) {
  case undefined:
  case 'ekran':
    dok()
    break
  case 'dokun':
    eylem((d) => {
      const hedef = arg.length === 2 ? { x: +arg[0], y: +arg[1] } : d.ogeler[+arg[0]]
      if (!hedef) throw new Error(`Son dökümde [${arg[0]}] yok; önce ekranı dök.`)
      adb('shell', 'input', 'tap', String(hedef.x), String(hedef.y))
    })
    break
  case 'yaz': {
    const ham = arg.join(' ')
    const ascii = [...ham].map((c) => TR[c] ?? c).join('')
    if (ascii !== ham) console.log(`not: Türkçe harfler çevrildi: "${ascii}" (araç sınırı, bulgu değil)`)
    eylem(() => adb('shell', 'input', 'text', ascii.replace(/([\\'"`$&|;<>()*?!#~])/g, '\\$1').replace(/ /g, '%s')))
    break
  }
  case 'geri':
    eylem(() => adb('shell', 'input', 'keyevent', '4'))
    break
  case 'kaydir': {
    const yukari = arg[0] === 'yukari'
    eylem(() => adb('shell', 'input', 'swipe', '540', yukari ? '700' : '1700', '540', yukari ? '1700' : '700', '300'))
    break
  }
  case 'ac':
    eylem(() => adb('shell', 'monkey', '-p', PAKET, '-c', 'android.intent.category.LAUNCHER', '1'))
    break
  case 'sifirla':
    durumYaz({ adim: 0, ogeler: [], olcek: durumOku().olcek })
    console.log('adım sayacı sıfırlandı')
    break
  default:
    console.error(`Bilinmeyen komut: ${komut}`)
    process.exit(1)
}
