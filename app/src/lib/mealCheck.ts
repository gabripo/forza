// A meal logged by mistake: grams typed or heard wrong, three scoops read as three hundred grams, a product taken
// for another. Most meals stay well under 1000 kcal and 100 g of protein: above that, the amounts are checked
// before the meal is saved.
import { useMemo, useState } from 'react'
import { sumItems } from './calc'
import type { FoodItem } from './types'

export const MEAL_KCAL_MAX = 1000
export const MEAL_PROTEIN_MAX = 100

export interface UnusualMeal {
  /** What is unusual: the calories, or the protein. */
  reason: 'kcal' | 'protein'
  kcal: number
  protein: number
  /** The foods to check first: the ones that weigh most on it (up to three). */
  check: FoodItem[]
}

/** Null for a meal that looks like a meal. */
export function unusualMeal(items: FoodItem[]): UnusualMeal | null {
  const t = sumItems(items)
  const reason = t.kcal > MEAL_KCAL_MAX ? 'kcal' : t.protein_g > MEAL_PROTEIN_MAX ? 'protein' : null
  if (!reason) return null
  const share = (i: FoodItem) => Number(reason === 'kcal' ? i.kcal : i.protein_g) || 0
  const total = reason === 'kcal' ? t.kcal : t.protein_g
  // The biggest one always; the others when they are at least a fifth of the meal.
  const check = [...items].sort((a, b) => share(b) - share(a)).filter((i, n) => n === 0 || share(i) >= total / 5).slice(0, 3)
  return { reason, kcal: Math.round(t.kcal), protein: Math.round(t.protein_g), check }
}

export interface MealCheck {
  odd: UnusualMeal | null
  /** The person was asked about this very meal (these totals): the next tap saves it. */
  asked: boolean
  ask: () => void
}

/** Whether the meal looks like a mistake, and whether the person was already asked about it. */
export function useMealCheck(items: FoodItem[]): MealCheck {
  const odd = useMemo(() => unusualMeal(items), [items])
  const key = odd ? `${odd.kcal}|${odd.protein}` : null
  const [asked, setAsked] = useState<string | null>(null)
  return { odd, asked: Boolean(key && asked === key), ask: () => setAsked(key) }
}
