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
  const [profile, weights, sessions, sets, steps, food, checkins, templates, sync] = await Promise.all([
    db.from('profiles').select('*').eq('id', id).maybeSingle(),
    db.from('body_weights').select('*').eq('user_id', id).gte('measured_at', year).order('measured_at'),
    db.from('workout_sessions').select('*').eq('user_id', id).gte('started_at', year).order('started_at', { ascending: false }),
    db.from('set_logs').select('*').eq('user_id', id).gte('performed_at', year).order('performed_at').limit(20000),
    db.from('daily_steps').select('*').eq('user_id', id).gte('day', quarter).order('day'),
    db.from('food_logs').select('*').eq('user_id', id).gte('eaten_at', month).order('eaten_at', { ascending: false }),
    db.from('checkins').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(30),
    db.from('workout_templates').select('*').eq('user_id', id).eq('archived', false).order('position'),
    db.from('sync_tokens').select('last_used_at, created_at').eq('user_id', id).maybeSingle(),
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
  exercises: (t.exercises ?? []).map((e) => ({
    exercise_id: String(e.exercise_id),
    sets: Number(e.sets) || 3,
    rep_min: Number(e.rep_min) || 8,
    rep_max: Number(e.rep_max) || 12,
    rest_s: Number(e.rest_s) || 0,
    target_kg: e.target_kg === '' || e.target_kg == null ? null : Number(e.target_kg),
    note: e.note || null,
  })),
  managed_by_admin: true,
})

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
  ['GET', /^\/api\/catalogue$/, () => catalogue()],
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
