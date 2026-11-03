// Changing a person's food log from Forza! Coach: portions, foods, removing and adding meals.

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
  // No score: the app works it out from the new amounts, against the person's own target.
  return { meal: body.meal, eaten_at: at.toISOString(), title, ...meal, score_fat_loss: null, score_muscle_gain: null }
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

/**
 * The foods of a meal added here join the family's food database (values per 100 g) and count as used by the
 * person, as when they log in the app. A failure only means they are not remembered this time.
 */
async function remember(db, userId, items) {
  const foods = items
    .filter((i) => i.grams > 0 && nameKey(i.name))
    .map((i) => {
      const k = 100 / i.grams
      const per100 = Object.fromEntries(NUTRIENTS.map((n) => [n, round1(i[n] * k)]))
      const optional = Object.fromEntries(OPTIONAL.filter(([n]) => i[n] != null).map(([n]) => [n, Math.round(i[n] * k * 100) / 100]))
      return { name: i.name, name_key: nameKey(i.name), ...per100, ...optional, portion_g: i.grams, source: 'manual', grams: i.grams }
    })
  if (foods.length) await db.rpc('remember_foods_as', { p_user: userId, p_foods: foods }).then(() => {}, () => {})
}

export async function addMeal(db, userId, body) {
  const row = check(await db.from('food_logs').insert({ ...mealFields(body), user_id: userId, source: 'manual' }).select().single())
  await remember(db, userId, row.items ?? [])
  return row
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
