/**
 * Programa bağlı workout bloklarına program günü dağıtımı.
 *
 * Bir rutin bir programa bağlıysa (`routines.workout_program_id`) programın çalışma
 * günleri (A/B/C) rutinin bloklarına sırayla düşer. Sıra takvime değil yapılan
 * antrenmana göre ilerler (`programProgress.ts` ile aynı kural): kaçırılan blok
 * sıradaki günü kaydırmaz, atlanan ve ileri tarihli antrenman sayılmaz. Dağıtım
 * sunucuda saklanmaz, ekran her açılışta hesaplar.
 */

import type { ProgramDay, Workout, WorkoutProgram } from '../types'
import { fromDateString } from './date'
import { PROGRAM_DAY_SEPARATOR, workingDays } from './programProgress'

export interface ProgramBlockRef {
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM' veya 'HH:MM:SS' */
  start_time: string
}

/** Programdan yapılmış son antrenmanın günü: çalışma günü sırası ve tarihi. */
function lastDoneDay(
  days: ProgramDay[],
  program: WorkoutProgram,
  history: Workout[],
  today: string,
  dayLabel: (day: ProgramDay) => string,
): { index: number; date: string } | null {
  const todayTime = fromDateString(today).getTime()
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
  for (const workout of sorted) {
    if (workout.status === 'skipped') continue
    if (fromDateString(workout.date).getTime() > todayTime) continue
    const name = workout.name?.trim()
    if (!name || !name.startsWith(program.name + PROGRAM_DAY_SEPARATOR)) continue
    const suffix = name.slice(program.name.length + PROGRAM_DAY_SEPARATOR.length)
    const index = days.findIndex((d) => dayLabel(d) === suffix)
    if (index >= 0) return { index, date: workout.date }
  }
  return null
}

/**
 * Bugün ve sonrasındaki bloklara program günü atar; geçmiş bloklar atanmaz.
 *
 * - Hiç antrenman yoksa ilk blok programın ilk günüdür.
 * - Son antrenman bugün yapıldıysa bugünün ilk bloğu o günü gösterir, sıradaki blok bir sonrakini.
 * - Aksi halde ilk blok, son yapılan günden sonraki gündür; kaçırılan geçmiş blok sırayı ilerletmez.
 * Dönen anahtar blok id'sidir.
 */
export function assignProgramDays(
  program: WorkoutProgram,
  history: Workout[],
  blocks: ProgramBlockRef[],
  today: string,
  dayLabel: (day: ProgramDay) => string,
): Map<string, ProgramDay> {
  const result = new Map<string, ProgramDay>()
  const days = workingDays(program)
  if (days.length === 0) return result

  const done = lastDoneDay(days, program, history, today, dayLabel)
  const upcoming = blocks
    .filter((b) => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))

  let cursor = done ? done.index + 1 : 0
  let doneShown = false
  for (const block of upcoming) {
    // Bugün yapılan antrenman bugünün ilk bloğuna yazılır; aynı günün diğer blokları sıradakini alır.
    if (done && done.date === today && block.date === today && !doneShown) {
      doneShown = true
      const doneDay = days[done.index]
      if (doneDay) result.set(block.id, doneDay)
      continue
    }
    const day = days[cursor % days.length]
    if (day) result.set(block.id, day)
    cursor += 1
  }
  return result
}
