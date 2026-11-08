// The day and the meal a meal is logged at: today, or a day before when something was left out. A meal of a day
// before is put at that meal's usual time (as meals from Build With Science are). One of today is put at the time
// it is logged, or at its usual time when it is an earlier meal of the day (a breakfast logged in the evening).
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { mealForNow } from '../components/PlateResult'
import { daysAgo, localDay } from './calc'
import type { FoodLog, Meal } from './types'

/** How many days back a meal can be logged: the Food page has the last four weeks. */
export const LOG_DAYS_BACK = 27

const MEAL_AT: Record<Meal, [number, number]> = { breakfast: [8, 0], lunch: [13, 0], snack: [16, 30], dinner: [20, 0] }
const ORDER: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

const dateOf = (day: string, h = 0, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m)
}

/** The day (YYYY-MM-DD) as a date, at noon: to show it, wherever the phone is. */
export const dayDate = (day: string) => dateOf(day, 12)

/** The first day a meal can be logged at (YYYY-MM-DD). */
export const firstLogDay = () => localDay(daysAgo(LOG_DAYS_BACK))

/** A day (YYYY-MM-DD) a meal can be logged at, or null: from four weeks ago to today. */
export function loggableDay(s: unknown, now = new Date()): string | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const first = new Date(now)
  first.setDate(first.getDate() - LOG_DAYS_BACK)
  return s <= localDay(now) && s >= localDay(first) ? s : null
}

/** How many days before today this day is (0: today), as the Food page counts them. */
export function daysBefore(day: string, now = new Date()): number {
  const today = dateOf(localDay(now))
  return Math.max(0, Math.round((today.getTime() - dateOf(day).getTime()) / 86_400_000))
}

/** When a meal of this day was eaten, as it is saved. */
export function eatenAt(day: string, meal: Meal, now = new Date()): Date {
  const usual = dateOf(day, ...MEAL_AT[meal])
  if (day !== localDay(now)) return usual
  return ORDER.indexOf(meal) < ORDER.indexOf(mealForNow(now)) && usual < now ? usual : now
}

/**
 * The meal to start from when adding food to a day: the one of the moment for today; for a day before, the first
 * main meal not logged that day (a snack once all three are there).
 */
export function startMeal(day: string, food: Pick<FoodLog, 'eaten_at' | 'meal'>[], now = new Date()): Meal {
  if (day === localDay(now)) return mealForNow(now)
  const logged = new Set(food.filter((f) => localDay(new Date(f.eaten_at)) === day).map((f) => f.meal))
  return (['breakfast', 'lunch', 'dinner'] as const).find((m) => !logged.has(m)) ?? 'snack'
}

/** What a page that adds food can be opened with: the day (the Food page passes the one it shows) and the meal. */
export interface LogStart {
  day?: string
  meal?: Meal
}

/**
 * The day and the meal a new meal goes to: today and the meal of the moment, unless the page was opened for a day
 * before (from the Food page) or for a meal (a suggestion, a recipe).
 */
export function useLogWhen() {
  const start = useLocation().state as LogStart | null
  const [today] = useState(() => localDay(new Date()))
  const [day, setDay] = useState(() => loggableDay(start?.day) ?? today)
  const [meal, setMeal] = useState<Meal>(() => start?.meal ?? mealForNow())
  return {
    day,
    meal,
    setDay,
    setMeal,
    /** Today (YYYY-MM-DD), as when the page was opened. */
    today,
    isToday: day === today,
    /** When the meal was eaten: worked out as it is saved. */
    at: () => eatenAt(day, meal),
    /** How many days back the Food page opens, once the meal is saved: on the day it went to. */
    offset: () => daysBefore(day),
    /** For another way of adding the same meal (a photo adjusted by hand): the same day and meal. */
    pass: (): LogStart => ({ day, meal }),
  }
}

export type LogWhen = ReturnType<typeof useLogWhen>
