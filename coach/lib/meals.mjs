// Changing a person's food log from Forza! Coach: portions, foods, removing and adding meals.
import { readFile } from 'node:fs/promises'

const MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack'])
const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g']
// [field, name, most grams in one food, decimals]
const OPTIONAL = [
  ['salt_g', 'salt', 50, 2],
  ['satfat_g', 'saturated fat', 300, 1],
]

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

const bad = (message, status = 400) => Object.assign(new Error(message), { status })
const round1 = (n) => Math.round(n * 10) / 10

/** Meals logged by another app (through Health Connect, or Build With Science read on the phone) come back from there at the next sync. */
export const isSynced = (row) => row.source === 'health_connect' || (row.source === 'import' && Boolean(row.origin))

/** The foods of a meal, cleaned, with the meal's totals worked out from them. */
export function mealItems(items) {
  if (!Array.isArray(items) || !items.length) throw bad('Add at least one food')
  if (items.length > 40) throw bad('A meal can have up to 40 foods')
  const clean = items.map((i) => {
    const name = String(i?.name ?? '').trim().slice(0, 120)
    if (!name) throw bad('Every food needs a name')
    const item = { name, grams: Math.max(0, Math.round(Number(i.grams) || 0)) }
    for (const k of NUTRIENTS) {
      const v = Number(i[k] ?? 0)
      const max = k === 'kcal' ? 10000 : 1000
      if (!Number.isFinite(v) || v < 0 || v > max) throw bad(`${name}: ${k.replace('_g', '')} must be between 0 and ${max}`)
      item[k] = k === 'kcal' ? Math.round(v) : round1(v)
    }
    // Salt and saturated fat are optional: blank means not known.
    for (const [k, label, max, digits] of OPTIONAL) {
      const v = i[k] === '' || i[k] == null ? null : Number(i[k])
      if (v === null) continue
      if (!Number.isFinite(v) || v < 0 || v > max) throw bad(`${name}: ${label} must be between 0 and ${max} g`)
      item[k] = Math.round(v * 10 ** digits) / 10 ** digits
    }
    return item
  })
  const totals = Object.fromEntries(NUTRIENTS.map((k) => [k, round1(clean.reduce((s, i) => s + i[k], 0))]))
  const optional = Object.fromEntries(
    OPTIONAL.map(([k, , , digits]) => {
      const known = clean.filter((i) => i[k] != null)
      return [k, known.length ? Math.round(known.reduce((s, i) => s + i[k], 0) * 10 ** digits) / 10 ** digits : null]
    }),
  )
  return { items: clean, ...totals, ...optional }
}

function mealFields(body) {
  if (!MEALS.has(body.meal)) throw bad('Choose breakfast, lunch, dinner or snack')
  const at = new Date(body.eaten_at)
  if (Number.isNaN(at.getTime())) throw bad('When was it eaten?')
  const meal = mealItems(body.items)
  const title = String(body.title ?? '').trim().slice(0, 200) || meal.items.map((i) => i.name).join(', ').slice(0, 200)
  // No score: the app works it out from the new amounts, against the person's own target. The amounts written
  // here are what was eaten: all of it.
  return { meal: body.meal, eaten_at: at.toISOString(), title, ...meal, eaten_share: 1, score_fat_loss: null, score_muscle_gain: null }
}

async function editable(db, id) {
  const row = check(await db.from('food_logs').select('id, source, origin, photo_path').eq('id', id).maybeSingle())
  if (!row) throw bad('This meal is gone', 404)
  if (isSynced(row)) throw bad(`This meal comes from ${row.origin || 'Health Connect'}: change it there`, 409)
  return row
}

// The same name the app matches foods on: lower case, no accents, words only.
const nameKey = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(' ')

let table = null
/** The app's own food table: its ids, and its foods by name (English and Italian). */
async function builtIn() {
  table ??= readFile(new URL('../../shared/foods.json', import.meta.url), 'utf8').then((text) => {
    const foods = JSON.parse(text)
    return { ids: new Set(foods.map((f) => f.id)), byName: new Map(foods.flatMap((f) => [f.name.en, f.name.it].map((n) => [nameKey(n), f.id]))) }
  })
  return table
}

const UUID = /^[0-9a-f-]{36}$/

/**
 * The foods of a meal added here join the family's food database (values per 100 g) and count as used by the
 * person, as when they log in the app. A food of the app's own table (picked from it, or with its name) and one
 * picked from the family's foods are counted, not copied. A failure only means they are not remembered this time.
 */
async function remember(db, userId, items, origins = []) {
  const { ids, byName } = await builtIn().catch(() => ({ ids: new Set(), byName: new Map() }))
  const foods = items
    .map((i, n) => {
      const key = nameKey(i.name)
      const o = origins[n] ?? {}
      const builtin = ids.has(o.builtin) ? o.builtin : !UUID.test(o.food_id ?? '') ? byName.get(key) : null
      if (builtin) return { builtin, grams: i.grams }
      if (UUID.test(o.food_id ?? '')) return { id: o.food_id, grams: i.grams }
      if (!(i.grams > 0) || !key) return null
      const k = 100 / i.grams
      const per100 = Object.fromEntries(NUTRIENTS.map((n) => [n, round1(i[n] * k)]))
      const optional = Object.fromEntries(OPTIONAL.filter(([n]) => i[n] != null).map(([n]) => [n, Math.round(i[n] * k * 100) / 100]))
      return { name: i.name, name_key: key, ...per100, ...optional, portion_g: i.grams, source: 'manual', grams: i.grams }
    })
    .filter(Boolean)
  if (foods.length) await db.rpc('remember_foods_as', { p_user: userId, p_foods: foods }).then(() => {}, () => {})
}

export async function addMeal(db, userId, body) {
  const row = check(await db.from('food_logs').insert({ ...mealFields(body), user_id: userId, source: 'manual' }).select().single())
  // The foods keep their order when cleaned: where each came from is read from what was sent.
  await remember(db, userId, row.items ?? [], Array.isArray(body.items) ? body.items : [])
  return row
}

/**
 * Meals of one person copied into another's food log, at the same time and part of the day, as when the
 * person shares them in the app: one cooked, more ate. Meals from another app (Build With Science, Health
 * Connect) are copied too: the copy is the other person's own, to change or delete, and no sync touches it.
 */
export async function copyMeals(db, from, { to, ids }) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw bad('Choose from 1 to 50 meals')
  if (!to || to === from) throw bad('Choose someone else')
  const [rows, people] = await Promise.all([
    db.from('food_logs').select('id, eaten_at, meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g').eq('user_id', from).in('id', ids),
    db.from('profiles').select('id, display_name').in('id', [from, to]),
  ])
  const meals = check(rows)
  const names = new Map(check(people).map((p) => [p.id, p.display_name]))
  if (!names.has(to)) throw bad('That person is gone', 404)
  if (!meals.length) return { copied: 0 }
  // No score: the app works it out against the other person's own target. The person whose meal it was can
  // change the copy afterwards, as when they share it in the app.
  const copies = meals.map(({ id, ...m }) => ({ ...m, items: m.items ?? [], user_id: to, source: 'shared', origin: names.get(from) || 'family', shared_by: from, shared_from: id, score_fat_loss: null, score_muscle_gain: null }))
  check(await db.from('food_logs').insert(copies))
  return { copied: copies.length }
}

/**
 * What "Add a meal" offers besides the app's own table: the family's food database, and the meals the family
 * logged in the last six months ("Caffè con zucchero"), each once, the person's own and the most logged first.
 * Meals from another app are left out: they come back from there.
 */
export async function foodPicks(db, userId) {
  const since = new Date(Date.now() - 183 * 86400000).toISOString()
  const [foods, logs] = await Promise.all([
    db.from('foods').select('id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, portion_g, source').order('updated_at', { ascending: false }).limit(5000),
    db.from('food_logs').select(`user_id, title, items, source, origin, ${[...NUTRIENTS, ...OPTIONAL.map(([k]) => k)].join(', ')}`).gte('eaten_at', since).order('eaten_at', { ascending: false }).limit(5000),
  ])
  const meals = new Map()
  for (const r of check(logs)) {
    const key = nameKey(r.title ?? '')
    if (!key || isSynced(r)) continue
    const listed = Array.isArray(r.items) && r.items.length > 0
    // A meal of one food with the same name is that food: it is in the lists already.
    if (listed && r.items.length === 1 && nameKey(r.items[0].name ?? '') === key) continue
    // A meal logged with its totals only is one food with those totals.
    const items = listed ? r.items : [{ name: r.title, grams: 0, ...Object.fromEntries([...NUTRIENTS, ...OPTIONAL.map(([k]) => k)].map((k) => [k, r[k] == null ? null : Number(r[k])])) }]
    // The most recent one stands for the others.
    const m = meals.get(key) ?? { title: r.title, items, kcal: Number(r.kcal) || 0, uses: 0, mine: 0 }
    m.uses += 1
    if (r.user_id === userId) m.mine += 1
    meals.set(key, m)
  }
  return { foods: check(foods), meals: [...meals.values()].sort((a, b) => b.mine - a.mine || b.uses - a.uses).slice(0, 300) }
}

export async function updateMeal(db, id, body) {
  await editable(db, id)
  return check(await db.from('food_logs').update(mealFields(body)).eq('id', id).select().single())
}

export async function deleteMeal(db, id) {
  const row = await editable(db, id)
  check(await db.from('food_logs').delete().eq('id', id))
  // The photo goes too; a photo that cannot be removed only takes a little space.
  if (row.photo_path) await db.storage.from('food-photos').remove([row.photo_path]).catch(() => {})
  return { ok: true }
}
