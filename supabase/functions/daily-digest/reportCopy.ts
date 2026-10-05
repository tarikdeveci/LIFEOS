// Günlük döngünün bildirim metinleri: akşam rapor bildirimi ve sabah özeti.
// Saf fonksiyonlar (veritabanına dokunmaz). copy.ts ile aynı desen: güne göre dönen
// havuzlar, aynı kullanıcı aynı gün hep aynı metni alır, sayıdan sonra ek yok.
//
// Ton: suçlamasız, kaçan iş başarısızlık diye çerçevelenmez. Sayaçsız (is_untracked)
// rutinler ve haftalık esnek alışkanlıklar özetin sayısına girmez (expected=false),
// dolayısıyla metinde sayı ya da seri olarak geçmez.

import type { BriefItem, DailyBrief } from '../_shared/brief.ts'
import type { DaySummary } from '../_shared/report/narrative.ts'
import { clip, fill, lines, pick, withSpecial } from '../_shared/report/text.ts'
import type { Copy, DayContext } from './copy.ts'

// Akşam

// Başlık havuzu 7, gövde havuzları 3 ile 5: aynı ikili sık tekrarlanmasın.
const EVENING_TITLES = [
  'Günün raporu hazır',
  'Bugünün özeti seni bekliyor',
  'Gün kapanıyor, raporun hazır',
  'Bugün nasıl geçti? Rapor hazır',
  'Akşam raporun hazır',
  'Günü kapatma vakti',
  'Bugünün kısa değerlendirmesi hazır',
]

const EVENING_ALL = [
  '{done}/{total} iş tamam. Neler iyi gitti, raporda.',
  'Bugün tuttu: {done}/{total}. Ayrıntılar raporda.',
  '{total} iş vardı, hepsi bitti. İyi giden şeyler raporda.',
  'Plan tamam: {done}/{total}. Yarın için tek bir öneri de var.',
]

const EVENING_SOME = [
  '{done}/{total} iş tamam. Kalanlar için bir dokunuşla sebep işaretleyebilirsin.',
  'Bugün {done}/{total}. Yarını kolaylaştıracak bir öneri raporda.',
  '{done} iş tamamlandı, {rest} iş açık. Raporda iyi giden ve yarına dair öneri var.',
  'Bugünün özeti: {done}/{total} tamam. Açık kalanlara raporda bakabilirsin.',
]

const EVENING_NONE = [
  'Bugün plan tutmadı, sorun değil. Raporda yarını kolaylaştıracak bir öneri var.',
  'Zor bir gün olmuş olabilir. Raporda suçlamasız bir özet seni bekliyor.',
  'Bugün işler yürümedi, bu bir karne değil. Raporda yarın için bir öneri var.',
  'Plan bugün tutmadı. Neden olduğuna raporda bir dokunuşla bakabilirsin.',
  'Her gün plana uymaz. Raporda yarını hafifletecek bir öneri var.',
]

const EVENING_EMPTY = [
  'Bugün planlı iş yoktu. Günün özeti yine de hazır.',
  'Sakin bir gündü. Raporda küçük bir değerlendirme var.',
  'Takvim sakindi. Raporda bugünün kısa bir özeti var.',
  'Planlı iş olmasa da gün kayda geçti. Raporda bakabilirsin.',
]

/** Öğün girilmemiş olsa da gider: rapor kalori değil günün tamamı hakkında. */
export function eveningReportCopy(s: DaySummary, ctx: DayContext): Copy {
  const special = ctx.weekday === 5 ? 'Haftanın son raporu hazır'
    : ctx.weekday === 0 ? 'Yeni haftadan önce günün raporu'
    : null
  const vars = { done: s.done, total: s.total, rest: s.total - s.done }
  const body = s.total === 0 ? pick(EVENING_EMPTY, ctx.seed)
    : s.done === s.total ? fill(pick(EVENING_ALL, ctx.seed), vars)
    : s.done > 0 ? fill(pick(EVENING_SOME, ctx.seed), vars)
    : pick(EVENING_NONE, ctx.seed)
  return { title: withSpecial(special, EVENING_TITLES, ctx.seed), body }
}

// Sabah

const CARE_LABELS = ['Bakım', 'Kendine', 'Sağlık ve bakım']
const SPIRIT_LABELS = ['Ayrıca', 'Bir de', 'Planda ayrıca']

function morningTitle(n: number, ctx: DayContext): string {
  if (n === 1) {
    const special = ctx.weekday === 1 ? 'Yeni haftanın önceliği' : null
    return withSpecial(special, ['Bugünün önceliği', 'Bugün tek bir şey öne çıkıyor', 'Günaydın, bugünün işi bu'], ctx.seed)
  }
  const special = ctx.weekday === 1 ? `Yeni haftanın ${n} önceliği`
    : ctx.weekday === 5 ? `Cuma için ${n} öncelik`
    : null
  return withSpecial(special, [
    `Bugünün ${n} önceliği`,
    `Günaydın, bugün ${n} iş öne çıkıyor`,
    `Bugün odak: ${n} iş`,
    `Günün ${n} ana işi`,
    `${n} iş bugünün önünde`,
  ], ctx.seed)
}

function label(item: BriefItem): string {
  return `${clip(item.title, 40)}${item.start_time ? ` (${item.start_time})` : ''}`
}

/**
 * Sabah özeti: en çok 3 öncelik, 1 bakım, varsa manevi ya da sosyal plan. Yapılmış ve
 * adsız öğeler atlanır. Gösterilecek öncelik yoksa null: çağıran mevcut sabah metnine düşer.
 */
export function morningBriefCopy(brief: DailyBrief, ctx: DayContext): Copy | null {
  const shown = (item: BriefItem | null): BriefItem | null => (item && !item.done && item.title.trim() !== '' ? item : null)
  const priorities = brief.priorities.filter((p) => shown(p) !== null)
  if (priorities.length === 0) return null

  const care = shown(brief.care)
  const spirit = shown(brief.spirit)
  return {
    title: morningTitle(priorities.length, ctx),
    body: lines(
      ...priorities.map((p, i) => `${i + 1}. ${label(p)}`),
      care ? `${pick(CARE_LABELS, ctx.seed)}: ${label(care)}` : null,
      spirit ? `${pick(SPIRIT_LABELS, ctx.seed + 1)}: ${label(spirit)}` : null,
    ),
  }
}
