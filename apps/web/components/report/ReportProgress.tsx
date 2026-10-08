'use client'

// Gün raporunun ilerleme bölümleri: günün ritmi, haftalık alışkanlıklar, program adımı.
import { CheckCircle2, Footprints, Timer, Utensils, type LucideIcon } from 'lucide-react'
import { fill, formatNumber, type DailyReport, type HabitWeek, type ProgramRow } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { SectionTitle } from '@/components/report/ReportClosure'

interface VitalsProps { facts: DailyReport['facts'] }
interface HabitsWeekProps { habits: HabitWeek[] }
interface ProgramsProps { rows: ProgramRow[] }

interface Tile {
  icon: LucideIcon
  label: string
  value: string
  unit: string
  sub: string | null
  /** Hedefe oran (0-1); hedef yoksa çubuk çizilmez. */
  ratio: number | null
}

/**
 * Hareket, odak ve beslenme şeridi. Yalnızca verisi olan kutu çizilir; hiç veri yoksa bölüm
 * hiç görünmez. Kalori hedefin üstündeyse de renk değişmez: rapor uyarı vermez.
 */
export function Vitals({ facts }: VitalsProps) {
  const { t, lang } = useLang()
  const { movement, focus_minutes: focus, nutrition } = facts
  const minutes = movement.exercise_minutes ?? 0
  const steps = movement.steps ?? 0
  const tiles: Tile[] = []

  if (minutes > 0 || steps > 0 || movement.workout_done) {
    const stepsSub = minutes > 0 && steps > 0 ? fill(t.report_steps_sub, { n: formatNumber(steps, lang) }) : null
    const sub = [stepsSub, movement.workout_done ? t.report_workout_done : null].filter(Boolean).join(', ')
    tiles.push({
      icon: Footprints,
      label: t.report_move_label,
      value: formatNumber(minutes > 0 ? minutes : steps, lang),
      unit: minutes > 0 ? t.report_move_unit : t.report_steps_unit,
      sub: sub === '' ? null : sub,
      ratio: null,
    })
  }
  if (focus > 0) {
    tiles.push({ icon: Timer, label: t.report_focus_label, value: formatNumber(focus, lang), unit: t.report_focus_unit, sub: null, ratio: null })
  }
  if (nutrition) {
    const target = nutrition.calorie_target
    tiles.push({
      icon: Utensils,
      label: t.report_food_label,
      value: formatNumber(nutrition.calories, lang),
      unit: target ? `${t.report_kcal_unit}, ${fill(t.report_kcal_target, { n: formatNumber(target, lang) })}` : t.report_kcal_unit,
      sub: fill(t.report_protein_meals, { g: formatNumber(nutrition.protein_g, lang), n: nutrition.meals }),
      ratio: target ? Math.min(nutrition.calories / target, 1) : null,
    })
  }
  if (tiles.length === 0) return null

  return (
    <section className="space-y-3">
      <SectionTitle label={t.report_sec_vitals} />
      <div className="grid gap-2 sm:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value, unit, sub, ratio }) => (
          <div key={label} className="glass rounded-2xl p-3" aria-label={fill(t.report_vital_a11y, { label, value, unit })}>
            <p className="flex items-center gap-1.5 text-xs text-muted"><Icon className="h-3.5 w-3.5" />{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-primary">{value}</p>
            <p className="text-xs text-muted">{unit}</p>
            {ratio !== null && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
              </div>
            )}
            {sub !== null && <p className="mt-1 text-[11px] text-subtle">{sub}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Haftalık alışkanlıklar: her satırda haftanın dolan günleri. */
export function HabitsWeek({ habits }: HabitsWeekProps) {
  const { t } = useLang()
  if (habits.length === 0) return null

  return (
    <section className="space-y-4">
      <SectionTitle label={t.report_sec_habits} />
      {habits.map((habit) => {
        const filled = Math.min(habit.done, habit.target)
        const met = habit.done >= habit.target
        return (
          <div key={habit.routine_id} role="progressbar" aria-valuemin={0} aria-valuemax={habit.target} aria-valuenow={filled}
            aria-label={fill(t.report_habit_a11y, { title: habit.title, done: habit.done, target: habit.target })} className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex-1 text-sm text-primary">{habit.title}</span>
              {/* Hedefe ulaşan satır yalnız renkle ayrılmaz: sayının yanında onay işareti de var. */}
              {met && <CheckCircle2 className="h-4 w-4 text-success" />}
              <span className="text-sm font-semibold tabular-nums text-muted">{habit.done}/{habit.target}</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: habit.target }, (_, index) => (
                <div key={index} className={`h-1.5 flex-1 rounded-full ${index < filled ? (met ? 'bg-success' : 'bg-accent') : 'bg-border'}`} />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Program ilerlemesi: toplam yolun neresinde olunduğu. Yüzde yok, adım sayısı var. */
export function Programs({ rows }: ProgramsProps) {
  const { t } = useLang()
  if (rows.length === 0) return null

  return (
    <section className="space-y-3">
      <SectionTitle label={t.report_sec_program} />
      {rows.map((row) => {
        const done = Math.min(row.done, row.target)
        const caption = row.advanced ? t.report_program_today : done < row.target ? t.report_program_resume : null
        return (
          <div key={`${row.title}|${row.target}`} role="progressbar" aria-valuemin={0} aria-valuemax={row.target} aria-valuenow={done}
            aria-label={[fill(t.report_program_a11y, { title: row.title, done, target: row.target }), caption].filter(Boolean).join('. ')}
            className="glass space-y-3 rounded-2xl p-4">
            <div className="flex items-end gap-3">
              <span className="flex-1 text-sm font-semibold text-primary">{row.title}</span>
              <span className="tabular-nums">
                <span className="text-2xl font-extrabold text-primary">{done}</span>
                <span className="text-sm font-semibold text-muted">/{row.target}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-accent" style={{ width: `${row.target > 0 ? (done / row.target) * 100 : 0}%` }} />
            </div>
            {caption !== null && <p className="text-sm text-muted">{caption}</p>}
          </div>
        )
      })}
    </section>
  )
}
