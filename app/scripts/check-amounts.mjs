// Checks that amounts typed or dictated come out as believable grams: "2 mandorle" is two almonds (2 g), not two
// handfuls (50 g). Run by CI (`npm run check-amounts`); add a line here when a food is counted in a new way.
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// [what is said, locale, the food it is, fewest grams, most grams]
const CASES = [
  ['2 mandorle', 'it', 'almonds', 2, 3],
  ['10 mandorle', 'it', 'almonds', 10, 15],
  ['una manciata di mandorle', 'it', 'almonds', 25, 25],
  ['100 mandorle', 'it', 'almonds', 100, 100],
  ['2 almonds', 'en', 'almonds', 2, 3],
  ['30 pistacchi', 'it', 'pistachios', 15, 25],
  ['3 noci', 'it', 'walnuts', 10, 15],
  ['5 nocciole', 'it', 'hazelnuts', 6, 8],
  ['4 fragole', 'it', 'strawberries', 40, 60],
  ['20 ciliegie', 'it', 'cherries', 140, 180],
  ['15 acini', 'it', 'grapes', 60, 90],
  ['5 pomodorini', 'it', 'cherry_tomatoes', 60, 90],
  ['2 pomodori', 'it', 'tomatoes', 200, 300],
  ['5 asparagi', 'it', 'asparagus', 60, 90],
  ['2 albumi', 'it', 'egg_white', 60, 70],
  ['6 gamberi', 'it', 'prawns', 50, 70],
  ['3 fette di prosciutto', 'it', 'prosciutto', 30, 45],
  ['2 fette di mozzarella', 'it', 'mozzarella', 40, 60],
  ['una mozzarella', 'it', 'mozzarella', 125, 125],
  ['2 uova', 'it', 'egg', 100, 120],
  ['3 biscotti', 'it', 'biscuits', 25, 35],
  ['2 fette di pane', 'it', 'bread', 90, 110],
  ['8 olive', 'it', 'olives', 25, 35],
  ['200 g di pollo', 'it', 'chicken_breast', 200, 200],
  ['2 tuorli di uovo', 'it', 'egg_yolk', 30, 40],
  ['2 uova strapazzate', 'it', 'egg', 100, 120],
  ['pane ai 5 cereali', 'it', 'bread_wholegrain', 50, 50],
  ['2 fette di pan bauletto ai cereali', 'it', 'sandwich_bread', 45, 55],
  ['1 pacchettino di cracker integrali', 'it', 'crackers', 25, 25],
  ['5 chicchi di uva', 'it', 'grapes', 20, 30],
]

// Whole sentences: [what is said, locale, [the food, fewest grams, most grams] for every food it should give]
const MEALS = [
  [
    '4 albumi e 2 tuorli di uovo a frittata con 150g di spinaci e 2 fette di pane ai 5 cereali',
    'it',
    [['egg_white', 120, 140], ['egg_yolk', 30, 40], ['spinach', 150, 150], ['bread_wholegrain', 90, 110]],
  ],
  ['frittata di 3 uova', 'it', [['egg', 160, 170]]],
]

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = await mkdtemp(join(tmpdir(), 'forza-amounts-'))
try {
  const entry = join(dir, 'entry.ts')
  await writeFile(entry, `export { parseMeal } from ${JSON.stringify(join(app, 'src/lib/voice.ts'))}\nexport { FOODS } from ${JSON.stringify(join(app, 'src/data/foods.ts'))}\n`)
  const out = join(dir, 'amounts.mjs')
  execFileSync(join(app, 'node_modules', '.bin', 'rolldown'), [entry, '--format', 'esm', '--file', out], { cwd: app, stdio: 'pipe' })
  const { parseMeal, FOODS } = await import(pathToFileURL(out).href)
  const wrong = []
  for (const [said, locale, id, min, max] of CASES) {
    const items = parseMeal(said, locale).items
    const got = items.map((i) => `${i.foodId} ${i.grams} g`).join(', ') || 'nothing'
    if (items.length !== 1 || items[0].foodId !== id || items[0].grams < min || items[0].grams > max) wrong.push(`"${said}": ${got}, expected ${id} ${min}–${max} g`)
  }
  for (const [said, locale, want] of MEALS) {
    const items = parseMeal(said, locale).items
    const got = items.map((i) => `${i.foodId} ${i.grams} g`).join(', ') || 'nothing'
    const right = items.length === want.length && want.every(([id, min, max]) => items.some((i) => i.foodId === id && i.grams >= min && i.grams <= max))
    if (!right) wrong.push(`"${said}": ${got}, expected ${want.map(([id, min, max]) => `${id} ${min}–${max} g`).join(', ')}`)
  }
  // A portion that is a handful, a bunch or a pack is not one piece: such a food needs the weight of one.
  for (const f of FOODS) if (/handful|bunch|pack/.test(f.unit?.en ?? '') && !f.piece) wrong.push(`${f.id}: its portion is ${f.unit.en}, so it needs a piece weight (PIECE in foods.ts)`)
  if (wrong.length) {
    console.error(`Amounts that come out wrong:\n- ${wrong.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`Amounts: ${CASES.length} phrases and ${MEALS.length} sentences read right`)
} finally {
  await rm(dir, { recursive: true, force: true })
}
