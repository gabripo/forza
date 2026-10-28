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
import { adminClient, corsHeaders, json, sha256Hex } from '../_shared/util.ts'

const MAX_ROWS = 400
const SOURCES = new Set(['apple_health', 'health_connect'])

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

  await admin.from('sync_tokens').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId)
  return json({ ok: true, steps: perDay.size, weights: validWeights.length })
})
