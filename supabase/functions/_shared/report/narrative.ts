// Şablon anlatı: olgulardan ve kapanış işaretlerinden gün raporunun yazısı. Saf, AI yok,
// ücretsiz. Aynı girdi aynı metni verir; ertesi gün havuzda bir sonrakine geçer.
//
// Ton: somut ve suçlamasız. Kaçan iş başarısızlık diye çerçevelenmez, program
// kaçırılınca sıfırlanmaz. Metin havuzları narrativeText.ts'te.

import { dayIndex } from './dates.ts'
import { NARRATIVE_TEXT, type NarrativeText } from './narrativeText.ts'
import { clip, fill, pick, type ReportLanguage } from './text.ts'
import type { DayCheckin, DayFacts, DayItem, DayNarrative, SkipReason } from './types.ts'

const MAX_LISTED = 3
const MAX_POSTPONED = 5
const MAX_WENT_WELL = 4
const FOCUS_NOTABLE_MINUTES = 25
const MOVEMENT_NOTABLE_MINUTES = 20
const STEPS_NOTABLE = 8000

/** Kapanış işaretlerini açık öğelere işler. Gerçek tamamlama (done) işaretin önüne geçer. */
export function applyCheckin(facts: DayFacts, checkin: DayCheckin): DayFacts {
  const marks = checkin.items
  if (!marks) return facts
  return {
    ...facts,
    items: facts.items.map((item) => {
      const mark = marks[item.key]
      if (!mark || item.outcome !== 'open') return item
      return { ...item, outcome: mark.outcome, reason: mark.reason ?? null }
    }),
  }
}

export interface DaySummary {
  /** Bugün beklenen iş sayısı (haftalık esnek, sayaçsız ve manevi işler hariç). */
  total: number
  done: number
  partial: number
  skipped: number
  /** Hiç işaretlenmemiş açık iş. */
  open: number
}

export function summarizeDay(facts: DayFacts): DaySummary {
  // Manevi ve ölçülmeyen iş metrik değildir: mobildeki halka (reportModel.summarize) da saymaz.
  const expected = facts.items.filter((i) => i.expected && i.area !== 'spiritual' && !i.untracked)
  const count = (outcome: DayItem['outcome']) => expected.filter((i) => i.outcome === outcome).length
  return { total: expected.length, done: count('done'), partial: count('partial'), skipped: count('skipped'), open: count('open') }
}

function habitId(item: DayItem): string {
  return item.key.slice('habit:'.length)
}

function listOf(items: readonly DayItem[]): string {
  const shown = items.slice(0, MAX_LISTED).map((i) => clip(i.title, 40))
  const rest = items.length - shown.length
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ')
}

function headlineOf(s: DaySummary, t: NarrativeText, seed: number): string {
  const vars = { done: s.done, total: s.total }
  if (s.total === 0) return pick(t.headline.empty, seed)
  if (s.done === s.total) return fill(pick(t.headline.all, seed), vars)
  if (s.done * 2 >= s.total) return fill(pick(t.headline.most, seed), vars)
  if (s.done > 0) return fill(pick(t.headline.some, seed), vars)
  return fill(pick(t.headline.none, seed), vars)
}

function wentWellOf(day: DayFacts, t: NarrativeText, seed: number): string[] {
  const out: string[] = []
  const done = day.items.filter((i) => i.expected && i.outcome === 'done')
  if (done.length > 0) out.push(fill(pick(t.wentWell.done, seed + 1), { list: listOf(done) }))

  // Beklenmeyen ama yapılan işler: sayaçlı haftalık alışkanlıkta haftalık ilerleme,
  // sayaçsız (is_untracked) işlerde yalnız ad yazılır, sayı ve seri yok.
  const week = new Map(day.habits_week.map((h) => [h.routine_id, h]))
  const flexible = day.items.filter((i) => !i.expected && i.outcome === 'done')
  const tracked = (i: DayItem) => i.kind === 'habit' && week.has(habitId(i))
  const weekly = flexible.find(tracked)
  const progress = weekly ? week.get(habitId(weekly)) : undefined
  if (weekly && progress) {
    out.push(fill(pick(t.wentWell.habit, seed + 2), { title: clip(weekly.title, 40), week: progress.done, target: progress.target }))
  }
  const soft = flexible.filter((i) => !tracked(i))
  if (soft.length > 0) out.push(fill(pick(t.wentWell.soft, seed + 3), { list: listOf(soft) }))

  const m = day.movement
  if (m.workout_done) out.push(pick(t.wentWell.workout, seed + 4))
  else if ((m.exercise_minutes ?? 0) >= MOVEMENT_NOTABLE_MINUTES) {
    out.push(fill(pick(t.wentWell.minutes, seed + 4), { minutes: m.exercise_minutes ?? 0 }))
  } else if ((m.steps ?? 0) >= STEPS_NOTABLE) {
    out.push(fill(pick(t.wentWell.steps, seed + 4), { steps: m.steps ?? 0 }))
  }

  if (day.focus_minutes >= FOCUS_NOTABLE_MINUTES) {
    out.push(fill(pick(t.wentWell.focus, seed + 5), { minutes: day.focus_minutes }))
  }
  const n = day.nutrition
  if (n && n.calorie_target) {
    const ratio = n.calories / n.calorie_target
    if (ratio >= 0.85 && ratio <= 1.15) out.push(pick(t.wentWell.nutrition, seed + 6))
  }
  return out.length > 0 ? out.slice(0, MAX_WENT_WELL) : [pick(t.wentWell.none, seed + 1)]
}

function noteOf(item: DayItem, t: NarrativeText, seed: number): string {
  const pool = item.reason !== null ? t.note[item.reason] : item.outcome === 'partial' ? t.note.partial : item.outcome === 'skipped' ? t.note.skipped : t.note.open
  const program = item.program ? fill(t.note.program, { program: `${item.program.done}/${item.program.target}` }) : ''
  return `${pick(pool, seed)}${program}`
}

function suggestionOf(day: DayFacts, pending: readonly DayItem[], t: NarrativeText, seed: number): string {
  const reasons = new Set<SkipReason>(pending.flatMap((i) => (i.reason ? [i.reason] : [])))
  const lowEnergy = reasons.has('energy') || (day.energy !== null && day.energy <= 2)
  const pool = reasons.has('avoided') ? t.suggestion.avoided
    : lowEnergy ? t.suggestion.energy
    : reasons.has('interrupted') ? t.suggestion.interrupted
    : reasons.has('time') || pending.length >= 3 ? t.suggestion.time
    : pending.length > 0 ? t.suggestion.leftover
    : day.items.some((i) => i.expected) ? t.suggestion.steady
    : t.suggestion.empty
  return pick(pool, seed + 7)
}

function futureSelfOf(day: DayFacts, t: NarrativeText, seed: number): string {
  const done = day.items.filter((i) => i.outcome === 'done')
  const program = done.find((i) => i.program !== null)
  if (program?.program) {
    const vars = { title: clip(program.title, 40), program: `${program.program.done}/${program.program.target}` }
    return fill(pick(t.futureSelf.program, seed + 8), vars)
  }
  const goal = done.find((i) => i.goal !== null && !i.untracked && i.area !== 'spiritual')
  if (goal?.goal) {
    return fill(pick(t.futureSelf.goal, seed + 8), { title: clip(goal.title, 40), goal: clip(goal.goal.title, 40) })
  }
  const work = done.find((i) => i.kind !== 'habit' && (i.area === null || i.area === 'career'))
  if (work) return fill(pick(t.futureSelf.work, seed + 8), { title: clip(work.title, 40) })
  const care = done.find((i) => i.area === 'health' || i.area === 'personal')
  if (care) return fill(pick(t.futureSelf.care, seed + 8), { title: clip(care.title, 40) })
  if (day.focus_minutes >= FOCUS_NOTABLE_MINUTES) {
    return fill(pick(t.futureSelf.focus, seed + 8), { minutes: day.focus_minutes })
  }
  return pick(t.futureSelf.generic, seed + 8)
}

/** Şablon anlatı. `facts` ham olgulardır, kapanış işaretleri burada işlenir. */
export function buildTemplateNarrative(facts: DayFacts, checkin: DayCheckin, language: ReportLanguage): DayNarrative {
  const day = applyCheckin(facts, checkin)
  const t = NARRATIVE_TEXT[language]
  const seed = dayIndex(day.date)
  const pending = day.items.filter((i) => i.expected && i.outcome !== 'done')

  return {
    source: 'template',
    headline: headlineOf(summarizeDay(day), t, seed),
    went_well: wentWellOf(day, t, seed),
    postponed: pending.slice(0, MAX_POSTPONED).map((item, n) => ({ title: item.title, note: noteOf(item, t, seed + n) })),
    suggestion: suggestionOf(day, pending, t, seed),
    future_self: futureSelfOf(day, t, seed),
  }
}
