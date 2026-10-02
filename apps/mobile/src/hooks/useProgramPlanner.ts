import { useState } from 'react'
import { Alert } from 'react-native'
import { localDateTime, nextSlotTime, planProgram, spreadWeekdays, todayDate } from '@lifeos/shared'
import type { WorkoutProgram } from '@lifeos/shared'
import { createTimeBlocks } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { createRecurringEvent, findWritableCalendarId, requestCalendarPermission } from '@/src/utils/calendarSync'
import { useLang } from '@/src/contexts/LangContext'
import { activeDays, describeDay, programDayLabel } from '@/src/components/workout/programDays'
import { palette } from '@/src/theme/tokens'

interface Options {
  userId: string | null
  /** Detay sayfasında açık olan programın güncel kaydı. */
  liveProgram: WorkoutProgram | null
  /** Program takvime yazıldı: program sayfası kapanır. */
  onScheduled: () => void
}

/** Programı haftalık plana ve/veya cihaz takvimine yerleştirme ekranının durumu. */
export function useProgramPlanner({ userId, liveProgram, onScheduled }: Options) {
  const { t, lang } = useLang()

  const [planningProgram, setPlanningProgram] = useState(false)
  const [planStartDate, setPlanStartDate] = useState(todayDate)
  const [planTime, setPlanTime] = useState(nextSlotTime)
  const [planWeeks, setPlanWeeks] = useState('4')
  const [planWeekdays, setPlanWeekdays] = useState<Record<string, number>>({})
  const [planToBlocks, setPlanToBlocks] = useState(true)
  const [planToCalendar, setPlanToCalendar] = useState(true)
  const [scheduling, setScheduling] = useState(false)

  function openProgramPlanner(program: WorkoutProgram | null = liveProgram) {
    const days = activeDays(program)
    const spread = spreadWeekdays(days.length)
    const map: Record<string, number> = {}
    days.forEach((day, i) => { map[day.id] = spread[i] ?? 1 })
    setPlanWeekdays(map)
    setPlanStartDate(todayDate())
    setPlanTime(nextSlotTime())
    setPlanningProgram(true)
  }

  function pickWeekday(dayId: string, weekday: number) {
    setPlanWeekdays((map) => ({ ...map, [dayId]: weekday }))
  }

  /**
   * Programı somut tarihlere yazar.
   *
   * İki hedef aynı `planProgram()` çıktısını kullanıyor, dolayısıyla haftalık
   * plandaki blokla telefondaki etkinlik birbirinden kayamıyor.
   *
   * Takvim tarafı haftalık TEKRAR KURALI olan tek etkinlik yazıyor, hafta sayısı
   * kadar ayrı etkinlik değil: kullanıcı vazgeçtiğinde takvimden tek dokunuşla
   * silebilsin. Haftalık plan tarafında böyle bir imkân yok (bloklar tarih tarih
   * okunuyor), orada satırlar tek tek oluşuyor ama `createTimeBlocks` zaten var
   * olanı atlıyor: iki kez basmak kaydı ikiye katlamıyor.
   */
  async function handleScheduleProgram() {
    if (!userId || !liveProgram || scheduling) return

    if (!planToBlocks && !planToCalendar) {
      Alert.alert(t.wk_sched_target_title, t.wk_sched_target_msg)
      return
    }
    const days = activeDays(liveProgram)
    if (days.length === 0) {
      Alert.alert(t.wk_sched_empty_title, t.wk_sched_empty_msg)
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planStartDate)) {
      Alert.alert(t.wk_sched_date_title, t.wk_sched_date_msg)
      return
    }
    if (!/^\d{1,2}:\d{2}$/.test(planTime)) {
      Alert.alert(t.wk_sched_time_title, t.wk_sched_time_msg)
      return
    }
    const weeks = Math.min(12, Math.max(1, parseInt(planWeeks, 10) || 4))

    const sessions = planProgram({
      days: days.map((day) => ({
        id: day.id,
        day_name: programDayLabel(day, t),
        exercises: (day.exercises ?? []).map((ex) => ({ sets: ex.sets, rest_seconds: ex.rest_seconds })),
      })),
      weekdayByDay: planWeekdays,
      startDate: planStartDate,
      startTime: planTime,
      weeks,
    })

    setScheduling(true)
    try {
      const summary: string[] = []

      if (planToBlocks) {
        const rows = sessions.flatMap((session) =>
          session.dates.map((date) => ({
            date,
            start_time: session.startTime,
            end_time: session.endTime,
            block_type: 'workout' as const,
            label: `${liveProgram.name} · ${session.dayName}`,
            color: palette.workout,
          })),
        )
        const { inserted, skipped } = await createTimeBlocks(supabase, userId, rows)
        summary.push(
          t.wk_sched_blocks.replace('{n}', String(inserted)) + (skipped > 0 ? t.wk_sched_blocks_skipped.replace('{n}', String(skipped)) : ''),
        )
      }

      if (planToCalendar) {
        const granted = await requestCalendarPermission()
        const calendarId = granted ? await findWritableCalendarId() : null

        if (!granted) {
          summary.push(t.wk_sched_cal_denied)
        } else if (!calendarId) {
          summary.push(t.wk_sched_cal_none)
        } else {
          let events = 0
          for (const session of sessions) {
            const first = session.dates[0]
            if (!first) continue
            await createRecurringEvent(calendarId, {
              title: `${liveProgram.name} · ${session.dayName}`,
              notes: describeDay(days.find((d) => d.id === session.dayId), lang, t),
              startsAt: localDateTime(first, session.startTime),
              durationMinutes: session.durationMinutes,
              weeklyOccurrences: weeks,
              reminderMinutesBefore: 30,
            })
            events += 1
          }
          summary.push(t.wk_sched_cal_done.replace('{n}', String(events)).replace('{w}', String(weeks)))
        }
      }

      setPlanningProgram(false)
      onScheduled()
      Alert.alert(t.wk_sched_done_title, summary.join('\n'))
    } catch (error) {
      console.warn('Program planlanamadı:', error)
      Alert.alert(t.error, t.wk_err_schedule)
    } finally {
      setScheduling(false)
    }
  }

  return {
    planningProgram, setPlanningProgram, planStartDate, setPlanStartDate, planTime, setPlanTime, planWeeks, setPlanWeeks,
    planWeekdays, pickWeekday, planToBlocks, setPlanToBlocks, planToCalendar, setPlanToCalendar, scheduling,
    openProgramPlanner, handleScheduleProgram,
  }
}
