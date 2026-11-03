// "What happened last week": once a week, for people who logged it well enough (at least 4 days with a weigh-in
// and 4 complete days of food), the week told in a few lines: food against the targets, the weight trend against
// the chosen pace, workouts and steps, and how the energy estimate and the target moved with it. The weekly
// calorie check-in rides along, when one is due.
import { calorieCheckin, dailyWeights, localDay, weekStart, weightTrend, type CalorieCheckin } from './calc'
import type { SessionWithSets } from './data'
import { computeEnergy, incompleteDays, type Energy } from './energy'
import type { BodyWeight, DailySteps, FoodDay, FoodLog, Profile } from './types'

/** At least this many days with a weigh-in, and this many complete days of food, in the week. */
export const WEEK_MIN_DAYS = 4

export interface WeekSummary {
  /** Monday and Sunday of the week told. */
  from: string
  to: string
  foodDays: number
  weighIns: number
  avgKcal: number
  avgProtein: number
  /** Days with the calories inside the target range. */
  daysOnTarget: number
  /** Change of the weight trend over the week (kg), and the pace chosen (kg a week). */
  trendChange: number | null
  paceKgPerWeek: number
  workouts: number
  workoutsGoal: number
  avgSteps: number | null
  stepsGoal: number
  /** The energy used and the target, at the start of the week and now. */
  tdeeBefore: number
  tdeeNow: number
  targetBefore: number
  targetNow: number
  method: Energy['tdee']['method']
  checkin: CalorieCheckin
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** The week before this one (Monday to Sunday), told, or null when it was not logged enough to say much. */
export function lastWeekSummary(
  profile: Profile,
  weights: BodyWeight[],
  steps: DailySteps[],
  sessions: SessionWithSets[],
  food: FoodLog[],
  notes: FoodDay[],
  energy: Energy,
  now = new Date(),
): WeekSummary | null {
  const end = weekStart(now) // this Monday, 00:00
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  const from = localDay(start)
  const to = localDay(new Date(end.getTime() - 1))
  const inWeek = (d: string) => d >= from && d <= to

  const weighIns = new Set(weights.map((w) => localDay(new Date(w.measured_at))).filter(inWeek)).size
  const skip = incompleteDays(food, energy.targets.kcal, notes, now)
  const byDay = new Map<string, { kcal: number; protein: number }>()
  for (const f of food) {
    const d = localDay(new Date(f.eaten_at))
    if (!inWeek(d) || skip.has(d)) continue
    const x = byDay.get(d) ?? { kcal: 0, protein: 0 }
    x.kcal += Number(f.kcal)
    x.protein += Number(f.protein_g)
    byDay.set(d, x)
  }
  if (weighIns < WEEK_MIN_DAYS || byDay.size < WEEK_MIN_DAYS) return null

  const days = [...byDay.values()]
  const [lo, hi] = energy.targets.ranges.kcal
  const trend = weightTrend(dailyWeights(weights)).filter((p) => p.day <= to)
  const atStart = [...trend].reverse().find((p) => p.day < from) ?? trend.find((p) => inWeek(p.day))
  const atEnd = [...trend].reverse().find((p) => inWeek(p.day))
  const before = computeEnergy(profile, weights, steps, sessions, food, notes, start)
  const stepDays = steps.filter((s) => inWeek(s.day) && s.steps > 0)
  const checkin = calorieCheckin(profile, weights, now)
  return {
    from,
    to,
    foodDays: byDay.size,
    weighIns,
    avgKcal: Math.round(avg(days.map((d) => d.kcal))),
    avgProtein: Math.round(avg(days.map((d) => d.protein))),
    daysOnTarget: days.filter((d) => d.kcal >= lo && d.kcal <= hi * 1.03).length,
    trendChange: atStart && atEnd && atStart !== atEnd ? Math.round((atEnd.trend - atStart.trend) * 100) / 100 : null,
    paceKgPerWeek: checkin.goalKgPerWeek,
    workouts: sessions.filter((s) => inWeek(localDay(new Date(s.started_at)))).length,
    workoutsGoal: profile.workouts_per_week,
    avgSteps: stepDays.length ? Math.round(avg(stepDays.map((s) => s.steps))) : null,
    stepsGoal: profile.steps_goal,
    tdeeBefore: before.tdee.tdee,
    tdeeNow: energy.tdee.tdee,
    targetBefore: before.targets.kcal,
    targetNow: energy.targets.kcal,
    method: energy.tdee.method,
    checkin,
  }
}
