import type { TaskStatus } from '../types/task'
import type { BlockType } from '../types/planning'
import type { MealType, PortionRung, ResolveRung } from '../types/nutrition'
import type { WorkoutCategory, WorkoutStatus, BodyRegion } from '../types/workout'

// Status renkleri (Tailwind class adları)
export const TASK_STATUS_COLORS: Record<TaskStatus, { bg: string; text: string; border: string }> = {
  backlog:     { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300' },
  planned:     { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300' },
  in_progress: { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-300' },
  blocked:     { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300' },
  done:        { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300' },
  deferred:    { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog:     'Backlog',
  planned:     'Planlandı',
  in_progress: 'Devam Ediyor',
  blocked:     'Bloke',
  done:        'Tamamlandı',
  deferred:    'Ertelendi',
}

// Time block renkleri (hex)
export const BLOCK_TYPE_COLORS: Record<BlockType, string> = {
  task:    '#4A90D9', // blue
  routine: '#34A853', // green
  break:   '#F59E0B', // amber
  focus:   '#8B5CF6', // purple
  meal:    '#EF4444', // red
  workout: '#EC4899', // pink
}

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  task:    'Görev',
  routine: 'Rutin',
  break:   'Mola',
  focus:   'Odak',
  meal:    'Yemek',
  workout: 'Spor',
}

// Öğün etiketleri
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Kahvaltı',
  lunch:     'Öğle',
  dinner:    'Akşam',
  snack:     'Ara Öğün',
}

export const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: '☀️',
  lunch:     '🌤️',
  dinner:    '🌙',
  snack:     '🍎',
}

// WSJF skor etiketleri (1-5)
export const WSJF_SCORE_LABELS: Record<number, string> = {
  1: 'Çok Düşük',
  2: 'Düşük',
  3: 'Orta',
  4: 'Yüksek',
  5: 'Çok Yüksek',
}

// App defaults
export const APP_DEFAULTS = {
  DAILY_EFFORT_LIMIT: 25,        // Efor toplamı limiti
  MORNING_BRIEFING_TIME: '08:00',
  EVENING_SUMMARY_TIME: '21:00',
  TIMEZONE: 'Europe/Istanbul',
  WEEK_START: 'monday' as const,

  // Timeline görünümü
  TIMELINE_START_HOUR: 6,   // 06:00
  TIMELINE_END_HOUR: 23,    // 23:00
  TIMELINE_HOUR_HEIGHT: 60, // px

  // Nutrition defaults
  DEFAULT_CALORIES: 2500,
  DEFAULT_PROTEIN_G: 150,
  DEFAULT_CARBS_G: 300,
  DEFAULT_FAT_G: 80,
  DEFAULT_FIBER_G: 30,
} as const

// Workout sabitleri
export const WORKOUT_CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  strength:    'Kuvvet',
  cardio:      'Kardiyo',
  flexibility: 'Esneklik',
  mobility:    'Mobilite',
}

export const WORKOUT_CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  strength:    '#4A90D9',
  cardio:      '#EF4444',
  flexibility: '#34A853',
  mobility:    '#8B5CF6',
}

export const WORKOUT_STATUS_LABELS: Record<WorkoutStatus, string> = {
  planned:     'Planlandı',
  in_progress: 'Devam Ediyor',
  completed:   'Tamamlandı',
  skipped:     'Atlandı',
}

export const WORKOUT_STATUS_COLORS: Record<WorkoutStatus, string> = {
  planned:     '#6B7280',
  in_progress: '#F59E0B',
  completed:   '#34A853',
  skipped:     '#9CA3AF',
}

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  upper: 'Üst Vücut',
  lower: 'Alt Vücut',
  core:  'Karın / Bel',
  full:  'Tüm Vücut',
}

// Design tokens (Tailwind ile senkron)
export const COLORS = {
  primary:    '#1A1A2E',
  accent:     '#4A90D9',
  success:    '#34A853',
  warning:    '#F59E0B',
  danger:     '#EF4444',
  muted:      '#6B7280',
  background: '#FAFBFC',
  surface:    '#FFFFFF',
} as const

// ============================
// Çözümleme merdiveni etiketleri
// ============================
// Kullanıcı "bu sayı nereden geldi" sorusunun cevabını kalemin yanında görür;
// aralığın genişliği gösterilmekle kalmaz, açıklanır.

export const RESOLVE_RUNG_LABELS: Record<ResolveRung, string> = {
  user_alias: 'senin düzeltmen',
  global_alias: 'birebir eşleşme',
  lexical: 'sözlük eşleşmesi',
  lexical_verified: 'AI doğruladı',
  corpus_verified: 'USDA kaydı (AI doğruladı)',
  choices: 'seçim bekliyor',
  unresolved: 'tanınmadı',
}

export const PORTION_RUNG_LABELS: Record<PortionRung, string> = {
  stated_mass: 'yazdığın gramaj',
  stated_volume: 'yazdığın hacim',
  user_memory: 'senin porsiyonun',
  household_measure: 'ev ölçüsü',
  serving_default: '1 porsiyon varsayıldı',
  model_estimate: 'AI tahmini',
  unknown: 'bilinmiyor',
}
