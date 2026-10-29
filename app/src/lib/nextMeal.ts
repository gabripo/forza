import { FOODS, foodAt } from '../data/foods'
import { localDay, sumItems, type Targets } from './calc'
import type { FoodItem, FoodLog, L10n, Locale, Meal } from './types'

/**
 * After a meal is logged: what the next meal could be so the day ends on target. If lunch was chicken
 * and potatoes (protein and carbs, almost no fat), dinner should bring healthy fats; if the day is
 * already full, something light. Ideas are real dishes made of foods from the built-in table, scaled to
 * the calories that are left, so they can be logged in one tap.
 */

export type Focus = 'fat' | 'protein' | 'fiber' | 'carbs' | 'light' | 'balanced'
type Slot = 'breakfast' | 'main' | 'snack'

interface Idea {
  id: string
  emoji: string
  slots: Slot[]
  focus: Focus[]
  name: L10n
  items: [string, number][]
}

const IDEAS: Idea[] = [
  { id: 'salmon_veg', emoji: '🐟', slots: ['main'], focus: ['fat', 'protein'], name: { en: 'Baked salmon, vegetables and wholegrain bread', it: 'Salmone al forno, verdure e pane integrale' }, items: [['salmon', 150], ['mixed_veg', 200], ['olive_oil', 10], ['bread_wholegrain', 50]] },
  { id: 'eggs_avocado', emoji: '🥑', slots: ['main', 'breakfast'], focus: ['fat', 'protein'], name: { en: 'Eggs with avocado, tomatoes and wholegrain bread', it: 'Uova con avocado, pomodori e pane integrale' }, items: [['egg', 110], ['avocado', 70], ['tomatoes', 150], ['bread_wholegrain', 50]] },
  { id: 'tuna_beans', emoji: '🥗', slots: ['main'], focus: ['fat', 'fiber', 'protein'], name: { en: 'Salad of tuna in oil, beans and tomatoes', it: 'Insalata di tonno sott’olio, fagioli e pomodori' }, items: [['tuna_oil', 80], ['beans', 150], ['tomatoes', 150], ['salad', 80], ['olive_oil', 10]] },
  { id: 'mozzarella_tomatoes', emoji: '🍅', slots: ['main'], focus: ['fat'], name: { en: 'Mozzarella, tomatoes, olive oil and bread', it: 'Mozzarella, pomodori, olio e pane' }, items: [['mozzarella', 125], ['tomatoes', 200], ['olive_oil', 10], ['bread_wholegrain', 50]] },
  { id: 'chicken_salad', emoji: '🍗', slots: ['main'], focus: ['protein', 'light'], name: { en: 'Grilled chicken with a big salad', it: 'Pollo alla griglia con un’insalata grande' }, items: [['chicken_breast', 150], ['salad', 120], ['tomatoes', 150], ['olive_oil', 10]] },
  { id: 'fish_veg', emoji: '🐠', slots: ['main'], focus: ['protein', 'light'], name: { en: 'White fish with steamed vegetables', it: 'Pesce bianco con verdure al vapore' }, items: [['white_fish', 180], ['zucchini', 200], ['carrots', 100], ['olive_oil', 10]] },
  { id: 'lentils', emoji: '🍲', slots: ['main'], focus: ['fiber', 'protein'], name: { en: 'Lentils with vegetables and a drizzle of oil', it: 'Lenticchie con verdure e un filo d’olio' }, items: [['lentils', 200], ['mixed_veg', 200], ['olive_oil', 10], ['bread_wholegrain', 30]] },
  { id: 'pasta_chickpeas', emoji: '🍝', slots: ['main'], focus: ['carbs', 'fiber'], name: { en: 'Pasta and chickpeas', it: 'Pasta e ceci' }, items: [['pasta_wholegrain_dry', 70], ['chickpeas', 150], ['olive_oil', 10]] },
  { id: 'rice_chicken', emoji: '🍚', slots: ['main'], focus: ['carbs', 'protein'], name: { en: 'Rice with chicken and vegetables', it: 'Riso con pollo e verdure' }, items: [['rice_dry', 70], ['chicken_breast', 120], ['mixed_veg', 200], ['olive_oil', 10]] },
  { id: 'pasta_tuna', emoji: '🍝', slots: ['main'], focus: ['carbs', 'protein'], name: { en: 'Wholegrain pasta with tuna and tomato', it: 'Pasta integrale al tonno e pomodoro' }, items: [['pasta_wholegrain_dry', 80], ['tuna_water', 80], ['tomatoes', 150], ['olive_oil', 10]] },
  { id: 'beef_potatoes', emoji: '🥩', slots: ['main'], focus: ['carbs', 'protein'], name: { en: 'Lean beef with potatoes and salad', it: 'Manzo magro con patate e insalata' }, items: [['lean_beef', 120], ['potatoes', 200], ['salad', 80], ['olive_oil', 10]] },
  { id: 'tofu_quinoa', emoji: '🥦', slots: ['main'], focus: ['protein', 'fiber'], name: { en: 'Tofu with quinoa and vegetables', it: 'Tofu con quinoa e verdure' }, items: [['tofu', 150], ['quinoa', 150], ['broccoli', 200], ['olive_oil', 5]] },
  { id: 'yogurt_oats', emoji: '🥣', slots: ['breakfast', 'snack'], focus: ['protein', 'fiber', 'fat'], name: { en: 'Greek yogurt with oats, berries and walnuts', it: 'Yogurt greco con avena, frutti di bosco e noci' }, items: [['greek_yogurt_0', 170], ['oats', 30], ['berries', 100], ['walnuts', 15]] },
  { id: 'porridge', emoji: '🥣', slots: ['breakfast'], focus: ['carbs', 'fiber'], name: { en: 'Oat porridge with milk and a banana', it: 'Porridge d’avena con latte e banana' }, items: [['oats', 50], ['milk', 200], ['banana', 120]] },
  { id: 'toast_eggs', emoji: '🍳', slots: ['breakfast'], focus: ['protein', 'balanced'], name: { en: 'Wholegrain toast, eggs and an orange', it: 'Pane integrale, uova e un’arancia' }, items: [['bread_wholegrain', 50], ['egg', 110], ['orange', 200]] },
  { id: 'skyr_fruit', emoji: '🍎', slots: ['snack', 'breakfast'], focus: ['protein', 'light'], name: { en: 'Skyr and a piece of fruit', it: 'Skyr e un frutto' }, items: [['skyr', 150], ['apple', 180]] },
  { id: 'nuts_apple', emoji: '🌰', slots: ['snack'], focus: ['fat', 'fiber'], name: { en: 'A handful of almonds and an apple', it: 'Una manciata di mandorle e una mela' }, items: [['almonds', 25], ['apple', 180]] },
  { id: 'cottage_bread', emoji: '🧀', slots: ['snack'], focus: ['protein'], name: { en: 'Cottage cheese on wholegrain bread', it: 'Fiocchi di latte con pane integrale' }, items: [['cottage', 150], ['bread_wholegrain', 30]] },
  { id: 'banana_pb', emoji: '🍌', slots: ['snack'], focus: ['carbs', 'fat'], name: { en: 'Banana with peanut butter', it: 'Banana con burro d’arachidi' }, items: [['banana', 120], ['peanut_butter', 15]] },
  { id: 'veg_sticks', emoji: '🥕', slots: ['snack'], focus: ['light', 'fiber'], name: { en: 'Carrots and cherry tomatoes', it: 'Carote e pomodorini' }, items: [['carrots', 150], ['tomatoes', 150]] },
]

/** When each meal usually happens, and its share of what is left of the day. */
const MEALS: { meal: Meal; until: number; share: number }[] = [
  { meal: 'breakfast', until: 11, share: 1 },
  { meal: 'lunch', until: 15, share: 1.3 },
  { meal: 'snack', until: 18.5, share: 0.5 },
  { meal: 'dinner', until: 22, share: 1.3 },
]

export interface NextMeal {
  meal: Meal
  focus: Focus
  idea: Idea
  items: FoodItem[]
  totals: ReturnType<typeof sumItems>
  /** Other ideas that fit as well, for "another idea". */
  others: number
}

export function nextMeal(food: FoodLog[], targets: Targets, locale: Locale, now = new Date(), pick = 0): NextMeal | null {
  const today = localDay(now)
  const eatenLogs = food.filter((f) => localDay(new Date(f.eaten_at)) === today)
  const hour = now.getHours() + now.getMinutes() / 60
  const loggedOrder = Math.max(-1, ...eatenLogs.map((f) => MEALS.findIndex((m) => m.meal === f.meal)))
  // Snacks are suggested only to people who have them: many older people eat three meals.
  const snacker = food.some((f) => f.meal === 'snack' && now.getTime() - new Date(f.eaten_at).getTime() < 14 * 86_400_000)
  // The meals still to come today: after the last one logged, and not yet over.
  const ahead = MEALS.filter((m, i) => i > loggedOrder && m.until > hour && (m.meal !== 'snack' || snacker))
  if (!ahead.length) return null
  const next = ahead[0]

  const eaten = eatenLogs.reduce(
    (a, f) => ({ kcal: a.kcal + Number(f.kcal), protein: a.protein + Number(f.protein_g), fat: a.fat + Number(f.fat_g), carbs: a.carbs + Number(f.carbs_g), fiber: a.fiber + Number(f.fiber_g) }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  )
  const leftKcal = Math.max(0, targets.kcal - eaten.kcal)
  const mealKcal = Math.max(150, (leftKcal * next.share) / ahead.reduce((s, m) => s + m.share, 0))

  // What lags most behind calories: if half the calories are eaten but only a fifth of the fat, fat it is.
  const kcalLeftShare = leftKcal / targets.kcal
  const lags: [Focus, number][] = (
    [
      ['protein', Math.max(0, targets.protein_g - eaten.protein) / targets.protein_g],
      ['fat', Math.max(0, targets.fat_g - eaten.fat) / targets.fat_g],
      ['fiber', Math.max(0, targets.fiber_g - eaten.fiber) / targets.fiber_g],
      ['carbs', Math.max(0, targets.carbs_g - eaten.carbs) / targets.carbs_g],
    ] as [Focus, number][]
  ).map(([k, left]) => [k, left - kcalLeftShare] as [Focus, number])
  lags.sort((a, b) => b[1] - a[1])
  const focus: Focus = leftKcal < 300 ? 'light' : eatenLogs.length && lags[0][1] > 0.1 ? lags[0][0] : 'balanced'

  const slot: Slot = next.meal === 'breakfast' ? 'breakfast' : next.meal === 'snack' ? 'snack' : 'main'
  const fits = IDEAS.filter((i) => i.slots.includes(slot))
  // Dishes built around the missing nutrient first; a second nutrient counts only if it is short too.
  const second = lags[1] && lags[1][1] > 0.1 ? lags[1][0] : undefined
  const ranked = [...fits].sort((a, b) => rank(b) - rank(a))
  function rank(i: Idea) {
    return (i.focus[0] === focus ? 3 : i.focus.includes(focus) ? 2 : 0) + (second && i.focus.includes(second) ? 1 : 0)
  }
  const best = ranked.filter((i) => rank(i) === rank(ranked[0]))
  // A different idea each day (and on request), among the best ones.
  const dayIndex = Math.floor(now.getTime() / 86_400_000)
  const idea = best[(dayIndex + pick) % best.length]

  const base = idea.items.map(([id, g]) => ({ food: FOODS.find((f) => f.id === id)!, g })).filter((x) => x.food)
  const baseKcal = base.reduce((s, x) => s + foodAt(x.food, x.g).kcal, 0)
  const scale = Math.min(1.4, Math.max(0.6, mealKcal / baseKcal))
  const items = base.map(({ food, g }) => {
    const grams = Math.max(5, Math.round((g * scale) / 5) * 5)
    return { name: food.name[locale], grams, ...foodAt(food, grams) }
  })
  return { meal: next.meal, focus, idea, items, totals: sumItems(items), others: best.length }
}
