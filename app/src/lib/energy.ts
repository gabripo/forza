import { adaptiveTdee, dailyTargets, dailyWeights, daysAgo, estimateTdee, localDay, weightTrend, type Targets, type TdeeEstimate } from './calc'
import type { SessionWithSets } from './data'
import type { BodyWeight, DailySteps, FoodLog, Profile } from './types'

export interface Energy {
  weightKg: number
  tdee: TdeeEstimate
  targets: Targets
  avgSteps: number | null
  workoutsPerWeek: number
  avgWorkoutMinutes: number
  loggedFoodDays: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function sessionMinutes(s: { started_at: string; finished_at: string | null }): number {
  if (!s.finished_at) return 0
  return Math.max(0, (new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000)
}

/** Daily energy needs from everything we know about the person. */
export function computeEnergy(
  profile: Profile,
  weights: BodyWeight[],
  steps: DailySteps[],
  sessions: SessionWithSets[],
  food: FoodLog[],
): Energy {
  const trend = weightTrend(dailyWeights(weights))
  const weightKg = trend.at(-1)?.trend ?? Number(profile.start_weight_kg ?? 70)

  const from14 = localDay(daysAgo(14))
  const recentSteps = steps.filter((s) => s.day >= from14 && s.steps > 0)
  const avgSteps = recentSteps.length >= 4 ? Math.round(avg(recentSteps.map((s) => s.steps))) : null

  const since28 = daysAgo(28)
  const recent = sessions.filter((s) => new Date(s.started_at) >= since28)
  const workoutsPerWeek = recent.length / 4
  const minutes = recent.map(sessionMinutes).filter((m) => m > 5 && m < 240)
  const avgWorkoutMinutes = minutes.length ? avg(minutes) : 50

  // Adaptive estimate: needs 14+ well-logged days and a weight trend over the same window.
  const kcalByDay = new Map<string, number>()
  for (const f of food) {
    if (new Date(f.eaten_at) < since28) continue
    const d = localDay(new Date(f.eaten_at))
    kcalByDay.set(d, (kcalByDay.get(d) ?? 0) + Number(f.kcal))
  }
  const goodDays = [...kcalByDay].filter(([, k]) => k >= 900)
  let adaptive: number | null = null
  const window = trend.filter((p) => new Date(p.day) >= since28)
  if (goodDays.length >= 14 && window.length >= 6) {
    const span = Math.max(7, (new Date(window.at(-1)!.day).getTime() - new Date(window[0].day).getTime()) / 86_400_000)
    adaptive = adaptiveTdee(avg(goodDays.map(([, k]) => k)), window.at(-1)!.trend - window[0].trend, span)
  }

  const tdee = estimateTdee({ profile, weightKg, avgSteps, workoutsPerWeek, avgWorkoutMinutes, adaptive })
  return {
    weightKg,
    tdee,
    targets: dailyTargets(profile, weightKg, tdee.tdee),
    avgSteps,
    workoutsPerWeek,
    avgWorkoutMinutes,
    loggedFoodDays: goodDays.length,
  }
}
