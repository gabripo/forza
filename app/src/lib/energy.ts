import { adaptiveTdee, bwsTargets, dailyTargets, dailyWeights, estimateTdee, localDay, weightTrend, type Targets, type TdeeEstimate } from './calc'
import type { SessionWithSets } from './data'
import type { BodyWeight, DailySteps, FoodDay, FoodLog, Profile } from './types'

export interface Energy {
  weightKg: number
  tdee: TdeeEstimate
  targets: Targets
  avgSteps: number | null
  workoutsPerWeek: number
  avgWorkoutMinutes: number
  loggedFoodDays: number
  /** Weigh-in days in the last 4 weeks. */
  weighIns: number
  /** Days of the last 4 weeks left out because their food was not all logged. */
  leftOutDays: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function sessionMinutes(s: { started_at: string; finished_at: string | null }): number {
  if (!s.finished_at) return 0
  return Math.max(0, (new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000)
}

/** Midnight `n` days before `now`. */
function before(now: Date, n: number): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

/** Complete days of food before the measured energy counts at all, and before it counts its most (80%). */
export const MIN_DAYS = 14
export const FULL_DAYS = 28

/** Under this share of the calorie target, a day counts as logged only in part, unless the person said it was all. */
export const INCOMPLETE_SHARE = 0.7

/**
 * Days whose food is left out of every sum and average: the person said something was not logged, or the day is
 * under 70% of the calorie target and the person did not say it was everything. Today is never judged (not over).
 */
export function incompleteDays(food: Pick<FoodLog, 'eaten_at' | 'kcal'>[], targetKcal: number, notes: Pick<FoodDay, 'day' | 'status'>[] = [], now = new Date()): Set<string> {
  const kcal = new Map<string, number>()
  for (const f of food) {
    const d = localDay(new Date(f.eaten_at))
    kcal.set(d, (kcal.get(d) ?? 0) + Number(f.kcal))
  }
  const said = new Map(notes.map((n) => [n.day, n.status]))
  const today = localDay(now)
  const out = new Set<string>()
  for (const [d, k] of kcal) {
    if (d >= today) continue
    const s = said.get(d)
    if (s === 'incomplete' || (s !== 'complete' && k < targetKcal * INCOMPLETE_SHARE)) out.add(d)
  }
  for (const n of notes) if (n.status === 'incomplete') out.add(n.day)
  return out
}

/**
 * Daily energy needs from everything we know about the person, as of `now` (today, or a past day to rebuild the
 * history of the targets). `notes` are what the person said about past days (all logged or not).
 */
export function computeEnergy(
  profile: Profile,
  weights: BodyWeight[],
  steps: DailySteps[],
  sessions: SessionWithSets[],
  food: Pick<FoodLog, 'eaten_at' | 'kcal'>[],
  notes: Pick<FoodDay, 'day' | 'status'>[] = [],
  now = new Date(),
): Energy {
  const at = now.getTime()
  const today = localDay(now)
  const trend = weightTrend(dailyWeights(weights.filter((w) => new Date(w.measured_at).getTime() <= at)))
  const weightKg = trend.at(-1)?.trend ?? Number(profile.start_weight_kg ?? 70)

  const from14 = localDay(before(now, 14))
  const recentSteps = steps.filter((s) => s.day >= from14 && s.day <= today && s.steps > 0)
  const avgSteps = recentSteps.length >= 4 ? Math.round(avg(recentSteps.map((s) => s.steps))) : null

  const since28 = before(now, 28)
  const recent = sessions.filter((s) => new Date(s.started_at) >= since28 && new Date(s.started_at).getTime() <= at)
  const workoutsPerWeek = recent.length / 4
  const minutes = recent.map(sessionMinutes).filter((m) => m > 5 && m < 240)
  const avgWorkoutMinutes = minutes.length ? avg(minutes) : 50

  // The formula's target first: "under 70%" is measured against it.
  const formulaOnly = estimateTdee({ profile, weightKg, avgSteps, workoutsPerWeek, avgWorkoutMinutes })
  const reference = dailyTargets(profile, weightKg, formulaOnly.tdee)
  const skip = incompleteDays(food, (bwsTargets(profile, reference) ?? reference).kcal, notes, now)

  // Adaptive estimate: the complete days of the last 4 weeks (not today) against the weight trend of the same
  // weeks. It counts from 14 such days (two weekends) and 4 weigh-ins, and more and more up to 4 weeks: a reliable
  // measurement needs about 28 days of food and weight (Hall & Chow 2011; Basiotis et al. 1987).
  const kcalByDay = new Map<string, number>()
  for (const f of food) {
    const when = new Date(f.eaten_at)
    const d = localDay(when)
    if (when < since28 || d >= today || skip.has(d)) continue
    kcalByDay.set(d, (kcalByDay.get(d) ?? 0) + Number(f.kcal))
  }
  const goodDays = [...kcalByDay]
  let adaptive: number | null = null
  let adaptiveWeight = 0
  const window = trend.filter((p) => new Date(p.day) >= since28)
  if (goodDays.length >= MIN_DAYS && window.length >= 4) {
    const span = Math.max(7, (new Date(window.at(-1)!.day).getTime() - new Date(window[0].day).getTime()) / 86_400_000)
    adaptive = adaptiveTdee(avg(goodDays.map(([, k]) => k)), window.at(-1)!.trend - window[0].trend, span)
    adaptiveWeight = 0.8 * Math.min(1, goodDays.length / FULL_DAYS) * Math.min(1, window.length / 8)
  }

  const tdee = estimateTdee({ profile, weightKg, avgSteps, workoutsPerWeek, avgWorkoutMinutes, adaptive, adaptiveWeight })
  const own = dailyTargets(profile, weightKg, tdee.tdee)
  return {
    weightKg,
    tdee,
    targets: bwsTargets(profile, own) ?? own,
    avgSteps,
    workoutsPerWeek,
    avgWorkoutMinutes,
    loggedFoodDays: goodDays.length,
    weighIns: window.length,
    leftOutDays: [...skip].filter((d) => d >= localDay(since28)).length,
  }
}

/** The daily targets of one day: as they were then, or worked out again from what was logged up to that day. */
export interface TargetPoint {
  day: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  tdee: number | null
  method: string | null
  weight_kg: number | null
  /** Worked out again now (before targets were kept), with today's settings. */
  estimated?: boolean
}

/**
 * The targets of past weeks (one a week), worked out as the app would have then, from what was logged up to each
 * week: the history before targets were kept. Today's settings are used (goal, pace, a target set by hand).
 */
export function pastTargets(
  profile: Profile,
  weights: BodyWeight[],
  steps: DailySteps[],
  sessions: SessionWithSets[],
  food: Pick<FoodLog, 'eaten_at' | 'kcal'>[],
  notes: Pick<FoodDay, 'day' | 'status'>[] = [],
  weeks = 26,
  now = new Date(),
): TargetPoint[] {
  const out: TargetPoint[] = []
  for (let i = weeks; i >= 1; i--) {
    const at = new Date(now)
    at.setDate(at.getDate() - 7 * i)
    at.setHours(21, 0, 0, 0)
    // Only from the first thing logged: before it there is nothing to work out.
    if (!weights.some((w) => new Date(w.measured_at) <= at) && !food.some((f) => new Date(f.eaten_at) <= at)) continue
    const e = computeEnergy(profile, weights, steps, sessions, food, notes, at)
    out.push({ day: localDay(at), kcal: e.targets.kcal, protein_g: e.targets.protein_g, carbs_g: e.targets.carbs_g, fat_g: e.targets.fat_g, tdee: e.tdee.tdee, method: e.tdee.method, weight_kg: Math.round(e.weightKg * 100) / 100, estimated: true })
  }
  return out
}

/** The targets kept day by day, with the weeks before the first one worked out again: one line, oldest first. */
export function targetSeries(kept: TargetPoint[], past: TargetPoint[]): TargetPoint[] {
  const first = kept[0]?.day
  return [...past.filter((p) => !first || p.day < first), ...kept].sort((a, b) => a.day.localeCompare(b.day))
}
