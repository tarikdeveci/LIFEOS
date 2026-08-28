// Spor/Fitness domain types
// Şema: supabase/migrations/005_workout_schema.sql

export type WorkoutCategory = 'strength' | 'cardio' | 'flexibility' | 'mobility'
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'
export type BodyRegion = 'upper' | 'lower' | 'core' | 'full'

export interface MuscleGroup {
  id: number
  name: string        // "Göğüs"
  name_en: string     // "Chest"
  body_region: BodyRegion
}

export interface Exercise {
  id: string
  user_id: string | null    // null = global
  name: string
  name_en: string | null
  category: WorkoutCategory
  muscle_group_id: number | null
  muscle_group?: MuscleGroup
  secondary_muscle_group_ids: number[]
  instructions: string | null
  met_value: number | null
  is_bodyweight: boolean
  created_at: string
}

export interface AiWorkoutPlan {
  type: 'exercise_suggestion' | 'rest' | 'progression' | 'general'
  message: string
  exercise_id?: string
}

export interface Workout {
  id: string
  user_id: string
  date: string          // 'YYYY-MM-DD'
  name: string | null
  notes: string | null
  status: WorkoutStatus
  duration_minutes: number | null
  total_calories_burned: number | null
  ai_plan: AiWorkoutPlan[]
  created_at: string
  updated_at: string
  workout_sets?: WorkoutSet[]
}

export interface WorkoutSet {
  id: string
  workout_id: string
  exercise_id: string
  exercise?: Exercise
  set_number: number
  reps: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  rest_seconds: number
  notes: string | null
  completed: boolean
  created_at: string
}

export interface CreateWorkoutInput {
  date: string
  name?: string
  notes?: string
  status?: WorkoutStatus
}

export interface CreateWorkoutSetInput {
  workout_id: string
  exercise_id: string
  set_number?: number
  reps?: number
  weight_kg?: number
  duration_seconds?: number
  distance_m?: number
  rest_seconds?: number
  notes?: string
}

export interface UpdateWorkoutSetInput {
  reps?: number
  weight_kg?: number
  duration_seconds?: number
  distance_m?: number
  rest_seconds?: number
  notes?: string
  completed?: boolean
}

export interface DailyWorkoutSummary {
  date: string
  workout_id: string | null
  status: WorkoutStatus | null
  total_sets: number
  completed_sets: number
  duration_minutes: number | null
  calories_burned: number | null
  muscle_groups_worked: string[]
}

// Workout Programs
export interface WorkoutProgram {
  id: string
  user_id: string | null  // null = global template
  name: string
  description: string | null
  split_type: 'bro_split' | 'push_pull_legs' | 'full_body' | 'upper_lower' | 'custom'
  frequency_per_week: number
  created_at: string
  days?: ProgramDay[]
}

export interface ProgramDay {
  id: string
  program_id: string
  day_number: number
  day_name: string
  is_rest: boolean
  exercises?: ProgramExercise[]
}

export interface ProgramExercise {
  id: string
  program_day_id: string
  exercise_id: string
  exercise?: Exercise
  sets: number
  reps: number | null
  rest_seconds: number
  order_index: number
  notes: string | null
}

export interface CreateProgramInput {
  name: string
  description?: string
  split_type?: WorkoutProgram['split_type']
  frequency_per_week?: number
}

/**
 * AI koçunun ürettiği program planı. Edge function egzersiz adlarını kataloğa
 * karşı doğruladığı için burada isim değil, istemcide çözülmüş exercise_id
 * taşınır — kaydederken eşleşmeyen satır kalmasın.
 */
export interface AiProgramPlanExercise {
  exercise_id: string
  sets: number
  reps: number | null
  rest_seconds: number
  notes: string | null
}

export interface AiProgramPlanDay {
  day_name: string
  exercises: AiProgramPlanExercise[]
}

export interface AiProgramPlan {
  name: string
  description?: string
  split_type?: WorkoutProgram['split_type']
  days: AiProgramPlanDay[]
}
