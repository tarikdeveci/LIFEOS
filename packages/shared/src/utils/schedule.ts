/**
 * "Şu an neredeyim?" hesapları — saf fonksiyonlar, web ve mobil paylaşır.
 *
 * Tüm zaman karşılaştırmaları gün içi dakikaya (0-1439) indirgenerek yapılır.
 * Bir bloğun `start_time`/`end_time` alanları Postgres TIME tipinden gelir
 * ('HH:MM' veya 'HH:MM:SS'), tarih bilgisi taşımaz — bu yüzden gün karşılaştırması
 * her zaman ayrıca `date` alanı ile yapılmalı.
 */

import type { TimeBlock } from '../types/planning'
import { parseClockParts, toDateString } from './date'

export type BlockPhase = 'past' | 'active' | 'upcoming'

export interface BlockTiming {
  phase: BlockPhase
  /** Bloğun başlangıcı, gün içi dakika (0-1439) */
  startMinute: number
  /** Bloğun bitişi, gün içi dakika. Gece yarısını aşan blok 1440'a sabitlenir. */
  endMinute: number
  /** Blok süresi (dakika). En az 1. */
  durationMinutes: number
  /** Aktif blokta 0-1 arası ilerleme; geçmişte 1, gelecekte 0 */
  progress: number
  /** Aktif blokta bitişe kalan dakika, gelecekte tüm süre, geçmişte 0 */
  remainingMinutes: number
  /** Gelecek blokta başlangıca kalan dakika, aksi halde 0 */
  minutesUntilStart: number
  /** Aktif/geçmiş blokta başlangıçtan bu yana geçen dakika */
  elapsedMinutes: number
}

/** Bir Date'in gün içi dakikası (yerel saat) */
export function minutesOfDay(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** 'HH:MM[:SS]' → gün içi dakika */
export function clockToMinutes(time: string): number {
  const { h, m } = parseClockParts(time)
  return h * 60 + m
}

/** Gün içi dakika → 'HH:MM' */
export function minutesToClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)))
  const h = String(Math.floor(clamped / 60)).padStart(2, '0')
  const m = String(clamped % 60).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Dakikayı kısa süre etiketine çevirir: 95 → '1s 35d' (tr) / '1h 35m' (en).
 * 60'ın altında sadece dakika gösterir.
 */
export function formatDuration(minutes: number, lang: 'tr' | 'en' = 'tr'): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  const hourUnit = lang === 'tr' ? 's' : 'h'
  const minuteUnit = lang === 'tr' ? 'd' : 'm'

  if (h === 0) return `${m}${minuteUnit}`
  if (m === 0) return `${h}${hourUnit}`
  return `${h}${hourUnit} ${m}${minuteUnit}`
}

/**
 * Bloğun verilen ana göre konumunu hesaplar.
 *
 * `nowMinute` bloğun ait olduğu **günün** dakikası olmalı. Farklı bir gün
 * görüntülenirken `blockTimingForDate` kullan — bu fonksiyon tarih bilmez.
 */
export function blockTiming(
  block: Pick<TimeBlock, 'start_time' | 'end_time'>,
  nowMinute: number,
): BlockTiming {
  const startMinute = clockToMinutes(block.start_time)
  const rawEnd = clockToMinutes(block.end_time)
  // 00:00 bitiş veya ters aralık = gece yarısına kadar süren blok
  const endMinute = rawEnd <= startMinute ? 1440 : rawEnd
  const durationMinutes = Math.max(1, endMinute - startMinute)

  if (nowMinute < startMinute) {
    return {
      phase: 'upcoming',
      startMinute,
      endMinute,
      durationMinutes,
      progress: 0,
      remainingMinutes: durationMinutes,
      minutesUntilStart: startMinute - nowMinute,
      elapsedMinutes: 0,
    }
  }

  if (nowMinute >= endMinute) {
    return {
      phase: 'past',
      startMinute,
      endMinute,
      durationMinutes,
      progress: 1,
      remainingMinutes: 0,
      minutesUntilStart: 0,
      elapsedMinutes: durationMinutes,
    }
  }

  const elapsedMinutes = nowMinute - startMinute
  return {
    phase: 'active',
    startMinute,
    endMinute,
    durationMinutes,
    progress: elapsedMinutes / durationMinutes,
    remainingMinutes: endMinute - nowMinute,
    minutesUntilStart: 0,
    elapsedMinutes,
  }
}

/**
 * Görüntülenen gün bugünden farklıysa blok tamamen geçmiş ya da tamamen
 * gelecektir; `nowMinute` o gün için anlamsızdır. Bu sarmalayıcı onu düzeltir.
 */
export function blockTimingForDate(
  block: Pick<TimeBlock, 'start_time' | 'end_time' | 'date'>,
  now: Date = new Date(),
): BlockTiming {
  const today = toDateString(now)
  if (block.date < today) return blockTiming(block, 1440)
  if (block.date > today) return blockTiming(block, -1)
  return blockTiming(block, minutesOfDay(now))
}

export interface DayPosition {
  /** Şu an içinde bulunulan blok (varsa) */
  activeBlock: TimeBlock | null
  activeTiming: BlockTiming | null
  /** Şu andan sonra başlayan ilk blok */
  nextBlock: TimeBlock | null
  nextTiming: BlockTiming | null
  /** Biten blok sayısı */
  pastCount: number
  /** Şu anın gün içi dakikası */
  nowMinute: number
  /** Gün planı hiç başlamadı mı (tüm bloklar gelecekte) */
  beforeFirstBlock: boolean
  /** Günün tüm blokları bitti mi */
  afterLastBlock: boolean
}

/**
 * Bugünün blok listesi içindeki konumu tek geçişte çıkarır.
 * `blocks` aynı güne ait olmalı; sıralı olması gerekmez.
 *
 * Bloklar çakışıyorsa en son başlayan aktif blok seçilir — kullanıcı elle blok
 * eklerken çakışma engellenmiyor, bu yüzden "birden fazla aktif" durumu gerçek.
 */
export function getDayPosition(blocks: TimeBlock[], now: Date = new Date()): DayPosition {
  const nowMinute = minutesOfDay(now)

  let activeBlock: TimeBlock | null = null
  let activeTiming: BlockTiming | null = null
  let nextBlock: TimeBlock | null = null
  let nextTiming: BlockTiming | null = null
  let pastCount = 0

  for (const block of blocks) {
    const timing = blockTiming(block, nowMinute)

    if (timing.phase === 'past') {
      pastCount += 1
      continue
    }

    if (timing.phase === 'active') {
      if (!activeTiming || timing.startMinute >= activeTiming.startMinute) {
        activeBlock = block
        activeTiming = timing
      }
      continue
    }

    if (!nextTiming || timing.startMinute < nextTiming.startMinute) {
      nextBlock = block
      nextTiming = timing
    }
  }

  return {
    activeBlock,
    activeTiming,
    nextBlock,
    nextTiming,
    pastCount,
    nowMinute,
    beforeFirstBlock: blocks.length > 0 && pastCount === 0 && activeBlock === null,
    afterLastBlock: blocks.length > 0 && pastCount === blocks.length,
  }
}
