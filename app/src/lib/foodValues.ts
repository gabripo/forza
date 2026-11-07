// A food's values typed in by hand: calories and grams of each nutrient.
import type { FoodItem } from './types'

/** A food's values as typed: calories and grams of each nutrient (null: not typed). */
export type Values = Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'satfat_g' | 'salt_g', number | null>

export const VALUE_KEYS: (keyof Values)[] = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'satfat_g', 'salt_g']
/** Fibre, sugar, saturated fat and salt may be left out (they count as unknown, or 0 for fibre and sugar). */
export const OPTIONAL_VALUES = new Set<keyof Values>(['fiber_g', 'sugar_g', 'satfat_g', 'salt_g'])

/** The values of a food, ready to change (all empty for a new one). */
export const valuesOf = (v?: Partial<Record<keyof Values, number | null | undefined>>): Values =>
  Object.fromEntries(VALUE_KEYS.map((k) => [k, v?.[k] ?? null])) as Values

/** A food from typed values, for an amount: fibre and sugar not typed count as 0, salt and saturated fat as unknown. */
export function itemFromValues(name: string, grams: number, v: Values): FoodItem {
  return {
    name: name.trim(),
    grams,
    kcal: v.kcal ?? 0,
    protein_g: v.protein_g ?? 0,
    carbs_g: v.carbs_g ?? 0,
    fat_g: v.fat_g ?? 0,
    fiber_g: v.fiber_g ?? 0,
    sugar_g: v.sugar_g ?? 0,
    ...(v.salt_g != null ? { salt_g: v.salt_g } : {}),
    ...(v.satfat_g != null ? { satfat_g: v.satfat_g } : {}),
  }
}
