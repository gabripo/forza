import type { L10n } from '../lib/types'

/**
 * Common foods, values per 100 g (approximate, from standard food composition tables such as
 * USDA FoodData Central and CREA). `portion` is a typical serving in grams.
 */
export interface Food {
  id: string
  name: L10n
  group: 'protein' | 'dairy' | 'legumes' | 'carbs' | 'fruit' | 'veg' | 'fats' | 'treats' | 'drinks'
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  portion: number
  /** Optional unit name for the portion, e.g. "1 egg". */
  unit?: L10n
}

type Row = [string, string, string, Food['group'], number, number, number, number, number, number, number, string?, string?]

const ROWS: Row[] = [
  // id, en, it, group, kcal, protein, carbs, fat, fiber, sugar, portion g, unit en, unit it
  ['chicken_breast', 'Chicken breast (cooked)', 'Petto di pollo (cotto)', 'protein', 165, 31, 0, 3.6, 0, 0, 120],
  ['turkey_breast', 'Turkey breast (cooked)', 'Fesa di tacchino (cotta)', 'protein', 135, 30, 0, 1, 0, 0, 120],
  ['lean_beef', 'Lean beef (cooked)', 'Manzo magro (cotto)', 'protein', 175, 27, 0, 7, 0, 0, 120],
  ['salmon', 'Salmon (cooked)', 'Salmone (cotto)', 'protein', 206, 22, 0, 12, 0, 0, 120],
  ['white_fish', 'White fish, cod/hake (cooked)', 'Pesce bianco, merluzzo (cotto)', 'protein', 105, 23, 0, 0.9, 0, 0, 150],
  ['tuna_water', 'Tuna in water (drained)', 'Tonno al naturale (sgocciolato)', 'protein', 116, 26, 0, 1, 0, 0, 80, '1 can', '1 scatoletta'],
  ['tuna_oil', 'Tuna in oil (drained)', "Tonno sott'olio (sgocciolato)", 'protein', 198, 29, 0, 8, 0, 0, 80, '1 can', '1 scatoletta'],
  ['egg', 'Egg', 'Uovo', 'protein', 143, 12.6, 0.7, 9.5, 0, 0.4, 55, '1 egg', '1 uovo'],
  ['egg_white', 'Egg whites', 'Albume', 'protein', 52, 11, 0.7, 0.2, 0, 0.7, 100],
  ['bresaola', 'Bresaola', 'Bresaola', 'protein', 151, 32, 0, 2.6, 0, 0, 50],
  ['prosciutto', 'Cured ham (prosciutto crudo)', 'Prosciutto crudo', 'protein', 224, 26, 0, 13, 0, 0, 50],
  ['cooked_ham', 'Cooked ham', 'Prosciutto cotto', 'protein', 132, 20, 1, 5, 0, 1, 50],
  ['tofu', 'Tofu', 'Tofu', 'protein', 144, 17, 3, 9, 2, 0.6, 100],
  ['whey', 'Whey protein powder', 'Proteine in polvere (whey)', 'protein', 390, 78, 8, 6, 0, 6, 30, '1 scoop', '1 misurino'],
  ['greek_yogurt_0', 'Greek yogurt 0%', 'Yogurt greco 0%', 'dairy', 59, 10, 3.6, 0.4, 0, 3.2, 170, '1 pot', '1 vasetto'],
  ['greek_yogurt', 'Greek yogurt (whole)', 'Yogurt greco intero', 'dairy', 97, 9, 4, 5, 0, 4, 170, '1 pot', '1 vasetto'],
  ['skyr', 'Skyr', 'Skyr', 'dairy', 63, 11, 4, 0.2, 0, 4, 150, '1 pot', '1 vasetto'],
  ['yogurt', 'Plain yogurt', 'Yogurt bianco', 'dairy', 61, 3.5, 4.7, 3.3, 0, 4.7, 125, '1 pot', '1 vasetto'],
  ['cottage', 'Cottage cheese', 'Fiocchi di latte', 'dairy', 98, 11, 3.4, 4.3, 0, 2.7, 150],
  ['ricotta', 'Ricotta', 'Ricotta', 'dairy', 146, 11, 3.5, 10, 0, 0.3, 100],
  ['mozzarella', 'Mozzarella', 'Mozzarella', 'dairy', 253, 18, 2, 19, 0, 1, 125, '1 ball', '1 mozzarella'],
  ['parmesan', 'Parmesan', 'Parmigiano', 'dairy', 392, 33, 0, 28, 0, 0, 10, '1 tbsp grated', '1 cucchiaio grattugiato'],
  ['milk', 'Semi-skimmed milk', 'Latte parzialmente scremato', 'dairy', 46, 3.4, 4.8, 1.6, 0, 4.8, 200, '1 glass', '1 bicchiere'],
  ['lentils', 'Lentils (cooked)', 'Lenticchie (cotte)', 'legumes', 116, 9, 20, 0.4, 7.9, 1.8, 150],
  ['chickpeas', 'Chickpeas (cooked)', 'Ceci (cotti)', 'legumes', 164, 8.9, 27, 2.6, 7.6, 4.8, 150],
  ['beans', 'Beans, borlotti/kidney (cooked)', 'Fagioli (cotti)', 'legumes', 127, 8.7, 22.8, 0.5, 6.4, 0.3, 150],
  ['peas', 'Peas', 'Piselli', 'legumes', 81, 5.4, 14, 0.4, 5.7, 5.7, 100],
  ['pasta_dry', 'Pasta (dry weight)', 'Pasta (peso a crudo)', 'carbs', 359, 12.5, 72, 1.5, 3, 3, 80],
  ['pasta_wholegrain_dry', 'Wholegrain pasta (dry)', 'Pasta integrale (a crudo)', 'carbs', 348, 13.4, 64, 2.5, 8, 3, 80],
  ['pasta_cooked', 'Pasta (cooked)', 'Pasta (cotta)', 'carbs', 158, 5.8, 31, 0.9, 1.8, 0.6, 200],
  ['rice_dry', 'Rice (dry weight)', 'Riso (peso a crudo)', 'carbs', 360, 7, 79, 0.6, 1.3, 0.1, 80],
  ['rice_cooked', 'Rice (cooked)', 'Riso (cotto)', 'carbs', 130, 2.7, 28, 0.3, 0.4, 0.1, 180],
  ['bread', 'White bread', 'Pane bianco', 'carbs', 265, 9, 49, 3.2, 2.7, 5, 50, '1 slice', '1 fetta'],
  ['bread_wholegrain', 'Wholegrain bread', 'Pane integrale', 'carbs', 247, 13, 41, 3.4, 7, 6, 50, '1 slice', '1 fetta'],
  ['oats', 'Oats', "Fiocchi d'avena", 'carbs', 389, 16.9, 66, 6.9, 10.6, 1, 40],
  ['potatoes', 'Potatoes (boiled)', 'Patate (lesse)', 'carbs', 87, 1.9, 20, 0.1, 1.8, 0.9, 200],
  ['quinoa', 'Quinoa (cooked)', 'Quinoa (cotta)', 'carbs', 120, 4.4, 21, 1.9, 2.8, 0.9, 150],
  ['rusks', 'Rusks (fette biscottate)', 'Fette biscottate', 'carbs', 410, 11, 75, 6, 3.5, 6, 20, '2 rusks', '2 fette'],
  ['banana', 'Banana', 'Banana', 'fruit', 89, 1.1, 23, 0.3, 2.6, 12, 120, '1 banana', '1 banana'],
  ['apple', 'Apple', 'Mela', 'fruit', 52, 0.3, 14, 0.2, 2.4, 10, 180, '1 apple', '1 mela'],
  ['orange', 'Orange', 'Arancia', 'fruit', 47, 0.9, 12, 0.1, 2.4, 9, 200, '1 orange', '1 arancia'],
  ['berries', 'Berries', 'Frutti di bosco', 'fruit', 50, 0.9, 12, 0.3, 3.5, 7, 125],
  ['kiwi', 'Kiwi', 'Kiwi', 'fruit', 61, 1.1, 15, 0.5, 3, 9, 75, '1 kiwi', '1 kiwi'],
  ['broccoli', 'Broccoli', 'Broccoli', 'veg', 34, 2.8, 7, 0.4, 2.6, 1.7, 200],
  ['salad', 'Salad greens', 'Insalata', 'veg', 15, 1.4, 2.9, 0.2, 1.3, 1, 80],
  ['tomatoes', 'Tomatoes', 'Pomodori', 'veg', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 150],
  ['zucchini', 'Courgette', 'Zucchine', 'veg', 17, 1.2, 3.1, 0.3, 1, 2.5, 200],
  ['carrots', 'Carrots', 'Carote', 'veg', 41, 0.9, 10, 0.2, 2.8, 4.7, 100],
  ['spinach', 'Spinach', 'Spinaci', 'veg', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 150],
  ['mixed_veg', 'Mixed vegetables', 'Verdure miste', 'veg', 40, 2, 7, 0.3, 3, 3, 200],
  ['olive_oil', 'Extra virgin olive oil', "Olio extravergine d'oliva", 'fats', 884, 0, 0, 100, 0, 0, 10, '1 tbsp', '1 cucchiaio'],
  ['avocado', 'Avocado', 'Avocado', 'fats', 160, 2, 8.5, 14.7, 6.7, 0.7, 70, '½ avocado', '½ avocado'],
  ['almonds', 'Almonds', 'Mandorle', 'fats', 579, 21, 22, 50, 12.5, 4.4, 25, 'a handful', 'una manciata'],
  ['walnuts', 'Walnuts', 'Noci', 'fats', 654, 15, 14, 65, 6.7, 2.6, 25, 'a handful', 'una manciata'],
  ['peanut_butter', 'Peanut butter', "Burro d'arachidi", 'fats', 588, 25, 20, 50, 6, 9, 15, '1 tbsp', '1 cucchiaio'],
  ['dark_chocolate', 'Dark chocolate 70%', 'Cioccolato fondente 70%', 'treats', 598, 7.8, 46, 43, 11, 24, 20, '2 squares', '2 quadretti'],
  ['biscuits', 'Biscuits', 'Biscotti frollini', 'treats', 480, 6.5, 68, 20, 2, 25, 30, '3 biscuits', '3 biscotti'],
  ['croissant', 'Croissant', 'Cornetto', 'treats', 410, 8, 46, 21, 2, 12, 60, '1 croissant', '1 cornetto'],
  ['pizza', 'Pizza margherita', 'Pizza margherita', 'treats', 250, 10.5, 33, 8.5, 2, 3.6, 300, '1 pizza (⅔)', '1 pizza (⅔)'],
  ['ice_cream', 'Ice cream', 'Gelato', 'treats', 207, 3.5, 24, 11, 0.7, 21, 100],
  ['soda', 'Sugary soft drink', 'Bibita zuccherata', 'drinks', 42, 0, 10.6, 0, 0, 10.6, 330, '1 can', '1 lattina'],
  ['juice', 'Fruit juice', 'Succo di frutta', 'drinks', 45, 0.5, 10.5, 0.1, 0.2, 9, 200, '1 glass', '1 bicchiere'],
  ['wine', 'Wine (per 100 ml)', 'Vino (per 100 ml)', 'drinks', 85, 0.1, 2.6, 0, 0, 0.6, 125, '1 glass', '1 bicchiere'],
  ['beer', 'Beer (per 100 ml)', 'Birra (per 100 ml)', 'drinks', 43, 0.5, 3.6, 0, 0, 0, 330, '1 bottle', '1 bottiglia'],
]

export const FOODS: Food[] = ROWS.map(([id, en, it, group, kcal, protein, carbs, fat, fiber, sugar, portion, uen, uit]) => ({
  id,
  name: { en, it },
  group,
  kcal,
  protein,
  carbs,
  fat,
  fiber,
  sugar,
  portion,
  unit: uen ? { en: uen, it: uit ?? uen } : undefined,
}))

export function foodAt(food: Food, grams: number) {
  const k = grams / 100
  const r = (n: number) => Math.round(n * k * 10) / 10
  return { kcal: Math.round(food.kcal * k), protein_g: r(food.protein), carbs_g: r(food.carbs), fat_g: r(food.fat), fiber_g: r(food.fiber), sugar_g: r(food.sugar) }
}
