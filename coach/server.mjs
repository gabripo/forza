// Forza! Coach: sets up the family's Forza! server, creates the accounts and follows everyone's
// progress. A small local web app that only listens on this computer (macOS, Windows or Linux).
//
// The keys (full access to every account) never leave this computer: they are kept in the
// system password store (lib/secrets.mjs). The browser UI talks to this server with a random
// token generated at each launch, so other websites open in the browser cannot call it.
//
//   npm start          -> your Forza! server (set it up the first time from the browser)
//   npm run local      -> the local `supabase start` stack (development)
import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { platform } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { cleanTemplate, importHistory } from '../shared/history-import.mjs'
import { Device, downloadAdb, findAdb } from './lib/adb.mjs'
import { Stop } from './lib/bws-extract.mjs'
import { DEFAULT_APP_URL, loadConnection } from './lib/connection.mjs'
import { historyFile, runBwsImport } from './lib/bws-job.mjs'
import { install, Management, regionForTimeZone } from './lib/project.mjs'
import { getConfig, getSecret, setConfig, setSecret, store } from './lib/secrets.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 4545)
const LOCAL = process.argv.includes('--local')
const TOKEN = randomBytes(24).toString('hex')

// ---------------------------------------------------------------------------
// Connection to the Forza! server
// ---------------------------------------------------------------------------

/** { url, key, publishable, ref, appUrl, db } once set up, otherwise null (setup mode). */
let ctx = null

async function connect() {
  ctx = await loadConnection({ local: LOCAL })
  return ctx
}

const need = () => {
  if (!ctx) throw Object.assign(new Error('Forza! is not set up yet'), { status: 409 })
  return ctx.db
}

async function management() {
  const token = await getSecret('supabase-access-token')
  if (!token) throw Object.assign(new Error('Add your Supabase access token first (Setup)'), { status: 409 })
  return new Management(token)
}

// ---------------------------------------------------------------------------
// Background jobs (install, Build With Science import): the UI polls their log.
// ---------------------------------------------------------------------------

const jobs = new Map()

function startJob(kind, run) {
  const id = randomBytes(6).toString('hex')
  const job = { id, kind, status: 'running', log: [], result: null, error: null, controller: new AbortController() }
  const log = (line) => {
    job.log.push(`${new Date().toLocaleTimeString('en-GB')}  ${line}`)
    console.log(`[${kind}] ${line}`)
  }
  jobs.set(id, job)
  run(log, job.controller.signal)
    .then((result) => Object.assign(job, { status: 'done', result }))
    .catch((e) => {
      log(`Stopped: ${e.message}`)
      Object.assign(job, { status: 'error', error: e.message })
    })
  return { id }
}

const jobView = ({ controller: _c, ...job }) => job

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const check = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return data
}

/** Supabase returns at most 1000 rows per request: fetch every page. */
async function fetchAll(page) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const rows = check(await page(from, from + 999))
    out.push(...rows)
    if (rows.length < 1000) return { data: out, error: null }
  }
}

async function listUsers() {
  const db = need()
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
    no_email: u.email?.endsWith('.invalid') ?? false,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    profile: p[u.id]?.[0] ?? null,
    last_workout: s[u.id]?.[0]?.started_at ?? null,
    workouts_28d: (s[u.id] ?? []).filter((x) => new Date(x.started_at).getTime() > since).length,
    last_weight: w[u.id]?.[0] ?? null,
  }))
}

async function userData(id) {
  const db = need()
  const year = new Date(Date.now() - 365 * 86_400_000).toISOString()
  const quarter = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [profile, weights, sessions, sets, steps, food, checkins, templates, sync, activities, photos, lessons] = await Promise.all([
    db.from('profiles').select('*').eq('id', id).maybeSingle(),
    fetchAll((from, to) => db.from('body_weights').select('*').eq('user_id', id).gte('measured_at', year).order('measured_at').order('id').range(from, to)),
    db.from('workout_sessions').select('*').eq('user_id', id).gte('started_at', year).order('started_at', { ascending: false }),
    fetchAll((from, to) => db.from('set_logs').select('*').eq('user_id', id).gte('performed_at', year).order('performed_at').order('id').range(from, to)),
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
  const db = need()
  const builtIn = JSON.parse(await readFile(join(here, '../app/src/data/exercises.json'), 'utf8'))
  const [custom, overrides] = await Promise.all([db.from('custom_exercises').select('*'), db.from('exercise_overrides').select('*')])
  return { builtIn, custom: check(custom), overrides: check(overrides) }
}

const PROFILE_EDITABLE = ['display_name', 'locale', 'sex', 'birth_year', 'height_cm', 'goal', 'activity_level', 'experience', 'start_weight_kg', 'target_weight_kg', 'workouts_per_week', 'steps_goal']

/** A coach can fill in the profile, so the person skips the questions on their phone. */
async function saveProfile(id, body) {
  const patch = {}
  for (const k of PROFILE_EDITABLE) if (k in body) patch[k] = body[k] === '' ? null : body[k]
  for (const k of ['birth_year', 'height_cm', 'start_weight_kg', 'target_weight_kg', 'workouts_per_week', 'steps_goal']) if (patch[k] != null) patch[k] = Number(patch[k])
  if (body.finish_setup) patch.onboarded_at = new Date().toISOString()
  return check(await need().from('profiles').update(patch).eq('id', id).select().single())
}

/**
 * A one-time sign-in code for the person's phone (valid 24 hours, usable once). It opens the
 * Forza! app already connected to this server and signed in: no email or password to type.
 */
async function signInCode(id) {
  const db = need()
  if (!ctx.publishable) throw Object.assign(new Error('Open Setup and click "Update the server" once: Coach needs the public key for sign-in codes.'), { status: 409 })
  const { data: u, error } = await db.auth.admin.getUserById(id)
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email: u.user.email })
  if (link.error) throw Object.assign(new Error(link.error.message), { status: 400 })
  const profile = check(await db.from('profiles').select('display_name, locale').eq('id', id).maybeSingle())
  const params = new URLSearchParams({ u: ctx.url, k: ctx.publishable ?? '', t: link.data.properties.hashed_token })
  if (profile?.display_name) params.set('n', profile.display_name)
  const url = `${ctx.appUrl}#/welcome?${params}`
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  return { url, svg, name: profile?.display_name ?? '', locale: profile?.locale ?? 'en', expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() }
}

async function createUser(body) {
  const db = need()
  const name = String(body.display_name ?? '').trim()
  // No email? A private placeholder address (".invalid" never exists): the person signs in with the QR code.
  const email =
    String(body.email ?? '').trim() ||
    `${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'person'}.${randomBytes(3).toString('hex')}@forza.invalid`
  const password = String(body.password ?? '') || randomBytes(18).toString('base64url')
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, locale: body.locale === 'it' ? 'it' : 'en' },
  })
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return { id: data.user.id, email }
}

// ---------------------------------------------------------------------------
// Build With Science import (USB cable + ADB)
// ---------------------------------------------------------------------------

async function bwsDevices() {
  const adb = await findAdb()
  if (!adb) return { adb: null, devices: [] }
  return { adb, devices: await Device.list(adb) }
}

function bwsImport(userId, options) {
  const db = need()
  return startJob('bws', (log, signal) => runBwsImport({ ...options, db, userId, log, signal }))
}

// ---------------------------------------------------------------------------
// Set-up (Supabase project, AI key, app address)
// ---------------------------------------------------------------------------

async function status() {
  const config = await getConfig()
  return {
    configured: Boolean(ctx),
    local: LOCAL,
    url: ctx?.url ?? null,
    ref: ctx?.ref ?? config.ref ?? null,
    appUrl: ctx?.appUrl ?? config.appUrl ?? DEFAULT_APP_URL,
    publishable: Boolean(ctx?.publishable),
    accessToken: Boolean(await getSecret('supabase-access-token')),
    store,
    platform: platform(),
    region: regionForTimeZone(),
  }
}

async function saveToken(token) {
  const m = new Management(String(token ?? '').trim())
  const [projects, organizations] = await Promise.all([m.projects(), m.organizations()])
  await setSecret('supabase-access-token', m.token)
  return { projects, organizations }
}

async function projects() {
  const m = await management()
  const [list, organizations] = await Promise.all([m.projects(), m.organizations()])
  return { projects: list, organizations }
}

function installJob({ ref, geminiKey, appUrl }) {
  return startJob('install', async (log) => {
    const m = await management()
    const url = String(appUrl || DEFAULT_APP_URL).replace(/\/?$/, '/')
    const r = await install(m, ref, { appUrl: url, geminiKey: geminiKey || null, onStep: log })
    await setSecret('supabase-url', r.url)
    await setSecret('service-role-key', r.secret)
    await setConfig({ ref, publishable: r.publishable, appUrl: url })
    await connect()
    log(r.applied.length ? `Database updated (${r.applied.length} changes)` : 'Database already up to date')
    log('Forza! is ready')
    return { ref, url: r.url }
  })
}

/** Sends a photo to the food AI with the project's secret key: checks the key and the model. */
async function testFoodAi(body) {
  need()
  const res = await fetch(`${ctx.url}/functions/v1/food-estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.key}`, apikey: ctx.key },
    body: JSON.stringify({ image: body.image, mime: body.mime ?? 'image/jpeg', mode: body.mode ?? 'plate', locale: body.locale ?? 'en', goal: 'maintain', meal: 'a meal', note: body.note ?? '' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.detail ?? data.error ?? `HTTP ${res.status}`), { status: 502 })
  return data
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = [
  ['GET', /^\/api\/status$/, () => status()],
  ['POST', /^\/api\/setup\/token$/, (_m, body) => saveToken(body.token)],
  ['GET', /^\/api\/setup\/projects$/, () => projects()],
  [
    'POST',
    /^\/api\/setup\/create-project$/,
    async (_m, body) => (await management()).createProject({ name: body.name || 'forza', organization: body.organization, region: body.region || regionForTimeZone() }),
  ],
  ['POST', /^\/api\/setup\/install$/, (_m, body) => installJob(body)],
  [
    'POST',
    /^\/api\/setup\/ai-key$/,
    async (_m, body) => {
      const m = await management()
      await m.setSecrets(ctx?.ref ?? body.ref, { GEMINI_API_KEY: String(body.key).trim() })
      return { ok: true }
    },
  ],
  ['POST', /^\/api\/setup\/test-ai$/, (_m, body) => testFoodAi(body)],
  [
    'POST',
    /^\/api\/setup\/app-url$/,
    async (_m, body) => {
      const appUrl = String(body.appUrl).trim().replace(/\/?$/, '/')
      if (!/^https?:\/\//.test(appUrl)) throw Object.assign(new Error('The address must start with https://'), { status: 400 })
      await setConfig({ appUrl })
      if (ctx) ctx.appUrl = appUrl
      return { appUrl }
    },
  ],
  ['GET', /^\/api\/jobs\/(\w+)$/, (m) => jobView(jobs.get(m[1]) ?? { status: 'missing', log: [] })],
  [
    'POST',
    /^\/api\/jobs\/(\w+)\/stop$/,
    (m) => {
      jobs.get(m[1])?.controller.abort()
      return { ok: true }
    },
  ],

  ['GET', /^\/api\/users$/, () => listUsers()],
  ['POST', /^\/api\/users$/, (_m, body) => createUser(body)],
  ['GET', /^\/api\/users\/([\w-]+)$/, (m) => userData(m[1])],
  ['PUT', /^\/api\/users\/([\w-]+)\/profile$/, (m, body) => saveProfile(m[1], body)],
  ['POST', /^\/api\/users\/([\w-]+)\/signin-code$/, (m) => signInCode(m[1])],
  [
    'POST',
    /^\/api\/users\/([\w-]+)\/password$/,
    async (m, body) => {
      const { error } = await need().auth.admin.updateUserById(m[1], { password: body.password })
      if (error) throw Object.assign(new Error(error.message), { status: 400 })
      return { ok: true }
    },
  ],
  [
    'DELETE',
    /^\/api\/users\/([\w-]+)$/,
    async (m) => {
      const { error } = await need().auth.admin.deleteUser(m[1])
      if (error) throw Object.assign(new Error(error.message), { status: 400 })
      return { ok: true }
    },
  ],
  ['POST', /^\/api\/users\/([\w-]+)\/templates$/, async (m, body) => check(await need().from('workout_templates').insert({ ...cleanTemplate(body), managed_by_admin: true, user_id: m[1] }).select().single())],
  ['PUT', /^\/api\/templates\/([\w-]+)$/, async (m, body) => check(await need().from('workout_templates').update({ ...cleanTemplate(body), managed_by_admin: true }).eq('id', m[1]).select().single())],
  ['DELETE', /^\/api\/templates\/([\w-]+)$/, async (m) => check(await need().from('workout_templates').update({ archived: true }).eq('id', m[1]).select().single())],
  [
    'POST',
    /^\/api\/users\/([\w-]+)\/copy-plan$/,
    async (m, body) => {
      const db = need()
      const source = check(await db.from('workout_templates').select('*').eq('user_id', body.from).eq('archived', false).order('position'))
      const rows = source.map((t) => ({ ...cleanTemplate(t), managed_by_admin: true, user_id: m[1] }))
      if (rows.length) check(await db.from('workout_templates').insert(rows))
      return { copied: rows.length }
    },
  ],
  ['POST', /^\/api\/users\/([\w-]+)\/import$/, (m, body) => importHistory(need(), m[1], body, { byCoach: true })],
  ['GET', /^\/api\/bws\/devices$/, () => bwsDevices()],
  ['POST', /^\/api\/bws\/download-adb$/, () => startJob('adb', (log) => downloadAdb(log).then((adb) => ({ adb })))],
  ['POST', /^\/api\/users\/([\w-]+)\/bws$/, (m, body) => bwsImport(m[1], body)],
  [
    'GET',
    /^\/api\/users\/([\w-]+)\/bws-file$/,
    async (m) => JSON.parse(await readFile(historyFile(m[1]), 'utf8')),
  ],
  ['GET', /^\/api\/catalogue$/, () => catalogue()],
  [
    'GET',
    /^\/api\/templates\/([\w-]+)\/versions$/,
    async (m) => check(await need().from('workout_template_versions').select('*').eq('template_id', m[1]).order('saved_at', { ascending: false }).limit(30)),
  ],
  [
    'POST',
    /^\/api\/templates\/([\w-]+)\/restore\/(\d+)$/,
    async (m) => {
      const db = need()
      const v = check(await db.from('workout_template_versions').select('*').eq('id', m[2]).eq('template_id', m[1]).single())
      // The update itself keeps the current version, so a restore can be undone.
      return check(await db.from('workout_templates').update({ name: v.name, notes: v.notes, weekday: v.weekday, exercises: v.exercises }).eq('id', m[1]).select().single())
    },
  ],
  [
    'GET',
    /^\/api\/progress-photo$/,
    async (_m, _b, q) => {
      const { data } = await need().storage.from('progress-photos').createSignedUrl(q.get('path') ?? '', 600)
      return { url: data?.signedUrl ?? null }
    },
  ],
  [
    'PUT',
    /^\/api\/overrides\/([\w-]+)$/,
    async (m, body) =>
      check(
        await need()
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
        await need()
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
      const { data } = await need().storage.from('food-photos').createSignedUrl(q.get('path') ?? '', 600)
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
    const status = e instanceof Stop ? 409 : (e.status ?? (e.code === 'ENOENT' ? 404 : 500))
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }))
  }
})

function openBrowser(link) {
  const [cmd, args] =
    platform() === 'darwin' ? ['open', [link]] : platform() === 'win32' ? ['cmd', ['/c', 'start', '""', link.replaceAll('&', '^&')]] : ['xdg-open', [link]]
  try {
    // A missing opener (e.g. no xdg-open) is reported as an 'error' event, not an exception.
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  } catch {
    // no browser: the link is printed below
  }
}

await connect()
let port = PORT
// Another copy already running (or another program on the port): use the next free one.
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE' || port >= PORT + 10) throw e
  server.listen(++port, '127.0.0.1')
})
server.listen(port, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${port}/#token=${TOKEN}`
  console.log(`\nForza! Coach (${LOCAL ? 'local stack' : (ctx?.url ?? 'not set up yet')})\n→ ${link}\n\nOnly this computer can reach it. Keep this window open; close it (or press Ctrl+C) to stop.\n`)
  if (!process.argv.includes('--no-open')) openBrowser(link)
})
