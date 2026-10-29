export type Locale = 'en' | 'it'
export type Goal = 'fat_loss' | 'muscle_gain' | 'maintain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Sex = 'male' | 'female'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type ExerciseKind = 'reps' | 'bodyweight' | 'time' | 'cardio'

/** A text available in both languages. */
export type L10n = { en: string; it: string }

export interface Profile {
  id: string
  display_name: string
  locale: Locale
  sex: Sex | null
  birth_year: number | null
  height_cm: number | null
  goal: Goal | null
  activity_level: ActivityLevel | null
  experience: 'beginner' | 'intermediate'
  start_weight_kg: number | null
  target_weight_kg: number | null
  workouts_per_week: number
  steps_goal: number
  onboarded_at: string | null
  /** Weekly check-in correction on top of the estimated energy needs (kcal). */
  kcal_adjust: number
  kcal_checkin_at: string | null
}

export interface BodyWeight {
  id?: number
  measured_at: string
  weight_kg: number
  body_fat_pct?: number | null
  source: string
}

export interface DailySteps {
  day: string
  steps: number
  source: string
}

export interface TemplateExercise {
  exercise_id: string
  sets: number
  rep_min: number
  rep_max: number
  rest_s: number
  target_kg?: number | null
  note?: string | null
  /** Exercises sharing a number are done as a superset (alternate sets, rest after the round). */
  superset?: number | null
  /** Suggest warm-up sets. Undefined = automatic for big lifts. */
  warmup?: boolean | null
}

export interface WorkoutTemplate {
  id: string
  user_id?: string
  name: string
  notes: string | null
  position: number
  /** 0 = Monday … 6 = Sunday; null = no fixed day. */
  weekday: number | null
  exercises: TemplateExercise[]
  managed_by_admin: boolean
  archived: boolean
  updated_at?: string
}

export interface WorkoutSession {
  id: string
  template_id: string | null
  name: string
  started_at: string
  finished_at: string | null
  effort: number | null
  notes: string | null
  source?: string
}

export interface SetLog {
  session_id: string
  exercise_id: string
  exercise_order: number
  set_index: number
  weight_kg: number | null
  reps: number | null
  duration_s: number | null
  rir: number | null
  is_warmup: boolean
  performed_at: string
}

export interface FoodItem {
  name: string
  grams: number
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
}

export interface FoodLog {
  id: string
  eaten_at: string
  meal: Meal
  title: string
  items: FoodItem[]
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  score_fat_loss: number | null
  score_muscle_gain: number | null
  photo_path: string | null
  source: 'ai' | 'manual' | 'barcode' | 'import'
  ai_notes: string | null
}

export interface Checkin {
  id: string
  created_at: string
  waist_cm: number | null
  energy: number | null
  sleep: number | null
  mood: number | null
  notes: string | null
}

export interface Exercise {
  id: string
  name: L10n
  muscles: string[]
  equipment: string
  kind: ExerciseKind
  level: 1 | 2
  images: string[]
  steps: { en: string[]; it: string[] }
  tip?: L10n
  video_url?: string | null
  custom?: boolean
}

export interface Activity {
  id?: number
  started_at: string
  ended_at: string
  kind: string
  title: string | null
  source: string
}

export interface ProgressPhoto {
  id: string
  taken_at: string
  path: string
  weight_kg: number | null
  note: string | null
}
