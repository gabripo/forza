// Ultra-processed foods (ice cream, biscuits, snacks, sugary drinks…) fill up less and bring fewer nutrients than the
// foods they push out. Whoever logs them often is asked, kindly, whether they know, and shown many alternatives that
// are just as pleasant, each one tap away from being logged. Meals keep only food names, so foods are known by name,
// in Italian, English and German (packaged products keep their own names).
import { FOODS, foodAt } from '../data/foods'
import { localDay } from './calc'
import type { FoodItem, FoodLog, L10n, Locale } from './types'

export type ProcessedKind = 'ice_cream' | 'biscuits' | 'pastries' | 'chocolate' | 'sweets' | 'salty_snacks' | 'sugary_drinks' | 'processed_meat' | 'fast_food' | 'cereals'

/** Lower case, without accents or apostrophes: "Caffè d’orzo" → "caffe d orzo". */
const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´]/g, ' ')

/** Made to bring protein, or without sugar: chosen on purpose, never pointed at. */
const NOT_THESE = /protein|proteic|\bskyr\b|\bzero\b|\blight\b|\bdiet\b|senza zucchero|sugar ?free|ohne zucker|fondente|\bdark\b|fatt[oa] in casa|home[- ]?made/

/** The words of each kind; the first that matches wins (fries before crisps: both are "patatine"). */
const KINDS: [ProcessedKind, RegExp][] = [
  ['fast_food', /patatine fritte|french fries|\bfries\b|pommes frites|nugget|cordon bleu|bastoncin|fish ?fingers|fischstabchen|cotolett[ae] (pronta|surgelat|impanat)|panino con hamburger|cheeseburger|big mac|mc ?donald|burger king|\bkebab|\bdoner\b|hot ?dog/],
  ['ice_cream', /gelat|\bice ?cream|\beis\b|\bglace\b|sorbett|ghiacciol|\bmagnum\b|cornetto algida|\bbudin|pudding|panna cotta|creme caramel/],
  ['biscuits', /biscott(?!at)|frollin|\bcookie|\bwafer|krumir|gocciole|pan di stelle|\boreo|digestive|\bkeks|\bkekse/],
  ['pastries', /cornett|\bbrioche|croissant|millefoglie|pasticcin|crostat|\btort[ae]\b|cheesecake|tiramis|plum ?cake|ciambell|krapfen|bombolon|\bcannol|sfogliatell|panettone|pandoro|colomba|merendin|snack cake|\bdonut|(?<!egg )\bmuffin|strudel|\bbigne|\bkuchen|(?<!rice )\bcake\b|\bsacher/],
  ['chocolate', /nutella|crema (spalmabile|alla nocciola|di nocciol|al cioccolato)|nocciolata|hazelnut (cocoa )?spread|cioccolat[oa] (al latte|bianc)|milk chocolate|white chocolate|\bkinder|snickers|\btwix|\bmars\b|\bbounty|ovetto|cioccolata calda|hot chocolate/],
  ['sweets', /caramell|\bgomm(e|ose|osa)\b|\bgummy|haribo|marshmallow|lecca ?lecca|confett|\bsweets\b|\bcandy/],
  ['salty_snacks', /patatin|\bchips\b|\bcrisps\b|pringles|fonzies|\btaralli|tarallin|salatin|pretzel|snack salat/],
  ['sugary_drinks', /coca[- ]?cola|\bcola\b|aranciata|\bfanta\b|\bsprite\b|te freddo|the freddo|estathe|ice ?tea|eistee|energy drink|red bull|\bbibit|soft drink|\bsoda\b|gassosa|chinotto|limonata|succo di frutta|fruit juice|\bnettare/],
  ['processed_meat', /w[uü]rstel|wurst|frankfurt|mortadell|\bsalam[ei]\b|salamin|\bbacon\b|\bspam\b/],
  ['cereals', /corn ?flakes|cereali (al cioccolato|soffiat|zuccherat|da colazione)|breakfast cereal|choco ?pops|coco ?pops|frosties|nesquik|barrett[ae] (ai|di) cereali|cereal bar|granola bar|muesli bar/],
]

/** Which kind of processed food a food is, from its name; null for anything else. */
export function processedKind(name: string): ProcessedKind | null {
  const n = plain(name)
  if (NOT_THESE.test(n)) return null
  return KINDS.find(([, re]) => re.test(n))?.[0] ?? null
}

/** A plate's processed foods, by kind: the names that made it so. */
export function processedOn(items: { name: string }[]): Map<ProcessedKind, string[]> {
  const out = new Map<ProcessedKind, string[]>()
  for (const it of items) {
    const kind = processedKind(it.name)
    if (kind) out.set(kind, [...(out.get(kind) ?? []), it.name])
  }
  return out
}

/** The days looked back at, and how often processed foods must come up there (meals, on different days) to be a habit. */
export const HABIT_DAYS = 14
export const HABIT_MEALS = 4
export const HABIT_ON_DAYS = 3

export interface ProcessedHabit {
  kind: ProcessedKind
  /** Meals with this kind of food in the last days (a meal counts once). */
  times: number
  /** The names as logged ("Gelato", "Joghurt und Himbeer Eis"), the most frequent first. */
  names: string[]
}

export interface ProcessedHabits {
  /** Meals with processed foods in the last `HABIT_DAYS` days, and the days they were on. */
  meals: number
  days: number
  /** Each kind, the most frequent first. */
  kinds: ProcessedHabit[]
}

/**
 * The processed foods someone logs often: how many meals had them in the last `HABIT_DAYS` days, kind by kind, the
 * most frequent first. Null unless they came up in `HABIT_MEALS` meals or more, on `HABIT_ON_DAYS` days at least.
 */
export function processedHabits(food: FoodLog[], now = new Date()): ProcessedHabits | null {
  const since = new Date(now)
  since.setDate(since.getDate() - HABIT_DAYS)
  const found = new Map<ProcessedKind, { times: number; names: Map<string, number> }>()
  const days = new Set<string>()
  let meals = 0
  for (const log of food) {
    const at = new Date(log.eaten_at)
    if (at < since || at > now) continue
    const items: { name: string }[] = log.items?.length ? log.items : [{ name: log.title }]
    const kinds = processedOn(items)
    if (!kinds.size) continue
    days.add(localDay(at))
    meals++
    for (const [kind, names] of kinds) {
      const f = found.get(kind) ?? { times: 0, names: new Map() }
      f.times++
      for (const n of names) f.names.set(n, (f.names.get(n) ?? 0) + 1)
      found.set(kind, f)
    }
  }
  if (meals < HABIT_MEALS || days.size < HABIT_ON_DAYS) return null
  const kinds = [...found]
    .map(([kind, f]) => ({ kind, times: f.times, names: [...f.names].sort((a, b) => b[1] - a[1]).map(([n]) => n) }))
    .sort((a, b) => b.times - a.times)
  return { meals, days: days.size, kinds }
}

/** Something to have instead: foods from the app's table, in usual amounts. */
interface Swap {
  id: string
  emoji: string
  name: L10n
  /** Why it is better, in a few words. */
  note: L10n
  items: [string, number][]
}

const s = (id: string, emoji: string, en: string, it: string, noteEn: string, noteIt: string, items: [string, number][]): Swap => ({ id, emoji, name: { en, it }, note: { en: noteEn, it: noteIt }, items })

/** For each kind, many alternatives: the most similar (and the most filling) first. */
const SWAPS: Record<ProcessedKind, Swap[]> = {
  ice_cream: [
    s('frozen_yogurt', '🍨', 'Home-made frozen yogurt', 'Frozen yogurt fatto in casa', 'Greek yogurt with frozen berries and honey: creamy and cold, with five times the protein.', 'Yogurt greco con frutti di bosco surgelati e miele: cremoso e freddo, con cinque volte le proteine.', [['greek_yogurt_0', 150], ['berries', 80], ['honey', 5]]),
    s('nice_cream', '🍌', 'Banana “nice cream”', 'Gelato di banana (nice cream)', 'A frozen banana blended until creamy: it tastes like ice cream, with no added sugar.', 'Una banana congelata frullata finché è cremosa: sa di gelato, senza zuccheri aggiunti.', [['banana', 150], ['dark_chocolate', 10]]),
    s('skyr_strawberries', '🍓', 'Skyr with strawberries', 'Skyr con fragole', 'Fresh and sweet, and it keeps you full until the next meal.', 'Fresco e dolce, e sazia fino al pasto dopo.', [['skyr', 150], ['strawberries', 150]]),
    s('ricotta_cream', '🥄', 'Ricotta cream with honey and dark chocolate', 'Crema di ricotta, miele e fondente', 'Ricotta whipped with a teaspoon of honey and a few flakes of dark chocolate.', 'Ricotta montata con un cucchiaino di miele e qualche scaglia di fondente.', [['ricotta', 100], ['honey', 5], ['dark_chocolate', 10]]),
    s('frozen_grapes', '🍇', 'Frozen grapes', 'Acini d’uva congelati', 'Eaten one by one, like a sorbet.', 'Si mangiano uno alla volta, come un sorbetto.', [['grapes', 150]]),
    s('fresh_fruit', '🍉', 'Watermelon or melon', 'Anguria o melone', 'Cold from the fridge: lots of water, few calories.', 'Freddi di frigo: tanta acqua e poche calorie.', [['watermelon', 300]]),
    s('kefir_smoothie', '🥤', 'Thick kefir and berry smoothie', 'Frullato denso di kefir e frutti di bosco', 'With frozen berries it comes out thick, like a soft-serve.', 'Con i frutti di bosco surgelati viene denso, come un gelato morbido.', [['kefir', 200], ['berries', 100]]),
    s('one_scoop', '🍦', 'If it must be ice cream: one scoop with fruit', 'Se dev’essere gelato: una pallina con frutta', 'Half the ice cream, with fresh fruit beside it.', 'Metà del gelato, con frutta fresca accanto.', [['ice_cream', 50], ['strawberries', 150]]),
  ],
  biscuits: [
    s('yogurt_oats', '🥣', 'Yogurt with oats and berries', 'Yogurt con avena e frutti di bosco', 'Crunchy like biscuits, with protein and fibre that keep you full.', 'Croccante come i biscotti, con proteine e fibre che saziano.', [['greek_yogurt_0', 150], ['oats', 30], ['berries', 80]]),
    s('bread_ricotta', '🍞', 'Wholegrain bread, ricotta and honey', 'Pane integrale, ricotta e miele', 'Sweet, but with protein: it lasts until lunch.', 'Dolce, ma con proteine: dura fino a pranzo.', [['bread_wholegrain', 40], ['ricotta', 50], ['honey', 5]]),
    s('bread_pb', '🥜', 'Wholegrain bread with peanut butter', 'Pane integrale con burro d’arachidi', 'Good fats and protein instead of sugar and refined flour.', 'Grassi buoni e proteine al posto di zucchero e farina raffinata.', [['bread_wholegrain', 40], ['peanut_butter', 15]]),
    s('porridge', '🥣', 'Oat porridge with milk and banana', 'Porridge d’avena con latte e banana', 'Warm and sweet from the banana alone.', 'Caldo e dolce solo grazie alla banana.', [['oats', 40], ['milk', 200], ['banana', 60]]),
    s('apple_almonds', '🍎', 'An apple and a few almonds', 'Una mela e qualche mandorla', 'Crunchy, sweet, and it takes a while to eat.', 'Croccante, dolce, e ci vuole un po’ a mangiarla.', [['apple', 180], ['almonds', 15]]),
    s('dates_walnuts', '🌰', 'Two dates and a few walnuts', 'Due datteri e qualche noce', 'Sweet like a biscuit, with fibre and good fats.', 'Dolci come un biscotto, con fibre e grassi buoni.', [['dates', 20], ['walnuts', 15]]),
    s('muesli_milk', '🥛', 'Muesli with milk', 'Muesli con latte', 'Choose one without added sugar: oats, nuts and dried fruit.', 'Scegline uno senza zuccheri aggiunti: avena, frutta secca e uvetta.', [['muesli', 40], ['milk', 150]]),
  ],
  pastries: [
    s('bread_ricotta_jam', '🍞', 'Wholegrain bread, ricotta and jam', 'Pane integrale, ricotta e marmellata', 'The sweet breakfast, with protein that keeps you going.', 'La colazione dolce, con proteine che tengono fino a pranzo.', [['bread_wholegrain', 50], ['ricotta', 50], ['jam', 15]]),
    s('yogurt_oats_banana', '🥣', 'Greek yogurt, oats and banana', 'Yogurt greco, avena e banana', 'As many calories as a croissant, three times as filling.', 'Le calorie di un cornetto, ma sazia il triplo.', [['greek_yogurt_0', 150], ['oats', 30], ['banana', 60]]),
    s('porridge', '🥣', 'Oat porridge with milk and banana', 'Porridge d’avena con latte e banana', 'Warm and sweet from the banana alone.', 'Caldo e dolce solo grazie alla banana.', [['oats', 40], ['milk', 200], ['banana', 60]]),
    s('toast_egg', '🍳', 'Wholegrain toast and an egg', 'Pane integrale tostato e un uovo', 'A savoury breakfast: no mid-morning hunger.', 'Una colazione salata: niente fame a metà mattina.', [['bread_wholegrain', 50], ['egg', 55]]),
    s('cappuccino_bread', '☕', 'Cappuccino with bread and jam', 'Cappuccino e pane con marmellata', 'The bar breakfast, without the butter of a croissant.', 'La colazione al bar, senza il burro del cornetto.', [['cappuccino', 150], ['bread_wholegrain', 40], ['jam', 15]]),
    s('banana_walnuts', '🍌', 'A banana and a few walnuts', 'Una banana e qualche noce', 'Ready in a second, also on the go.', 'Pronta in un attimo, anche fuori casa.', [['banana', 120], ['walnuts', 15]]),
  ],
  chocolate: [
    s('dark_strawberries', '🍫', 'Two squares of dark chocolate with strawberries', 'Due quadretti di fondente con fragole', 'Dark chocolate 70% has more cocoa and much less sugar.', 'Il fondente 70% ha più cacao e molto meno zucchero.', [['dark_chocolate', 15], ['strawberries', 100]]),
    s('bread_pb', '🥜', 'Wholegrain bread with peanut butter', 'Pane integrale con burro d’arachidi', 'Instead of the hazelnut spread: protein and good fats, little sugar.', 'Al posto della crema alla nocciola: proteine e grassi buoni, poco zucchero.', [['bread_wholegrain', 40], ['peanut_butter', 15]]),
    s('ricotta_chocolate', '🥄', 'Ricotta cream with dark chocolate', 'Crema di ricotta e fondente', 'Creamy and chocolatey, with protein.', 'Cremosa e al cioccolato, con proteine.', [['ricotta', 80], ['dark_chocolate', 10], ['honey', 5]]),
    s('banana_pb', '🍌', 'Banana with peanut butter', 'Banana con burro d’arachidi', 'Sweet and filling.', 'Dolce e sazia.', [['banana', 120], ['peanut_butter', 15]]),
    s('yogurt_chocolate', '🥣', 'Greek yogurt with dark chocolate flakes', 'Yogurt greco con scaglie di fondente', 'A spoonful of chocolate on a pot of protein.', 'Un po’ di cioccolato su un vasetto di proteine.', [['greek_yogurt_0', 150], ['dark_chocolate', 10]]),
    s('dates_almonds', '🌰', 'Dates and almonds', 'Datteri e mandorle', 'Sweet like a chocolate bar, with fibre.', 'Dolci come una barretta, con fibre.', [['dates', 20], ['almonds', 15]]),
  ],
  sweets: [
    s('grapes', '🍇', 'A bunch of grapes', 'Un grappolo d’uva', 'One at a time, like sweets.', 'Un acino alla volta, come le caramelle.', [['grapes', 150]]),
    s('raisins_almonds', '🌰', 'Raisins and almonds', 'Uvetta e mandorle', 'Sweet and chewy, with fibre and good fats.', 'Dolce e gommosa, con fibre e grassi buoni.', [['raisins', 20], ['almonds', 10]]),
    s('strawberries', '🍓', 'Strawberries', 'Fragole', 'A whole bowl for the calories of a few sweets.', 'Una ciotola intera per le calorie di poche caramelle.', [['strawberries', 150]]),
    s('dark_square', '🍫', 'A square of dark chocolate', 'Un quadretto di fondente', 'Enough for the craving.', 'Basta per la voglia di dolce.', [['dark_chocolate', 10]]),
    s('dates', '🌴', 'Two dates', 'Due datteri', 'Natural sweetness, with fibre.', 'Dolcezza naturale, con fibre.', [['dates', 20]]),
    s('fruit_salad', '🍑', 'Fresh fruit salad', 'Macedonia fresca', 'Many colours, vitamins and water.', 'Tanti colori, vitamine e acqua.', [['fruit_salad', 200]]),
  ],
  salty_snacks: [
    s('almonds', '🌰', 'Unsalted almonds', 'Mandorle non salate', 'Crunchy and filling: a handful is enough.', 'Croccanti e sazianti: ne basta una manciata.', [['almonds', 20]]),
    s('carrots_hummus', '🥕', 'Carrot sticks with hummus', 'Carote con hummus', 'Crunchy and savoury, with fibre and protein.', 'Croccanti e saporite, con fibre e proteine.', [['carrots', 100], ['hummus', 40]]),
    s('home_popcorn', '🍿', 'Home-made popcorn', 'Popcorn fatti in casa', 'With little oil and salt: a big bowl for few calories.', 'Con poco olio e poco sale: una ciotola grande per poche calorie.', [['popcorn', 20]]),
    s('tomatoes_mozzarella', '🍅', 'Cherry tomatoes and mozzarella bites', 'Pomodorini e bocconcini di mozzarella', 'Fresh and savoury, with protein.', 'Freschi e saporiti, con proteine.', [['tomatoes', 150], ['mozzarella', 50]]),
    s('pistachios', '🥜', 'Pistachios in their shells', 'Pistacchi con il guscio', 'Opening them slows you down.', 'Sgusciarli rallenta: se ne mangiano meno.', [['pistachios', 20]]),
    s('roasted_chickpeas', '🫘', 'Crunchy roasted chickpeas', 'Ceci croccanti al forno', 'Chickpeas baked with spices: protein and fibre.', 'Ceci passati in forno con le spezie: proteine e fibre.', [['chickpeas', 60]]),
    s('edamame', '🫛', 'Edamame', 'Edamame', 'A savoury snack full of protein.', 'Uno snack salato pieno di proteine.', [['edamame', 80]]),
  ],
  sugary_drinks: [
    s('sparkling_lemon', '🍋', 'Sparkling water with lemon', 'Acqua frizzante con limone', 'The bubbles, without the sugar.', 'Le bollicine, senza lo zucchero.', [['lemon_juice', 10]]),
    s('iced_tea', '🧊', 'Home-made iced tea, unsweetened', 'Tè freddo fatto in casa, senza zucchero', 'With lemon or mint: almost no calories.', 'Con limone o menta: quasi zero calorie.', [['tea', 300]]),
    s('orange', '🍊', 'An orange instead of juice', 'Un’arancia al posto del succo', 'The whole fruit keeps its fibre and fills you up.', 'Il frutto intero ha la fibra e sazia.', [['orange', 200]]),
    s('yogurt_smoothie', '🥤', 'Home-made yogurt and fruit smoothie', 'Frullato di yogurt e frutta fatto in casa', 'Sweet from the fruit, with protein.', 'Dolce grazie alla frutta, con proteine.', [['yogurt', 125], ['berries', 100]]),
    s('kefir', '🥛', 'A glass of kefir', 'Un bicchiere di kefir', 'Fresh and slightly fizzy, with protein.', 'Fresco e un po’ frizzante, con proteine.', [['kefir', 200]]),
    s('diet_soda', '🥫', 'If it must be a soft drink: the zero one', 'Se dev’essere una bibita: quella zero', 'Same taste, without the seven teaspoons of sugar.', 'Lo stesso gusto, senza i sette cucchiaini di zucchero.', [['diet_soda', 330]]),
  ],
  processed_meat: [
    s('chicken', '🍗', 'Grilled chicken breast', 'Petto di pollo alla griglia', 'More protein, far less salt and fat.', 'Più proteine, molto meno sale e grassi.', [['chicken_breast', 100]]),
    s('turkey_roast', '🦃', 'Home-roasted turkey, sliced', 'Fesa di tacchino al forno, a fette', 'Cooked at home and sliced: the sandwich filling, without additives.', 'Cotta in casa e affettata: il ripieno del panino, senza additivi.', [['turkey_breast', 100]]),
    s('tuna', '🐟', 'Tuna in water', 'Tonno al naturale', 'Ready in a second, lean and full of protein.', 'Pronto in un attimo, magro e pieno di proteine.', [['tuna_water', 80]]),
    s('eggs', '🥚', 'Two eggs', 'Due uova', 'Boiled or in an omelette: cheap and filling.', 'Sode o in frittata: costano poco e saziano.', [['egg', 110]]),
    s('mozzarella', '🧀', 'Mozzarella', 'Mozzarella', 'In the sandwich instead of salami.', 'Nel panino al posto del salame.', [['mozzarella', 80]]),
    s('hummus', '🫘', 'Chickpea hummus', 'Hummus di ceci', 'Spread on bread: protein and fibre.', 'Da spalmare sul pane: proteine e fibre.', [['hummus', 60]]),
    s('salmon', '🍣', 'Salmon', 'Salmone', 'Protein and the good fats of fish.', 'Proteine e i grassi buoni del pesce.', [['salmon', 100]]),
  ],
  fast_food: [
    s('home_burger', '🍔', 'Home-made burger with wholegrain bread and salad', 'Hamburger fatto in casa con pane integrale e insalata', 'The same pleasure, with less fat and salt.', 'Lo stesso piacere, con meno grassi e sale.', [['beef_burger', 100], ['bread_wholegrain', 60], ['salad', 30], ['tomatoes', 50]]),
    s('chicken_potatoes', '🍗', 'Chicken and oven-roasted potatoes', 'Pollo e patate al forno', 'Crisp potatoes from the oven instead of the fryer.', 'Patate croccanti dal forno invece che dalla friggitrice.', [['chicken_breast', 120], ['roast_potatoes', 150]]),
    s('piadina_chicken', '🌯', 'Flatbread with chicken and vegetables', 'Piadina con pollo e verdure', 'Like a kebab, made at home.', 'Come un kebab, fatto in casa.', [['piadina', 80], ['chicken_breast', 100], ['salad', 30], ['tomatoes', 50]]),
    s('fish_potatoes', '🐟', 'Baked fish with potatoes', 'Pesce al forno con patate', 'Instead of fish fingers: real fish, little oil.', 'Al posto dei bastoncini: pesce vero, poco olio.', [['white_fish', 150], ['potatoes', 150], ['olive_oil', 5]]),
    s('roast_potatoes', '🥔', 'Oven potatoes instead of fries', 'Patate al forno invece delle patatine fritte', 'Half the fat, just as crisp.', 'Metà dei grassi, croccanti uguale.', [['roast_potatoes', 200]]),
  ],
  cereals: [
    s('porridge', '🥣', 'Oat porridge with milk and banana', 'Porridge d’avena con latte e banana', 'Oats fill you up far longer than corn flakes.', 'L’avena sazia molto più a lungo dei corn flakes.', [['oats', 40], ['milk', 200], ['banana', 60]]),
    s('yogurt_oats', '🥣', 'Yogurt with oats and berries', 'Yogurt con avena e frutti di bosco', 'Crunchy, with protein and fibre.', 'Croccante, con proteine e fibre.', [['greek_yogurt_0', 150], ['oats', 30], ['berries', 80]]),
    s('muesli_milk', '🥛', 'Muesli with milk', 'Muesli con latte', 'One without added sugar: oats, nuts and dried fruit.', 'Uno senza zuccheri aggiunti: avena, frutta secca e uvetta.', [['muesli', 40], ['milk', 150]]),
    s('bread_ricotta', '🍞', 'Wholegrain bread, ricotta and honey', 'Pane integrale, ricotta e miele', 'Sweet, but with protein.', 'Dolce, ma con proteine.', [['bread_wholegrain', 40], ['ricotta', 50], ['honey', 5]]),
    s('apple_almonds', '🍎', 'An apple and a few almonds', 'Una mela e qualche mandorla', 'Instead of a cereal bar: just as quick.', 'Al posto della barretta: veloce uguale.', [['apple', 180], ['almonds', 15]]),
    s('banana_walnuts', '🍌', 'A banana and a few walnuts', 'Una banana e qualche noce', 'Ready in a second, also on the go.', 'Pronta in un attimo, anche fuori casa.', [['banana', 120], ['walnuts', 15]]),
  ],
}

export interface SwapIdea {
  id: string
  emoji: string
  name: string
  note: string
  /** As it would be logged: the foods in their amounts. */
  items: FoodItem[]
  kcal: number
  protein_g: number
}

const byId = new Map(FOODS.map((f) => [f.id, f]))

/** The alternatives to a kind of processed food, with what each brings. */
export function swapsFor(kind: ProcessedKind, locale: Locale): SwapIdea[] {
  return SWAPS[kind].map((w) => {
    const items = w.items.flatMap(([id, g]) => {
      const f = byId.get(id)
      return f ? [{ name: f.name[locale], grams: g, ...foodAt(f, g) }] : []
    })
    return {
      id: w.id,
      emoji: w.emoji,
      name: w.name[locale],
      note: w.note[locale],
      items,
      kcal: items.reduce((t, i) => t + i.kcal, 0),
      protein_g: Math.round(items.reduce((t, i) => t + i.protein_g, 0)),
    }
  })
}

/** Every alternative names foods of the app's table (checked by the amounts check). */
export const SWAP_FOOD_IDS = Object.values(SWAPS).flatMap((list) => list.flatMap((w) => w.items.map(([id]) => id)))
