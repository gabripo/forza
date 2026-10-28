// Forza! admin dashboard: a tiny local server that only listens on this Mac.
//
// The Supabase service-role key (full access to every account) never leaves this machine:
// it is read from the macOS Keychain at start-up (see scripts/admin-setup.sh).
// The browser UI talks to this server with a random token generated at each launch,
// so other websites open in the browser cannot call it.
//
//   npm start          -> cloud project, credentials from the Keychain
//   npm run local      -> local `supabase start` stack (development)
import { createClient } from '@supabase/supabase-js'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 4545)
const LOCAL = process.argv.includes('--local')
const KEYCHAIN_SERVICE = 'forza-admin'

function keychain(account) {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function credentials() {
  if (LOCAL) {
    // Public demo key printed by `supabase status` for the local stack only.
    const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: join(here, '..'), encoding: 'utf8' }))
    return { url: status.API_URL, key: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY }
  }
  const url = keychain('supabase-url')
  const key = keychain('service-role-key')
  if (!url || !key) {
    console.error('\nAdmin credentials not found in the Keychain. Run:  ./scripts/admin-setup.sh\n')
    process.exit(1)
  }
  return { url, key }
}

const { url, key } = credentials()
// `ws` gives Node 20 the WebSocket that supabase-js expects (Node 22+ has it built in).
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } })
const TOKEN = randomBytes(24).toString('hex')

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const check = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return data
}

async function listUsers() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const ids = data.users.map((u) => u.id)
  const [profiles, sessions, weights] = await Promise.all([
    db.from('profiles').select('*').in('id', ids),
    db.from('workout_sessions').select('user_id, started_at').in('user_id', ids).order('started_at', { ascending: false }).limit(2000),
    db.from('body_weights').select('user_id, measured_at, weight_kg').in('user_id', ids).order('measured_at', { ascending: false }).limit(2000),
  ])
  const byId = (rows) => {
    const out = {}
    for (const r of rows ?? []) (out[r.user_id ?? r.id] ??= []).push(r)
    return out
  }
  const p = byId(profiles.data)
  const s = byId(sessions.data)
  const w = byId(weights.data)
  const since = Date.now() - 28 * 86_400_000
  return data.users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    profile: p[u.id]?.[0] ?? null,
    last_workout: s[u.id]?.[0]?.started_at ?? null,
    workouts_28d: (s[u.id] ?? []).filter((x) => new Date(x.started_at).getTime() > since).length,
    last_weight: w[u.id]?.[0] ?? null,
  }))
}

async function userData(id) {
  const year = new Date(Date.now() - 365 * 86_400_000).toISOString()
  const quarter = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [profile, weights, sessions, sets, steps, food, checkins, templates, sync, activities, photos, lessons] = await Promise.all([
    db.from('profiles').select('*').eq('id', id).maybeSingle(),
    db.from('body_weights').select('*').eq('user_id', id).gte('measured_at', year).order('measured_at'),
    db.from('workout_sessions').select('*').eq('user_id', id).gte('started_at', year).order('started_at', { ascending: false }),
    db.from('set_logs').select('*').eq('user_id', id).gte('performed_at', year).order('performed_at').limit(20000),
    db.from('daily_steps').select('*').eq('user_id', id).gte('day', quarter).order('day'),
    db.from('food_logs').select('*').eq('user_id', id).gte('eaten_at', month).order('eaten_at', { ascending: false }),
    db.from('checkins').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(30),
    db.from('workout_templates').select('*').eq('user_id', id).eq('archived', false).order('position'),
    db.from('sync_tokens').select('last_used_at, created_at').eq('user_id', id).maybeSingle(),
    db.from('activities').select('*').eq('user_id', id).gte('started_at', month).order('started_at', { ascending: false }),
    db.from('progress_photos').select('*').eq('user_id', id).order('taken_at', { ascending: false }),
    db.from('lesson_progress').select('*').eq('user_id', id),
  ])
  return {
    profile: check(profile),
    weights: check(weights),
    sessions: check(sessions),
    sets: check(sets),
    steps: check(steps),
    food: check(food),
    checkins: check(checkins),
    templates: check(templates),
    sync: sync.data ?? null,
    activities: check(activities),
    photos: check(photos),
    lessons: check(lessons),
  }
}

async function catalogue() {
  const builtIn = JSON.parse(await readFile(join(here, '../app/src/data/exercises.json'), 'utf8'))
  const [custom, overrides] = await Promise.all([db.from('custom_exercises').select('*'), db.from('exercise_overrides').select('*')])
  return { builtIn, custom: check(custom), overrides: check(overrides) }
}

const cleanTemplate = (t) => ({
  name: String(t.name ?? '').trim() || 'Workout',
  notes: t.notes || null,
  position: Number(t.position ?? 0),
  weekday: t.weekday === '' || t.weekday == null ? null : Number(t.weekday),
  exercises: (t.exercises ?? []).map((e) => ({
    exercise_id: String(e.exercise_id),
    sets: Number(e.sets) || 3,
    rep_min: Number(e.rep_min) || 8,
    rep_max: Number(e.rep_max) || 12,
    rest_s: Number(e.rest_s) || 0,
    target_kg: e.target_kg === '' || e.target_kg == null ? null : Number(e.target_kg),
    note: e.note || null,
    superset: e.superset === '' || e.superset == null ? null : Number(e.superset),
    warmup: e.warmup === '' || e.warmup == null ? null : e.warmup === true || e.warmup === 'true',
  })),
  managed_by_admin: true,
})

/**
 * Imports workout history, a plan and weigh-ins into one account (format: docs/import-format.md).
 * Idempotent: sessions keep their ids, so importing the same file twice changes nothing.
 */
async function importHistory(userId, data) {
  if (data?.format !== 'forza-history-v1') throw Object.assign(new Error('Unknown file format (expected forza-history-v1)'), { status: 400 })
  const result = { templates: 0, sessions: 0, sets: 0, weights: 0, custom_exercises: 0 }

  // Exercises that only exist in the source app become shared custom exercises (reused by name).
  const customIds = new Map()
  for (const c of data.custom_exercises ?? []) {
    const found = check(await db.from('custom_exercises').select('id').is('owner_id', null).eq('name_en', c.name_en).maybeSingle())
    const row = found ?? check(
      await db
        .from('custom_exercises')
        .insert({ owner_id: null, name_en: c.name_en, name_it: c.name_it || c.name_en, kind: c.kind ?? 'reps', muscles: c.muscles ?? [], equipment: c.equipment ?? 'other', video_url: c.video_url ?? null })
        .select('id')
        .single(),
    )
    if (!found) result.custom_exercises++
    customIds.set(c.key, row.id)
  }
  const resolve = (id) => (String(id).startsWith('custom:') ? customIds.get(String(id).slice(7)) : id)
  for (const t of data.templates ?? []) for (const e of t.exercises ?? []) e.exercise_id = resolve(e.exercise_id)
  for (const s of data.sessions ?? []) for (const x of s.sets ?? []) x.exercise_id = resolve(x.exercise_id)

  const templateIds = new Map()
  const existing = check(await db.from('workout_templates').select('id, name').eq('user_id', userId).eq('archived', false))
  for (const [i, t] of (data.templates ?? []).entries()) {
    const row = { ...cleanTemplate({ ...t, position: t.position ?? i }), user_id: userId }
    const same = existing.find((e) => e.name === row.name)
    const saved = same
      ? check(await db.from('workout_templates').update(row).eq('id', same.id).select('id, name').single())
      : check(await db.from('workout_templates').insert(row).select('id, name').single())
    templateIds.set(saved.name, saved.id)
    result.templates++
  }
  for (const e of existing) if (!templateIds.has(e.name)) templateIds.set(e.name, e.id)

  const sessions = data.sessions ?? []
  for (let i = 0; i < sessions.length; i += 200) {
    const chunk = sessions.slice(i, i + 200)
    const rows = chunk.map((s) => ({
      id: s.id,
      user_id: userId,
      template_id: templateIds.get(s.name) ?? null,
      name: s.name,
      started_at: s.started_at,
      finished_at: s.finished_at ?? null,
      effort: s.effort ?? null,
      notes: s.notes ?? null,
      source: 'import',
    }))
    check(await db.from('workout_sessions').upsert(rows, { onConflict: 'id' }))
    check(await db.from('set_logs').delete().in('session_id', rows.map((r) => r.id)))
    const sets = chunk.flatMap((s) =>
      (s.sets ?? []).map((x) => ({
        session_id: s.id,
        user_id: userId,
        exercise_id: x.exercise_id,
        exercise_order: x.exercise_order,
        set_index: x.set_index,
        weight_kg: x.weight_kg ?? null,
        reps: x.reps ?? null,
        duration_s: x.duration_s ?? null,
        rir: x.rir ?? null,
        is_warmup: Boolean(x.is_warmup),
        performed_at: x.performed_at ?? s.started_at,
      })),
    )
    for (let j = 0; j < sets.length; j += 1000) check(await db.from('set_logs').insert(sets.slice(j, j + 1000)))
    result.sessions += rows.length
    result.sets += sets.length
  }

  const weights = (data.weights ?? []).map((w) => ({ user_id: userId, measured_at: w.measured_at, weight_kg: w.weight_kg, body_fat_pct: w.body_fat_pct ?? null, source: 'import' }))
  for (let i = 0; i < weights.length; i += 500) {
    check(await db.from('body_weights').upsert(weights.slice(i, i + 500), { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true }))
  }
  result.weights = weights.length
  return result
}

const routes = [
  ['GET', /^\/api\/users$/, () => listUsers()],
  [
    'POST',
    /^\/api\/users$/,
    async (_m, body) => {
      const { data, error } = await db.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { display_name: body.display_name ?? '', locale: body.locale === 'it' ? 'it' : 'en' },
      })
      if (error) throw Object.assign(new Error(error.message), { status: 400 })
      return { id: data.user.id }
    },
  ],
  ['GET', /^\/api\/users\/([\w-]+)$/, (m) => userData(m[1])],
  [
    'POST',
    /^\/api\/users\/([\w-]+)\/password$/,
    async (m, body) => {
      const { error } = await db.auth.admin.updateUserById(m[1], { password: body.password })
      if (error) throw Object.assign(new Error(error.message), { status: 400 })
      return { ok: true }
    },
  ],
  [
    'DELETE',
    /^\/api\/users\/([\w-]+)$/,
    async (m) => {
      const { error } = await db.auth.admin.deleteUser(m[1])
      if (error) throw Object.assign(new Error(error.message), { status: 400 })
      return { ok: true }
    },
  ],
  ['POST', /^\/api\/users\/([\w-]+)\/templates$/, async (m, body) => check(await db.from('workout_templates').insert({ ...cleanTemplate(body), user_id: m[1] }).select().single())],
  ['PUT', /^\/api\/templates\/([\w-]+)$/, async (m, body) => check(await db.from('workout_templates').update(cleanTemplate(body)).eq('id', m[1]).select().single())],
  ['DELETE', /^\/api\/templates\/([\w-]+)$/, async (m) => check(await db.from('workout_templates').update({ archived: true }).eq('id', m[1]).select().single())],
  [
    'POST',
    /^\/api\/users\/([\w-]+)\/copy-plan$/,
    async (m, body) => {
      const source = check(await db.from('workout_templates').select('*').eq('user_id', body.from).eq('archived', false).order('position'))
      const rows = source.map((t) => ({ ...cleanTemplate(t), user_id: m[1] }))
      if (rows.length) check(await db.from('workout_templates').insert(rows))
      return { copied: rows.length }
    },
  ],
  ['POST', /^\/api\/users\/([\w-]+)\/import$/, (m, body) => importHistory(m[1], body)],
  ['GET', /^\/api\/catalogue$/, () => catalogue()],
  [
    'GET',
    /^\/api\/templates\/([\w-]+)\/versions$/,
    async (m) => check(await db.from('workout_template_versions').select('*').eq('template_id', m[1]).order('saved_at', { ascending: false }).limit(30)),
  ],
  [
    'POST',
    /^\/api\/templates\/([\w-]+)\/restore\/(\d+)$/,
    async (m) => {
      const v = check(await db.from('workout_template_versions').select('*').eq('id', m[2]).eq('template_id', m[1]).single())
      // The update itself keeps the current version, so a restore can be undone.
      return check(await db.from('workout_templates').update({ name: v.name, notes: v.notes, weekday: v.weekday, exercises: v.exercises }).eq('id', m[1]).select().single())
    },
  ],
  [
    'GET',
    /^\/api\/progress-photo$/,
    async (_m, _b, q) => {
      const { data } = await db.storage.from('progress-photos').createSignedUrl(q.get('path') ?? '', 600)
      return { url: data?.signedUrl ?? null }
    },
  ],
  [
    'PUT',
    /^\/api\/overrides\/([\w-]+)$/,
    async (m, body) =>
      check(
        await db
          .from('exercise_overrides')
          .upsert({ exercise_id: m[1], video_url: body.video_url || null, note_en: body.note_en || null, note_it: body.note_it || null, updated_at: new Date().toISOString() })
          .select()
          .single(),
      ),
  ],
  [
    'POST',
    /^\/api\/custom-exercises$/,
    async (_m, body) =>
      check(
        await db
          .from('custom_exercises')
          .insert({
            owner_id: null,
            name_en: body.name_en,
            name_it: body.name_it || body.name_en,
            muscles: body.muscles ?? [],
            equipment: body.equipment ?? 'other',
            kind: body.kind ?? 'reps',
            steps_en: body.steps_en ?? [],
            steps_it: body.steps_it ?? [],
            video_url: body.video_url || null,
          })
          .select()
          .single(),
      ),
  ],
  [
    'GET',
    /^\/api\/photo$/,
    async (_m, _b, q) => {
      const { data } = await db.storage.from('food-photos').createSignedUrl(q.get('path') ?? '', 600)
      return { url: data?.signedUrl ?? null }
    },
  ],
]

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }

function authorised(req) {
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''))
  const expected = Buffer.from(TOKEN)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const server = createServer(async (req, res) => {
  // Refuse requests addressed to any other host name (DNS-rebinding protection).
  const host = (req.headers.host ?? '').split(':')[0]
  if (host !== '127.0.0.1' && host !== 'localhost') {
    res.writeHead(403).end()
    return
  }
  const u = new URL(req.url ?? '/', `http://${req.headers.host}`)
  try {
    if (u.pathname.startsWith('/api/')) {
      if (!authorised(req)) {
        res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorised"}')
        return
      }
      const route = routes.find(([method, re]) => method === req.method && re.test(u.pathname))
      if (!route) {
        res.writeHead(404).end()
        return
      }
      let body = {}
      if (req.method !== 'GET') {
        const chunks = []
        for await (const c of req) chunks.push(c)
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      }
      const result = await route[2](u.pathname.match(route[1]), body, u.searchParams)
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(result))
      return
    }
    const file = u.pathname === '/' ? 'index.html' : u.pathname.slice(1)
    if (!/^[\w.-]+$/.test(file)) {
      res.writeHead(404).end()
      return
    }
    const content = await readFile(join(here, 'public', file))
    res
      .writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'content-security-policy': "default-src 'self'; img-src 'self' data: https: http://127.0.0.1:54321; connect-src 'self'; style-src 'self' 'unsafe-inline'",
      })
      .end(content)
  } catch (e) {
    const status = e.status ?? (e.code === 'ENOENT' ? 404 : 500)
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}/#token=${TOKEN}`
  console.log(`\nForza! admin (${LOCAL ? 'local stack' : url})\n→ ${link}\n\nOnly this Mac can reach it. Press Ctrl+C to stop.\n`)
  if (!process.argv.includes('--no-open')) spawn('open', [link], { stdio: 'ignore', detached: true }).unref()
})
