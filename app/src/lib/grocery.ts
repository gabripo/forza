// The grocery list: the foods someone logs (the last four weeks), turned into what to buy for the days ahead, in
// amounts that fit their targets. Whole foods: processed foods give way to the app's alternatives, white bread and
// pasta to wholegrain ones, ready dishes to what they are made of. Enough protein: more of the protein foods they
// already eat, or one more food of the kinds they eat (no meat for whoever never logs any). Fruit and vegetables
// every day, in season. The amounts are worked out as in the recipe builder, from the foods' own values, and given
// as they are sold: raw meat and fish, dry pasta and rice, eggs by the piece, tins and pots by the pack.
import { FOODS, PROCESSED_FOODS, type Food } from '../data/foods'
import { localDay, type Targets } from './calc'
import type { DbFood } from './foodDb'
import { processedKind, swapFoods, type ProcessedKind } from './processed'
import { builtinPer100, roleOf, type Per100, type Role } from './recipeIdea'
import type { FoodItem, FoodLog, L10n, Locale } from './types'
import { nameKey, parseMeal } from './voice'

export type Aisle = 'veg' | 'fruit' | 'meat' | 'fish' | 'eggs_dairy' | 'legumes' | 'grains' | 'nuts_oil' | 'other'
export const AISLES: Aisle[] = ['veg', 'fruit', 'meat', 'fish', 'eggs_dairy', 'legumes', 'grains', 'nuts_oil', 'other']

/** Why a food is on the list: one of theirs, added (for protein, vegetables, fruit, good fats, energy), or in place of another. */
export type Why = 'usual' | 'protein' | 'veg' | 'fruit' | 'fats' | 'energy' | 'swap' | 'wholegrain'

export interface GroceryItem {
  key: string
  name: string
  aisle: Aisle
  /** How much to buy, in grams (as sold). */
  grams: number
  /** Eggs: how many. */
  count?: number
  /** Foods sold by the pack (a tin, a pot): one pack, in grams. */
  pack?: number
  /** Milk and the like: shown in litres. */
  liquid?: boolean
  why: Why
  /** What it takes the place of, as logged. */
  instead: string[]
}

export interface GroceryList {
  days: number
  items: GroceryItem[]
  /** A day, on average: what the list brings. */
  perDay: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; fruitVeg_g: number }
  /** Days with meals logged in the last four weeks: few, and the list stands more on the targets than on habits. */
  loggedDays: number
}

/** The days looked back at. */
export const GROCERY_LOOKBACK = 28
/** Vegetables and fruit a day, as eaten (WHO: at least 400 g of the two; Italian guidelines: five portions). */
export const VEG_A_DAY = 300
export const FRUIT_A_DAY = 200

const byId = new Map(FOODS.map((f) => [f.id, f]))
const food = (id: string) => byId.get(id)!

/** The app's foods by their names, in both languages: how logged foods are known again. */
const BY_NAME = new Map<string, Food>()
for (const f of FOODS) for (const n of [f.name.en, f.name.it]) if (!BY_NAME.has(nameKey(n))) BY_NAME.set(nameKey(n), f)

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’'`´]/g, ' ')

const ALCOHOL = /\bvino\b|\bwine\b|\bbirra\b|\bbeer\b|prosecco|spritz|grappa|whisky|vodka|\bgin\b|\brum\b|\bamaro\b|liquore|liqueur|cocktail|aperol/
const FISH = /tonno|salmon|merluzz|nasello|pesce|gamber|calamar|polpo|sgombr|sardin|\balic[ei]\b|acciugh|trota|orata|branzino|spada|cozze|vongole|\btuna\b|\bcod\b|hake|fish|prawn|shrimp|squid|octopus|mackerel|anchov|trout|bream|\bbass\b|mussel|clam/
const MEAT = /pollo|tacchino|manzo|vitello|maiale|lonza|coniglio|agnello|bresaola|prosciutto|speck|roast beef|hamburger|salsicc|chicken|turkey|beef|veal|pork|rabbit|lamb|\bham\b|burger|sausage/
const PLANT_PROTEIN = /tofu|tempeh|seitan|lupin|edamame/

/** Ready dishes, as the foods they are made of (shares of the dish's weight, as eaten). */
const DISH_PARTS: Record<string, [string, number][]> = {
  grilled_veg: [['mixed_veg', 1]],
  minestrone: [['mixed_veg', 0.8]],
  veg_cream_soup: [['mixed_veg', 0.7]],
  roast_potatoes: [['potatoes', 1]],
  mashed_potatoes: [['potatoes', 0.8], ['milk', 0.15]],
  frittata: [['egg', 0.8]],
  caprese: [['mozzarella', 0.4], ['tomatoes', 0.6]],
  pasta_tomato: [['pasta_cooked', 0.75], ['tomato_sauce', 0.25]],
  pasta_pesto: [['pasta_cooked', 0.85], ['pesto', 0.15]],
  pasta_ragu: [['pasta_cooked', 0.7], ['lean_beef', 0.15], ['tomato_sauce', 0.15]],
  pasta_beans: [['pasta_cooked', 0.4], ['beans', 0.4]],
  pasta_chickpeas_dish: [['pasta_cooked', 0.4], ['chickpeas', 0.4]],
  risotto: [['rice_cooked', 0.85], ['parmesan', 0.05]],
  meatballs: [['lean_beef', 0.6], ['tomato_sauce', 0.3]],
  pizza: [['flour_00', 0.5], ['mozzarella', 0.2], ['tomato_sauce', 0.2], ['olive_oil', 0.03]],
  pizza_slice: [['flour_00', 0.5], ['mozzarella', 0.2], ['tomato_sauce', 0.2], ['olive_oil', 0.03]],
}

/** White bread and pasta, and their wholegrain kind (as many calories). */
const WHOLEGRAIN: Record<string, string> = {
  bread: 'bread_wholegrain',
  sandwich_bread: 'bread_wholegrain',
  rusks: 'bread_wholegrain',
  pasta_dry: 'pasta_wholegrain_dry',
  pasta_cooked: 'pasta_wholegrain_dry',
  flour_00: 'flour_wholemeal',
}

/** Processed foods of the app's table whose names do not say so, by kind (the rest, such as ketchup, are left out). */
const PROCESSED_ID: Record<string, ProcessedKind> = { chicken_cutlet: 'fast_food', kebab: 'fast_food', fries: 'fast_food', burger_sandwich: 'fast_food', fish_fingers: 'fast_food' }
/** The alternative chosen for a kind, when it is not the first (sparkling water needs no shopping). */
const SWAP_PICK: Partial<Record<ProcessedKind, string>> = { sugary_drinks: 'orange' }
/** Not bought to cook with (eaten out, or a treat of its own): left off the list. */
const SKIP = new Set(['cake', 'tiramisu', 'panettone', 'jam_tart', 'protein_bar', 'popcorn', 'ketchup', 'mayonnaise'])

/**
 * Foods logged cooked, as sold: the food bought (when another), grams bought for each gram eaten (meat and fish lose
 * about a quarter of their weight cooking; dry pasta and rice weigh what their calories say), and the name as sold.
 */
const BUY: Record<string, { k: number; as?: string; name?: L10n }> = {
  chicken_breast: { k: 1.33, name: { en: 'Chicken breast', it: 'Petto di pollo' } },
  turkey_breast: { k: 1.33, name: { en: 'Turkey breast', it: 'Fesa di tacchino' } },
  lean_beef: { k: 1.33, name: { en: 'Lean beef', it: 'Manzo magro' } },
  chicken_thigh: { k: 1.33, name: { en: 'Chicken thighs, skinless', it: 'Cosce di pollo, senza pelle' } },
  pork_loin: { k: 1.33, name: { en: 'Pork loin', it: 'Lonza di maiale' } },
  veal: { k: 1.33, name: { en: 'Veal', it: 'Vitello' } },
  rabbit: { k: 1.33, name: { en: 'Rabbit', it: 'Coniglio' } },
  lamb: { k: 1.33, name: { en: 'Lamb', it: 'Agnello' } },
  turkey_burger: { k: 1.25, name: { en: 'Turkey burgers', it: 'Hamburger di tacchino' } },
  chicken_burger: { k: 1.25, name: { en: 'Chicken burgers', it: 'Hamburger di pollo' } },
  beef_burger: { k: 1.3, name: { en: 'Beef burgers', it: 'Hamburger di manzo' } },
  salmon: { k: 1.25, name: { en: 'Salmon', it: 'Salmone' } },
  white_fish: { k: 1.25, name: { en: 'White fish (cod, hake)', it: 'Pesce bianco (merluzzo, nasello)' } },
  tuna_fresh: { k: 1.25, name: { en: 'Fresh tuna', it: 'Tonno fresco' } },
  swordfish: { k: 1.25, name: { en: 'Swordfish', it: 'Pesce spada' } },
  sea_bream: { k: 1.25, name: { en: 'Sea bream or sea bass fillets', it: 'Filetti di orata o branzino' } },
  trout: { k: 1.25, name: { en: 'Trout', it: 'Trota' } },
  mackerel: { k: 1.25, name: { en: 'Mackerel', it: 'Sgombro' } },
  sardines: { k: 1.25, name: { en: 'Fresh sardines or anchovies', it: 'Sardine o alici fresche' } },
  prawns: { k: 1.25, name: { en: 'Prawns, shelled', it: 'Gamberi sgusciati' } },
  squid: { k: 1.3, name: { en: 'Squid', it: 'Calamari' } },
  rice_cooked: { k: 130 / 360, as: 'rice_dry' },
  rice_dry: { k: 1, name: { en: 'Rice', it: 'Riso' } },
  brown_rice: { k: 123 / 362, name: { en: 'Brown rice', it: 'Riso integrale' } },
  pasta_dry: { k: 1, name: { en: 'Pasta', it: 'Pasta' } },
  pasta_cooked: { k: 158 / 359, as: 'pasta_dry' },
  pasta_wholegrain_dry: { k: 1, name: { en: 'Wholegrain pasta', it: 'Pasta integrale' } },
  quinoa: { k: 120 / 368, name: { en: 'Quinoa', it: 'Quinoa' } },
  couscous: { k: 112 / 376, name: { en: 'Couscous', it: 'Cous cous' } },
  spelt: { k: 127 / 338, name: { en: 'Spelt', it: 'Farro' } },
  barley: { k: 123 / 352, name: { en: 'Pearl barley', it: 'Orzo perlato' } },
  polenta: { k: 70 / 362, name: { en: 'Cornmeal for polenta', it: 'Farina di mais per polenta' } },
  lentils: { k: 116 / 353, name: { en: 'Lentils, dry', it: 'Lenticchie secche' } },
  chickpeas: { k: 1, name: { en: 'Chickpeas, tinned (drained weight)', it: 'Ceci in scatola (peso sgocciolato)' } },
  beans: { k: 1, name: { en: 'Beans, tinned (drained weight)', it: 'Fagioli in scatola (peso sgocciolato)' } },
  potatoes: { k: 1, name: { en: 'Potatoes', it: 'Patate' } },
  tomato_sauce: { k: 1, name: { en: 'Tomato passata', it: 'Passata di pomodoro' } },
  sweet_potato: { k: 1.2, name: { en: 'Sweet potatoes', it: 'Patate dolci' } },
}

/** Sold by the pack: a tin, a pot, a ball, a burger. */
const PACK = /\b(can|pot|ball|burger|burrata)\b/

/** Vegetables and fruit in season in Italy, by season (winter, spring, summer, autumn), the most common first. */
const SEASON_VEG = [
  ['broccoli', 'fennel', 'cauliflower', 'spinach', 'carrots', 'cabbage', 'salad'],
  ['asparagus', 'spinach', 'salad', 'carrots', 'zucchini', 'fennel'],
  ['zucchini', 'tomatoes', 'peppers', 'green_beans', 'cucumber', 'salad'],
  ['pumpkin', 'broccoli', 'spinach', 'mushrooms', 'carrots', 'cabbage', 'salad'],
]
const SEASON_FRUIT = [
  ['orange', 'mandarin', 'apple', 'kiwi', 'pear'],
  ['strawberries', 'apple', 'kiwi', 'orange'],
  ['peach', 'apricot', 'watermelon', 'cherries', 'plums', 'melon'],
  ['apple', 'pear', 'grapes', 'persimmon', 'kiwi'],
]
const seasonOf = (d: Date) => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][d.getMonth()]

/** Protein foods to add, by kind: lean and whole, the most protein for the calories first. */
type Kind = 'meat' | 'fish' | 'dairy' | 'eggs' | 'legumes'
const PROTEIN: Record<Kind, string[]> = {
  meat: ['chicken_breast', 'turkey_breast'],
  fish: ['white_fish', 'tuna_water', 'salmon'],
  dairy: ['greek_yogurt_0', 'skyr', 'cottage'],
  eggs: ['egg'],
  legumes: ['lentils', 'chickpeas', 'tofu'],
}
/** Whole foods that bring energy, for a list short of calories. */
const ENERGY = ['oats', 'bread_wholegrain', 'pasta_wholegrain_dry', 'potatoes', 'rice_dry', 'almonds', 'olive_oil']
/** Good fats, for a list short of fat: grams a day to start from. */
const FATS: [string, number][] = [['olive_oil', 15], ['almonds', 20], ['walnuts', 20]]

/** Every food of the app's table the list can name (checked by the amounts check). */
export const GROCERY_FOOD_IDS = [
  ...Object.values(DISH_PARTS).flatMap((p) => p.map(([id]) => id)),
  ...Object.keys(DISH_PARTS),
  ...Object.entries(WHOLEGRAIN).flat(),
  ...Object.keys(PROCESSED_ID),
  ...Object.keys(BUY),
  ...Object.values(BUY).flatMap((b) => (b.as ? [b.as] : [])),
  ...SEASON_VEG.flat(),
  ...SEASON_FRUIT.flat(),
  ...Object.values(PROTEIN).flat(),
  ...ENERGY,
  ...FATS.map(([id]) => id),
]

// ---------------------------------------------------------------------------
// The foods logged, known again
// ---------------------------------------------------------------------------

interface Source {
  key: string
  name: string
  per100: Per100
  food?: Food
}

const builtin = (f: Food, locale: Locale): Source => ({ key: `b:${f.id}`, name: f.name[locale], per100: builtinPer100(f), food: f })

function fromDb(d: DbFood): Source {
  const brand = d.brand && !d.name.toLowerCase().includes(d.brand.toLowerCase()) ? ` (${d.brand})` : ''
  return {
    key: `d:${d.id}`,
    name: d.name + brand,
    per100: { kcal: Number(d.kcal), protein_g: Number(d.protein_g), carbs_g: Number(d.carbs_g), fat_g: Number(d.fat_g), fiber_g: Number(d.fiber_g), sugar_g: Number(d.sugar_g) },
  }
}

function fromItem(it: FoodItem): Source | null {
  if (!(it.grams > 0)) return null
  const k = 100 / it.grams
  return {
    key: `n:${nameKey(it.name)}`,
    name: it.name,
    per100: { kcal: it.kcal * k, protein_g: it.protein_g * k, carbs_g: it.carbs_g * k, fat_g: it.fat_g * k, fiber_g: (Number(it.fiber_g) || 0) * k, sugar_g: (Number(it.sugar_g) || 0) * k },
  }
}

/**
 * A meal's foods: as logged, or, for a meal kept with its title and totals only (an older one, one from another
 * app), the foods its title names, read as when dictated, in amounts that make its calories.
 */
function foodsOf(log: FoodLog, locale: Locale): FoodItem[] {
  if (log.items?.length) return log.items
  if (!log.title || !(Number(log.kcal) > 0)) return []
  const read = [locale, locale === 'it' ? 'en' : 'it'].map((l) => parseMeal(log.title, l as Locale)).sort((a, b) => b.items.length - a.items.length)[0]
  const kcal = read.items.reduce((s, i) => s + i.kcal, 0)
  if (!kcal) return []
  const k = Math.min(3, Math.max(0.33, Number(log.kcal) / kcal))
  return read.items.map((i) => ({ ...i, grams: i.grams * k }))
}

function aisleOf(role: Role, name: string, f?: Food): Aisle {
  const n = plain(name)
  switch (role) {
    case 'veg':
    case 'potatoes':
      return 'veg'
    case 'fruit':
      return 'fruit'
    case 'egg':
    case 'yogurt':
    case 'cheese':
    case 'milk':
      return 'eggs_dairy'
    case 'legume':
      return 'legumes'
    case 'pasta':
    case 'rice':
    case 'grain':
    case 'bread':
    case 'oats':
      return 'grains'
    case 'oil':
    case 'nuts':
      return 'nuts_oil'
    case 'protein':
      if (FISH.test(n)) return 'fish'
      if (MEAT.test(n)) return 'meat'
      if (f?.group === 'legumes' || PLANT_PROTEIN.test(n)) return 'legumes'
      return 'other'
    default:
      return f?.group === 'dairy' ? 'eggs_dairy' : f?.group === 'carbs' ? 'grains' : 'other'
  }
}

interface Cand {
  key: string
  name: string
  per100: Per100
  food?: Food
  role: Role
  aisle: Aisle
  /** As eaten, for all the days. */
  grams: number
  min: number
  max: number
  fixed: boolean
  why: Why
  instead: string[]
  /** Meals it was in. */
  meals: number
}

function cand(src: Source, grams: number, why: Why, meals = 0): Cand {
  const role = roleOf({ name: src.name, foodId: src.food?.id, per100: src.per100 })
  return { ...src, role, aisle: aisleOf(role, src.name, src.food), grams, min: grams, max: grams, fixed: false, why, instead: [], meals }
}

/** Mostly protein: more of it brings protein without many calories. */
const proteinRich = (p: Per100) => p.protein_g >= 8 && (p.protein_g * 4) / Math.max(p.kcal, 1) >= 0.3

/**
 * The amounts for the targets, keeping to what is usually eaten: every food scaled alike to the calories; short of
 * protein, the protein foods scaled up more and the rest down, so both come right (and the other way round when
 * protein would be well past its target, leaving room for the rest). Each amount stays within its bounds (one that
 * reaches them stays there, and the others are worked out again).
 */
function fit(cands: Cand[], goal: { kcal: number; protein_g: number }): number[] {
  const amounts = cands.map((c) => c.grams)
  const held = cands.map((c) => c.fixed)
  const rich = cands.map((c) => proteinRich(c.per100))
  for (let round = 0; round < 8; round++) {
    // Calories and protein of the amounts held, and of the protein foods and the rest at their usual amounts.
    let hk = 0
    let hp = 0
    let rk = 0
    let rp = 0
    let ok = 0
    let op = 0
    cands.forEach((c, i) => {
      const k = c.per100.kcal / 100
      const p = c.per100.protein_g / 100
      if (held[i]) {
        hk += k * amounts[i]
        hp += p * amounts[i]
      } else if (rich[i]) {
        rk += k * c.grams
        rp += p * c.grams
      } else {
        ok += k * c.grams
        op += p * c.grams
      }
    })
    const K = goal.kcal - hk
    const P = goal.protein_g - hp
    let ar = K / Math.max(rk + ok, 1)
    let ao = ar
    const alike = (rp + op) * ar
    // The protein to reach: the target when short of it, a tenth over it when well past it.
    const want = alike < P ? P : hp + alike > goal.protein_g * 1.15 && ok > 0 ? goal.protein_g * 1.1 - hp : null
    if (want !== null && rp > 0) {
      // rk·ar + ok·ao = K and rp·ar + op·ao = want; with nothing else left, the protein foods alone bring the protein.
      const det = rk * op - ok * rp
      if (ok > 0 && Math.abs(det) > 1e-6) {
        ar = (K * op - ok * want) / det
        ao = (rk * want - rp * K) / det
      } else ar = want / rp
    }
    let moved = false
    cands.forEach((c, i) => {
      if (held[i]) return
      const x = c.grams * Math.max(0, rich[i] ? ar : ao)
      amounts[i] = Math.min(c.max, Math.max(c.min, x))
      if (amounts[i] !== x) {
        held[i] = true
        moved = true
      }
    })
    if (!moved) break
  }
  return amounts
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * The grocery list for the next `days` days: the foods logged in the last four weeks (known again by name in the
 * app's table, then in the family's foods), without processed foods, with wholegrain bread and pasta, fruit and
 * vegetables every day, and amounts fitted to the targets with at least the protein. Null with nothing logged.
 */
export function groceryList(logs: FoodLog[], foods: DbFood[], targets: Targets, days: number, locale: Locale, now = new Date()): GroceryList | null {
  const since = new Date(now)
  since.setDate(since.getDate() - GROCERY_LOOKBACK)
  const dbByName = new Map(foods.map((d) => [d.name_key, d]))
  const loggedDays = new Set<string>()
  const usual = new Map<string, { src: Source; grams: number; meals: Set<string>; instead: Set<string>; wholegrain: boolean }>()
  const processed = new Map<ProcessedKind, { meals: Set<string>; names: Set<string> }>()

  const take = (src: Source, grams: number, meal: string, instead?: string) => {
    const u = usual.get(src.key) ?? { src, grams: 0, meals: new Set<string>(), instead: new Set<string>(), wholegrain: false }
    u.grams += grams
    u.meals.add(meal)
    if (instead) {
      u.instead.add(instead)
      u.wholegrain = true
    }
    usual.set(src.key, u)
  }

  /** One of the app's foods: white bread and pasta as wholegrain ones, as many calories. */
  const takeFood = (f: Food, grams: number, meal: string, said: string) => {
    const whole = WHOLEGRAIN[f.id]
    if (!whole) return take(builtin(f, locale), grams, meal)
    const w = food(whole)
    take(builtin(w, locale), (grams * f.kcal) / w.kcal, meal, said)
  }

  for (const log of logs) {
    const at = new Date(log.eaten_at)
    if (at < since || at > now) continue
    loggedDays.add(localDay(at))
    for (const it of foodsOf(log, locale)) {
      if (!(it.grams > 0) || !it.name) continue
      const f = BY_NAME.get(nameKey(it.name))
      const kind = processedKind(it.name) ?? (f ? (PROCESSED_ID[f.id] ?? null) : null)
      if (kind) {
        const p = processed.get(kind) ?? { meals: new Set<string>(), names: new Set<string>() }
        p.meals.add(log.id)
        p.names.add(it.name)
        processed.set(kind, p)
        continue
      }
      if (f) {
        if (PROCESSED_FOODS.has(f.id) || SKIP.has(f.id) || f.group === 'drinks') continue
        if (f.group === 'dishes' || DISH_PARTS[f.id]) {
          for (const [id, share] of DISH_PARTS[f.id] ?? []) takeFood(food(id), it.grams * share, log.id, it.name)
          continue
        }
        takeFood(f, it.grams, log.id, it.name)
        continue
      }
      if (ALCOHOL.test(plain(it.name))) continue
      const d = dbByName.get(nameKey(it.name))
      if (d?.source === 'recipe') continue
      const src = d ? fromDb(d) : fromItem(it)
      if (!src || src.per100.kcal < 10 || src.per100.kcal > 900) continue
      take(src, it.grams, log.id)
    }
  }
  if (!loggedDays.size) return null

  const N = days
  const logged = loggedDays.size
  const fewDays = logged < 7
  // Usual: had at least twice (once, with few days logged), and not a pinch a day.
  const cands: Cand[] = [...usual.values()]
    .filter((u) => (u.meals.size >= 2 || fewDays || u.wholegrain) && u.grams / logged >= 3)
    .sort((a, b) => b.meals.size - a.meals.size || b.grams - a.grams)
    .slice(0, 30)
    .map((u) => {
      const c = cand(u.src, (u.grams / logged) * N, u.instead.size ? 'wholegrain' : 'usual', u.meals.size)
      c.instead = [...u.instead]
      return c
    })

  const find = (key: string) => cands.find((c) => c.key === key)
  const addFood = (id: string, grams: number, why: Why) => {
    const c = cand(builtin(food(id), locale), grams, why)
    cands.push(c)
    return c
  }

  // Processed foods: their alternative, as often as they were had.
  for (const [kind, p] of processed) {
    const times = Math.round((p.meals.size / logged) * N)
    if (!times) continue
    // Fish fingers become baked fish, not a burger.
    const pick = kind === 'fast_food' && [...p.names].every((n) => FISH.test(plain(n))) ? 'fish_potatoes' : SWAP_PICK[kind]
    for (const [id, g] of swapFoods(kind, pick).items) {
      for (const [pid, share] of DISH_PARTS[id] ?? [[id, 1] as [string, number]]) {
        const c = find(`b:${pid}`) ?? addFood(pid, 0, 'swap')
        c.grams += g * share * times
        c.instead = [...new Set([...c.instead, ...[...p.names].slice(0, 2)])].slice(0, 3)
        if (c.why === 'usual') c.why = 'swap'
      }
    }
  }

  // The kinds of protein food eaten, the most first: the ones to add more of.
  const kindGrams = new Map<Kind, number>()
  for (const c of cands) {
    const k: Kind | null = c.aisle === 'meat' ? 'meat' : c.aisle === 'fish' ? 'fish' : c.role === 'egg' ? 'eggs' : c.aisle === 'eggs_dairy' ? 'dairy' : c.aisle === 'legumes' ? 'legumes' : null
    if (k && c.meals) kindGrams.set(k, (kindGrams.get(k) ?? 0) + c.grams)
  }
  const kinds: Kind[] = fewDays || !kindGrams.size
    ? ['dairy', 'eggs', 'fish', 'meat', 'legumes']
    : [...[...kindGrams].sort((a, b) => b[1] - a[1]).map(([k]) => k), ...(['legumes'] as Kind[]).filter((k) => !kindGrams.has(k))]
  // One of each kind in turn: more variety than three of a kind.
  const proteinPool = [0, 1, 2].flatMap((i) => kinds.flatMap((k) => PROTEIN[k][i] ?? []))

  // Fruit and vegetables every day: more of the usual ones (half as much again at most), then some in season.
  const season = seasonOf(now)
  const fill = (role: 'veg' | 'fruit', perDay: number, pool: string[]) => {
    const have = cands.filter((c) => c.role === role)
    const need = perDay * N
    let total = have.reduce((s, c) => s + c.grams, 0)
    for (const c of have) {
      if (total >= need) break
      const more = Math.min(c.grams * 0.5, need - total)
      c.grams += more
      total += more
    }
    const fresh = pool.filter((id) => !find(`b:${id}`))
    const left = need - total
    if (left <= 0 || !fresh.length) return
    const n = Math.min(3, fresh.length, Math.max(1, Math.ceil(left / (N * 150))))
    for (const id of fresh.slice(0, n)) addFood(id, left / n, role)
  }
  fill('veg', VEG_A_DAY, SEASON_VEG[season])
  fill('fruit', FRUIT_A_DAY, SEASON_FRUIT[season])

  const goal = { kcal: targets.kcal * N, protein_g: targets.protein_g * N, fat_g: targets.fat_g * N }

  // Sweet things stay as they are, within a twentieth of the calories.
  const sweets = cands.filter((c) => c.role === 'sweet' || c.food?.group === 'treats')
  const sweetKcal = sweets.reduce((s, c) => s + (c.per100.kcal * c.grams) / 100, 0)
  if (sweetKcal > goal.kcal * 0.05) for (const c of sweets) c.grams *= (goal.kcal * 0.05) / sweetKcal

  // How far each amount can move: fruit, vegetables and sweet things stay; protein foods can grow the most. Meals
  // logged well under the target (oil and snacks are often left out) let everything grow as much as it takes.
  for (const c of cands) if (c.role === 'veg' || c.role === 'fruit' || sweets.includes(c)) c.fixed = true
  const kcalOf = (list: Cand[]) => list.reduce((s, c) => s + (c.per100.kcal * c.grams) / 100, 0)
  const free = cands.filter((c) => !c.fixed)
  const grow = Math.max(1, (goal.kcal - kcalOf(cands.filter((c) => c.fixed))) / Math.max(kcalOf(free), 1))
  for (const c of cands) {
    if (c.fixed) {
      c.min = c.max = c.grams
    } else if (c.role === 'oil') {
      c.min = c.grams * 0.5
      c.max = c.grams * Math.max(1.2, grow)
    } else {
      // Down to less than half of the usual amount: a high protein target in few calories leaves little room.
      c.min = c.grams * (proteinRich(c.per100) ? 0.6 : 0.4)
      // Twice as much at most of a protein food: past that, another one (more variety than ever more of the same).
      c.max = c.grams * (proteinRich(c.per100) ? Math.max(2, grow * 1.2) : Math.max(1.6, grow * 1.25))
    }
  }

  const totals = (list: Cand[], grams: (c: Cand) => number) =>
    list.reduce(
      (t, c) => {
        const k = grams(c) / 100
        t.kcal += c.per100.kcal * k
        t.protein_g += c.per100.protein_g * k
        t.carbs_g += c.per100.carbs_g * k
        t.fat_g += c.per100.fat_g * k
        t.fiber_g += c.per100.fiber_g * k
        if (c.role === 'veg' || c.role === 'fruit') t.fruitVeg_g += grams(c)
        return t
      },
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, fruitVeg_g: 0 },
    )

  // Fitted, then short of protein or calories: one more food of the right kind, and fitted again.
  let fitted: number[] = []
  let widened = false
  let added = 0
  for (let round = 0; round < 8; round++) {
    fitted = fit(cands, goal)
    const tot = totals(cands, (c) => fitted[cands.indexOf(c)])
    // A usual protein food at half as much again: another one, for variety (two at most).
    const stretched = added < 2 && cands.some((c, i) => !c.fixed && c.why !== 'protein' && proteinRich(c.per100) && fitted[i] > c.grams * 1.5)
    if (tot.protein_g < goal.protein_g * 0.95 || stretched) {
      const id = proteinPool.find((x) => !find(`b:${x}`))
      if (id) {
        added++
        const f = food(id)
        const c = addFood(id, f.portion * N * 0.5, 'protein')
        c.min = f.portion * N * 0.25
        c.max = f.portion * N * 1.2
        continue
      }
      if (!widened) {
        widened = true
        for (const c of cands) if (!c.fixed && proteinRich(c.per100)) c.max *= 1.6
        continue
      }
    }
    // Good fats, when they fit in the calories: what is left of them, and what the starches and the rest can give way.
    if (tot.fat_g < goal.fat_g * 0.8) {
      const fat = FATS.find(([x]) => !find(`b:${x}`))
      const room = goal.kcal - tot.kcal + cands.reduce((s, c, i) => s + (c.fixed || proteinRich(c.per100) ? 0 : (c.per100.kcal * (fitted[i] - c.min)) / 100), 0)
      if (fat && room >= (food(fat[0]).kcal * fat[1] * N * 0.5) / 100) {
        const c = addFood(fat[0], fat[1] * N, 'fats')
        c.min = c.grams * 0.5
        c.max = c.grams * 1.5
        continue
      }
    }
    if (tot.kcal < goal.kcal * 0.92) {
      const id = ENERGY.find((x) => !find(`b:${x}`))
      if (id) {
        const f = food(id)
        const c = addFood(id, f.portion * N * 0.5, 'energy')
        c.min = 0
        c.max = f.portion * N * 1.5
        continue
      }
    }
    break
  }
  cands.forEach((c, i) => (c.grams = fitted[i] ?? c.grams))

  // As sold: raw, dry, by the piece or the pack, in amounts as weighed at the shop.
  const sold = new Map<string, { item: GroceryItem; eaten: Cand[]; raw: number; f?: Food }>()
  for (const c of cands) {
    // A pinch a day: not worth buying for this (oil, nuts and cheese count even in small amounts).
    if (c.grams < 2 * N || (c.grams < 5 * N && c.per100.kcal < 300)) continue
    const id = c.food?.id
    const buy = id ? BUY[id] : undefined
    const f = buy?.as ? food(buy.as) : c.food
    const key = f ? `b:${f.id}` : c.key
    const k = buy?.k ?? 1
    const name = (buy?.as ? BUY[buy.as]?.name?.[locale] : buy?.name?.[locale]) ?? (f ? f.name[locale] : c.name)
    const s = sold.get(key) ?? { item: { key, name, aisle: c.aisle, grams: 0, why: c.why, instead: [] }, eaten: [], raw: 0, f }
    s.raw += c.grams * k
    s.eaten.push(c)
    // "Pasta (peso a crudo)" → "Pasta": the names as said.
    s.item.instead = [...new Set([...s.item.instead, ...c.instead.map((n) => n.replace(/\s*\([^)]*\)/g, '').trim())])].slice(0, 3)
    if (s.item.why === 'usual' && c.why !== 'usual') s.item.why = c.why
    sold.set(key, s)
  }

  const items: GroceryItem[] = []
  const perDay = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, fruitVeg_g: 0 }
  for (const s of sold.values()) {
    const g = s.raw
    const f = s.f
    let grams: number
    if (f?.id === 'egg') {
      s.item.count = Math.max(1, Math.round(g / f.portion))
      grams = s.item.count * f.portion
    } else if (f && PACK.test(f.unit?.en ?? '')) {
      s.item.pack = f.portion
      grams = Math.max(1, Math.round(g / f.portion)) * f.portion
    } else grams = g < 100 ? Math.max(10, Math.round(g / 10) * 10) : g < 1000 ? Math.round(g / 50) * 50 : Math.round(g / 100) * 100
    s.item.grams = grams
    if (s.eaten.some((c) => c.role === 'milk') || /kefir/.test(plain(s.item.name))) s.item.liquid = true
    // What the list brings, as eaten, with the amounts as rounded.
    const scale = g > 0 ? grams / g : 1
    const t = totals(s.eaten, (c) => c.grams * scale)
    for (const key of Object.keys(perDay) as (keyof typeof perDay)[]) perDay[key] += t[key] / N
    items.push(s.item)
  }
  items.sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || b.grams - a.grams)
  for (const key of Object.keys(perDay) as (keyof typeof perDay)[]) perDay[key] = Math.round(perDay[key])
  return { days: N, items, perDay, loggedDays: logged }
}
