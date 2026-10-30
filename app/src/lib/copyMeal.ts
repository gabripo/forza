// Copying meals: many people eat the same breakfast most days, so yesterday's can be logged again in one tap.
import { useState } from 'react'
import { mealForNow } from '../components/PlateResult'
import { daysAgo, localDay } from './calc'
import { copyMealsToToday, deleteFoods } from './data'
import type { FoodLog, Meal } from './types'

const ORDER: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

/** Meals logged by another app come back from there: copying them here would count them twice. */
const synced = (f: FoodLog) => f.source === 'health_connect' || (f.source === 'import' && Boolean(f.origin))

export interface CopySuggestion {
  meal: Meal
  entries: FoodLog[]
  kcal: number
}

/**
 * Yesterday's meal to offer again: the one of this time of day, or the one just before if it is still missing
 * today (a forgotten lunch in the afternoon). Nothing when today already has it or yesterday did not.
 */
export function copySuggestion(food: FoodLog[], now = new Date()): CopySuggestion | null {
  const today = localDay(now)
  const yesterday = localDay(daysAgo(1))
  const current = ORDER.indexOf(mealForNow(now))
  for (const meal of [ORDER[current], ORDER[current - 1]].filter(Boolean)) {
    if (food.some((f) => f.meal === meal && localDay(new Date(f.eaten_at)) === today)) continue
    const entries = food.filter((f) => f.meal === meal && !synced(f) && localDay(new Date(f.eaten_at)) === yesterday)
    if (entries.length) return { meal, entries, kcal: entries.reduce((s, f) => s + Number(f.kcal), 0) }
  }
  return null
}

/** Copies meals to today, and keeps what was copied for a moment so a wrong tap can be undone. */
export function useMealCopy(onChanged: () => void) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<{ ids: string[]; kcal: number } | null>(null)
  async function copy(entries: FoodLog[]) {
    setBusy(true)
    try {
      const ids = await copyMealsToToday(entries)
      setCopied({ ids, kcal: entries.reduce((s, f) => s + Number(f.kcal), 0) })
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  async function undo() {
    if (!copied) return
    setBusy(true)
    try {
      await deleteFoods(copied.ids)
      setCopied(null)
      onChanged()
    } finally {
      setBusy(false)
    }
  }
  return { busy, copied, copy, undo }
}
