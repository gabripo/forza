// The family food database and each person's remembered foods. Every food logged that is not in the app's own
// table (a product scanned or read from a label, a food typed in, one the AI recognised, one found online) joins
// the family database, and each person's foods are counted: their usual ones come first in the search, and a
// product they logged becomes "the" mozzarella when they later say or photograph a mozzarella.
import { useEffect, useReducer } from 'react'
import { FOODS, type Food } from '../data/foods'
import type { Product } from './products'
import { supabase } from './supabase'
import type { FoodItem, Locale } from './types'
import { nameKey, nameStems, searchFoods } from './voice'

export interface DbFood {
  id: string
  name: string
  name_key: string
  brand: string | null
  barcode: string | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  salt_g: number | null
  satfat_g: number | null
  portion_g: number | null
  source: 'barcode' | 'label' | 'manual' | 'ai' | 'web' | 'recipe'
}

interface Memory {
  food_key: string
  uses: number
  last_grams: number | null
  last_used_at: string
}

/** Where a food on a plate comes from, so it can be remembered after the meal is saved. */
export interface ItemOrigin {
  foodId?: string
  dbId?: string
  barcode?: string
  brand?: string | null
  origin?: DbFood['source']
}

export type LoggedItem = FoodItem & ItemOrigin

/** A food to pick: one of the app's, or from the family database, with how often this person had it. */
export type Pick = { kind: 'builtin'; food: Food; uses: number } | { kind: 'db'; food: DbFood; uses: number }

const CACHE = 'forza.foodDb'
// Values someone checked (label, barcode, typed in, a product found online): they can stand for a food said or seen.
const TRUSTED = new Set<DbFood['source']>(['barcode', 'label', 'manual', 'web', 'recipe'])

/** How often the whole family logged a food, and by how many people (counts only, never who). */
interface FamilyUse {
  food_key: string
  uses: number
  people: number
}

export interface FoodDbState {
  foods: DbFood[]
  memory: Memory[]
  family?: FamilyUse[]
}

let state: FoodDbState = readCache()
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function readCache(): FoodDbState {
  try {
    return (JSON.parse(localStorage.getItem(CACHE) ?? 'null') as FoodDbState | null) ?? { foods: [], memory: [] }
  } catch {
    return { foods: [], memory: [] }
  }
}

/** Reads the family's foods and this person's memory (the last copy stays on the phone for offline use). */
export function loadFoodDb(force = false): Promise<void> {
  if (loading && !force) return loading
  loading = Promise.all([
    supabase.from('foods').select('*').order('updated_at', { ascending: false }).limit(5000),
    supabase.from('food_memory').select('*'),
    supabase.rpc('family_food_uses'),
  ])
    .then(([foods, memory, family]) => {
      if (foods.error || memory.error) return
      state = { foods: (foods.data ?? []) as DbFood[], memory: (memory.data ?? []) as Memory[], family: family.error ? (state.family ?? []) : ((family.data ?? []) as FamilyUse[]) }
      try {
        localStorage.setItem(CACHE, JSON.stringify(state))
      } catch {
        // the built-in foods still work
      }
      listeners.forEach((l) => l())
    })
    .catch(() => {})
  return loading
}

export function useFoodDb(): FoodDbState {
  const [, refresh] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    listeners.add(refresh)
    void loadFoodDb()
    return () => {
      listeners.delete(refresh)
    }
  }, [])
  return state
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** A food of the database for an amount. */
export function dbFoodAt(f: DbFood, grams: number): FoodItem {
  const k = grams / 100
  return {
    name: f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.name} (${f.brand})` : f.name,
    grams,
    kcal: Math.round(Number(f.kcal) * k),
    protein_g: r1(Number(f.protein_g) * k),
    carbs_g: r1(Number(f.carbs_g) * k),
    fat_g: r1(Number(f.fat_g) * k),
    fiber_g: r1(Number(f.fiber_g) * k),
    sugar_g: r1(Number(f.sugar_g) * k),
    ...(f.salt_g != null ? { salt_g: r2(Number(f.salt_g) * k) } : {}),
    ...(f.satfat_g != null ? { satfat_g: r1(Number(f.satfat_g) * k) } : {}),
  }
}

/** A database food in the shape of a scanned product, for the same "how much?" sheet. */
export function dbProduct(f: DbFood): Product {
  return {
    code: f.barcode ?? f.id,
    name: f.name,
    brand: f.brand,
    image: null,
    per100: { kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g), fiber_g: Number(f.fiber_g), sugar_g: Number(f.sugar_g), ...(f.salt_g != null ? { salt_g: Number(f.salt_g) } : {}), ...(f.satfat_g != null ? { satfat_g: Number(f.satfat_g) } : {}) },
    servingG: f.portion_g,
    ultraProcessed: false,
    source: 'family',
    dbId: f.id,
  }
}

const uses = (key: string, st = state) => st.memory.find((m) => m.food_key === key)

/** Every word asked for is the start of a word of the name (stems, so "mozzarelle" finds "mozzarella"). */
function matches(query: string[], name: string): boolean {
  const have = nameStems(name)
  return query.length > 0 && query.every((q) => have.some((h) => h.startsWith(q) || (q.length >= 4 && q.startsWith(h))))
}

/**
 * Whether a product can be the food recognised: about as rich in energy (within 80 kcal per 100 g, or half to
 * twice as much). The words alone can mislead: "latte" (milk) is also in "Protein Caramel Latte", a protein
 * powder with six times the calories.
 */
function sameKind(item: FoodItem | undefined, f: DbFood): boolean {
  if (!item || !(item.grams > 0) || !(item.kcal > 0)) return true
  const seen = (item.kcal / item.grams) * 100
  const kcal = Number(f.kcal)
  return Math.abs(kcal - seen) <= 80 || (kcal >= seen / 2 && kcal <= seen * 2)
}

/**
 * This person's own version of a food said or seen ("mozzarella"): a product they logged whose name has all those
 * words (and the same kind of food as the one recognised, when given), the one they had most often (then most
 * recently). Null when they never logged one.
 */
export function usualFor(text: string, recognised?: FoodItem): { food: DbFood; lastGrams: number | null } | null {
  const q = nameStems(text)
  if (!q.length) return null
  let best: { food: DbFood; m: Memory } | null = null
  for (const f of state.foods) {
    if (!TRUSTED.has(f.source)) continue
    const m = uses(f.id)
    if (!m || !matches(q, `${f.name} ${f.brand ?? ''}`) || !sameKind(recognised, f)) continue
    if (!best || m.uses > best.m.uses || (m.uses === best.m.uses && m.last_used_at > best.m.last_used_at)) best = { food: f, m }
  }
  return best ? { food: best.food, lastGrams: best.m.last_grams } : null
}

/**
 * Puts the person's usual product in place of a food the app or the AI recognised, keeping the amount (or the
 * amount they usually have, when none was said). Foods with no usual product stay as they are.
 */
export function withUsual<T extends LoggedItem>(item: T, text: string, amountSaid = true): T & { usual?: boolean } {
  const u = usualFor(text, item)
  if (!u) return item
  const grams = amountSaid || !u.lastGrams ? item.grams || u.food.portion_g || 100 : u.lastGrams
  return { ...item, ...dbFoodAt(u.food, grams), foodId: undefined, dbId: u.food.id, barcode: u.food.barcode ?? undefined, brand: u.food.brand, origin: u.food.source, usual: true }
}

/**
 * The family's product with this barcode (logged before, or put right with "Non è questo?"): asked of the database,
 * so a correction made on another phone counts at once; the foods kept on this phone when offline.
 */
export async function familyProduct(code: string): Promise<DbFood | null> {
  const { data, error } = await supabase.from('foods').select('*').eq('barcode', code).maybeSingle()
  if (!error) return (data as DbFood | null) ?? null
  return state.foods.find((f) => f.barcode === code) ?? null
}

/**
 * A scanned product put right for its barcode, for the whole family: its name, brand, values per 100 g and serving
 * replace what was there. Returns the food's id; the family database is read again.
 */
export async function fixProduct(p: Product, code: string, source: 'label' | 'manual'): Promise<string> {
  const { data, error } = await supabase.rpc('fix_product', {
    p_food: { barcode: code, name: p.name, name_key: nameKey(p.name), brand: p.brand, ...p.per100, portion_g: p.servingG, source },
  })
  if (error) throw new Error('fix_failed')
  void loadFoodDb(true)
  return data as string
}

/** The person's foods, most used first: the list shown before anything is typed. */
export function frequentFoods(st: FoodDbState = state, limit = 10): Pick[] {
  const out: Pick[] = []
  for (const m of [...st.memory].sort((a, b) => b.uses - a.uses || b.last_used_at.localeCompare(a.last_used_at))) {
    if (m.food_key.startsWith('b:')) {
      const food = FOODS.find((f) => f.id === m.food_key.slice(2))
      if (food) out.push({ kind: 'builtin', food, uses: m.uses })
    } else {
      const food = st.foods.find((f) => f.id === m.food_key)
      if (food) out.push({ kind: 'db', food, uses: m.uses })
    }
    if (out.length >= limit) break
  }
  return out
}

/** The foods the family logs most (logged by at least two people, or often), that this person has not had yet. */
export function familyFavourites(st: FoodDbState = state, limit = 8): Pick[] {
  const mine = new Set(st.memory.map((m) => m.food_key))
  const out: Pick[] = []
  for (const f of st.family ?? []) {
    if (mine.has(f.food_key) || (f.people < 2 && f.uses < 3)) continue
    if (f.food_key.startsWith('b:')) {
      const food = FOODS.find((x) => x.id === f.food_key.slice(2))
      if (food) out.push({ kind: 'builtin', food, uses: 0 })
    } else {
      const food = st.foods.find((x) => x.id === f.food_key)
      if (food) out.push({ kind: 'db', food, uses: 0 })
    }
    if (out.length >= limit) break
  }
  return out
}

/** The search box: this person's foods first, then the family's (the most logged first), then the app's own table. */
export function searchAll(query: string, st: FoodDbState = state, limit = 40): Pick[] {
  const q = nameStems(query)
  if (!q.length) return []
  const db = st.foods
    .filter((f) => matches(q, `${f.name} ${f.brand ?? ''}`))
    .map((food): Pick => ({ kind: 'db', food, uses: uses(food.id, st)?.uses ?? 0 }))
  const builtIn = searchFoods(query, limit).map((food): Pick => ({ kind: 'builtin', food, uses: uses(`b:${food.id}`, st)?.uses ?? 0 }))
  const mine = [...db, ...builtIn].filter((p) => p.uses > 0).sort((a, b) => b.uses - a.uses)
  const familyUses = new Map((st.family ?? []).map((f) => [f.food_key, f.uses]))
  const family = db
    .filter((p) => !p.uses)
    .sort(
      (a, b) =>
        Number(TRUSTED.has((b.food as DbFood).source)) - Number(TRUSTED.has((a.food as DbFood).source)) ||
        (familyUses.get((b.food as DbFood).id) ?? 0) - (familyUses.get((a.food as DbFood).id) ?? 0),
    )
  return [...mine, ...family, ...builtIn.filter((p) => !p.uses)].slice(0, limit)
}

/** Products found by name in Open Food Facts (through the food-search function). */
export async function searchOnline(query: string, locale: Locale): Promise<Product[]> {
  const { data, error } = await supabase.functions.invoke('food-search', { body: { q: query, locale } })
  if (error) throw new Error('search_failed')
  return ((data as { products?: Omit<Product, 'source'>[] }).products ?? []).map((p) => ({ ...p, source: 'web' as const }))
}

/** The food's values per 100 g, from what was logged (nothing for a food without grams). */
function per100(it: FoodItem) {
  if (!(it.grams > 0)) return null
  const k = 100 / it.grams
  return {
    kcal: r1(it.kcal * k),
    protein_g: r1(it.protein_g * k),
    carbs_g: r1(it.carbs_g * k),
    fat_g: r1(it.fat_g * k),
    fiber_g: r1(it.fiber_g * k),
    sugar_g: r1(it.sugar_g * k),
    ...(it.salt_g != null ? { salt_g: r2(it.salt_g * k) } : {}),
    ...(it.satfat_g != null ? { satfat_g: r1(it.satfat_g * k) } : {}),
  }
}

/**
 * After a meal is saved: new foods join the family database and every food counts as used once more by this
 * person (`forUser`: the one the family coach logged the meal for). Runs in the background; a failure only means the
 * foods are not remembered this time.
 */
export function rememberItems(items: LoggedItem[], fallback: DbFood['source'], forUser?: string): void {
  const entries = items
    .map((it) => {
      if (it.foodId) return { builtin: it.foodId, grams: it.grams }
      if (it.dbId) return { id: it.dbId, grams: it.grams }
      const values = per100(it)
      if (!values || !it.name.trim()) return null
      const brand = it.brand ?? null
      const name = brand ? it.name.replace(` (${brand})`, '') : it.name
      return { name, name_key: nameKey(name), brand, barcode: it.barcode, ...values, portion_g: Math.round(it.grams), source: it.origin ?? fallback, grams: it.grams }
    })
    .filter(Boolean)
  if (!entries.length) return
  void (forUser ? supabase.rpc('remember_foods_for', { p_user: forUser, p_foods: entries }) : supabase.rpc('remember_foods', { p_foods: entries }))
    .then(({ error }) => (error ? undefined : loadFoodDb(true)))
}

/** The plain food as stored in the meal, without where it came from. */
export function plainItem({ name, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g }: FoodItem): FoodItem {
  return { name, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, ...(salt_g != null ? { salt_g } : {}), ...(satfat_g != null ? { satfat_g } : {}) }
}
