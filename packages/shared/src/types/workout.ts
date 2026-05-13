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
