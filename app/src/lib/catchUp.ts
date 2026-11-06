// After days short of protein or of calories: what was missing, and a few foods that bring it back, so today
// ends on target. Protein counts for everyone. Calories do not while losing fat: eating under the target is then
// part of the plan, and only protein is asked for (it keeps the muscles while the weight goes down).
import { FOODS, PROCESSED_FOODS, foodAt, type Food } from '../data/foods'
import { localDay, type Targets } from './calc'
import { logsOfDay, totalsOf } from './dayCheck'
import { incompleteDays } from './energy'
import { dbFoodAt, frequentFoods, type FoodDbState, type LoggedItem } from './foodDb'
import type { FoodDay, FoodLog, Goal, Locale } from './types'

/** The past days looked at: yesterday and the two before. */
export const CATCH_UP_DAYS = 3

/** What a few past days were short of, for one target. */
export interface Shortfall {
  /** Days short of the target, out of the days that count (logged in full). */
  short: number
  of: number
  /** Yesterday counted and was short. */
  yesterday: boolean
  /** Eaten on average on the days short (yesterday alone when it is the only one). */
  eaten: number
  target: number
}

export interface CatchUp {
  protein: Shortfall | null
  kcal: Shortfall | null
}

/** A food suggested, as it would be logged: one usual portion. */
export interface CatchUpPick {
  item: LoggedItem
  /** "1 pot", or null when the portion is just grams. */
  unit: string | null
  /** One of the person's own usual foods. */
  usual: boolean
}

/**
 * What the last days were short of. A day counts when it was logged in full (not left out of the averages), and is
 * short when protein is under its range (by 10 g or more), or the calories under 90% of the target (by 150 kcal or
 * more; never while losing fat). Asked for when yesterday was short, or two of the last three days; not once today
 * has already caught up.
 */
export function catchUp(food: FoodLog[], notes: FoodDay[], targets: Targets, goal: Goal, now = new Date()): CatchUp {
  const left = incompleteDays(food, targets.kcal, notes, now)
  const days = Array.from({ length: CATCH_UP_DAYS }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - i - 1)
    return localDay(d)
  })
  const counted = days.map((day) => ({ day, logs: logsOfDay(food, day) })).filter((d) => d.logs.length && !left.has(d.day))
  const totals = counted.map((d) => ({ day: d.day, t: totalsOf(d.logs) }))
  const today = totalsOf(logsOfDay(food, localDay(now)))

  function shortfall(eaten: (t: ReturnType<typeof totalsOf>) => number, isShort: (n: number) => boolean, target: number, caughtUp: boolean): Shortfall | null {
    const short = totals.filter((d) => isShort(eaten(d.t)))
    const yesterday = short.some((d) => d.day === days[0])
    if (caughtUp || !(yesterday || short.length >= 2)) return null
    const used = short.length >= 2 ? short : short.filter((d) => d.day === days[0])
    return { short: short.length, of: totals.length, yesterday, eaten: Math.round(used.reduce((s, d) => s + eaten(d.t), 0) / used.length), target: Math.round(target) }
  }

  const [pLow] = targets.ranges.protein_g
  const protein = shortfall((t) => t.protein_g, (p) => p <= pLow - 10, targets.protein_g, today.protein_g >= pLow)
  const kcal =
    goal === 'fat_loss'
      ? null
      : shortfall((t) => t.kcal, (k) => k < targets.kcal * 0.9 && targets.kcal - k >= 150, targets.kcal, today.kcal >= targets.ranges.kcal[0])
  return { protein, kcal }
}

const builtinPick = (food: Food, locale: Locale, usual: boolean): CatchUpPick => ({
  item: { name: food.name[locale], grams: food.portion, ...foodAt(food, food.portion), foodId: food.id },
  unit: food.unit ? food.unit[locale] : null,
  usual,
})

/**
 * Easy additions, the easiest first: a pot of yogurt, a can of tuna. Lean ones while losing fat. Legumes are there
 * for whoever eats no meat or fish.
 */
const PROTEIN_ADDS: Record<'lean' | 'any', string[]> = {
  lean: ['greek_yogurt_0', 'tuna_water', 'bresaola', 'skyr', 'cottage', 'chicken_breast', 'egg_white', 'lentils'],
  any: ['greek_yogurt_0', 'tuna_water', 'egg', 'cottage', 'chicken_breast', 'skyr', 'bresaola', 'lentils'],
}
/** Calories that come easily and well: nuts, wholegrain bread, fruit, oats, milk; with protein first for muscle. */
const KCAL_ADDS: Record<'muscle' | 'any', string[]> = {
  muscle: ['peanut_butter', 'oats', 'whole_milk', 'greek_yogurt', 'almonds', 'banana', 'bread_wholegrain'],
  any: ['almonds', 'bread_wholegrain', 'banana', 'oats', 'olive_oil', 'whole_milk', 'walnuts'],
}
const byId = new Map(FOODS.map((f) => [f.id, f]))

/**
 * The person's own foods first (two at most), then the list, each of another kind (dairy, fish or meat, legumes…)
 * so that one of them is easy to fit in, up to `count`.
 */
function choose(own: CatchUpPick[], list: string[], locale: Locale, count: number): CatchUpPick[] {
  const out = own.slice(0, 2)
  const groups = new Set(out.flatMap((p) => (p.item.foodId ? [byId.get(p.item.foodId)?.group] : [])))
  for (const f of list.map((id) => byId.get(id)).filter((f): f is Food => Boolean(f))) {
    if (out.length >= count) break
    if (out.some((p) => p.item.foodId === f.id) || groups.has(f.group)) continue
    groups.add(f.group)
    out.push(builtinPick(f, locale, false))
  }
  return out
}

/**
 * Foods that bring protein: the person's own foods with plenty of it in one usual portion (12 g or more, a good
 * share of their calories, lean ones while losing fat; 400 kcal at most), then easy additions.
 */
export function proteinPicks(goal: Goal, db: FoodDbState, locale: Locale, count = 3): CatchUpPick[] {
  const list = PROTEIN_ADDS[goal === 'fat_loss' ? 'lean' : 'any']
  const share = goal === 'fat_loss' ? 0.4 : 0.25
  const rich = (i: { kcal: number; protein_g: number }) => i.protein_g >= 12 && i.kcal > 0 && i.kcal <= 400 && (i.protein_g * 4) / i.kcal >= share
  const own: CatchUpPick[] = []
  for (const p of frequentFoods(db, 30)) {
    if (p.kind === 'builtin') {
      const plain = !PROCESSED_FOODS.has(p.food.id) && !['dishes', 'drinks', 'treats'].includes(p.food.group)
      if (plain && rich(foodAt(p.food, p.food.portion))) own.push(builtinPick(p.food, locale, true))
    } else if (p.food.source !== 'recipe') {
      const item = { ...dbFoodAt(p.food, p.food.portion_g || 100), dbId: p.food.id }
      if (rich(item)) own.push({ item, unit: null, usual: true })
    }
  }
  return choose(own, list, locale, count)
}

/** Foods that bring calories easily and well, those the person has often first. Never ultra-processed. */
export function kcalPicks(goal: Goal, db: FoodDbState, locale: Locale, count = 3): CatchUpPick[] {
  const list = KCAL_ADDS[goal === 'muscle_gain' ? 'muscle' : 'any']
  const own = frequentFoods(db, 30).flatMap((p) => (p.kind === 'builtin' && list.includes(p.food.id) ? [builtinPick(p.food, locale, true)] : []))
  return choose(own, list, locale, count)
}
