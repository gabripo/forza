import { FOODS, foodAt, type Food } from '../data/foods'
import type { FoodItem, Locale } from './types'

/**
 * Turns a dictated sentence ("due uova, 80 grammi di pasta e un cucchiaio d'olio") into food items,
 * using the built-in food table: no AI, no network, instant. Whatever it does not recognise is
 * returned as `unknown`, so the caller can ask the food AI about just those words.
 */

/** Everyday names people say, on top of each food's own name. */
const ALIASES: Record<string, string[]> = {
  chicken_breast: ['pollo', 'petto di pollo', 'pollo arrosto', 'pollo alla griglia', 'chicken', 'chicken breast'],
  turkey_breast: ['tacchino', 'fesa', 'turkey'],
  lean_beef: ['manzo', 'carne', 'carne rossa', 'bistecca', 'vitello', 'hamburger', 'beef', 'steak', 'meat'],
  salmon: ['salmone', 'salmon'],
  white_fish: ['pesce', 'merluzzo', 'nasello', 'orata', 'branzino', 'platessa', 'fish', 'cod', 'hake'],
  tuna_water: ['tonno', 'tonno al naturale', 'tuna'],
  tuna_oil: ['tonno sott olio', 'tonno all olio', 'tuna in oil'],
  egg: ['uovo', 'egg', 'uovo sodo', 'boiled egg'],
  egg_white: ['albume', 'egg white'],
  whey: ['proteine', 'proteine in polvere', 'shake proteico', 'whey', 'protein shake'],
  greek_yogurt_0: ['yogurt greco', 'greek yogurt'],
  greek_yogurt: ['yogurt greco intero'],
  yogurt: ['yogurt'],
  cottage: ['fiocchi di latte', 'cottage cheese'],
  parmesan: ['parmigiano', 'grana', 'parmesan'],
  milk: ['latte', 'milk'],
  lentils: ['lenticchie', 'lentils'],
  chickpeas: ['ceci', 'chickpeas'],
  beans: ['fagioli', 'beans'],
  peas: ['piselli', 'peas'],
  pasta_dry: ['pasta', 'spaghetti', 'penne', 'fusilli', 'maccheroni', 'rigatoni', 'linguine', 'tagliatelle'],
  pasta_wholegrain_dry: ['pasta integrale', 'spaghetti integrali', 'penne integrali', 'wholegrain pasta', 'whole wheat pasta'],
  rice_dry: ['riso', 'risotto', 'rice'],
  bread: ['pane', 'panino', 'bread', 'roll'],
  bread_wholegrain: ['pane integrale', 'wholegrain bread', 'whole wheat bread'],
  oats: ['avena', 'fiocchi d avena', 'porridge', 'oats', 'oatmeal'],
  potatoes: ['patata', 'patate lesse', 'potato'],
  rusks: ['fette biscottate', 'rusk'],
  berries: ['frutti di bosco', 'fragola', 'mirtillo', 'lampone', 'berry', 'strawberry', 'blueberry'],
  salad: ['insalata', 'lattuga', 'rucola', 'salad', 'lettuce'],
  tomatoes: ['pomodoro', 'tomato'],
  zucchini: ['zucchina', 'zucchine', 'courgette', 'zucchini'],
  carrots: ['carota', 'carrot'],
  spinach: ['spinaci', 'spinach'],
  mixed_veg: ['verdura', 'verdure', 'verdure miste', 'contorno', 'minestrone', 'vegetables', 'veggies'],
  olive_oil: ['olio', 'olio d oliva', 'olio extravergine', 'olive oil', 'oil'],
  almonds: ['mandorla', 'almond'],
  walnuts: ['noce', 'walnut', 'nuts'],
  peanut_butter: ['burro d arachidi', 'burro di arachidi', 'peanut butter'],
  dark_chocolate: ['cioccolato', 'cioccolato fondente', 'chocolate', 'dark chocolate'],
  biscuits: ['biscotto', 'biscuit', 'cookie'],
  croissant: ['cornetto', 'brioche', 'croissant'],
  pizza: ['pizza'],
  ice_cream: ['gelato', 'ice cream'],
  soda: ['bibita', 'coca cola', 'aranciata', 'soda', 'coke'],
  juice: ['succo', 'succo di frutta', 'spremuta', 'juice', 'orange juice'],
  wine: ['vino', 'wine'],
  beer: ['birra', 'beer'],
  prosciutto: ['prosciutto', 'prosciutto crudo', 'ham'],
  cooked_ham: ['prosciutto cotto', 'cooked ham'],
  sugar: ['zucchero', 'sugar'],
  honey: ['miele', 'honey'],
  jam: ['marmellata', 'confettura', 'jam', 'marmalade'],
  espresso: ['caffe', 'caffe espresso', 'espresso', 'coffee'],
  cappuccino: ['cappuccino', 'caffelatte', 'latte macchiato'],
}

/** Words that link foods: each one starts a new food. */
const SPLIT = /[,;\n]|\.(?!\d)|\b(?:e|ed|con|poi|piu|anche|and|with|plus|then|also)\b/
/** Words that carry no meaning for the food or its amount. */
const FILLER = new Set(
  ('di del della dello dei degli delle d il lo la l i gli le ho mangiato bevuto preso a al alla allo ai agli alle in per da circa tipo sott ' +
    'colazione pranzo cena merenda spuntino oggi stamattina stasera ancora po poco acqua senza ' +
    'of the some i had ate drank about around for my breakfast lunch dinner snack today tonight water without little bit').split(' '),
)
const NUMBERS: Record<string, number> = {
  un: 1, uno: 1, una: 1, a: 1, an: 1, one: 1,
  due: 2, two: 2, tre: 3, three: 3, quattro: 4, four: 4, cinque: 5, five: 5, sei: 6, six: 6,
  sette: 7, seven: 7, otto: 8, eight: 8, nove: 9, nine: 9, dieci: 10, ten: 10,
  mezzo: 0.5, mezza: 0.5, half: 0.5, cento: 100, duecento: 200, trecento: 300, centocinquanta: 150,
}
const GRAMS = new Set(['g', 'gr', 'grammo', 'grammi', 'gram', 'grams', 'ml', 'millilitri'])
const KILOS = new Set(['kg', 'chilo', 'chili', 'kilo', 'kilos'])
const SPOONS = new Set(['cucchiaio', 'cucchiai', 'spoon', 'spoons', 'tbsp', 'tablespoon', 'tablespoons'])
const TEASPOONS = new Set(['cucchiaino', 'cucchiaini', 'teaspoon', 'teaspoons', 'tsp'])
/** Units that mean "one serving" of whatever follows. */
const SERVINGS = new Set([
  'piatto', 'piatti', 'porzione', 'porzioni', 'ciotola', 'tazza', 'bicchiere', 'bicchieri', 'vasetto', 'vasetti',
  'scatoletta', 'scatolette', 'lattina', 'bottiglia', 'manciata', 'tazzina', 'tazzine', 'plate', 'plates', 'portion', 'portions', 'bowl',
  'cup', 'glass', 'glasses', 'pot', 'can', 'bottle', 'handful', 'serving', 'servings',
])
/** Units that count pieces. */
const PIECES = new Set(['fetta', 'fette', 'pezzo', 'pezzi', 'quadretto', 'quadretti', 'slice', 'slices', 'piece', 'pieces', 'square', 'squares'])

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/['’`]/g, ' ')
/** Singular and plural meet: "patate"/"patata" → "patat", "eggs"/"egg" → "egg". */
const stem = (w: string) => (w.length < 4 ? w : w.replace(/s$/, '').replace(/[aeiouy]+$/, '') || w)
const words = (s: string) => plain(s).split(/[^a-z0-9]+/).filter(Boolean)

interface Alias {
  food: Food
  stems: string[]
}

const INDEX: Alias[] = (() => {
  const out: Alias[] = []
  for (const food of FOODS) {
    // The food's own names, without notes in brackets or after a comma: "Pesce bianco, merluzzo (cotto)" → "pesce bianco".
    const own = [food.name.it, food.name.en].map((n) => n.replace(/\(.*?\)/g, '').split(',')[0])
    for (const name of [...own, ...(ALIASES[food.id] ?? [])]) {
      const stems = words(name).filter((w) => !FILLER.has(w)).map(stem)
      if (stems.length) out.push({ food, stems })
    }
  }
  // Longest names first, so "pasta integrale" wins over "pasta" and "prosciutto cotto" over "prosciutto".
  return out.sort((a, b) => b.stems.length - a.stems.length)
})()

export interface VoiceResult {
  items: (FoodItem & { foodId: string })[]
  /** Parts of the sentence that did not match a known food. */
  unknown: string[]
}

export function parseMeal(text: string, locale: Locale): VoiceResult {
  const items: VoiceResult['items'] = []
  const unknown: string[] = []
  // Numbers stuck to units ("80g") become two words; decimal commas stay inside the number.
  const prepared = plain(text).replace(/(\d)([a-z])/g, '$1 $2').replace(/(\d),(\d)/g, '$1.$2')
  for (const part of prepared.split(SPLIT)) {
    // Filler words go first, so "frutti di bosco" meets the food name "frutti bosco".
    const ws = (part ?? '').split(/[^a-z0-9.]+/).filter((w) => w && !FILLER.has(w))
    if (!ws.length) continue
    const stems = ws.map(stem)
    // Every food named in this part, left to right, the longest name at each place.
    const hits: { food: Food; start: number; end: number }[] = []
    for (let i = 0; i < ws.length; ) {
      const a = INDEX.find((x) => x.stems.every((st, k) => stems[i + k] === st))
      if (a) {
        hits.push({ food: a.food, start: i, end: i + a.stems.length })
        i += a.stems.length
      } else i++
    }
    const leftover = ws.filter((w, i) => !hits.some((h) => i >= h.start && i < h.end) && meaningful(w))
    if (!hits.length) {
      // Only amounts and filler words ("ancora un po'"): nothing to report.
      if (leftover.length) unknown.push(part.trim())
      continue
    }
    hits.forEach((h, k) => {
      // The amount is usually said before the food ("200 g di pollo"), sometimes after ("pollo, 200 grammi").
      const before = ws.slice(k ? hits[k - 1].end : 0, h.start)
      const after = ws.slice(h.end, hits[k + 1]?.start ?? ws.length)
      const grams = Math.round(amount(before, h.food) ?? amount(after, h.food) ?? h.food.portion)
      items.push({ foodId: h.food.id, name: h.food.name[locale], grams, ...foodAt(h.food, grams) })
    })
  }
  return { items, unknown }
}

const meaningful = (w: string) => !FILLER.has(w) && !Object.hasOwn(NUMBERS, w) && Number.isNaN(Number(w)) && !isUnit(w)

const isUnit = (w: string) => GRAMS.has(w) || KILOS.has(w) || SPOONS.has(w) || TEASPOONS.has(w) || SERVINGS.has(w) || PIECES.has(w)

/** Grams for the amount said in a few words, or null when they say no amount. */
function amount(ws: string[], food: Food): number | null {
  let n: number | null = null
  for (const w of ws) {
    const value = Number(w)
    if (!Number.isNaN(value) && value > 0) n = value
    // "un chilo e mezzo", "due e mezzo": a half adds to the number before it.
    else if (Object.hasOwn(NUMBERS, w)) n = n !== null && NUMBERS[w] === 0.5 ? n + 0.5 : NUMBERS[w]
    else if (GRAMS.has(w)) return n ?? food.portion
    else if (KILOS.has(w)) return (n ?? 1) * 1000
    else if (SPOONS.has(w)) return (n ?? 1) * (/tbsp|tablespoon/.test(food.unit?.en ?? '') ? food.portion : 15)
    else if (TEASPOONS.has(w)) return (n ?? 1) * (/teaspoon/.test(food.unit?.en ?? '') ? food.portion : 5)
    else if (SERVINGS.has(w)) return (n ?? 1) * food.portion
    else if (PIECES.has(w)) return (n ?? 1) * pieceGrams(food)
  }
  if (n === null) return null
  // A bare number: grams when large ("200 pollo"), pieces or portions when small ("2 uova", "una pizza").
  return n >= 20 ? n : n * pieceGrams(food)
}

/** One piece: an egg, a slice, a biscuit. Units such as "3 biscuits" share the portion between the pieces. */
function pieceGrams(food: Food): number {
  const unit = food.unit?.en ?? ''
  const count = unit.startsWith('½') ? 0.5 : Number(/^(\d+)/.exec(unit)?.[1] ?? 1)
  return food.portion / count
}
