// Health maths used across the app. Kept simple and explainable on purpose:
// every number shown to the user can be traced back to one of these functions.
import type { ActivityLevel, BodyWeight, FoodItem, Goal, Meal, Profile, SetLog } from './types'

export const DAY = 86_400_000

// ---------------------------------------------------------------------------
// Energy (TDEE)
// ---------------------------------------------------------------------------

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export function ageFrom(birthYear: number | null): number {
  return birthYear ? new Date().getFullYear() - birthYear : 40
}

/** Basal metabolic rate, Mifflin-St Jeor equation (kcal/day). */
export function bmr(p: Pick<Profile, 'sex' | 'birth_year' | 'height_cm'>, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * (p.height_cm ?? 170) - 5 * ageFrom(p.birth_year)
  return Math.round(base + (p.sex === 'female' ? -161 : 5))
}

export interface TdeeEstimate {
  bmr: number
  /** Estimate from profile + logged steps and workouts. */
  formula: number
  /** Estimate from food logged vs weight change, when there is enough data. */
  adaptive: number | null
  /** The number we use. */
  tdee: number
  method: 'activity_level' | 'steps_and_workouts' | 'blended'
  stepsKcal: number
  trainingKcal: number
}

export function estimateTdee(args: {
  profile: Profile
  weightKg: number
  avgSteps: number | null
  workoutsPerWeek: number
  avgWorkoutMinutes: number
  adaptive?: number | null
}): TdeeEstimate {
  const { profile, weightKg, avgSteps, workoutsPerWeek, avgWorkoutMinutes } = args
  const base = bmr(profile, weightKg)
  let formula: number
  let stepsKcal = 0
  let trainingKcal = 0
  let method: TdeeEstimate['method'] = 'activity_level'
  if (avgSteps !== null) {
    // ~0.04 kcal per step for a 70 kg person, scaled by weight.
    stepsKcal = Math.round(avgSteps * 0.04 * (weightKg / 70))
    // Weight training ~ 5 MET; subtract the 1 MET already counted at rest.
    trainingKcal = Math.round(((workoutsPerWeek * avgWorkoutMinutes) / 60) * 4 * weightKg / 7)
    formula = Math.round(base * 1.2 + stepsKcal + trainingKcal)
    method = 'steps_and_workouts'
  } else {
    formula = Math.round(base * ACTIVITY_FACTOR[profile.activity_level ?? 'light'])
  }
  const adaptive = args.adaptive ?? null
  const plausible = adaptive !== null && adaptive > base && adaptive < base * 2.6
  return {
    bmr: base,
    formula,
    adaptive: plausible ? Math.round(adaptive) : null,
    tdee: plausible ? Math.round((formula + adaptive) / 2) : formula,
    method: plausible ? 'blended' : method,
    stepsKcal,
    trainingKcal,
  }
}

/**
 * Energy balance: what you ate minus what your weight says you stored.
 * 1 kg of body weight change is about 7700 kcal.
 */
export function adaptiveTdee(avgIntakeKcal: number, trendChangeKg: number, days: number): number {
  return avgIntakeKcal - (trendChangeKg * 7700) / days
}

export interface Targets {
  kcal: number
  protein_g: number
  fat_g: number
  carbs_g: number
  fiber_g: number
}

/** Reference weight for protein: avoids huge targets for people carrying a lot of fat. */
function proteinWeight(p: Profile, weightKg: number): number {
  const h = (p.height_cm ?? 170) / 100
  const bmi = weightKg / (h * h)
  return bmi > 30 ? 27 * h * h : weightKg
}

export function dailyTargets(p: Profile, weightKg: number, tdee: number): Targets {
  const goal: Goal = p.goal ?? 'maintain'
  const floor = p.sex === 'female' ? 1200 : 1500
  const base = goal === 'fat_loss' ? Math.round(tdee * 0.8) : goal === 'muscle_gain' ? tdee + 250 : tdee
  // Weekly check-ins nudge the target up or down based on what the scale really does.
  const kcal = Math.max(floor, base + (p.kcal_adjust ?? 0))
  const perKg = goal === 'maintain' ? 1.4 : goal === 'fat_loss' ? 1.8 : 1.6
  const protein = Math.round(proteinWeight(p, weightKg) * (ageFrom(p.birth_year) >= 60 ? Math.max(perKg, 1.4) : perKg))
  const fat = Math.round((kcal * 0.3) / 9)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  const fiber = Math.max(25, Math.round((kcal / 1000) * 14))
  return { kcal: Math.round(kcal / 10) * 10, protein_g: protein, fat_g: fat, carbs_g: carbs, fiber_g: fiber }
}

// ---------------------------------------------------------------------------
// Weight trend
// ---------------------------------------------------------------------------

export interface DailyWeight {
  day: string
  kg: number
}

/** One value per day (the first weigh-in of the day: closest to "morning, fasted"). */
export function dailyWeights(rows: BodyWeight[]): DailyWeight[] {
  const byDay = new Map<string, { t: number; kg: number }>()
  for (const r of rows) {
    const d = new Date(r.measured_at)
    const day = localDay(d)
    const prev = byDay.get(day)
    if (!prev || d.getTime() < prev.t) byDay.set(day, { t: d.getTime(), kg: Number(r.weight_kg) })
  }
  return [...byDay].map(([day, v]) => ({ day, kg: v.kg })).sort((a, b) => a.day.localeCompare(b.day))
}

/** Exponentially smoothed trend (like a 10-day moving average, but it handles missing days). */
export function weightTrend(points: DailyWeight[], alpha = 0.15): { day: string; kg: number; trend: number }[] {
  let trend: number | null = null
  let prevDay: number | null = null
  return points.map((p) => {
    const t = new Date(p.day).getTime()
    if (trend === null || prevDay === null) trend = p.kg
    else {
      const gap = Math.max(1, Math.round((t - prevDay) / DAY))
      const a = 1 - Math.pow(1 - alpha, gap)
      trend = trend + a * (p.kg - trend)
    }
    prevDay = t
    return { ...p, trend: Math.round(trend * 100) / 100 }
  })
}

/** Least-squares slope in kg per week over the given points. */
export function slopePerWeek(points: { day: string; kg: number }[]): number | null {
  if (points.length < 3) return null
  const t0 = new Date(points[0].day).getTime()
  const xs = points.map((p) => (new Date(p.day).getTime() - t0) / DAY)
  const ys = points.map((p) => p.kg)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return (num / den) * 7
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

/** Estimated one-rep max (Epley). Reliable up to ~12 reps. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + Math.min(reps, 15) / 30)
}

export interface StrengthPoint {
  day: string
  sessionId: string
  best: number
  /** Total kg lifted (weight x reps) for the exercise in that session. */
  volume: number
  /** Best reps (for bodyweight exercises) or longest time in seconds. */
  bestReps: number
}

/** Per exercise, per session: best estimated 1RM. */
export function strengthHistory(sets: SetLog[]): Map<string, StrengthPoint[]> {
  const byExercise = new Map<string, Map<string, StrengthPoint>>()
  for (const s of sets) {
    if (s.is_warmup) continue
    const sessions = byExercise.get(s.exercise_id) ?? new Map<string, StrengthPoint>()
    byExercise.set(s.exercise_id, sessions)
    const p = sessions.get(s.session_id) ?? {
      day: localDay(new Date(s.performed_at)),
      sessionId: s.session_id,
      best: 0,
      volume: 0,
      bestReps: 0,
    }
    const w = Number(s.weight_kg ?? 0)
    const r = Number(s.reps ?? 0)
    p.best = Math.max(p.best, e1rm(w, r))
    p.volume += w * r
    p.bestReps = Math.max(p.bestReps, r || Number(s.duration_s ?? 0))
    sessions.set(s.session_id, p)
  }
  const out = new Map<string, StrengthPoint[]>()
  for (const [id, sessions] of byExercise) {
    out.set(id, [...sessions.values()].sort((a, b) => a.day.localeCompare(b.day)))
  }
  return out
}

/** Average % change of best e1RM between the first and last sessions, over exercises with 2+ sessions. */
export function strengthChangePct(history: Map<string, StrengthPoint[]>, sinceDay?: string): number | null {
  const changes: number[] = []
  for (const points of history.values()) {
    const pts = sinceDay ? points.filter((p) => p.day >= sinceDay) : points
    const usable = pts.filter((p) => p.best > 0)
    if (usable.length < 2) continue
    const first = usable[0].best
    const last = Math.max(...usable.slice(-2).map((p) => p.best))
    changes.push(((last - first) / first) * 100)
  }
  if (!changes.length) return null
  return changes.reduce((a, b) => a + b, 0) / changes.length
}

// ---------------------------------------------------------------------------
// Plate scores
// ---------------------------------------------------------------------------

export const MEAL_SHARE: Record<Meal, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 }

export interface PlateTotals {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
}

export function sumItems(items: FoodItem[]): PlateTotals {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  for (const i of items) {
    t.kcal += Number(i.kcal) || 0
    t.protein_g += Number(i.protein_g) || 0
    t.carbs_g += Number(i.carbs_g) || 0
    t.fat_g += Number(i.fat_g) || 0
    t.fiber_g += Number(i.fiber_g) || 0
    t.sugar_g += Number(i.sugar_g) || 0
  }
  return {
    kcal: Math.round(t.kcal),
    protein_g: round1(t.protein_g),
    carbs_g: round1(t.carbs_g),
    fat_g: round1(t.fat_g),
    fiber_g: round1(t.fiber_g),
    sugar_g: round1(t.sugar_g),
  }
}

export type ReasonKey =
  | 'protein_high'
  | 'protein_low'
  | 'fiber_good'
  | 'fiber_low'
  | 'kcal_ok'
  | 'kcal_high'
  | 'kcal_low'
  | 'sugar_high'
  | 'processed'
  | 'carbs_fuel'
  | 'late_sugar'

export interface PlateScore {
  fatLoss: number
  muscleGain: number
  reasons: { key: ReasonKey; good: boolean }[]
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (x: number, from: number, to: number) => clamp01((x - from) / (to - from))

/**
 * Scores a plate 0-100 for fat loss and for muscle gain, against the meal's share of the daily target.
 * Each point comes from a named reason so the app can explain the score.
 */
export function scorePlate(t: PlateTotals, meal: Meal, dailyKcal: number, ultraProcessed: boolean, eatenAt: Date): PlateScore {
  const kcal = Math.max(t.kcal, 1)
  const budget = dailyKcal * MEAL_SHARE[meal]
  const ratio = t.kcal / budget
  const proteinPct = (t.protein_g * 4) / kcal
  const fiberPer1000 = (t.fiber_g / kcal) * 1000
  const sugarPct = (t.sugar_g * 4) / kcal
  const carbPct = (t.carbs_g * 4) / kcal

  const fatLoss =
    30 * lerp(proteinPct, 0.1, 0.3) +
    20 * lerp(fiberPer1000, 4, 14) +
    25 * (1 - lerp(ratio, 1, 1.5)) +
    15 * (1 - lerp(sugarPct, 0.1, 0.3)) +
    (ultraProcessed ? 0 : 10)

  const kcalFit = ratio < 0.9 ? lerp(ratio, 0.5, 0.9) : 1 - 0.6 * lerp(ratio, 1.3, 1.8)
  const muscleGain =
    35 * lerp(t.protein_g, 10, 30) +
    25 * kcalFit +
    15 * lerp(carbPct, 0.15, 0.35) +
    15 * lerp(fiberPer1000, 4, 10) +
    (ultraProcessed ? 0 : 10)

  const reasons: PlateScore['reasons'] = []
  if (t.protein_g >= 25 || proteinPct >= 0.25) reasons.push({ key: 'protein_high', good: true })
  else if (t.kcal > 150) reasons.push({ key: 'protein_low', good: false })
  if (fiberPer1000 >= 12 || t.fiber_g >= 8) reasons.push({ key: 'fiber_good', good: true })
  else if (t.kcal > 150) reasons.push({ key: 'fiber_low', good: false })
  if (ratio > 1.3) reasons.push({ key: 'kcal_high', good: false })
  else if (ratio < 0.5 && meal !== 'snack') reasons.push({ key: 'kcal_low', good: false })
  else reasons.push({ key: 'kcal_ok', good: true })
  if (sugarPct > 0.2) reasons.push({ key: 'sugar_high', good: false })
  if (ultraProcessed) reasons.push({ key: 'processed', good: false })
  if (carbPct >= 0.3 && t.kcal > 300) reasons.push({ key: 'carbs_fuel', good: true })
  const late = meal === 'dinner' || eatenAt.getHours() >= 19
  if (late && (sugarPct > 0.2 || ultraProcessed)) reasons.push({ key: 'late_sugar', good: false })

  return { fatLoss: Math.round(fatLoss), muscleGain: Math.round(muscleGain), reasons }
}

export function scoreBand(score: number): 'great' | 'good' | 'okay' | 'rethink' {
  return score >= 75 ? 'great' : score >= 50 ? 'good' : score >= 30 ? 'okay' : 'rethink'
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** yyyy-MM-dd in the device's time zone. */
export function localDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

export function weekStart(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday = 0
  return x
}

// ---------------------------------------------------------------------------
// Streaks and records
// ---------------------------------------------------------------------------

/** Consecutive weeks (Monday-Sunday) with at least one workout. The current week counts once it has one. */
export function weekStreak(sessionStarts: string[], now = new Date()): number {
  const weeks = new Set(sessionStarts.map((s) => localDay(weekStart(new Date(s)))))
  const cursor = weekStart(now)
  if (!weeks.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 7)
  let n = 0
  while (weeks.has(localDay(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 7)
  }
  return n
}

export interface RecordEvent {
  exerciseId: string
  day: string
  value: number
  previous: number
}

/** Every time an exercise's best estimated max beat all earlier sessions, newest first. */
export function recordEvents(sets: SetLog[]): RecordEvent[] {
  const out: RecordEvent[] = []
  for (const [exerciseId, points] of strengthHistory(sets)) {
    let best = 0
    for (const p of points) {
      if (p.best > best && best > 0) out.push({ exerciseId, day: p.day, value: p.best, previous: best })
      best = Math.max(best, p.best)
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day))
}

// ---------------------------------------------------------------------------
// Weekly calorie check-in
// ---------------------------------------------------------------------------

/** Goal pace as % of body weight per week. */
export const GOAL_PACE: Record<Goal, number> = { fat_loss: -0.5, muscle_gain: 0.25, maintain: 0 }

export interface CalorieCheckin {
  due: boolean
  confidence: 'low' | 'medium' | 'high'
  /** Weight change per week over the last 3 weeks (kg), from the smoothed trend. */
  actualKgPerWeek: number | null
  goalKgPerWeek: number
  /** Suggested change to the daily target (kcal). */
  change: number
  verdict: 'on_track' | 'too_slow' | 'too_fast' | 'wrong_way' | 'not_enough_data'
}

/**
 * Once a week, compare the weight trend with the goal pace and suggest a small calorie change
 * (about 100-150 kcal a day). Small, regular nudges work better than big jumps.
 */
export function calorieCheckin(p: Profile, weights: BodyWeight[], now = new Date()): CalorieCheckin {
  const goal: Goal = p.goal ?? 'maintain'
  const last = p.kcal_checkin_at ? new Date(p.kcal_checkin_at) : p.onboarded_at ? new Date(p.onboarded_at) : now
  const due = now.getTime() - last.getTime() >= 7 * DAY
  const since = localDay(daysAgo(21))
  const trend = weightTrend(dailyWeights(weights)).filter((x) => x.day >= since)
  const recent = trend.filter((x) => x.day >= localDay(daysAgo(14)))
  const span = trend.length ? (new Date(trend.at(-1)!.day).getTime() - new Date(trend[0].day).getTime()) / DAY : 0
  const confidence = recent.length >= 8 && span >= 14 ? 'high' : recent.length >= 4 && span >= 7 ? 'medium' : 'low'
  const weight = trend.at(-1)?.trend ?? Number(p.start_weight_kg ?? 70)
  const goalKgPerWeek = (GOAL_PACE[goal] / 100) * weight
  const slope = slopePerWeek(trend.map((x) => ({ day: x.day, kg: x.trend })))
  if (confidence === 'low' || slope === null) {
    return { due, confidence, actualKgPerWeek: slope, goalKgPerWeek, change: 0, verdict: 'not_enough_data' }
  }
  const tolerance = Math.max(0.1, weight * 0.0015)
  const diff = slope - goalKgPerWeek // positive = heavier than planned
  let verdict: CalorieCheckin['verdict'] = 'on_track'
  let change = 0
  if (Math.abs(diff) > tolerance) {
    const step = Math.abs(diff) > tolerance * 3 ? 150 : 100
    change = diff > 0 ? -step : step
    if (goal === 'fat_loss') verdict = slope > 0 ? 'wrong_way' : diff > 0 ? 'too_slow' : 'too_fast'
    else if (goal === 'muscle_gain') verdict = slope < 0 ? 'wrong_way' : diff < 0 ? 'too_slow' : 'too_fast'
    else verdict = diff > 0 ? 'too_slow' : 'too_fast'
  }
  // Keep the total correction within ±600 kcal of the estimate.
  const current = p.kcal_adjust ?? 0
  change = Math.max(-600, Math.min(600, current + change)) - current
  return { due, confidence, actualKgPerWeek: slope, goalKgPerWeek, change, verdict }
}
