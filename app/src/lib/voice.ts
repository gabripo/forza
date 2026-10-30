import { FOODS, foodAt, type Food } from '../data/foods'
import type { FoodItem, Locale } from './types'

/**
 * Turns a dictated sentence ("due uova, 80 grammi di pasta e un cucchiaio d'olio") into food items,
 * using the built-in food table: no AI, no network, instant. Whatever it does not recognise is
 * returned as `unknown`, so the caller can ask the food AI about just those words.
 */

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/['’`]/g, ' ')
/** Singular and plural meet: "patate"/"patata" → "patat", "eggs"/"egg" → "egg". */
const stem = (w: string) => (w.length < 4 ? w : w.replace(/s$/, '').replace(/[aeiouy]+$/, '') || w)
const words = (s: string) => plain(s).split(/[^a-z0-9]+/).filter(Boolean)

/** Everyday names people say, on top of each food's own name (which is always recognised too). */
const ALIASES: Record<string, string[]> = {
  chicken_breast: ['pollo', 'petto di pollo', 'pollo arrosto', 'pollo alla griglia', 'straccetti di pollo', 'chicken', 'chicken breast'],
  turkey_breast: ['tacchino', 'petto di tacchino', 'fesa', 'turkey'],
  lean_beef: ['manzo', 'carne', 'carne rossa', 'bistecca', 'tagliata', 'carpaccio', 'beef', 'steak', 'meat'],
  turkey_burger: ['hamburger di tacchino', 'burger di tacchino', 'turkey burger'],
  chicken_burger: ['hamburger di pollo', 'burger di pollo', 'chicken burger'],
  beef_burger: ['hamburger', 'burger', 'hamburger di manzo', 'hamburger di carne', 'svizzera', 'beef burger'],
  veggie_burger: ['burger vegetale', 'burger vegano', 'hamburger vegetale', 'hamburger vegano', 'veggie burger', 'vegan burger'],
  chicken_thigh: ['coscia di pollo', 'cosce di pollo', 'sovracoscia', 'chicken thigh'],
  pork_loin: ['maiale', 'lonza', 'arista', 'braciola', 'pork', 'pork chop'],
  sausage: ['salsiccia', 'salamella', 'sausage'],
  veal: ['vitello', 'scaloppina', 'veal'],
  frankfurter: ['wurstel', 'wurstel', 'hot dog', 'frankfurter'],
  deli_turkey: ['fesa di tacchino a fette', 'affettato di tacchino', 'petto di tacchino a fette'],
  salmon: ['salmone', 'salmon'],
  white_fish: ['pesce', 'merluzzo', 'nasello', 'platessa', 'sogliola', 'baccala', 'fish', 'cod', 'hake'],
  sea_bream: ['orata', 'branzino', 'spigola', 'sea bream', 'sea bass'],
  sardines: ['sardina', 'alice', 'acciuga', 'anchovy', 'sardine'],
  sardines_oil: ['sardine sott olio', 'sardine in scatola'],
  mackerel_oil: ['sgombro sott olio', 'sgombro in scatola'],
  tuna_water: ['tonno', 'tonno al naturale', 'tonno in scatola', 'tuna'],
  tuna_oil: ['tonno sott olio', 'tonno all olio', 'tuna in oil'],
  tuna_fresh: ['tonno fresco', 'trancio di tonno', 'tuna steak'],
  swordfish: ['pesce spada', 'swordfish'],
  prawns: ['gambero', 'gamberetto', 'mazzancolla', 'scampo', 'prawn', 'shrimp'],
  mussels: ['cozza', 'mussel'],
  clams: ['vongola', 'clam'],
  squid: ['calamaro', 'seppia', 'totano', 'squid', 'cuttlefish'],
  octopus: ['polpo', 'polipo', 'octopus'],
  egg: ['uovo', 'egg', 'uovo sodo', 'uovo all occhio di bue', 'boiled egg', 'fried egg'],
  egg_white: ['albume', 'chiara d uovo', 'egg white'],
  whey: ['proteine', 'proteine in polvere', 'shake proteico', 'frullato proteico', 'whey', 'protein shake'],
  protein_bar: ['barretta proteica', 'protein bar'],
  greek_yogurt_0: ['yogurt greco', 'greek yogurt'],
  greek_yogurt: ['yogurt greco intero'],
  yogurt: ['yogurt', 'yogurt bianco', 'yoghurt'],
  fruit_yogurt: ['yogurt alla frutta', 'yogurt alla fragola', 'yogurt ai frutti di bosco', 'fruit yogurt'],
  cottage: ['fiocchi di latte', 'cottage cheese', 'cottage'],
  parmesan: ['parmigiano', 'grana', 'grana padano', 'parmesan'],
  mozzarella: ['mozzarella', 'fior di latte', 'bocconcini'],
  scamorza: ['scamorza', 'provola', 'provolone'],
  emmental: ['emmental', 'groviera', 'fontina', 'asiago', 'formaggio', 'cheese'],
  stracchino: ['stracchino', 'crescenza', 'robiola'],
  cream_cheese: ['philadelphia', 'formaggio spalmabile', 'formaggino', 'cream cheese'],
  milk: ['latte', 'latte parzialmente scremato', 'milk'],
  whole_milk: ['latte intero', 'whole milk'],
  skim_milk: ['latte scremato', 'skimmed milk', 'skim milk'],
  soy_drink: ['latte di soia', 'bevanda di soia', 'soy milk'],
  oat_drink: ['latte d avena', 'latte di avena', 'bevanda d avena', 'oat milk'],
  cream: ['panna', 'cream'],
  lentils: ['lenticchie', 'lentils'],
  chickpeas: ['ceci', 'chickpeas'],
  beans: ['fagioli', 'fagioli borlotti', 'fagioli cannellini', 'beans'],
  broad_beans: ['fave', 'broad beans'],
  peas: ['piselli', 'peas'],
  pasta_dry: ['pasta', 'spaghetti', 'penne', 'fusilli', 'maccheroni', 'rigatoni', 'linguine', 'tagliatelle', 'farfalle', 'bucatini', 'orecchiette', 'paccheri', 'tagliolini'],
  pasta_wholegrain_dry: ['pasta integrale', 'spaghetti integrali', 'penne integrali', 'wholegrain pasta', 'whole wheat pasta'],
  pasta_tomato: ['pasta al pomodoro', 'spaghetti al pomodoro', 'penne al pomodoro', 'pasta al sugo', 'spaghetti al sugo', 'pasta with tomato sauce'],
  pasta_ragu: ['pasta al ragu', 'tagliatelle al ragu', 'spaghetti al ragu', 'spaghetti alla bolognese', 'pasta alla bolognese', 'spaghetti bolognese'],
  pasta_pesto: ['pasta al pesto', 'trofie al pesto', 'pasta with pesto'],
  carbonara: ['carbonara', 'pasta alla carbonara', 'spaghetti alla carbonara'],
  pasta_clams: ['spaghetti alle vongole', 'pasta alle vongole', 'linguine alle vongole'],
  pasta_beans: ['pasta e fagioli', 'pasta fagioli'],
  pasta_chickpeas_dish: ['pasta e ceci', 'pasta ceci'],
  lasagne: ['lasagna', 'lasagne', 'lasagne al forno'],
  rice_dry: ['riso', 'rice'],
  risotto: ['risotto'],
  brown_rice: ['riso integrale', 'brown rice'],
  gnocchi: ['gnocchi', 'gnocchi di patate'],
  tortellini: ['tortellini', 'cappelletti', 'agnolotti'],
  ravioli: ['ravioli'],
  couscous: ['cous cous', 'couscous'],
  spelt: ['farro', 'spelt'],
  barley: ['orzo', 'barley'],
  bread: ['pane', 'panino', 'rosetta', 'bread', 'roll'],
  bread_wholegrain: ['pane integrale', 'pane di segale', 'wholegrain bread', 'whole wheat bread', 'rye bread'],
  sandwich_bread: ['pancarre', 'pan bauletto', 'pane in cassetta', 'sandwich bread'],
  oats: ['avena', 'fiocchi d avena', 'porridge', 'oats', 'oatmeal'],
  cornflakes: ['cereali', 'corn flakes', 'cornflakes', 'cereal'],
  potatoes: ['patata', 'patate lesse', 'potato'],
  roast_potatoes: ['patate al forno', 'patate arrosto', 'roast potatoes'],
  mashed_potatoes: ['pure', 'pure di patate', 'mashed potatoes'],
  fries: ['patatine fritte', 'patate fritte', 'french fries', 'fries', 'chips'],
  crisps: ['patatine', 'patatine in busta', 'crisps'],
  rusks: ['fette biscottate', 'rusk'],
  rice_cakes: ['gallette', 'gallette di riso', 'gallette di mais', 'rice cakes'],
  breadsticks: ['grissini', 'taralli', 'breadsticks'],
  minestrone: ['minestrone', 'minestra', 'zuppa di verdure', 'vegetable soup'],
  veg_cream_soup: ['vellutata', 'passato di verdure', 'crema di verdure', 'cream soup'],
  parmigiana: ['parmigiana', 'parmigiana di melanzane'],
  frittata: ['frittata', 'omelette', 'omelet', 'uova strapazzate', 'scrambled eggs'],
  caprese: ['caprese', 'insalata caprese'],
  meatballs: ['polpette', 'polpettine', 'meatballs'],
  chicken_cutlet: ['cotoletta', 'cotoletta di pollo', 'cotoletta alla milanese', 'milanese', 'schnitzel', 'chicken nuggets', 'nuggets'],
  fish_fingers: ['bastoncini', 'bastoncini di pesce', 'fish fingers', 'fish sticks'],
  fried_squid: ['calamari fritti', 'fritto misto', 'frittura di pesce', 'fried squid'],
  grilled_veg: ['verdure grigliate', 'verdure alla griglia', 'grilled vegetables'],
  pizza: ['pizza', 'pizza margherita', 'pizza intera'],
  pizza_slice: ['pizza al taglio', 'trancio di pizza', 'fetta di pizza', 'pizzetta', 'slice of pizza'],
  focaccia: ['focaccia', 'schiacciata'],
  piadina: ['piadina', 'piada', 'wrap', 'tortilla'],
  toast_ham_cheese: ['toast', 'toast prosciutto e formaggio', 'toast al prosciutto', 'ham and cheese toastie'],
  tramezzino: ['tramezzino', 'sandwich'],
  burger_sandwich: ['panino con hamburger', 'panino con l hamburger', 'cheeseburger', 'big mac'],
  arancino: ['arancino', 'arancina', 'suppli'],
  tomato_sauce: ['sugo', 'sugo di pomodoro', 'passata', 'passata di pomodoro', 'salsa di pomodoro', 'tomato sauce'],
  ragu: ['ragu', 'sugo di carne', 'bolognese'],
  berries: ['frutti di bosco', 'mirtillo', 'lampone', 'mora', 'berry', 'blueberry', 'raspberry'],
  strawberries: ['fragola', 'strawberry'],
  apple: ['mela', 'apple'],
  pear: ['pera', 'pear'],
  peach: ['pesca', 'pesca noce', 'nettarina', 'peach', 'nectarine'],
  grapes: ['uva', 'acino', 'grape'],
  cherries: ['ciliegia', 'cherry'],
  watermelon: ['anguria', 'cocomero', 'watermelon'],
  mandarin: ['mandarino', 'clementina', 'mandarancio', 'tangerine', 'clementine'],
  plums: ['prugna', 'susina', 'plum'],
  figs: ['fico', 'fig'],
  persimmon: ['caco', 'cachi', 'kaki', 'persimmon'],
  dates: ['dattero', 'date'],
  raisins: ['uvetta', 'uva passa', 'raisin'],
  fruit_salad: ['macedonia', 'fruit salad'],
  salad: ['insalata', 'insalata verde', 'lattuga', 'insalata mista', 'salad', 'lettuce'],
  rocket: ['rucola', 'rocket', 'arugula'],
  tomatoes: ['pomodoro', 'pomodorini', 'pomodoro fresco', 'tomato', 'cherry tomatoes'],
  zucchini: ['zucchina', 'zucchine', 'courgette', 'zucchini'],
  carrots: ['carota', 'carrot'],
  spinach: ['spinaci', 'spinach'],
  aubergine: ['melanzana', 'aubergine', 'eggplant'],
  peppers: ['peperone', 'pepper', 'bell pepper'],
  cabbage: ['cavolo', 'verza', 'cavolo nero', 'cavolini di bruxelles', 'cabbage', 'kale'],
  greens_cooked: ['bietola', 'bieta', 'cicoria', 'cime di rapa', 'friarielli', 'scarola', 'chard', 'chicory'],
  green_beans: ['fagiolino', 'cornetti', 'green beans'],
  mushrooms: ['fungo', 'funghi', 'champignon', 'porcini', 'mushroom'],
  mixed_veg: ['verdura', 'verdure', 'verdure miste', 'contorno', 'contorno di verdure', 'verdure cotte', 'vegetables', 'veggies'],
  olive_oil: ['olio', 'olio d oliva', 'olio extravergine', 'olio di oliva', 'olio di semi', 'olive oil', 'oil'],
  butter: ['burro', 'noce di burro', 'butter'],
  almonds: ['mandorla', 'almond'],
  walnuts: ['noce', 'gheriglio', 'walnut', 'nuts'],
  hazelnuts: ['nocciola', 'hazelnut'],
  pistachios: ['pistacchio', 'pistachio'],
  peanuts: ['arachide', 'nocciolina', 'noccioline', 'peanut'],
  seeds: ['semi', 'semi di zucca', 'semi di girasole', 'semi di chia', 'semi di lino', 'seeds', 'chia'],
  peanut_butter: ['burro d arachidi', 'burro di arachidi', 'peanut butter'],
  dark_chocolate: ['cioccolato', 'cioccolato fondente', 'cioccolata fondente', 'chocolate', 'dark chocolate'],
  milk_chocolate: ['cioccolato al latte', 'cioccolatino', 'cioccolatini', 'milk chocolate'],
  hazelnut_spread: ['nutella', 'crema spalmabile', 'crema alla nocciola', 'nutella spread'],
  biscuits: ['biscotto', 'frollino', 'biscuit', 'cookie'],
  wholegrain_biscuits: ['biscotti integrali', 'digestive'],
  croissant: ['cornetto', 'brioche', 'croissant'],
  jam_tart: ['crostata', 'crostatina', 'tart'],
  cake: ['torta', 'ciambellone', 'ciambella', 'plumcake', 'cake', 'muffin'],
  snack_cake: ['merendina', 'merendine', 'snack cake'],
  cereal_bar: ['barretta', 'barretta ai cereali', 'cereal bar'],
  ice_cream: ['gelato', 'cono', 'coppetta', 'ice cream'],
  pudding: ['budino', 'pudding'],
  sweets: ['caramella', 'caramelle', 'candy', 'sweets'],
  soda: ['bibita', 'coca cola', 'aranciata', 'fanta', 'sprite', 'chinotto', 'gassosa', 'soda', 'coke'],
  diet_soda: ['coca zero', 'coca cola zero', 'bibita zero', 'bibita light', 'diet coke', 'coke zero'],
  juice: ['succo', 'succo di frutta', 'spremuta', 'spremuta d arancia', 'juice', 'orange juice'],
  smoothie: ['frullato', 'smoothie', 'centrifuga', 'estratto'],
  wine: ['vino', 'vino rosso', 'vino bianco', 'calice di vino', 'wine'],
  prosecco: ['prosecco', 'spumante', 'champagne', 'bollicine'],
  spritz: ['spritz', 'aperol', 'aperitivo'],
  beer: ['birra', 'beer'],
  spirits: ['grappa', 'whisky', 'vodka', 'gin', 'rum', 'superalcolico', 'spirits'],
  liqueur: ['amaro', 'limoncello', 'liquore', 'digestivo', 'liqueur'],
  prosciutto: ['prosciutto', 'prosciutto crudo', 'crudo di parma', 'ham'],
  cooked_ham: ['prosciutto cotto', 'cooked ham'],
  salami: ['salame', 'salamino', 'salami'],
  mortadella: ['mortadella'],
  sugar: ['zucchero', 'sugar'],
  honey: ['miele', 'honey'],
  jam: ['marmellata', 'confettura', 'jam', 'marmalade'],
  espresso: ['caffe', 'caffe espresso', 'caffe macchiato', 'caffe amaro', 'espresso', 'coffee'],
  cappuccino: ['cappuccino', 'caffelatte', 'caffe latte', 'latte macchiato', 'flat white'],
  tea: ['te', 'the', 'tisana', 'camomilla', 'infuso', 'tea', 'herbal tea'],
  hot_chocolate: ['cioccolata calda', 'hot chocolate'],
}

/**
 * Dishes whose name contains a linking word ("pasta e fagioli"): protected before the sentence is split
 * at "e", "con" and "and", so they stay one dish.
 */
const LINKS = /\b(e|ed|con|and|with)\b/g
const JOINED: RegExp[] = [...Object.values(ALIASES).flat(), ...FOODS.flatMap((f) => [f.name.it, f.name.en].map((n) => n.replace(/\(.*?\)/g, '')))]
  .map((a) => plain(a).trim())
  .filter((a) => a.split(/\s+/).length > 2 && /\b(e|ed|con|and|with)\b/.test(a))
  .sort((a, b) => b.length - a.length)
  .map((a) => new RegExp(`\\b${a.replace(/[^a-z0-9]+/g, '\\s+')}\\b`, 'g'))

/**
 * Forms a food can take, followed by what it is made of: "hamburger di salmone", "polpette di tacchino".
 * When there is no dish for that pair, the second food counts, in the portion of the form.
 */
const FORMS = new Set(['beef_burger', 'meatballs', 'chicken_cutlet'])

/** Plated pasta and rice dishes: an amount in grams usually means the dry pasta or rice in the dish. */
const DRY_REF: Record<string, number> = { pasta_tomato: 80, pasta_ragu: 80, pasta_pesto: 80, carbonara: 80, pasta_clams: 80, risotto: 70 }

/** How a food is cooked or seasoned: no effect on which food it is, and no need to ask the AI. */
const DESCRIPTIONS = new Set(
  ('cotto cotta cotti cotte crudo cruda lesso lessa bollito bollita grigliato grigliata griglia arrosto forno vapore ' +
    'fresco fresca freschi fresche freddo fredda caldo calda tiepido integrale integrali magro magra light bianco bianca ' +
    'rosso rossa verde nero nera piccolo piccola grande medio media abbondante condito condita saltato saltata padella ' +
    'fritto fritta misto mista normale buono buona buonissimo sale pepe aceto balsamico limone spezie erbe aglio prezzemolo ' +
    'basilico origano rosmarino peperoncino basmati venere thai jasmine fatto fatta casa casalingo casalinga solito solita ' +
    'cooked raw boiled grilled roasted baked steamed fresh cold hot warm wholegrain wholemeal lean white red green black ' +
    'small big large medium homemade plain salt pepper vinegar lemon herbs garlic usual').split(' ').map((w) => stem(w)),
)
/** Words that link foods: each one starts a new food. */
const SPLIT = /[,;\n]|\.(?!\d)|\b(?:e|ed|con|poi|piu|anche|and|with|plus|then|also)\b/
/** Words that carry no meaning for the food or its amount. */
const FILLER = new Set(
  ('di del della dello dei degli delle d il lo la l i gli le o or ee ho mangiato bevuto preso a al alla allo ai agli alle in per da circa tipo sott ' +
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
  'scatoletta', 'scatolette', 'lattina', 'bottiglia', 'manciata', 'tazzina', 'tazzine', 'calice', 'calici', 'bicchierino', 'ciotolina', 'plate', 'plates', 'portion', 'portions', 'bowl',
  'cup', 'glass', 'glasses', 'pot', 'can', 'bottle', 'handful', 'serving', 'servings',
])
/** Units that count pieces. */
const PIECES = new Set(['fetta', 'fette', 'pezzo', 'pezzi', 'quadretto', 'quadretti', 'slice', 'slices', 'piece', 'pieces', 'square', 'squares'])


interface Alias {
  food: Food
  stems: string[]
  /** The name's words as written, for the search box. */
  words: string[]
}

const INDEX: Alias[] = (() => {
  const out: Alias[] = []
  for (const food of FOODS) {
    // The food's own names, without notes in brackets or after a comma: "Pesce bianco, merluzzo (cotto)" → "pesce bianco".
    // "Orata / branzino" is two names.
    const own = [food.name.it, food.name.en].flatMap((n) => n.replace(/\(.*?\)/g, '').split(',')[0].split('/'))
    for (const name of [...own, ...(ALIASES[food.id] ?? [])]) {
      const ws = words(name).filter((w) => !FILLER.has(w))
      // Linking words inside a dish name ("pasta e fagioli") are protected in the sentence, and dropped here.
      const stems = (ws.length > 2 ? ws.filter((w) => !/^(e|ed|con|and|with)$/.test(w)) : ws).map(stem)
      if (stems.length) out.push({ food, stems, words: ws })
    }
  }
  // Longest names first, so "pasta integrale" wins over "pasta" and "prosciutto cotto" over "prosciutto".
  return out.sort((a, b) => b.stems.length - a.stems.length)
})()

/** A name as stored for matching: lower case, no accents, single spaces ("Mozzarella Bufala!" → "mozzarella bufala"). */
export const nameKey = (name: string) => words(name).join(' ')

/** The words that name a food, singular and plural alike: no filler, amounts or descriptions such as "cooked". */
export const nameStems = (name: string) => words(name).filter((w) => !FILLER.has(w) && !DESCRIPTIONS.has(stem(w)) && Number.isNaN(Number(w)) && !isUnit(w)).map(stem)

export interface VoiceResult {
  /** `said`: the words that named the food; `amountSaid`: whether an amount was said (else a typical portion). */
  items: (FoodItem & { foodId: string; said: string; amountSaid: boolean })[]
  /** Parts of the sentence that did not match a known food. */
  unknown: string[]
}

export function parseMeal(text: string, locale: Locale): VoiceResult {
  const items: VoiceResult['items'] = []
  const unknown: string[] = []
  // Numbers stuck to units ("80g") become two words; decimal commas stay inside the number.
  let prepared = plain(text).replace(/(\d)([a-z])/g, '$1 $2').replace(/(\d),(\d)/g, '$1.$2')
  // Dishes such as "pasta e fagioli" stay whole: their linking word does not split the sentence.
  for (const dish of JOINED) prepared = prepared.replace(dish, (m) => m.replace(LINKS, 'ee'))
  for (const part of prepared.split(SPLIT)) {
    // Filler words go first, so "frutti di bosco" meets the food name "frutti bosco".
    const ws = (part ?? '').split(/[^a-z0-9.]+/).filter((w) => w && !FILLER.has(w))
    if (!ws.length) continue
    const stems = ws.map(stem)
    // Every food named in this part, left to right, the longest name at each place.
    const hits: { food: Food; start: number; end: number; portion?: number }[] = []
    for (let i = 0; i < ws.length; ) {
      const a = INDEX.find((x) => x.stems.every((st, k) => stems[i + k] === st))
      if (a) {
        hits.push({ food: a.food, start: i, end: i + a.stems.length })
        i += a.stems.length
      } else i++
    }
    // "Hamburger di salmone", "polpette di tacchino": the form and what it is made of are one food.
    for (let k = 0; k < hits.length - 1; k++) {
      const [form, made] = [hits[k], hits[k + 1]]
      if (FORMS.has(form.food.id) && made.start === form.end && (made.food.group === 'protein' || made.food.group === 'legumes')) {
        hits.splice(k, 2, { food: made.food, start: form.start, end: made.end, portion: form.food.portion })
      }
    }
    // Words that are neither food, amount nor description ("lasagne" when it is not in the table): the AI gets them.
    const leftover = ws.filter((w, i) => !hits.some((h) => i >= h.start && i < h.end) && meaningful(w) && !DESCRIPTIONS.has(stem(w)))
    if (!hits.length) {
      if (leftover.length) unknown.push(part.trim())
      continue
    }
    if (leftover.length) unknown.push(leftover.join(' '))
    hits.forEach((h, k) => {
      // The amount is usually said before the food ("200 g di pollo"), sometimes after ("pollo, 200 grammi").
      const before = ws.slice(k ? hits[k - 1].end : 0, h.start)
      const after = ws.slice(h.end, hits[k + 1]?.start ?? ws.length)
      const portion = h.portion ?? h.food.portion
      const given = amount(before, h.food, portion) ?? amount(after, h.food, portion)
      const grams = Math.round(given ?? portion)
      items.push({ foodId: h.food.id, said: ws.slice(h.start, h.end).join(' '), amountSaid: given !== null, name: h.food.name[locale], grams, ...foodAt(h.food, grams) })
    })
  }
  return { items, unknown }
}

const meaningful = (w: string) => !FILLER.has(w) && !Object.hasOwn(NUMBERS, w) && Number.isNaN(Number(w)) && !isUnit(w)

const isUnit = (w: string) => GRAMS.has(w) || KILOS.has(w) || SPOONS.has(w) || TEASPOONS.has(w) || SERVINGS.has(w) || PIECES.has(w)

/** Grams for the amount said in a few words, or null when they say no amount. */
function amount(ws: string[], food: Food, portion = food.portion): number | null {
  let n: number | null = null
  // Grams said for a plate of pasta are the dry pasta in it: "80 grammi di pasta al pomodoro" is a full plate.
  const asGrams = (g: number) => (DRY_REF[food.id] && g <= 150 ? (g * food.portion) / DRY_REF[food.id] : g)
  for (const w of ws) {
    const value = Number(w)
    if (!Number.isNaN(value) && value > 0) n = value
    // "un chilo e mezzo", "due e mezzo": a half adds to the number before it.
    else if (Object.hasOwn(NUMBERS, w)) n = n !== null && NUMBERS[w] === 0.5 ? n + 0.5 : NUMBERS[w]
    else if (GRAMS.has(w)) return n === null ? portion : asGrams(n)
    else if (KILOS.has(w)) return (n ?? 1) * 1000
    else if (SPOONS.has(w)) return (n ?? 1) * (/tbsp|tablespoon/.test(food.unit?.en ?? '') ? food.portion : 15)
    else if (TEASPOONS.has(w)) return (n ?? 1) * (/teaspoon/.test(food.unit?.en ?? '') ? food.portion : 5)
    else if (SERVINGS.has(w)) return (n ?? 1) * portion
    else if (PIECES.has(w)) return (n ?? 1) * pieceGrams(food, portion)
  }
  if (n === null) return null
  // A bare number: grams when large ("200 pollo"), pieces or portions when small ("2 uova", "una pizza").
  return n >= 20 ? asGrams(n) : n * pieceGrams(food, portion)
}

/** One piece: an egg, a slice, a biscuit. Units such as "3 biscuits" share the portion between the pieces. */
function pieceGrams(food: Food, portion = food.portion): number {
  const unit = food.unit?.en ?? ''
  const count = unit.startsWith('½') ? 0.5 : Number(/^(\d+)/.exec(unit)?.[1] ?? 1)
  return portion / count
}

/**
 * The search box of "Add by hand": every word typed must start a word of the food's name or of one of
 * its everyday names, so "hamb tacch" finds the turkey burger. Exact names first, then shorter ones.
 */
export function searchFoods(query: string, limit = 40): Food[] {
  const qs = words(query).filter((w) => !FILLER.has(w) && !/^(e|ed|con|and|with)$/.test(w))
  if (!qs.length) return []
  const best = new Map<Food, number>()
  for (const a of INDEX) {
    const hit = (q: string) => a.words.some((w) => w.startsWith(q) || stem(w) === stem(q))
    if (!qs.every(hit)) continue
    const exact = a.words.length === qs.length && a.words.every((w, i) => stem(w) === stem(qs[i]))
    const score = (exact ? 100 : 50) - a.words.length
    if (score > (best.get(a.food) ?? -Infinity)) best.set(a.food, score)
  }
  return [...best.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit).map(([f]) => f)
}

/**
 * Joins the pieces that speech recognition returns. Chrome on Android often repeats what it already
 * said in each new piece ("due hamburger", then "due hamburger di tacchino"): a piece that starts with,
 * contains or overlaps the text so far extends it instead of being added again.
 */
export function mergeSpeech(sofar: string, piece: string): string {
  const a = sofar.trim()
  const b = piece.trim()
  if (!a) return b
  if (!b) return a
  const wa = words(a)
  const wb = words(b)
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((w, i) => w === y[i])
  // The new piece repeats everything and goes further: keep the new piece.
  if (wb.length >= wa.length && same(wb.slice(0, wa.length), wa)) return b
  // The new piece is already part of the text.
  for (let i = 0; i + wb.length <= wa.length; i++) if (same(wa.slice(i, i + wb.length), wb)) return a
  // The end of the text is the start of the piece: add only the rest.
  for (let k = Math.min(wa.length, wb.length) - 1; k > 0; k--) {
    if (same(wa.slice(-k), wb.slice(0, k))) return `${a} ${b.split(/\s+/).slice(k).join(' ')}`.trim()
  }
  return `${a} ${b}`
}

