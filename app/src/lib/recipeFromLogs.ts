// A recipe from what was logged: a meal, one food of it (one synced from Build With Science too), or several picked
// together. Their foods come with their values as logged; foods that came without a weight (other apps send only
// calories and nutrients) get one worked out from a food of the same name, marked as estimated, to check.
import { FOODS } from '../data/foods'
import { searchAll, type FoodDbState, type LoggedItem } from './foodDb'
import type { FoodItem, FoodLog } from './types'
import { parseMeal } from './voice'

/**
 * A food of a recipe being written: `estimated` when its weight was worked out from its calories; `scanned` when it
 * was scanned, read from a photo or typed in just now (only those join the family's foods: the others are there
 * already, or their values per 100 g would rest on a guessed weight).
 */
export type DraftItem = LoggedItem & { estimated?: boolean; scanned?: boolean }

/** A logged meal's foods; one logged with its totals only is one food with those totals, and no weight. */
export function foodsOfLog(log: FoodLog): FoodItem[] {
  if (log.items?.length) return log.items
  return [
    {
      name: log.title,
      grams: 0,
      kcal: Number(log.kcal),
      protein_g: Number(log.protein_g),
      carbs_g: Number(log.carbs_g),
      fat_g: Number(log.fat_g),
      fiber_g: Number(log.fiber_g),
      sugar_g: Number(log.sugar_g),
      ...(log.salt_g != null ? { salt_g: Number(log.salt_g) } : {}),
      ...(log.satfat_g != null ? { satfat_g: Number(log.satfat_g) } : {}),
    },
  ]
}

const byId = new Map(FOODS.map((f) => [f.id, f]))

/** Calories per 100 g of a food with this name: the family's own product first, then the one food the name says. */
function kcalPer100(name: string, st: FoodDbState): number | null {
  const own = searchAll(name, st, 5).find((p) => (p.kind === 'db' ? p.food.source !== 'recipe' && Number(p.food.kcal) > 0 : p.food.kcal > 0))
  if (own) return Number(own.food.kcal)
  for (const locale of ['en', 'it'] as const) {
    const said = parseMeal(name, locale).items
    if (said.length === 1) return byId.get(said[0].foodId)?.kcal ?? null
  }
  return null
}

/** A food without a weight, with one worked out from its calories (between 1 g and 1.5 kg), or as it was. */
export function withWeight(item: FoodItem, st: FoodDbState): DraftItem {
  if (item.grams > 0 || !(item.kcal > 0)) return item
  const per100 = kcalPer100(item.name, st)
  const grams = per100 ? Math.round((item.kcal / per100) * 100) : 0
  return grams >= 1 && grams <= 1500 ? { ...item, grams, estimated: true } : item
}

/** A recipe's name and foods from logged meals: one meal's own name, or the names of all of them. */
export function draftFromLogs(logs: FoodLog[], st: FoodDbState): { name: string; items: DraftItem[] } {
  const titles = [...new Set(logs.map((l) => l.title.trim()).filter(Boolean))]
  return {
    name: titles.join(' + ').slice(0, 120),
    items: logs.flatMap(foodsOfLog).map((it) => withWeight(it, st)),
  }
}

/** The start of a recipe made from logged meals, for the recipe editor: their foods, and one portion, what was eaten. */
export function recipeDraftFromLogs(logs: FoodLog[], st: FoodDbState) {
  const d = draftFromLogs(logs, st)
  return { name: d.name, servings: 1, added: d.items, fromLog: true }
}
