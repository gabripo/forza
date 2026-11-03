// A day of food, looked at as a whole: the totals of each meal and of the day, a kind evaluation of the day, one
// sentence of encouragement for Home, and the questions asked once a day is over (was everything logged? was a
// meal skipped? is it always skipped, as with intermittent fasting?).
import { localDay, type Targets } from './calc'
import { INCOMPLETE_SHARE } from './energy'
import type { FoodDay, FoodLog, Meal } from './types'

export const MAIN_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']

export interface Totals {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  /** Null when no food said. */
  satfat_g: number | null
  salt_g: number | null
}

export function totalsOf(logs: Pick<FoodLog, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'satfat_g' | 'salt_g'>[]): Totals {
  const t: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, satfat_g: null, salt_g: null }
  for (const f of logs) {
    t.kcal += Number(f.kcal) || 0
    t.protein_g += Number(f.protein_g) || 0
    t.carbs_g += Number(f.carbs_g) || 0
    t.fat_g += Number(f.fat_g) || 0
    t.fiber_g += Number(f.fiber_g) || 0
    t.sugar_g += Number(f.sugar_g) || 0
    if (f.satfat_g != null) t.satfat_g = (t.satfat_g ?? 0) + Number(f.satfat_g)
    if (f.salt_g != null) t.salt_g = (t.salt_g ?? 0) + Number(f.salt_g)
  }
  return t
}

export const addTotals = (a: Totals, b: Partial<Totals>): Totals => ({
  kcal: a.kcal + (b.kcal ?? 0),
  protein_g: a.protein_g + (b.protein_g ?? 0),
  carbs_g: a.carbs_g + (b.carbs_g ?? 0),
  fat_g: a.fat_g + (b.fat_g ?? 0),
  fiber_g: a.fiber_g + (b.fiber_g ?? 0),
  sugar_g: a.sugar_g + (b.sugar_g ?? 0),
  satfat_g: a.satfat_g == null && b.satfat_g == null ? null : (a.satfat_g ?? 0) + (b.satfat_g ?? 0),
  salt_g: a.salt_g == null && b.salt_g == null ? null : (a.salt_g ?? 0) + (b.salt_g ?? 0),
})

export const logsOfDay = (food: FoodLog[], day: string) => food.filter((f) => localDay(new Date(f.eaten_at)) === day)

/** What a day is judged on: each point is either good, to do, or not yet known. */
export type DayPoint = 'kcal' | 'kcal_over' | 'kcal_low' | 'protein' | 'fiber' | 'satfat' | 'balance'

export interface DayEvaluation {
  /** 0–100: how close the day is to the targets that matter most (energy, protein, fibre, saturated fat). */
  score: number
  band: 'great' | 'good' | 'okay' | 'rethink'
  good: DayPoint[]
  todo: DayPoint[]
  /** Today, before the evening: judged on the share of the day gone by, not on the whole day. */
  inProgress: boolean
}

/**
 * The day as a whole, kindly: for today the targets are scaled to the hours gone by (breakfast is not a failed
 * day), for a past day they are the whole targets. Being over a limit counts at any time.
 */
export function evaluateDay(t: Totals, tg: Targets, day: string, now = new Date()): DayEvaluation {
  const today = day === localDay(now)
  const hour = now.getHours() + now.getMinutes() / 60
  // Share of the day's food expected by now: about 20% by 9, all of it by 21.
  const share = today ? Math.min(1, Math.max(0.2, (hour - 6) / 15)) : 1
  const inProgress = today && share < 1
  const good: DayPoint[] = []
  const todo: DayPoint[] = []
  let score = 0

  const [kLo, kHi] = tg.ranges.kcal
  if (t.kcal > kHi * 1.05 && (!inProgress || t.kcal > kHi)) todo.push('kcal_over')
  else if (!inProgress && t.kcal < kLo * 0.85) todo.push('kcal_low')
  else if (!inProgress || t.kcal >= kLo * share * 0.8) {
    good.push('kcal')
    score += 30
  } else score += 20

  const protein = t.protein_g / (tg.ranges.protein_g[0] * share)
  if (protein >= 1) {
    good.push('protein')
    score += 30
  } else {
    score += Math.round(30 * Math.max(0, protein))
    if (protein < 0.8) todo.push('protein')
  }

  const fiber = t.fiber_g / (tg.fiber_g * share)
  if (fiber >= 0.9) {
    good.push('fiber')
    score += 20
  } else {
    score += Math.round(20 * Math.max(0, fiber))
    if (fiber < 0.7) todo.push('fiber')
  }

  if (t.satfat_g != null && t.satfat_g > tg.satfat_g) todo.push('satfat')
  else {
    score += 20
    if (t.satfat_g != null && t.kcal > 300) good.push('satfat')
  }
  // Carbs and fat both inside their ranges: a balanced day.
  if (!inProgress && t.fat_g >= tg.ranges.fat_g[0] && t.fat_g <= tg.ranges.fat_g[1] && t.carbs_g >= tg.ranges.carbs_g[0] * 0.85) good.push('balance')

  score = Math.max(0, Math.min(100, score))
  const band = score >= 85 ? 'great' : score >= 70 ? 'good' : score >= 50 ? 'okay' : 'rethink'
  return { score, band, good, todo, inProgress }
}

/**
 * One sentence for Home, from what was logged today: the best thing first, then the one thing to add. Keys of
 * `motivation.*` (praise, nudge), or a starting line when nothing is logged yet.
 */
export function motivation(food: FoodLog[], tg: Targets, now = new Date()): { praise: DayPoint | 'start' | 'logged'; nudge: DayPoint | null } {
  const logs = logsOfDay(food, localDay(now))
  if (!logs.length) return { praise: 'start', nudge: null }
  const e = evaluateDay(totalsOf(logs), tg, localDay(now), now)
  const praise = e.good.find((g) => g === 'protein' || g === 'fiber') ?? e.good[0] ?? 'logged'
  const nudge = e.todo.find((x) => x !== praise) ?? null
  return { praise, nudge }
}

/** A question about a past day, asked once (the newest day first). */
export type DayQuestion =
  | { kind: 'skipped'; day: string; meal: Meal }
  | { kind: 'incomplete'; day: string; kcal: number; target: number }
  | { kind: 'pattern'; meal: Meal; days: number }

/** How many days in a row a meal was skipped before asking whether it is always so (intermittent fasting). */
export const PATTERN_DAYS = 3

/**
 * What to ask about the last days, at most one thing at a time:
 * - a meal skipped again and again (said so on PATTERN_DAYS days in a row): is it always so?
 * - a main meal missing on a day with other meals logged: was it skipped?
 * - a day under 70% of the calories: was everything logged?
 * Days already answered, meals the person always skips, and today (not over) are never asked about.
 */
export function dayQuestion(food: FoodLog[], notes: FoodDay[], skipMeals: Meal[], targetKcal: number, now = new Date(), patternAsked: Meal[] = []): DayQuestion | null {
  const said = new Map(notes.map((n) => [n.day, n]))
  const days: string[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push(localDay(d))
  }

  // The same meal skipped on each of the last days: ask once whether it is the person's way of eating.
  for (const meal of MAIN_MEALS) {
    if (skipMeals.includes(meal) || patternAsked.includes(meal)) continue
    let run = 0
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      if (said.get(localDay(d))?.skipped.includes(meal)) run++
      else break
    }
    if (run >= PATTERN_DAYS) return { kind: 'pattern', meal, days: run }
  }

  for (const day of days) {
    const logs = logsOfDay(food, day)
    if (!logs.length) continue
    const note = said.get(day)
    const missing = MAIN_MEALS.find((m) => !skipMeals.includes(m) && !logs.some((f) => f.meal === m) && !note?.skipped.includes(m))
    if (missing && note?.status !== 'incomplete') return { kind: 'skipped', day, meal: missing }
    const kcal = logs.reduce((s, f) => s + Number(f.kcal), 0)
    if (!note?.status && kcal < targetKcal * INCOMPLETE_SHARE) return { kind: 'incomplete', day, kcal: Math.round(kcal), target: targetKcal }
  }
  return null
}

/**
 * Meals marked as always skipped come back by themselves once the person eats them again: logged on 2 of the last
 * 5 days. Returns the meals still skipped.
 */
export function stillSkipped(skipMeals: Meal[], food: FoodLog[], now = new Date()): Meal[] {
  const recent = new Set<string>()
  for (let i = 0; i < 5; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    recent.add(localDay(d))
  }
  return skipMeals.filter((m) => new Set(food.filter((f) => f.meal === m && recent.has(localDay(new Date(f.eaten_at)))).map((f) => localDay(new Date(f.eaten_at)))).size < 2)
}
