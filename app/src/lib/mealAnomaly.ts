// A meal that looks logged by mistake, looked for when it is logged and again once the meal is over: breakfast at
// 10:00, lunch at 15:30, dinner (and the day's snacks) at 21:30, so meals that arrive from elsewhere (another app,
// a family member, Coach) are looked at too. Three things are odd:
// - a food named but logged as something much lighter ("Taralli classici" logged as 3 g of breadsticks);
// - a main meal far lighter than the person's usual one (a quarter of it);
// - a meal heavier than any meal (over 1000 kcal or 100 g of protein), when it did not go through the app's own
//   check before saving.
// The person is asked until they correct the meal or say it is right (`checked_at`); then never again.
import { localDay, sumItems } from './calc'
import { MAIN_MEALS } from './dayCheck'
import { MEAL_KCAL_MAX, MEAL_PROTEIN_MAX } from './mealCheck'
import type { FoodItem, FoodLog, Locale, Meal } from './types'
import { nameStems, parseMeal } from './voice'

/** When each meal is over and is looked at, in minutes after midnight: 2 hours after breakfast and lunch, 1 after dinner. */
export const CHECK_AT: Record<Meal, number> = { breakfast: 10 * 60, lunch: 15 * 60 + 30, dinner: 21 * 60 + 30, snack: 21 * 60 + 30 }
/** Logged in the app: looked at as soon as it is logged. Anything else waits until the meal is over. */
const LOGGED_HERE = new Set<FoodLog['source']>(['ai', 'manual', 'barcode', 'voice'])
/** How far back meals are looked at. */
const DAYS = 7
/** A usual meal while there are fewer than 5 to learn it from. */
const USUAL: Record<Meal, number> = { breakfast: 300, lunch: 600, dinner: 600, snack: 200 }

export interface MealAnomaly {
  day: string
  meal: Meal
  /** Everything logged for that meal that day. */
  entries: FoodLog[]
  reason: 'named' | 'light' | 'heavy'
  /** The meal's calories, all its entries together. */
  kcal: number
  /** light: the person's usual calories for this meal, or a typical meal's (`own` false) while there is no history. */
  usual?: { kcal: number; own: boolean }
  /** named: the entry, and the foods its name says, in a typical portion unless an amount was said. */
  named?: { log: FoodLog; items: FoodItem[] }
  /** heavy: the entry. */
  heavy?: FoodLog
}

/** From another app (Health Connect, or Build With Science read on the phone): changed there, not here. */
export const isSynced = (e: Pick<FoodLog, 'source' | 'origin'>) => e.source === 'health_connect' || (e.source === 'import' && Boolean(e.origin))

/** The meal of the day this is, with the day: one key per meal. */
const slotOf = (f: Pick<FoodLog, 'eaten_at' | 'meal'>) => `${localDay(new Date(f.eaten_at))}|${f.meal}`

/**
 * The foods a meal's name says, when the meal holds none of them and is much lighter than they would be (under
 * half): "Taralli classici" with 3 g of breadsticks in it. Null when the name and the foods agree, even in part.
 */
export function namedFoods(log: Pick<FoodLog, 'title' | 'items' | 'kcal'>, locale: Locale): FoodItem[] | null {
  const said = parseMeal(log.title ?? '', locale).items
  if (!said.length) return null
  const items = log.items ?? []
  const ids = new Set(items.flatMap((i) => parseMeal(i.name, locale).items.map((x) => x.foodId)))
  const stems = new Set(items.flatMap((i) => nameStems(i.name)))
  // A food counts as there when the same food is, or a food sharing a word with it ("pasta" in "pasta al sugo").
  // Only a meal holding none of them: a name that matches in part ("risotto" for "rice") is no mistake.
  if (said.some((s) => ids.has(s.foodId) || nameStems(s.said).some((w) => stems.has(w)))) return null
  if (Number(log.kcal) >= sumItems(said).kcal / 2) return null
  return said.map(({ foodId: _id, said: _said, amountSaid: _amount, ...item }) => item)
}

/**
 * The person's usual calories for this meal: the middle of the days it was logged in the 4 weeks before (`own`), or
 * a typical meal while there are fewer than 5 of them.
 */
export function usualKcal(food: FoodLog[], meal: Meal, day: string): { kcal: number; own: boolean } {
  const byDay = new Map<string, number>()
  for (const f of food) {
    const d = localDay(new Date(f.eaten_at))
    if (f.meal !== meal || d >= day) continue
    byDay.set(d, (byDay.get(d) ?? 0) + Number(f.kcal))
  }
  const xs = [...byDay.values()].sort((a, b) => a - b)
  return xs.length >= 5 ? { kcal: xs[Math.floor(xs.length / 2)], own: true } : { kcal: USUAL[meal], own: false }
}

/** The odd meals of the last week not yet looked at, most recent first. */
export function mealAnomalies(food: FoodLog[], locale: Locale, now = new Date()): MealAnomaly[] {
  const today = localDay(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const first = new Date(now)
  first.setDate(first.getDate() - (DAYS - 1))
  const from = localDay(first)
  const slots = new Map<string, FoodLog[]>()
  for (const f of food) {
    const d = localDay(new Date(f.eaten_at))
    if (d < from || d > today) continue
    const k = slotOf(f)
    slots.set(k, [...(slots.get(k) ?? []), f])
  }
  const out: MealAnomaly[] = []
  for (const [k, entries] of slots) {
    if (entries.every((e) => e.checked_at)) continue
    const [day, meal] = k.split('|') as [string, Meal]
    const over = day < today || minutes >= CHECK_AT[meal]
    const kcal = Math.round(entries.reduce((s, e) => s + Number(e.kcal), 0))
    const ready = entries.filter((e) => !e.checked_at && (over || LOGGED_HERE.has(e.source)))
    const base = { day, meal, entries, kcal }
    let named: MealAnomaly['named']
    for (const e of ready) {
      const items = namedFoods(e, locale)
      if (items) {
        named = { log: e, items }
        break
      }
    }
    const usual = usualKcal(food, meal, day)
    // Meals logged here were checked before saving: only meals from elsewhere are heavy here, and only when they are
    // also twice the person's usual one (big dinners are no mistake for whoever always has them).
    const heavy = ready.find(
      (e) => !LOGGED_HERE.has(e.source) && (Number(e.kcal) > MEAL_KCAL_MAX || Number(e.protein_g) > MEAL_PROTEIN_MAX) && Number(e.kcal) > 2 * usual.kcal,
    )
    if (named) out.push({ ...base, reason: 'named', named })
    else if (heavy) out.push({ ...base, reason: 'heavy', heavy })
    // A light breakfast is no mistake for someone whose breakfast is always a coffee: only against a real usual.
    else if (over && MAIN_MEALS.includes(meal) && usual.kcal >= 200 && kcal < usual.kcal / 4) {
      out.push({ ...base, reason: 'light', usual: { kcal: Math.round(usual.kcal), own: usual.own } })
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || CHECK_AT[a.meal] - CHECK_AT[b.meal])
}

/** The next moment a meal is looked at (10:00, 15:30, 21:30), to look again then while the app is open. */
export function nextCheck(now = new Date()): Date {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const times = [...new Set(Object.values(CHECK_AT))].sort((a, b) => a - b)
  const next = times.find((m) => m > minutes)
  const at = new Date(now)
  if (next === undefined) {
    at.setDate(at.getDate() + 1)
    at.setHours(0, times[0], 0, 0)
  } else at.setHours(0, next, 0, 0)
  return at
}
