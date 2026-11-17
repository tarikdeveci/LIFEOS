// Esnek plan (081 ile 084) ve mobilden gelen UX metinleri; i18n.ts bunları ana sözlüğe katar.
// Metinler mobil i18n ile aynı tutulur.
import type { DayPart, ProgramDay, TimeBlock } from '@lifeos/shared'

const en = {
  today_minimum_on: 'Minimum day',
  today_minimum_off: 'Back to a normal day',
  today_minimum_hint: 'Only protected routines stay today. Nothing is deleted.',
  today_minimum_closed: 'Off today ({n})',
  today_minimum_empty: 'No protected routines. Mark a routine as protected in Routines.',
  today_minimum_go_routines: 'Open routines',
  today_minimum_error: "Couldn't change the day. Try again.",
  routines_protected: 'Protected: stays on minimum days',
  routines_min_minutes: 'Minimum length (min), optional',
  routines_err_min_minutes: 'Minimum length must be 1 to 600 minutes',
  routines_per_day: 'Different by day',
  routines_per_day_same: 'Same',
  routines_per_day_time: 'Time',
  routines_per_day_minutes: 'Length',
  routines_per_day_minutes_label: 'Length (min)',
  routines_per_day_load_error: "Couldn't load per-day times",
  routines_err_day_minutes: 'Length must be 1 to 1439 minutes',
  routines_day_part_toggle: 'No set time, pick a part of the day',
  routines_block_minutes: 'Length (min)',
  routines_err_block_minutes: 'Length must be 5 to 600 minutes',
  routines_err_per_week: 'Enter a number from 1 to 7',
  routines_err_per_day: 'Enter a number from 1 to 20',
  plan_err_time_invalid: 'Times must be in HH:MM format',
  day_part_morning: 'Morning',
  day_part_noon: 'Noon',
  day_part_afternoon: 'Afternoon',
  day_part_evening: 'Evening',
  ux_routine_similar: 'A similar routine already falls on these days: "{title}".',
  ux_routine_save_anyway: 'Save anyway',
  ux_routine_program: 'Workout program',
  ux_routine_program_none: 'No program',
  ux_routine_program_hint: "Program days fall on this block's days in order. A missed day does not shift the next one.",
  ux_routine_habit: 'Link to habit',
  ux_routine_habit_none: 'None',
  ux_routine_habit_hint: 'Completing this block marks the habit for that day, so you do not tick it twice.',
  ux_habit_linked_hint: 'Marked automatically when {title} is completed.',
  ux_next_task: 'Next task',
  ux_next_task_overdue: 'Overdue',
  task_add_to_calendar: 'Add to calendar',
  wk_day_n: 'Day {n}',
  ux_wk_next_day: 'Next: {day}',
  ux_wk_start_day: 'Start {day}',
  ux_wk_empty_start: 'Start an empty workout',
  ux_wk_active_program: 'Active program',
}

const tr: Record<keyof typeof en, string> = {
  today_minimum_on: 'Bugün asgari gün',
  today_minimum_off: 'Normal güne dön',
  today_minimum_hint: 'Bugün sadece korumalı rutinler var. Hiçbir şey silinmedi.',
  today_minimum_closed: 'Bugün kapalı ({n})',
  today_minimum_empty: 'Korumalı rutin yok. Rutinlerde bir rutini korumalı işaretleyebilirsin.',
  today_minimum_go_routines: 'Rutinlere git',
  today_minimum_error: 'Gün değiştirilemedi. Tekrar dene.',
  routines_protected: 'Korumalı: asgari günde de kalır',
  routines_min_minutes: 'Asgari süre (dk), isteğe bağlı',
  routines_err_min_minutes: 'Asgari süre 1 ile 600 dakika arasında olmalı',
  routines_per_day: 'Günlere göre farklı',
  routines_per_day_same: 'Aynı',
  routines_per_day_time: 'Saat',
  routines_per_day_minutes: 'Süre',
  routines_per_day_minutes_label: 'Süre (dk)',
  routines_per_day_load_error: 'Günlere göre saatler yüklenemedi',
  routines_err_day_minutes: 'Süre 1 ile 1439 dakika arasında olmalı',
  routines_day_part_toggle: 'Saat yok, gün bölümü seç',
  routines_block_minutes: 'Süre (dk)',
  routines_err_block_minutes: 'Süre 5 ile 600 dakika arası olmalı',
  routines_err_per_week: '1 ile 7 arasında bir sayı gir',
  routines_err_per_day: '1 ile 20 arasında bir sayı gir',
  plan_err_time_invalid: 'Saat SS:DD biçiminde olmalı',
  day_part_morning: 'Sabah',
  day_part_noon: 'Öğle',
  day_part_afternoon: 'Öğleden sonra',
  day_part_evening: 'Akşam',
  ux_routine_similar: 'Bu günlerde benzer bir rutinin var: "{title}".',
  ux_routine_save_anyway: 'Yine de kaydet',
  ux_routine_program: 'Antrenman programı',
  ux_routine_program_none: 'Program yok',
  ux_routine_program_hint: 'Program günleri bu bloğun günlerine sırayla düşer. Kaçırdığın gün sıradakini kaydırmaz.',
  ux_routine_habit: 'Alışkanlığa bağla',
  ux_routine_habit_none: 'Yok',
  ux_routine_habit_hint: 'Bu blok tamamlanınca alışkanlık o gün kendiliğinden işaretlenir, iki kez işaretlemezsin.',
  ux_habit_linked_hint: '{title} tamamlanınca kendiliğinden işaretlenir.',
  ux_next_task: 'Sıradaki görev',
  ux_next_task_overdue: 'Gecikmiş',
  task_add_to_calendar: 'Takvime ekle',
  wk_day_n: 'Gün {n}',
  ux_wk_next_day: 'Sıradaki: {day}',
  ux_wk_start_day: '{day} başlat',
  ux_wk_empty_start: 'Boş antrenman başlat',
  ux_wk_active_program: 'Aktif program',
}

export const FLEX_I18N = { en, tr }

/** Gün bölümünün çeviri anahtarı. */
export function dayPartKey(part: DayPart): `day_part_${DayPart}` {
  return `day_part_${part}`
}

/** Blok saati metni; yüzen blok (084) saat yerine gün bölümüyle yazılır, saati yer tutucudur. */
export function blockTimeText(
  block: Pick<TimeBlock, 'day_part' | 'start_time' | 'end_time'>,
  t: Record<`day_part_${DayPart}`, string>,
  sep = ' - ',
): string {
  if (block.day_part) return t[dayPartKey(block.day_part)]
  return `${block.start_time.slice(0, 5)}${sep}${block.end_time.slice(0, 5)}`
}

/** Program gününün adı; boş adlı günde "Gün 3". Antrenman adına da bu yazılır, mobil ile aynı. */
export function programDayLabel(day: Pick<ProgramDay, 'day_name' | 'day_number'>, t: { wk_day_n: string }): string {
  return day.day_name?.trim() || t.wk_day_n.replace('{n}', String(day.day_number))
}
