// Receives the Build With Science workouts that the Forza! Health helper read on the phone itself
// (through its accessibility service, no computer involved) and imports them the way Forza! Coach does.
// Authenticated with the person's sync key, like health-ingest.
//
// Body (JSON):
//   { action: "status", utc_offset_min }
//     → { imported: [{ name, started_at }], recent: [...], food: { days, hcDays } }
//       imported: workouts already brought over (the phone skips them); recent: the last 90 days in
//       forza-history format, which the phone needs to work out the plan (recent set counts, workouts
//       done this week); food: how many days of the food log to read, and the days Health Connect
//       already brought over from Build With Science (not read again).
//   { action: "import", utc_offset_min, file: forza-history-v1 + food_days }
//     → what was imported. Only workouts, the plan, the goal and the food log are taken from the file.
//
// utc_offset_min: the phone's minutes ahead of UTC, to tell its days apart (meals are kept per day).
import { importHistory } from '../../../shared/history-import.mjs'
import { adminClient, corsHeaders, json, sha256Hex } from '../_shared/util.ts'

const MAX_BYTES = 4_000_000
const BWS = 'Build With Science'
type Db = ReturnType<typeof adminClient>

/** A stable UUID from a text: the same meal of the same person always gets the same row. */
async function stableId(text: string): Promise<string> {
  const h = (await sha256Hex(text)).slice(0, 32).split('')
  h[12] = '5'
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/** The phone's local day ("2026-10-29") of a moment, given its minutes ahead of UTC. */
const localDay = (iso: string, offset: number) => new Date(new Date(iso).getTime() + offset * 60_000).toISOString().slice(0, 10)

/** Days (in the phone's time) whose Build With Science meals arrived through Health Connect. */
async function healthConnectDays(db: Db, userId: string, offset: number, days = 60): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await db.from('food_logs').select('eaten_at').eq('user_id', userId).eq('source', 'health_connect').eq('origin', BWS).gte('eaten_at', since)
  return new Set((data ?? []).map((r) => localDay(r.eaten_at, offset)))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const text = await req.text()
  if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const token = String(req.headers.get('x-forza-token') ?? body.token ?? '').trim()
  if (token.length < 20) return json({ error: 'unauthorized' }, 401)
  const admin = adminClient()
  const { data: owner } = await admin.from('sync_tokens').select('user_id').eq('token_hash', await sha256Hex(token)).maybeSingle()
  if (!owner) return json({ error: 'unauthorized' }, 401)
  const userId: string = owner.user_id

  const offset = Number.isFinite(Number(body.utc_offset_min)) ? Number(body.utc_offset_min) : 0

  if (body.action === 'status') {
    const { data: imported, error } = await admin.from('workout_sessions').select('name, started_at').eq('user_id', userId).eq('source', 'import')
    if (error) return json({ error: 'server_error' }, 500)
    const hcDays = await healthConnectDays(admin, userId, offset)
    // How far back to read the food log: a month the first time, then since the last day read
    // (plus two, for meals edited afterwards). When Health Connect brings the meals, a few days suffice.
    const { data: last } = await admin.from('food_logs').select('eaten_at').eq('user_id', userId).eq('source', 'import').eq('origin', BWS).order('eaten_at', { ascending: false }).limit(1).maybeSingle()
    const yesterday = localDay(new Date(Date.now() - 86_400_000).toISOString(), offset)
    const days = [...hcDays].some((d) => d >= yesterday)
      ? 3
      : last
        ? Math.min(30, Math.max(3, Math.ceil((Date.now() - new Date(last.eaten_at).getTime()) / 86_400_000) + 2))
        : 30
    return json({ imported, recent: await recentSessions(admin, userId), food: { days, hcDays: [...hcDays] } })
  }

  if (body.action === 'import') {
    const file = body.file as Record<string, unknown> | undefined
    if (file?.format !== 'forza-history-v1') return json({ error: 'bad_file' }, 400)
    const list = (v: unknown) => (Array.isArray(v) ? v : [])
    // What the phone reads in Build With Science, nothing else: no weigh-ins, meals or photos here.
    // Meals of the food log: per person ids, and never for a day Health Connect already brought over.
    const hcDays = await healthConnectDays(admin, userId, offset)
    const readDays = list(file.food_days).filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !hcDays.has(d))
    const food = []
    for (const f of list(file.food)) {
      if (typeof f?.day !== 'string' || hcDays.has(f.day) || typeof f.id !== 'string') continue
      food.push({ ...f, id: await stableId(`bws-food:${userId}:${f.id}`), origin: BWS })
    }
    const upload = {
      format: 'forza-history-v1',
      profile: file.profile ?? undefined,
      custom_exercises: list(file.custom_exercises),
      templates: list(file.templates),
      sessions: list(file.sessions),
      food,
    }
    // A workout rebuilt from the history never replaces one already in the plan (it would lose supersets).
    if (upload.templates.some((t) => t?.fromHistory)) {
      const { data: existing } = await admin.from('workout_templates').select('name').eq('user_id', userId).eq('archived', false)
      const names = new Set((existing ?? []).map((t) => t.name))
      upload.templates = upload.templates.filter((t) => !t?.fromHistory || !names.has(t.name))
    }
    try {
      const result = await importHistory(admin, userId, upload, { byCoach: true })
      // A day read again replaces what was read before: meals deleted in Build With Science go too.
      const keep = new Set(food.map((f) => f.id))
      for (const day of readDays) {
        const start = new Date(new Date(`${day}T00:00:00Z`).getTime() - offset * 60_000)
        const end = new Date(start.getTime() + 86_400_000)
        const { data: old } = await admin.from('food_logs').select('id').eq('user_id', userId).eq('source', 'import').eq('origin', BWS).gte('eaten_at', start.toISOString()).lt('eaten_at', end.toISOString())
        const gone = (old ?? []).map((r) => r.id).filter((id) => !keep.has(id))
        if (gone.length) await admin.from('food_logs').delete().in('id', gone)
      }
      const now = new Date().toISOString()
      // Build With Science's daily targets (ranges), which the person may choose to follow in Forza!.
      const t = file.bws_targets as Record<string, unknown> | null | undefined
      const range = (v: unknown) => (Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) < 10000) ? v.map(Number) : undefined)
      const targets = t && range(t.kcal) ? { kcal: range(t.kcal), protein: range(t.protein), carbs: range(t.carbs), fat: range(t.fat) } : null
      await admin.from('profiles').update({ bws_synced_at: now, ...(targets ? { bws_targets: targets, bws_targets_at: now } : {}) }).eq('id', userId)
      await admin.from('sync_tokens').update({ last_used_at: now }).eq('user_id', userId)
      return json(result)
    } catch (e) {
      console.error('bws import failed', (e as Error).message)
      return json({ error: 'import_failed', detail: (e as Error).message.slice(0, 300) }, (e as { status?: number }).status ?? 500)
    }
  }

  return json({ error: 'bad_request' }, 400)
})

/** The person's last 90 days of workouts, in forza-history format (as Forza! Coach builds them). */
async function recentSessions(db: Db, userId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: sessions } = await db.from('workout_sessions').select('id, name, started_at').eq('user_id', userId).gte('started_at', since)
  if (!sessions?.length) return []
  const sets: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('set_logs').select('session_id, exercise_id, is_warmup, reps, duration_s, weight_kg').eq('user_id', userId).gte('performed_at', since).order('id').range(from, from + 999)
    sets.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return sessions.map((s) => ({ ...s, sets: sets.filter((x) => x.session_id === s.id) }))
}
