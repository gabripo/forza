// Receives steps and body weight from the Apple Shortcut (iPhone) or the
// Forza! Health Connect helper (Android). Authenticated with the person's sync key.
//
// Body (JSON), every field optional except the key:
//   token        sync key (or send it as the `x-forza-token` header)
//   source       "apple_health" | "health_connect"
//   unit         "kg" (default) | "lb"
//   steps        [{ date: "2026-10-27", steps: 8432 }]
//   weights      [{ at: "2026-10-27T07:12:00Z", kg: 72.4, fat_pct: 21.5 }]
//   steps_text   one "yyyy-MM-dd<sep>value" per line (easy to build in Shortcuts)
//   weights_text one "yyyy-MM-dd[THH:mm]<sep>value" per line
//   activities   [{ start: ISO, end: ISO, kind: "walking", title?: "Morning walk" }]
//   activities_text one "start ISO<sep>end ISO<sep>kind" per line (from the Shortcut)
//   meals        [{ day, meal, origin, at, items: [{ name, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g }] }]
//   meals_since  ISO start of the window the meals cover: synced meals in it that are no longer sent
//                were deleted in the food app, and are deleted here too
import { adminClient, corsHeaders, json, sha256Hex } from '../_shared/util.ts'

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const
const APP_NAMES: Record<string, string> = { 'com.bws.appv2': 'Build With Science', 'com.myfitnesspal.android': 'MyFitnessPal', 'com.fatsecret.android': 'FatSecret' }

/** A stable UUID from a text: the same meal always gets the same row. */
async function stableId(text: string): Promise<string> {
  const h = (await sha256Hex(text)).slice(0, 32).split('')
  h[12] = '5'
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

const nutrient = (v: unknown, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0
}

const MAX_ROWS = 400
const SOURCES = new Set(['apple_health', 'health_connect'])
const KINDS = ['walking', 'running', 'cycling', 'swimming', 'hiking', 'other']

/** Maps free-form workout names from Apple Health / Health Connect to our activity kinds. */
function activityKind(raw: unknown): string {
  const k = String(raw ?? '').toLowerCase()
  if (/walk|camminat/.test(k)) return 'walking'
  if (/run|jog|corsa/.test(k)) return 'running'
  if (/cycl|bik|ciclis|bici/.test(k)) return 'cycling'
  if (/swim|nuot/.test(k)) return 'swimming'
  if (/hik|escurs/.test(k)) return 'hiking'
  return KINDS.includes(k) ? k : 'other'
}

type StepRow = { day: string; steps: number }
type WeightRow = { measured_at: string; weight_kg: number; body_fat_pct: number | null }

const DATE_RE = /(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?/

function parseLines(text: string): { date: string; time: string | null; value: string }[] {
  return text
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const m = line.match(DATE_RE)
      if (!m) return []
      const rest = line.slice((m.index ?? 0) + m[0].length).replace(/^[\s,|=:\t]+/, '')
      const time = m[2] ? `${m[2].padStart(2, '0')}:${m[3]}` : null
      return [{ date: m[1], time, value: rest }]
    })
}

/** Integers may arrive with locale grouping ("8.432" or "8,432"). */
function parseInteger(value: string): number {
  return Number(value.replace(/[^\d]/g, ''))
}

/** Decimals may arrive with a decimal comma ("72,5"). */
function parseDecimal(value: string): number {
  return Number(value.replace(/\s/g, '').replace(/[^\d.,-]/g, '').replace(',', '.'))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const token = String(req.headers.get('x-forza-token') ?? body.token ?? '').trim()
  if (token.length < 20) return json({ error: 'unauthorized' }, 401)

  const admin = adminClient()
  const hash = await sha256Hex(token)
  const { data: owner } = await admin.from('sync_tokens').select('user_id').eq('token_hash', hash).maybeSingle()
  if (!owner) return json({ error: 'unauthorized' }, 401)
  const userId: string = owner.user_id

  const source = SOURCES.has(String(body.source)) ? String(body.source) : 'apple_health'
  const toKg = String(body.unit ?? 'kg').toLowerCase().startsWith('lb') ? 0.45359237 : 1

  const steps: StepRow[] = []
  if (Array.isArray(body.steps)) {
    for (const s of body.steps as { date?: string; steps?: number }[]) {
      if (typeof s?.date === 'string' && DATE_RE.test(s.date)) steps.push({ day: s.date.slice(0, 10), steps: Math.round(Number(s.steps)) })
    }
  }
  if (typeof body.steps_text === 'string') {
    for (const l of parseLines(body.steps_text)) steps.push({ day: l.date, steps: parseInteger(l.value) })
  }

  const weights: WeightRow[] = []
  if (Array.isArray(body.weights)) {
    for (const w of body.weights as { at?: string; kg?: number; fat_pct?: number }[]) {
      const at = new Date(String(w?.at))
      if (!Number.isNaN(at.getTime())) {
        weights.push({ measured_at: at.toISOString(), weight_kg: Number(w.kg) * toKg, body_fat_pct: w.fat_pct ?? null })
      }
    }
  }
  if (typeof body.weights_text === 'string') {
    for (const l of parseLines(body.weights_text)) {
      // Without a time, store the weight at local noon so it lands on the right day in any time zone.
      const at = new Date(`${l.date}T${l.time ?? '12:00'}:00`)
      weights.push({ measured_at: at.toISOString(), weight_kg: parseDecimal(l.value) * toKg, body_fat_pct: null })
    }
  }

  const validSteps = steps.filter((s) => Number.isFinite(s.steps) && s.steps >= 0 && s.steps <= 200000).slice(-MAX_ROWS)
  const validWeights = weights
    .filter((w) => Number.isFinite(w.weight_kg) && w.weight_kg >= 20 && w.weight_kg <= 400)
    .map((w) => ({ ...w, weight_kg: Math.round(w.weight_kg * 100) / 100 }))
    .slice(-MAX_ROWS)

  // Keep the highest count per day (a phone can report a day more than once while it is still going).
  const perDay = new Map<string, number>()
  for (const s of validSteps) perDay.set(s.day, Math.max(perDay.get(s.day) ?? 0, s.steps))

  if (perDay.size) {
    const rows = [...perDay].map(([day, n]) => ({ user_id: userId, day, steps: n, source, updated_at: new Date().toISOString() }))
    const { error } = await admin.from('daily_steps').upsert(rows, { onConflict: 'user_id,day' })
    if (error) return json({ error: 'steps_failed', detail: error.message }, 500)
  }
  if (validWeights.length) {
    const rows = validWeights.map((w) => ({ ...w, user_id: userId, source }))
    const { error } = await admin.from('body_weights').upsert(rows, { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true })
    if (error) return json({ error: 'weights_failed', detail: error.message }, 500)
  }

  const activities: { started_at: string; ended_at: string; kind: string; title: string | null }[] = []
  const pushActivity = (start: unknown, end: unknown, kind: unknown, title: unknown) => {
    const a = new Date(String(start))
    const b = new Date(String(end))
    const minutes = (b.getTime() - a.getTime()) / 60_000
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || minutes < 3 || minutes > 24 * 60) return
    activities.push({ started_at: a.toISOString(), ended_at: b.toISOString(), kind: activityKind(kind), title: title ? String(title).slice(0, 80) : null })
  }
  if (Array.isArray(body.activities)) {
    for (const a of body.activities as Record<string, unknown>[]) pushActivity(a?.start, a?.end, a?.kind, a?.title)
  }
  if (typeof body.activities_text === 'string') {
    for (const line of body.activities_text.split(/\n+/)) {
      const [start, end, kind] = line.split(/[,;|\t]/).map((x) => x.trim())
      if (start && end) pushActivity(start, end, kind, null)
    }
  }
  // The same walk can arrive twice (the phone's own tracking and Google Fit, a watch…): keep one per
  // start time, the longest. Duplicates in one upsert would make the whole sync fail.
  const byStart = new Map<string, (typeof activities)[number]>()
  for (const a of activities) {
    const prev = byStart.get(a.started_at)
    if (!prev || a.ended_at > prev.ended_at) byStart.set(a.started_at, a)
  }
  if (byStart.size) {
    const rows = [...byStart.values()].slice(-MAX_ROWS).map((a) => ({ ...a, user_id: userId, source }))
    const { error } = await admin.from('activities').upsert(rows, { onConflict: 'user_id,started_at,source' })
    if (error) return json({ error: 'activities_failed', detail: error.message }, 500)
  }

  let meals = 0
  const since = new Date(String(body.meals_since ?? ''))
  if (Array.isArray(body.meals) && !Number.isNaN(since.getTime())) {
    const rows = []
    for (const m of (body.meals as Record<string, unknown>[]).slice(0, 2000)) {
      const at = new Date(String(m?.at))
      const meal = MEALS.includes(String(m?.meal)) ? String(m.meal) : 'snack'
      const origin = String(m?.origin ?? '').slice(0, 120)
      const items = (Array.isArray(m?.items) ? (m.items as Record<string, unknown>[]) : []).slice(0, 80).map((i) => ({
        name: String(i?.name ?? '').trim().slice(0, 120) || 'Food',
        grams: 0,
        kcal: nutrient(i?.kcal, 5000),
        protein_g: nutrient(i?.protein_g, 500),
        carbs_g: nutrient(i?.carbs_g, 500),
        fat_g: nutrient(i?.fat_g, 500),
        fiber_g: nutrient(i?.fiber_g, 500),
        sugar_g: nutrient(i?.sugar_g, 500),
      }))
      if (Number.isNaN(at.getTime()) || !items.length) continue
      const total = (k: (typeof NUTRIENTS)[number]) => Math.round(items.reduce((a, i) => a + i[k], 0) * 10) / 10
      rows.push({
        id: await stableId(`hc-meal:${userId}:${String(m.day)}:${meal}:${origin}`),
        user_id: userId,
        eaten_at: at.toISOString(),
        meal,
        title: items.map((i) => i.name).join(', ').slice(0, 200),
        items,
        kcal: total('kcal'),
        protein_g: total('protein_g'),
        carbs_g: total('carbs_g'),
        fat_g: total('fat_g'),
        fiber_g: total('fiber_g'),
        sugar_g: total('sugar_g'),
        source: 'health_connect',
        origin: APP_NAMES[origin] ?? origin,
      })
    }
    if (rows.length) {
      const { error } = await admin.from('food_logs').upsert(rows, { onConflict: 'id' })
      if (error) return json({ error: 'meals_failed', detail: error.message }, 500)
    }
    // Mirror deletions made in the food app, only inside the window the phone just read.
    const { data: existing } = await admin.from('food_logs').select('id').eq('user_id', userId).eq('source', 'health_connect').gte('eaten_at', since.toISOString())
    const keep = new Set(rows.map((r) => r.id))
    const gone = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id))
    if (gone.length) await admin.from('food_logs').delete().in('id', gone)
    meals = rows.length
  }

  await admin.from('sync_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId)
  return json({ ok: true, steps: perDay.size, weights: validWeights.length, activities: byStart.size, meals })
})
