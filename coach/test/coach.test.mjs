// Unit tests for Forza! Coach: `npm test` in the coach folder (Node's built-in test runner).
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseNodes, parsePower } from '../lib/adb.mjs'
import { convert, convertFood, effortToRir, parseValue, sessionDate, uuid5 } from '../lib/bws-convert.mjs'
import { BwsExtractor, cleanName, monthsSince } from '../lib/bws-extract.mjs'
import { regionForTimeZone } from '../lib/project.mjs'

test('session ids match the first import (re-importing never duplicates)', () => {
  assert.equal(uuid5('bws:Workout A:Feb 16'), '65a6632e-b6ec-5b3c-9213-82b8f85220b4')
})

test('set values', () => {
  assert.deepEqual(parseValue('20 kgs x 15'), { weight_kg: 20, reps: 15 })
  assert.deepEqual(parseValue('+12 kgs x 20'), { weight_kg: 12, reps: 20 })
  assert.deepEqual(parseValue('x 12'), { weight_kg: null, reps: 12 })
  assert.deepEqual(parseValue('45s'), { duration_s: 45 })
  assert.deepEqual(parseValue('1m 30s'), { duration_s: 90 })
  assert.deepEqual(parseValue('1:05'), { duration_s: 65 })
  assert.equal(parseValue('-'), null)
  assert.deepEqual(parseValue('45 lbs x 10'), { weight_kg: 20.5, reps: 10 })
  assert.throws(() => parseValue('banana'))
})

test('effort dot colours', () => {
  assert.equal(effortToRir([79, 155, 142]), 3) // green: easy
  assert.equal(effortToRir([240, 190, 40]), 2) // yellow: moderate
  assert.equal(effortToRir([235, 90, 60]), 1) // orange-red: hard
  assert.equal(effortToRir([246, 246, 248]), null) // no dot
})

test('dates without a year land in the last 12 months', () => {
  const now = new Date(2027, 1, 10)
  assert.equal(sessionDate('Feb 3', now).getFullYear(), 2027)
  assert.equal(sessionDate('Feb 20', now).getFullYear(), 2026)
  assert.equal(sessionDate('Oct 26', now).getFullYear(), 2026)
  assert.deepEqual(monthsSince(new Date(2026, 9, 26), new Date(2026, 11, 2)), ['Dec', 'Nov', 'Oct'])
  assert.equal(monthsSince(null, new Date(2026, 11, 2)).length, 12)
})

test('icons are stripped from exercise names', () => {
  assert.equal(cleanName('Barbell Back Squat \u{F0001}'), 'Barbell Back Squat')
})

test('conversion: warm-ups, plan days, unknown exercises', () => {
  const raw = {
    profile: { goal: 'Lose Fat', started: 'Started Oct 6, 2026 78 kgs at start', steps: 7000, program: 'Intermediate' },
    plan: {
      schedule: { thu: 'Workout A', sat: 'Rest' },
      workouts: [{ name: 'Workout A', exercises: [{ bws: 'Barbell Back Squat', sets: 6, reps: '6-10' }, { bws: 'Mystery Plank', sets: 3, reps: '30s' }] }],
    },
    sessions: [
      {
        name: 'Workout A ',
        date: 'Oct 23',
        duration_min: 60,
        exercises: [
          { name: 'Barbell Back Squat', sets: [{ value: '40 kgs x 8', effort_rgb: [79, 155, 142] }, { value: '80 kgs x 8', effort_rgb: [235, 90, 60] }, { value: '80 kgs x 7', effort_rgb: [235, 90, 60] }] },
          { name: 'Mystery Plank', sets: [{ value: '40s', effort_rgb: [246, 246, 248] }] },
        ],
      },
    ],
  }
  const out = convert(raw, [{ id: 'back_squat', kind: 'reps' }], { now: new Date(2026, 9, 29) })
  const [s] = out.sessions
  assert.equal(s.name, 'Workout A')
  assert.equal(s.sets[0].is_warmup, true)
  assert.equal(s.sets[0].rir, null)
  assert.equal(s.sets[1].rir, 1)
  assert.equal(s.sets[3].exercise_id, 'custom:mystery_plank')
  assert.deepEqual(out.custom_exercises.map((c) => [c.key, c.kind]), [['mystery_plank', 'time']])
  const [t] = out.templates
  assert.equal(t.weekday, 3)
  // BWS counts optional sets: the plan keeps what was really done recently (2 working sets).
  assert.equal(t.exercises[0].sets, 2)
  assert.equal(t.exercises[1].rep_min, 30)
  assert.deepEqual(out.profile, { goal: 'fat_loss', start_weight_kg: 78, steps_goal: 7000, workouts_per_week: 1, experience: 'intermediate' })
})

test('plan: workouts done this week use known history, timed targets, never empty', () => {
  const raw = {
    plan: {
      schedule: { sun: 'Workout C', wed: 'Core', thu: 'Ghost' },
      workouts: [
        { name: 'Workout C', exercises: null },
        { name: 'Core', exercises: [{ bws: 'Ground Sit', sets: 3, reps: 'Duration' }] },
        { name: 'Ghost', exercises: null },
      ],
    },
    sessions: [],
  }
  const knownSessions = [
    { id: 'a', name: 'Workout C', started_at: '2026-10-25T17:00:00Z', sets: [
      { exercise_id: 'hip_thrust', is_warmup: true, reps: 10 },
      { exercise_id: 'hip_thrust', is_warmup: false, reps: 12 },
      { exercise_id: 'hip_thrust', is_warmup: false, reps: 10 },
    ] },
  ]
  const out = convert(raw, [{ id: 'hip_thrust', kind: 'reps' }], { now: new Date(2026, 9, 29), knownSessions })
  assert.deepEqual(out.sessions, [])
  const c = out.templates.find((t) => t.name === 'Workout C')
  assert.equal(c.fromHistory, true)
  assert.deepEqual(c.exercises.map((e) => [e.exercise_id, e.sets, e.rep_min, e.rep_max]), [['hip_thrust', 2, 10, 12]])
  const core = out.templates.find((t) => t.name === 'Core')
  assert.deepEqual([core.exercises[0].rep_min, core.exercises[0].rep_max], [20, 45])
  assert.equal(out.custom_exercises[0].kind, 'time')
  assert.equal(out.templates.some((t) => t.name === 'Ghost'), false)
})

test('uiautomator dump parsing', () => {
  const xml = `<?xml version="1.0"?><hierarchy><node text="Workout A, Oct 26, ." content-desc="" clickable="true" bounds="[0,500][1080,600]" /><node text="" content-desc="Settings &amp; more" clickable="false" bounds="[10,10][110,60]" /><node text="" content-desc="" bounds="[0,0][1,1]" /></hierarchy>`
  assert.deepEqual(parseNodes(xml), [
    { x: 540, y: 550, top: 500, bottom: 600, label: 'Workout A, Oct 26, .', click: true },
    { x: 60, y: 35, top: 10, bottom: 60, label: 'Settings & more', click: false },
  ])
})

test('phone idle time from dumpsys power', () => {
  const text = `  mWakefulness=Awake\n  mLastWakeTime=184567155 (180841 ms ago)\n mLastUserActivityTime(excludingAttention)=184570850\n`
  assert.deepEqual(parsePower(text), { awake: true, idleMs: 177146 })
  assert.deepEqual(parsePower('  mWakefulness=Asleep\n'), { awake: false, idleMs: 0 })
})

test('server region from the time zone', () => {
  assert.equal(regionForTimeZone('Europe/Rome'), 'emea')
  assert.equal(regionForTimeZone('America/New_York'), 'americas')
  assert.equal(regionForTimeZone('Australia/Sydney'), 'apac')
})

// Linux only: elsewhere this would write to the real Keychain / Credential Manager.
test('keys fall back to a private file when no password store answers', { skip: platform() !== 'linux' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forza-coach-'))
  process.env.FORZA_COACH_HOME = dir
  const secrets = await import(`../lib/secrets.mjs?test=${Date.now()}`)
  try {
    await secrets.setSecret('forza-test', 'y')
    assert.equal(await secrets.getSecret('forza-test'), 'y')
    if (secrets.store === 'file') assert.match(await readFile(join(dir, 'secrets.json'), 'utf8'), /"forza-test": "y"/)
    await secrets.deleteSecret('forza-test')
    assert.equal(await secrets.getSecret('forza-test'), null)
  } finally {
    delete process.env.FORZA_COACH_HOME
    await rm(dir, { recursive: true, force: true })
  }
})

// The food log of one day as the phone's accessibility service saw it, screen by screen while scrolling
// (Build With Science 3.x, 1080×2400). The search bar floats over the bottom of the list.
const row = (y, top, bottom, label) => ({ x: 540, y, top, bottom, label, click: true })
const FOOD_SCREENS = [
  [
    row(1253, 1185, 1322, 'Breakfast, 513 Cal, 39 P, 72 C, 8 F'),
    row(1412, 1344, 1480, 'Espresso, 2 shot, 5 cal, 0g protein'),
    { x: 468, y: 1390, top: 1365, bottom: 1416, label: 'Espresso', click: false },
    { x: 468, y: 1437, top: 1416, bottom: 1459, label: '2 shot', click: false },
    row(1600, 1532, 1668, 'Authentic Greek Natural Yogurt 0% Fat, Milbona, 250 g, 124 cal, 21g protein'),
    row(1788, 1720, 1856, 'Oatmeal Whey Protein Choc Flavour, Prozis, 80 g, 294 cal, 17g protein'),
    row(1974, 1908, 2040, 'Kiwi, 1 serving, 90 cal, 2g protein'),
    row(2083, 2040, 2127, 'Lunch, 985 Cal, 93 P, 105 C, 25 F'),
    row(2125, 2062, 2188, '\u{f0349}, Search for a food'),
  ],
  [
    row(339, 273, 405, 'Breakfast, 513 Cal, 39 P, 72 C, 8 F'),
    row(495, 427, 563, 'Espresso, 2 shot, 5 cal, 0g protein'),
    row(683, 615, 751, 'Authentic Greek Natural Yogurt 0% Fat, Milbona, 250 g, 124 cal, 21g protein'),
    row(871, 803, 939, 'Oatmeal Whey Protein Choc Flavour, Prozis, 80 g, 294 cal, 17g protein'),
    row(1059, 991, 1127, 'Kiwi, 1 serving, 90 cal, 2g protein'),
    row(1278, 1210, 1347, 'Lunch, 985 Cal, 93 P, 105 C, 25 F'),
    row(1437, 1369, 1505, 'Uova allevate a terra, Le Contadine, 3 egg, 192 cal, 19g protein'),
    row(1625, 1557, 1693, 'High Protein White Cheese, Milbona, 3 slice, 127 cal, 19g protein'),
    row(1813, 1745, 1881, 'Cauliflower Raw, 300 g, 75 cal, 6g protein'),
    row(1987, 1934, 2040, "Albume D'uovo, Aia, 250 g, 118 cal, 28g protein"),
    row(2081, 2040, 2123, 'Mushrooms White Raw, 300 g, 66 cal, 9g protein'),
  ],
  [
    row(361, 293, 430, 'Lunch, 985 Cal, 93 P, 105 C, 25 F'),
    row(520, 452, 588, 'Uova allevate a terra, Le Contadine, 3 egg, 192 cal, 19g protein'),
    row(708, 640, 776, 'High Protein White Cheese, Milbona, 3 slice, 127 cal, 19g protein'),
    row(896, 828, 964, 'Cauliflower Raw, 300 g, 75 cal, 6g protein'),
    row(1085, 1017, 1153, "Albume D'uovo, Aia, 250 g, 118 cal, 28g protein"),
    row(1274, 1206, 1342, 'Mushrooms White Raw, 300 g, 66 cal, 9g protein'),
    row(1462, 1394, 1530, 'White Bread, 150 g, 399 cal, 13g protein'),
    row(1650, 1582, 1718, 'Olive Oil, 1 g, 9 cal, 0g protein'),
    row(1869, 1801, 1938, 'Dinner, 710 Cal, 63 P, 83 C, 17 F'),
    row(2000, 1960, 2040, 'Sweet Potato Raw, 300 g, 258 cal, 5g protein'),
  ],
  [
    row(357, 289, 425, 'Mushrooms White Raw, 300 g, 66 cal, 9g protein'),
    row(545, 477, 613, 'White Bread, 150 g, 399 cal, 13g protein'),
    row(733, 665, 801, 'Olive Oil, 1 g, 9 cal, 0g protein'),
    row(952, 884, 1021, 'Dinner, 710 Cal, 63 P, 83 C, 17 F'),
    row(1111, 1043, 1179, 'Sweet Potato Raw, 300 g, 258 cal, 5g protein'),
    row(1299, 1231, 1367, "Cuori Di Filetto Di Salmone Selvaggio Dell'Alaska, Conad, 2 serving, 202 cal, 42g protein"),
    row(1487, 1419, 1555, 'Olive Oil, 0.45 g, 4 cal, 0g protein'),
    row(1676, 1608, 1744, 'Zucchini Raw, 320 g, 54 cal, 4g protein'),
    row(1865, 1797, 1933, 'Tomatoes Red Raw, 60 g, 11 cal, 1g protein'),
    row(2013, 1986, 2040, 'Total 0% Fat Greek Yogurt, Fage, 100 g, 53 cal, 10g protein'),
  ],
  [
    row(375, 307, 443, "Cuori Di Filetto Di Salmone Selvaggio Dell'Alaska, Conad, 2 serving, 202 cal, 42g protein"),
    row(563, 495, 631, 'Olive Oil, 0.45 g, 4 cal, 0g protein'),
    row(752, 684, 820, 'Zucchini Raw, 320 g, 54 cal, 4g protein'),
    row(941, 873, 1009, 'Tomatoes Red Raw, 60 g, 11 cal, 1g protein'),
    row(1130, 1062, 1198, 'Total 0% Fat Greek Yogurt, Fage, 100 g, 53 cal, 10g protein'),
    row(1319, 1251, 1387, 'Avocados Raw, 80 g, 128 cal, 2g protein'),
    row(1538, 1470, 1607, 'Snacks, 3 Cal, 0 P, 0 C, 0 F'),
    row(1697, 1629, 1765, 'Espresso, 1 shot, 3 cal, 0g protein'),
    { x: 900, y: 1936, top: 1890, bottom: 1983, label: 'Explore more recipes', click: true },
  ],
]

function fakePhone(screens) {
  let i = 0
  return {
    width: 1080, height: 2400, density: 420, k: 1,
    cx: () => 540, left: (p) => p, right: (p) => p, top: (p) => p, bottom: (p) => p,
    dump: async () => screens[i],
    // Swiping down goes back to the top; swiping up shows the next screen.
    swipe: async (_x1, y1, _x2, y2) => {
      i = y2 > y1 ? 0 : Math.min(i + 1, screens.length - 1)
    },
    tap: async () => {},
    foreground: async () => ({ locked: false, focus: 'com.bws.appv2' }),
  }
}

test('food log: every meal and food of a day, each under its own meal while scrolling', async () => {
  const meals = await new BwsExtractor(fakePhone(FOOD_SCREENS)).readFoodDay()
  assert.deepEqual(meals.map((m) => [m.name, m.kcal, m.protein, m.carbs, m.fat, m.items.length]), [
    ['Breakfast', 513, 39, 72, 8, 4],
    ['Lunch', 985, 93, 105, 25, 7],
    ['Dinner', 710, 63, 83, 17, 7],
    ['Snacks', 3, 0, 0, 0, 1],
  ])
  assert.deepEqual(meals[0].items[0], { name: 'Espresso', detail: '2 shot', kcal: 5, protein: 0 })
  assert.equal(meals[1].items.at(-1).name, 'Olive Oil')
  assert.equal(meals[2].items[0].name, 'Sweet Potato Raw')

  const food = convertFood([{ date: 'Oct 29', meals }], new Date(2026, 9, 30, 9))
  assert.equal(food.length, 4)
  const lunch = food.find((f) => f.meal === 'lunch')
  assert.equal(lunch.day, '2026-10-29')
  assert.equal(new Date(lunch.eaten_at).getHours(), 13)
  assert.deepEqual([lunch.kcal, lunch.protein_g, lunch.carbs_g, lunch.fat_g, lunch.origin], [985, 93, 105, 25, 'Build With Science'])
  assert.deepEqual(lunch.items[0], { name: 'Uova allevate a terra (3 egg)', grams: 0, kcal: 192, protein_g: 19, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 })
  assert.equal(lunch.items[2].grams, 300)
  // Same day and meal → same id, so reading the day again replaces it.
  assert.equal(convertFood([{ date: 'Oct 29', meals }], new Date(2026, 9, 30, 9))[1].id, lunch.id)
})

