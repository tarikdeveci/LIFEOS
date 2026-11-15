import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Mobil kaynakta i18n dosyaları dışında Türkçe metin kalmasın (Faz 4, WORKFLOW kapı 4).
// Türkçe karakterli string literal ya da JSX metni bulunursa test düşer. İki dilli
// yazılmış dallar (`tr ? 'Türkçe' : 'English'`, `{ tr: ..., en: ... }`) geçer.

const ROOT = join(import.meta.dirname, '../../apps/mobile')
const DIRS = ['app', 'src']
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/

// Türkçe içeriği bilerek taşıyan dosyalar: çeviri tabloları ve Türkçe girdiyi çözen veri.
const ALLOWED_FILES = new Set<string>([])

// Satır ya da hemen üstündeki iki satır dil seçen bir dal içeriyorsa metin iki dillidir.
// `lang: 'tr'` dil seçicideki satırdır: her dil kendi adıyla yazılır.
const BILINGUAL = /(\b(tr|isTr|isTurkish)\s*\?|===\s*'tr'|\blang:\s*'tr'|\b(tr|trLabel|trSub|trTitle|trBody)\s*:)/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === 'node_modules') continue
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(ts|tsx)$/.test(name) && !/^i18n/.test(name)) out.push(p)
  }
  return out
}

function stripComments(line: string): string {
  const t = line.trim()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) return ''
  return line.replace(/\s\/\/\s.*$/, '')
}

const LITERAL = /(['"`])((?:\\.|(?!\1).)*?)\1/g
const JSX_TEXT = />([^<>{}]*)</g

export function findTurkishLiterals(src: string): { line: number; text: string }[] {
  const lines = src.split(/\r?\n/)
  const hits: { line: number; text: string }[] = []
  let inBlock = false
  lines.forEach((raw, i) => {
    // Çok satırlı yorumun devam satırları `*` ile başlamayabilir.
    if (inBlock) {
      if (raw.includes('*/')) inBlock = false
      return
    }
    // Yalnız satır yorumla başlıyorsa: 'image/*' gibi metinler yorum açmaz.
    if (/^\s*\{?\/\*/.test(raw) && !raw.includes('*/', raw.indexOf('/*') + 2)) inBlock = true
    const line = stripComments(raw)
    if (!line || /console\.(log|warn|error|info)/.test(line)) return
    const context = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
    if (BILINGUAL.test(context)) return
    const texts = [...line.matchAll(LITERAL)].map((m) => m[2]).concat([...line.matchAll(JSX_TEXT)].map((m) => m[1]))
    const tr = texts.find((t) => TR_CHARS.test(t))
    if (tr) hits.push({ line: i + 1, text: tr.slice(0, 60) })
  })
  return hits
}

test('mobil kaynakta i18n dışında Türkçe metin yok', () => {
  const problems: string[] = []
  for (const d of DIRS) {
    for (const file of sourceFiles(join(ROOT, d))) {
      const rel = relative(ROOT, file).split(sep).join('/')
      if (ALLOWED_FILES.has(rel)) continue
      for (const h of findTurkishLiterals(readFileSync(file, 'utf8'))) problems.push(`${rel}:${h.line} ${h.text}`)
    }
  }
  assert.deepEqual(problems, [], `i18n dosyasına taşınmamış ${problems.length} Türkçe metin:\n${problems.join('\n')}`)
})

test('tarayıcı: iki dilli dal ve yorum geçer, tek dilli metin yakalanır', () => {
  assert.equal(findTurkishLiterals("const a = tr ? 'Kaydedildi' : 'Saved'").length, 0)
  assert.equal(findTurkishLiterals("// Türkçe yorum").length, 0)
  assert.equal(findTurkishLiterals("{ tr: 'Öğün', en: 'Meal' }").length, 0)
  assert.equal(findTurkishLiterals("Alert.alert('Hata', 'Öğün eklenemedi')").length, 1)
  assert.equal(findTurkishLiterals('<Text style={s}>Düzenle</Text>').length, 1)
  assert.equal(findTurkishLiterals('{/* başlangıç\n   bir şey eksik mi */}\n<View />').length, 0)
  assert.equal(findTurkishLiterals("{ lang: 'tr', label: 'Türkçe' }").length, 0)
})

test('Faz 4 modülleri kendi önekini taşıyor, ana tablodaki anahtarları ezmiyor', async () => {
  const acc = await import('../../apps/mobile/src/i18nAccount.ts')
  const nut = await import('../../apps/mobile/src/i18nNutrition.ts')
  const misc = await import('../../apps/mobile/src/i18nMisc.ts')
  const mods: [string, Record<string, string>, Record<string, string>][] = [
    ['acc_', acc.accountEn, acc.accountTr],
    ['nut_', nut.nutritionEn, nut.nutritionTr],
    ['misc_', misc.miscEn, misc.miscTr],
  ]
  for (const [prefix, en, tr] of mods) {
    assert.deepEqual(Object.keys(en).filter((k) => !k.startsWith(prefix)), [], `${prefix} öneki eksik`)
    assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort(), `${prefix} en ve tr anahtarları farklı`)
    for (const v of [...Object.values(en), ...Object.values(tr)]) assert.ok(!/[–—]/.test(v), `uzun tire: ${v}`)
  }
})
