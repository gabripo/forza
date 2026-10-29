// Receives the Build With Science workouts that the Forza! Health helper read on the phone itself
// (through its accessibility service, no computer involved) and imports them the way Forza! Coach does.
// Authenticated with the person's sync key, like health-ingest.
//
// Body (JSON):
//   { action: "status" }
//     → { imported: [{ name, started_at }], recent: [...] }
//       imported: workouts already brought over (the phone skips them); recent: the last 90 days in
//       forza-history format, which the phone needs to work out the plan (recent set counts, workouts
//       done this week).
//   { action: "import", file: forza-history-v1 }
//     → what was imported. Only workouts, the plan and the goal are taken from the file.
import { importHistory } from '../../../shared/history-import.mjs'
import { adminClient, corsHeaders, json, sha256Hex } from '../_shared/util.ts'

const MAX_BYTES = 4_000_000
type Db = ReturnType<typeof adminClient>

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

  if (body.action === 'status') {
    const { data: imported, error } = await admin.from('workout_sessions').select('name, started_at').eq('user_id', userId).eq('source', 'import')
    if (error) return json({ error: 'server_error' }, 500)
    return json({ imported, recent: await recentSessions(admin, userId) })
  }

  if (body.action === 'import') {
    const file = body.file as Record<string, unknown> | undefined
    if (file?.format !== 'forza-history-v1') return json({ error: 'bad_file' }, 400)
    const list = (v: unknown) => (Array.isArray(v) ? v : [])
    // What the phone reads in Build With Science, nothing else: no weigh-ins, meals or photos here.
    const upload = {
      format: 'forza-history-v1',
      profile: file.profile ?? undefined,
      custom_exercises: list(file.custom_exercises),
      templates: list(file.templates),
      sessions: list(file.sessions),
    }
    // A workout rebuilt from the history never replaces one already in the plan (it would lose supersets).
    if (upload.templates.some((t) => t?.fromHistory)) {
      const { data: existing } = await admin.from('workout_templates').select('name').eq('user_id', userId).eq('archived', false)
      const names = new Set((existing ?? []).map((t) => t.name))
      upload.templates = upload.templates.filter((t) => !t?.fromHistory || !names.has(t.name))
    }
    try {
      const result = await importHistory(admin, userId, upload, { byCoach: true })
      const now = new Date().toISOString()
      await admin.from('profiles').update({ bws_synced_at: now }).eq('id', userId)
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
