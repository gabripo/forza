// "No idea what to eat? Build your own recipe!": the foods someone has at home (typed, said, scanned or photographed)
// become recipes that fit what is left of their day. The amounts are always worked out here, from the foods' own
// values and this meal's share of what is left; the food AI, when it answers, names the dishes and writes the steps,
// and without it the app puts together a simple dish of its own.
import { FOODS, type Food } from '../data/foods'
import { localDay, MEAL_SHARE, round1, sumItems, type PlateTotals, type Targets } from './calc'
import { logsOfDay, totalsOf } from './dayCheck'
import type { DbFood, LoggedItem } from './foodDb'
import type { FoodLog, Locale, Meal } from './types'

/** Nutrients per 100 g. */
export interface Per100 {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  salt_g?: number
  satfat_g?: number
}

/** A food someone has, to cook with. Its values may be unknown (a word the app does not know): the AI then says them. */
export interface Ingredient {
  key: string
  name: string
  per100: Per100 | null
  /** A usual amount in grams (one portion, one serving). */
  portion: number
  foodId?: string
  dbId?: string
  barcode?: string
  brand?: string | null
  origin?: DbFood['source']
}

export const builtinPer100 = (f: Food): Per100 => ({ kcal: f.kcal, protein_g: f.protein, carbs_g: f.carbs, fat_g: f.fat, fiber_g: f.fiber, sugar_g: f.sugar, salt_g: f.salt, satfat_g: f.satfat })

export const fromBuiltin = (f: Food, locale: Locale): Ingredient => ({ key: `b:${f.id}`, name: f.name[locale], per100: builtinPer100(f), portion: f.portion, foodId: f.id })

// ---------------------------------------------------------------------------
// The meal's target: its share of what is left of the day
// ---------------------------------------------------------------------------

export interface MealGoal {
  meal: Meal
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

const ORDER: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

/**
 * What this meal should bring: what is left of today's targets, shared among this meal and the ones still to come
 * (not logged yet), by their usual size. Never less than a small meal; at least a fifth of its calories from protein.
 */
export function mealGoal(food: FoodLog[], targets: Targets, meal: Meal, now = new Date()): MealGoal {
  const today = logsOfDay(food, localDay(now))
  const eaten = totalsOf(today)
  const logged = new Set(today.map((f) => f.meal))
  const from = ORDER.indexOf(meal)
  const ahead = ORDER.filter((m, i) => m === meal || (i > from && !logged.has(m) && m !== 'snack'))
  const share = MEAL_SHARE[meal] / ahead.reduce((s, m) => s + MEAL_SHARE[m], 0)
  const left = (target: number, had: number) => Math.max(0, target - had) * share
  const kcal = Math.max(meal === 'snack' ? 120 : 250, Math.round(left(targets.kcal, eaten.kcal)))
  return {
    meal,
    kcal,
    protein_g: Math.round(Math.max(left(targets.protein_g, eaten.protein_g), (kcal * 0.2) / 4)),
    carbs_g: Math.round(left(targets.carbs_g, eaten.carbs_g)),
    fat_g: Math.round(left(targets.fat_g, eaten.fat_g)),
    fiber_g: Math.round(left(targets.fiber_g, eaten.fiber_g)),
  }
}

// ---------------------------------------------------------------------------
// What each food is for in a dish
// ---------------------------------------------------------------------------

export type Role = 'pasta' | 'rice' | 'grain' | 'potatoes' | 'bread' | 'oats' | 'egg' | 'yogurt' | 'cheese' | 'legume' | 'protein' | 'veg' | 'fruit' | 'oil' | 'nuts' | 'sweet' | 'milk' | 'other'

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´]/g, ' ')

const BY_NAME: [Role, RegExp][] = [
  ['oil', /\bolio\b|\boil\b|\bburro\b|\bbutter\b/],
  ['egg', /\buov[oa]\b|\buova\b|\beggs?\b|album|tuorl/],
  ['yogurt', /yogurt|yoghurt|joghurt|\bskyr\b|\bkefir\b/],
  ['pasta', /\bpasta\b|spaghett|penne|fusill|rigaton|maccheron|tortellin|raviol|gnocch|lasagn|tagliatell|linguin|noodle/],
  ['rice', /\briso\b|\brice\b|risott|basmati/],
  ['grain', /quinoa|couscous|cous cous|\bfarro\b|\bspelt\b|orzo perlato|barley|bulgur|polenta|grano saraceno|buckwheat/],
  ['potatoes', /patat|potato/],
  ['bread', /\bpane\b|bread|piadin|\btoast\b|focaccia|\bwrap\b|tortilla|friselle|frisella|bauletto|panin/],
  ['oats', /avena|\boats?\b|muesli|granola/],
  ['cheese', /mozzarell|ricotta|parmigian|\bgrana\b|\bfeta\b|formagg|cheese|stracchino|scamorza|pecorino|burrata|emmental|fiocchi di latte|cottage/],
  ['milk', /\blatte\b|\bmilk\b|bevanda (d|di|alla)|drink\b/],
  ['legume', /\bceci\b|lenticch|fagiol|piselli|chickpea|lentil|\bbeans?\b|hummus|edamame|\btofu\b|tempeh|lupin|fave\b/],
  ['protein', /pollo|tacchino|manzo|vitello|maiale|tonno|salmone|merluzz|pesce|gamber|calamar|polpo|sgombro|sardin|alic|bresaola|prosciutto|chicken|turkey|beef|pork|tuna|salmon|\bcod\b|fish|prawn|shrimp|squid|seitan|hamburger|burger/],
  ['nuts', /mandorl|\bnoci\b|nocciol|pistacch|arachid|almond|walnut|hazelnut|pistachio|peanut|\bsemi\b|seeds/],
  ['sweet', /miele|honey|marmellat|\bjam\b|zucchero|sugar|cioccolat|chocolate|cacao|cocoa/],
]

const BY_GROUP: Partial<Record<Food['group'], Role>> = { protein: 'protein', dairy: 'cheese', legumes: 'legume', veg: 'veg', fruit: 'fruit', fats: 'oil', treats: 'sweet' }

/** What a food is for in a dish: its name first, then its group in the app's table, then its values. */
export function roleOf(ing: Pick<Ingredient, 'name' | 'foodId' | 'per100'>): Role {
  const n = plain(ing.name)
  const byName = BY_NAME.find(([, re]) => re.test(n))?.[0]
  if (byName) return byName
  const food = ing.foodId ? FOODS.find((f) => f.id === ing.foodId) : undefined
  if (food?.group && BY_GROUP[food.group]) return BY_GROUP[food.group]!
  const p = ing.per100
  if (!p || p.kcal <= 0) return 'other'
  if ((p.fat_g * 9) / p.kcal > 0.75) return p.kcal > 700 ? 'oil' : 'nuts'
  if ((p.protein_g * 4) / p.kcal > 0.35) return 'protein'
  if (p.kcal < 60) return food?.group === 'fruit' || p.sugar_g > 6 ? 'fruit' : 'veg'
  return 'other'
}

const BASES: Role[] = ['pasta', 'rice', 'grain', 'potatoes', 'bread', 'oats']

/** The amounts a food can have in a dish for one person, from its usual portion. */
function bounds(role: Role, portion: number): [number, number] {
  const p = Math.max(portion, 1)
  switch (role) {
    case 'oil':
      return [3, 15]
    case 'nuts':
      return [5, Math.max(15, p * 1.5)]
    case 'sweet':
      return [Math.min(5, p), Math.max(5, p)]
    case 'veg':
      return [Math.max(40, p * 0.5), Math.max(200, p * 1.5)]
    case 'cheese':
      return [Math.max(10, p * 0.3), p * 1.2]
    case 'egg':
      return [50, 180]
    case 'fruit':
    case 'other':
      return [p * 0.5, p * 1.5]
    default:
      return [p * 0.5, p * 1.8]
  }
}

// ---------------------------------------------------------------------------
// The amounts: as close as possible to the meal's target, without odd portions
// ---------------------------------------------------------------------------

export interface Part {
  per100: Per100
  /** Where the amounts start from (a usual portion, or what the AI wrote). */
  grams: number
  min: number
  max: number
  /** Salt, spices: their amount stays as it is. */
  fixed?: boolean
  role: Role
}

/**
 * Amounts that bring the meal's calories, enough protein, and carbs and fat close to what is left, staying near the
 * usual portions: a small search, food by food, within each food's sensible amounts. Rounded as they are weighed.
 */
export function fitAmounts(parts: Part[], goal: MealGoal): number[] {
  const K = Math.max(goal.kcal, 100)
  const P = Math.max(goal.protein_g, 5)
  const C = Math.max(goal.carbs_g, 30)
  const F = Math.max(goal.fat_g, 15)
  const x = parts.map(() => 1)
  const g0 = parts.map((p) => Math.max(p.grams, 1))
  const lo = parts.map((p, i) => (p.fixed ? 1 : Math.min(1, p.min / g0[i])))
  const hi = parts.map((p, i) => (p.fixed ? 1 : Math.max(1, p.max / g0[i])))
  for (let step = 0; step < 800; step++) {
    let k = 0
    let pr = 0
    let c = 0
    let f = 0
    parts.forEach((p, i) => {
      const g = g0[i] * x[i]
      k += (p.per100.kcal * g) / 100
      pr += (p.per100.protein_g * g) / 100
      c += (p.per100.carbs_g * g) / 100
      f += (p.per100.fat_g * g) / 100
    })
    const lr = 0.08 * (1 - step / 1000)
    parts.forEach((p, i) => {
      if (p.fixed) return
      const d =
        (8 * (k - K) * p.per100.kcal) / (100 * K * K) -
        (6 * Math.max(0, P - pr) * p.per100.protein_g) / (100 * P * P) +
        (1 * (c - C) * p.per100.carbs_g) / (100 * C * C) +
        (1 * (f - F) * p.per100.fat_g) / (100 * F * F)
      const grad = g0[i] * d + 0.4 * (x[i] - 1)
      x[i] = Math.min(hi[i], Math.max(lo[i], x[i] - lr * grad))
    })
  }
  return parts.map((p, i) => (p.fixed ? p.grams : friendly(g0[i] * x[i], p.role)))
}

/** Amounts as they are weighed or counted: whole eggs, oil by the teaspoon, the rest by 5 g (by 10 g past 200 g). */
function friendly(g: number, role: Role): number {
  if (role === 'egg') return Math.max(55, Math.round(g / 55) * 55)
  if (role === 'oil') return Math.max(5, Math.round(g / 5) * 5)
  if (g > 200) return Math.round(g / 10) * 10
  return Math.max(5, Math.round(g / 5) * 5)
}

export const itemAt = (per100: Per100, grams: number) => {
  const k = grams / 100
  return {
    grams,
    kcal: Math.round(per100.kcal * k),
    protein_g: round1(per100.protein_g * k),
    carbs_g: round1(per100.carbs_g * k),
    fat_g: round1(per100.fat_g * k),
    fiber_g: round1(per100.fiber_g * k),
    sugar_g: round1(per100.sugar_g * k),
    ...(per100.salt_g != null ? { salt_g: Math.round(per100.salt_g * k * 100) / 100 } : {}),
    ...(per100.satfat_g != null ? { satfat_g: round1(per100.satfat_g * k) } : {}),
  }
}

// ---------------------------------------------------------------------------
// A recipe, as shown and logged
// ---------------------------------------------------------------------------

export type RecipeItem = LoggedItem & { pantry?: boolean }

export interface RecipeIdea {
  name: string
  emoji: string
  minutes: number | null
  steps: string[]
  why: string | null
  items: RecipeItem[]
  totals: PlateTotals
  /** Against the meal's calories: within 15%, under or over. */
  fit: 'fits' | 'light' | 'heavy'
  proteinLow: boolean
  /** Written by the food AI, or put together by the app. */
  by: 'ai' | 'app'
}

/** Foods worth adding to the list when a recipe lacks something: protein, vegetables, or calories. */
export interface Missing {
  what: 'protein' | 'veg' | 'kcal'
  foods: Food[]
}

const byId = new Map(FOODS.map((f) => [f.id, f]))
const ids = (list: string[]) => list.map((id) => byId.get(id)).filter((f): f is Food => Boolean(f))

/** A recipe with its amounts worked out, how it fits, and what it lacks. */
function finish(r: Omit<RecipeIdea, 'totals' | 'fit' | 'proteinLow'>, goal: MealGoal): RecipeIdea {
  const totals = sumItems(r.items)
  const ratio = totals.kcal / goal.kcal
  return { ...r, totals, fit: ratio < 0.85 ? 'light' : ratio > 1.15 ? 'heavy' : 'fits', proteinLow: totals.protein_g < goal.protein_g * 0.75 }
}

/** What a recipe made of these foods would lack, with foods to add for it (none already on the list). */
export function missing(ings: Ingredient[], recipe: RecipeIdea | null, goal: MealGoal): Missing[] {
  const roles = new Set(ings.map(roleOf))
  const have = new Set(ings.map((i) => i.foodId))
  const fresh = (list: string[]) => ids(list).filter((f) => !have.has(f.id)).slice(0, 4)
  const sweet = goal.meal === 'breakfast' || goal.meal === 'snack'
  const out: Missing[] = []
  if (recipe?.proteinLow || ![...roles].some((r) => ['protein', 'egg', 'legume', 'cheese', 'yogurt'].includes(r))) {
    out.push({ what: 'protein', foods: fresh(sweet ? ['greek_yogurt_0', 'skyr', 'cottage', 'egg', 'ricotta'] : ['tuna_water', 'egg', 'chickpeas', 'chicken_breast', 'mozzarella']) })
  }
  if (!sweet && !roles.has('veg')) out.push({ what: 'veg', foods: fresh(['tomatoes', 'zucchini', 'salad', 'spinach', 'peppers']) })
  if (recipe && recipe.fit === 'light' && !BASES.some((b) => roles.has(b))) out.push({ what: 'kcal', foods: fresh(sweet ? ['oats', 'bread_wholegrain', 'banana'] : ['bread_wholegrain', 'potatoes', 'rice_dry', 'pasta_wholegrain_dry']) })
  return out.filter((m) => m.foods.length)
}

// ---------------------------------------------------------------------------
// The app's own recipe, when the AI is not there: a dish shaped by its main food, simple steps
// ---------------------------------------------------------------------------

type Style = 'pasta' | 'rice' | 'grain' | 'potatoes' | 'bread' | 'bowl' | 'porridge' | 'eggs' | 'legumes' | 'salad' | 'pan'

const EMOJI: Record<Style, string> = { pasta: '🍝', rice: '🍚', grain: '🥗', potatoes: '🥔', bread: '🥪', bowl: '🥣', porridge: '🥣', eggs: '🍳', legumes: '🍲', salad: '🥗', pan: '🍳' }
const MINUTES: Record<Style, number> = { pasta: 20, rice: 25, grain: 15, potatoes: 40, bread: 10, bowl: 5, porridge: 10, eggs: 20, legumes: 20, salad: 10, pan: 20 }
/** Meat or fish that may be raw, to cook before it joins the dish (not tinned fish, ham or bresaola). */
const RAW_MEAT = /pollo|tacchino|manzo|vitello|maiale|salmone|merluzz|pesce|gamber|calamar|chicken|turkey|beef|veal|pork|salmon|\bcod\b|fish|prawn|shrimp|squid/
const RAW_VEG = /insalat|lattug|rucol|pomodor|cetriol|carot|finocch|ravanell|valerian|salad|lettuce|rocket|tomato|cucumber|carrot|fennel|radish/

function styleOf(roles: Role[], names: string[], meal: Meal): Style {
  const has = (r: Role) => roles.includes(r)
  if (has('pasta')) return 'pasta'
  if (has('rice')) return 'rice'
  if ((meal === 'breakfast' || meal === 'snack') && has('yogurt')) return 'bowl'
  if ((meal === 'breakfast' || meal === 'snack') && has('oats')) return 'porridge'
  if (has('grain')) return 'grain'
  if (has('potatoes')) return 'potatoes'
  if (has('egg') && !has('bread')) return 'eggs'
  if (has('bread')) return 'bread'
  if (has('yogurt')) return 'bowl'
  if (has('legume')) return 'legumes'
  const veg = names.filter((_, i) => roles[i] === 'veg')
  if (veg.length && veg.every((n) => RAW_VEG.test(plain(n)))) return 'salad'
  return 'pan'
}

/** "Pasta (peso a crudo)" → "pasta": the name as it reads in a dish. */
const inDish = (name: string) => name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()

type Words = Record<string, (x: Record<string, string>) => string>

const WORDS: Record<Locale, Words> = {
  en: {
    pastaName: (x) => `${x.base} with ${x.rest}`,
    riceName: (x) => `Rice bowl with ${x.rest}`,
    grainName: (x) => `${x.base} salad with ${x.rest}`,
    potatoesName: (x) => `Oven potatoes with ${x.rest}`,
    breadName: (x) => `Sandwich with ${x.rest}`,
    bowlName: (x) => `Yogurt bowl with ${x.rest}`,
    porridgeName: (x) => `Porridge with ${x.rest}`,
    eggsName: (x) => `Omelette with ${x.rest}`,
    legumesName: (x) => `${x.base} in the pan with ${x.rest}`,
    saladName: (x) => `Salad of ${x.rest}`,
    panName: (x) => `${x.base} in the pan with ${x.rest}`,
    alone: (x) => x.base,
    panAlone: (x) => `Pan-fried ${x.base}`,
    cookBase: (x) => `Cook the ${x.base} in salted boiling water.`,
    cookGrain: (x) => `Cook the ${x.base} as the packet says, then let it cool a little.`,
    toast: (x) => `Toast the ${x.base}.`,
    ovenPotatoes: (x) => `Cut the ${x.base} into cubes and bake them at 200 °C for 30–35 minutes with ${x.fat}.`,
    sauteVeg: (x) => `Meanwhile, sauté the ${x.veg} in a pan with ${x.fat} for 8–10 minutes.`,
    addProtein: (x) => `Add the ${x.protein} and let it warm through for a few minutes.`,
    addProteinRaw: (x) => `Add the ${x.protein} and cook until done (if raw, cut it small and cook it in the pan first).`,
    cookProtein: (x) => `Cook the ${x.protein} in a pan with ${x.fat}, 4–6 minutes a side.`,
    sameVeg: (x) => `In the same pan, sauté the ${x.veg}.`,
    panVeg: (x) => `Sauté the ${x.veg} in a pan with ${x.fat} for 8–10 minutes.`,
    eggsBeat: (x) => `Beat the ${x.egg} with a pinch of salt${x.cheese ? ` and the ${x.cheese}` : ''}.`,
    eggsPan: () => `Pour into the pan and cook on a low heat, covered, 5–6 minutes a side.`,
    eggsVeg: (x) => `Soften the ${x.veg} in a pan with ${x.fat}.`,
    eggsCook: (x) => `Cook the ${x.egg} in a pan (scrambled or fried).`,
    slice: (x) => `Slice the ${x.veg}.`,
    fill: (x) => `Fill with ${x.what}${x.fat ? ` and a drizzle of ${x.fat}` : ''}.`,
    legumesCook: (x) => `In a pan with ${x.fat}, soften the ${x.veg} for 5 minutes, add the ${x.base} (rinsed, if tinned) and cook 10 minutes.`,
    legumesAlone: (x) => `Warm the ${x.base} in a pan with ${x.fat}, garlic or onion and a few herbs, 10 minutes.`,
    wash: (x) => `Wash and cut the ${x.veg}.`,
    bowlBase: (x) => `Put the ${x.base} in a bowl.`,
    porridgeCook: (x) => `Cook the ${x.base} with ${x.milk} on a low heat for 5 minutes, stirring.`,
    top: (x) => `Top with ${x.what}.`,
    mix: (x) => `Add ${x.what}.`,
    dress: (x) => `Dress with ${x.fat}, salt and lemon or vinegar.`,
    drain: (x) => `Drain, mix with the sauce${x.cheese ? ` and finish with the ${x.cheese}` : ''}, and serve.`,
    serveWith: (x) => `Serve with ${x.what}.`,
    serve: () => 'Serve.',
    oil: () => 'a little olive oil',
    milk: () => 'water or milk',
  },
  it: {
    pastaName: (x) => `${cap(x.base)} con ${x.rest}`,
    riceName: (x) => `Ciotola di riso con ${x.rest}`,
    grainName: (x) => `Insalata di ${x.base} con ${x.rest}`,
    potatoesName: (x) => `Patate al forno con ${x.rest}`,
    breadName: (x) => `Panino con ${x.rest}`,
    bowlName: (x) => `Ciotola di yogurt con ${x.rest}`,
    porridgeName: (x) => `Porridge con ${x.rest}`,
    eggsName: (x) => `Frittata con ${x.rest}`,
    legumesName: (x) => `${cap(x.base)} in padella con ${x.rest}`,
    saladName: (x) => `Insalata di ${x.rest}`,
    panName: (x) => `${cap(x.base)} in padella con ${x.rest}`,
    alone: (x) => cap(x.base),
    panAlone: (x) => `${cap(x.base)} in padella`,
    cookBase: (x) => `Cuoci ${x.base} in acqua bollente salata.`,
    cookGrain: (x) => `Cuoci ${x.base} come dice la confezione e lascia intiepidire.`,
    toast: (x) => `Tosta ${x.base}.`,
    ovenPotatoes: (x) => `Taglia ${x.base} a cubetti e cuoci in forno a 200 °C per 30–35 minuti con ${x.fat}.`,
    sauteVeg: (x) => `Intanto, in padella con ${x.fat}, fai saltare ${x.veg} per 8–10 minuti.`,
    addProtein: (x) => `Aggiungi ${x.protein} e lascia insaporire qualche minuto.`,
    addProteinRaw: (x) => `Aggiungi ${x.protein} e cuoci finché è pronto (se è crudo, tagliato a pezzetti e cotto prima in padella).`,
    cookProtein: (x) => `Cuoci ${x.protein} in padella con ${x.fat}, 4–6 minuti per lato.`,
    sameVeg: (x) => `Nella stessa padella fai saltare ${x.veg}.`,
    panVeg: (x) => `Fai saltare ${x.veg} in padella con ${x.fat} per 8–10 minuti.`,
    eggsBeat: (x) => `Sbatti ${x.egg} con un pizzico di sale${x.cheese ? ` e ${x.cheese}` : ''}.`,
    eggsPan: () => 'Versa in padella e cuoci a fuoco basso, coperto, 5–6 minuti per lato.',
    eggsVeg: (x) => `Fai appassire ${x.veg} in padella con ${x.fat}.`,
    eggsCook: (x) => `Cuoci ${x.egg} in padella (strapazzate o all’occhio).`,
    slice: (x) => `Taglia a fette ${x.veg}.`,
    fill: (x) => `Farcisci con ${x.what}${x.fat ? ` e un filo di ${x.fat}` : ''}.`,
    legumesCook: (x) => `In padella con ${x.fat} fai appassire ${x.veg} per 5 minuti, aggiungi ${x.base} (sciacquati, se in scatola) e cuoci 10 minuti.`,
    legumesAlone: (x) => `Scalda ${x.base} in padella con ${x.fat}, aglio o cipolla e qualche erba aromatica, per 10 minuti.`,
    wash: (x) => `Lava e taglia ${x.veg}.`,
    bowlBase: (x) => `Metti ${x.base} in una ciotola.`,
    porridgeCook: (x) => `Cuoci ${x.base} con ${x.milk} a fuoco basso per 5 minuti, mescolando.`,
    top: (x) => `Completa con ${x.what}.`,
    mix: (x) => `Aggiungi ${x.what}.`,
    dress: (x) => `Condisci con ${x.fat}, sale e limone o aceto.`,
    drain: (x) => `Scola, mescola con il condimento${x.cheese ? ` e completa con ${x.cheese}` : ''}, poi servi.`,
    serveWith: (x) => `Servi con ${x.what}.`,
    serve: () => 'Servi.',
    oil: () => 'un filo d’olio d’oliva',
    milk: () => 'acqua o latte',
  },
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The app's recipe from the foods with known values: a dish shaped by its main food, and simple steps. */
export function appRecipe(ings: Ingredient[], goal: MealGoal, locale: Locale): RecipeIdea | null {
  const usable = ings.filter((i): i is Ingredient & { per100: Per100 } => Boolean(i.per100))
  if (!usable.length) return null
  const w = WORDS[locale]
  const list = (xs: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(xs)
  const roles = usable.map(roleOf)
  const names = usable.map((i) => inDish(i.name))
  const style = styleOf(roles, usable.map((i) => i.name), goal.meal)
  // Cooking needs a little oil: from the pantry, when none is on the list.
  const cooked = !['bowl', 'porridge', 'bread'].includes(style)
  const oilFood = byId.get('olive_oil')!
  const withOil = cooked && !roles.includes('oil')
  const parts: (Part & { ing: Ingredient | null })[] = [
    ...usable.map((ing, i) => {
      const [min, max] = bounds(roles[i], ing.portion)
      // Eggs come in twos in a dish.
      const start = roles[i] === 'egg' && ing.portion <= 60 ? ing.portion * 2 : ing.portion
      return { per100: ing.per100, grams: start, min, max, role: roles[i], ing }
    }),
    ...(withOil ? [{ per100: builtinPer100(oilFood), grams: 10, min: 5, max: 10, role: 'oil' as Role, ing: null }] : []),
  ]
  const grams = fitAmounts(parts, goal)
  const items: RecipeItem[] = parts.map((p, i) =>
    p.ing
      ? { name: p.ing.name, ...itemAt(p.per100, grams[i]), foodId: p.ing.foodId, dbId: p.ing.dbId, barcode: p.ing.barcode, brand: p.ing.brand, origin: p.ing.origin }
      : { name: oilFood.name[locale], ...itemAt(p.per100, grams[i]), foodId: oilFood.id, pantry: true },
  )

  // The words of the dish: its main food, and the others by what they do.
  const of = (...r: Role[]) => names.filter((_, i) => r.includes(roles[i]))
  const fat = of('oil')[0] ?? w.oil({})
  const baseRole: Partial<Record<Style, Role[]>> = { pasta: ['pasta'], rice: ['rice'], grain: ['grain'], potatoes: ['potatoes'], bread: ['bread'], bowl: ['yogurt'], porridge: ['oats'], eggs: ['egg'], legumes: ['legume'], pan: ['protein', 'legume', 'cheese', 'egg'] }
  const baseIdx = names.findIndex((_, i) => (baseRole[style] ?? []).includes(roles[i]))
  const base = baseIdx >= 0 ? names[baseIdx] : ''
  const others = names.filter((_, i) => i !== baseIdx && roles[i] !== 'oil')
  const veg = of('veg')
  const protein = of('protein', 'legume').filter((n) => n !== base)
  const cheese = of('cheese').filter((n) => n !== base)
  const egg = of('egg').filter((n) => n !== base)
  const toppings = names.filter((_, i) => i !== baseIdx && ['fruit', 'nuts', 'sweet', 'oats', 'cheese', 'yogurt', 'milk', 'other'].includes(roles[i]))
  // Some names say the main food ("Pasta with…"), the others only the rest ("Salad of…").
  const withBase = ['pasta', 'grain', 'legumes', 'pan'].includes(style)
  const main = base || others[0] || names[0]
  // "Salad of salad greens and tomatoes": the greens go without saying.
  const extra = (withBase ? others.filter((n) => n !== main) : others).filter((n) => style !== 'salad' || !/^(insalata|salad)/.test(n))
  const name = extra.length ? w[`${style}Name`]({ base: main, rest: list(extra) }) : w[style === 'pan' ? 'panAlone' : 'alone']({ base: main })

  const steps: string[] = []
  let served = false
  const used = new Set<string>([base, ...of('oil')])
  const say = (key: string, x: Record<string, string>, also: string[] = []) => {
    steps.push(w[key](x))
    also.forEach((n) => used.add(n))
  }
  switch (style) {
    case 'pasta':
    case 'rice':
      say('cookBase', { base })
      if (veg.length) say('sauteVeg', { veg: list(veg), fat }, veg)
      if (protein.length || egg.length) say(protein.some((n) => RAW_MEAT.test(plain(n))) ? 'addProteinRaw' : 'addProtein', { protein: list([...protein, ...egg]) }, [...protein, ...egg])
      say('drain', { cheese: list(cheese) }, cheese)
      served = true
      break
    case 'grain':
      say('cookGrain', { base })
      if (veg.length) say('wash', { veg: list(veg) }, veg)
      if (others.some((n) => !used.has(n))) say('mix', { what: list(others.filter((n) => !used.has(n))) }, others)
      say('dress', { fat })
      break
    case 'potatoes':
      say('ovenPotatoes', { base, fat })
      if (protein.length || egg.length) say('cookProtein', { protein: list([...protein, ...egg]), fat }, [...protein, ...egg])
      if (veg.length) say('sameVeg', { veg: list(veg) }, veg)
      break
    case 'bread':
      say('toast', { base })
      if (egg.length) say('eggsCook', { egg: list(egg) }, egg)
      if (veg.length) say('slice', { veg: list(veg) }, veg)
      say('fill', { what: list(others.length ? others : [base]), fat: of('oil')[0] ?? '' }, others)
      break
    case 'bowl':
      say('bowlBase', { base })
      if (toppings.length) say('top', { what: list(toppings) }, toppings)
      break
    case 'porridge':
      say('porridgeCook', { base, milk: of('milk')[0] ?? w.milk({}) }, of('milk'))
      if (toppings.filter((n) => !used.has(n)).length) say('top', { what: list(toppings.filter((n) => !used.has(n))) }, toppings)
      break
    case 'eggs':
      if (veg.length) say('eggsVeg', { veg: list(veg), fat }, veg)
      say('eggsBeat', { egg: base, cheese: list(cheese) }, cheese)
      say('eggsPan', {})
      break
    case 'legumes':
      say(veg.length ? 'legumesCook' : 'legumesAlone', { base, veg: list(veg), fat }, veg)
      break
    case 'salad':
      say('wash', { veg: list(veg) }, veg)
      if (others.some((n) => !used.has(n))) say('mix', { what: list(others.filter((n) => !used.has(n))) }, others)
      say('dress', { fat })
      break
    default:
      if (base) say('cookProtein', { protein: base, fat })
      if (veg.length) say(base ? 'sameVeg' : 'panVeg', { veg: list(veg), fat }, veg)
  }
  const left = names.filter((n) => !used.has(n))
  if (left.length) steps.push(w.serveWith({ what: list(left) }))
  else if (!served) steps.push(w.serve({}))

  return finish({ name, emoji: EMOJI[style], minutes: MINUTES[style], steps, why: null, items, by: 'app' }, goal)
}

// ---------------------------------------------------------------------------
// The AI's recipes, with the app's amounts
// ---------------------------------------------------------------------------

/** One food of a recipe as the AI wrote it: `ref` is its place in the list sent, -1 for something from the pantry. */
export interface AiRecipeItem {
  ref: number
  name: string
  grams: number
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
}

export interface AiRecipe {
  name: string
  emoji: string
  minutes: number
  steps: string[]
  why: string
  items: AiRecipeItem[]
}

/**
 * An AI recipe with the app's values for the foods it knows and the AI's for the others (pantry staples too), and
 * amounts fitted to the meal's target: starting from the AI's, never more than double or less than half of them.
 */
export function fromAi(r: AiRecipe, ings: Ingredient[], goal: MealGoal): RecipeIdea {
  const parts = r.items
    .filter((it) => it.grams > 0 || it.kcal > 0)
    .map((it) => {
      const ing = it.ref >= 0 && it.ref < ings.length ? ings[it.ref] : null
      const grams = it.grams > 0 ? it.grams : 1
      const per100: Per100 = ing?.per100 ?? {
        kcal: (it.kcal / grams) * 100,
        protein_g: (it.protein_g / grams) * 100,
        carbs_g: (it.carbs_g / grams) * 100,
        fat_g: (it.fat_g / grams) * 100,
        fiber_g: (it.fiber_g / grams) * 100,
        sugar_g: (it.sugar_g / grams) * 100,
      }
      const role = roleOf({ name: ing?.name ?? it.name, foodId: ing?.foodId, per100 })
      const [min, max] = bounds(role, grams)
      // Salt, pepper, herbs: as written.
      const fixed = per100.kcal * grams < 1500
      return { per100, grams, min: Math.max(min, grams * 0.5), max: Math.min(max, grams * 2), role, fixed, ing, it }
    })
  const grams = fitAmounts(parts, goal)
  const items: RecipeItem[] = parts.map((p, i) => ({
    name: p.ing?.name ?? p.it.name,
    ...itemAt(p.per100, p.fixed ? Math.round(p.grams) : grams[i]),
    ...(p.ing ? { foodId: p.ing.foodId, dbId: p.ing.dbId, barcode: p.ing.barcode, brand: p.ing.brand, origin: p.ing.origin } : { pantry: true, origin: 'ai' as const }),
  }))
  return finish({ name: r.name, emoji: r.emoji || '🍽️', minutes: r.minutes || null, steps: r.steps, why: r.why || null, items, by: 'ai' }, goal)
}
