// Installs and updates the Forza! server (a Supabase project) through the Supabase Management API.
// It does what the Supabase CLI would do (database migrations, server functions, settings) without
// needing the CLI or Docker, so it works the same on macOS, Windows and Linux.
//
// The access token comes from https://supabase.com/dashboard/account/tokens and is kept in the
// system password store (lib/secrets.mjs).
import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://api.supabase.com/v1'
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const FUNCTIONS = ['food-estimate', 'food-search', 'health-ingest', 'bws-ingest']

export class Management {
  constructor(token) {
    this.token = token
  }

  async request(method, path, body, { form } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    })
    const text = await res.text()
    if (!res.ok) {
      let message = text
      try {
        message = JSON.parse(text).message ?? text
      } catch {
        // plain text error
      }
      throw Object.assign(new Error(`Supabase ${res.status}: ${String(message).slice(0, 300)}`), { status: res.status === 401 ? 401 : 502 })
    }
    return text ? JSON.parse(text) : null
  }

  organizations = () => this.request('GET', '/organizations')
  projects = () => this.request('GET', '/projects')
  project = (ref) => this.request('GET', `/projects/${ref}`)
  apiKeys = (ref) => this.request('GET', `/projects/${ref}/api-keys?reveal=true`)
  sql = (ref, query) => this.request('POST', `/projects/${ref}/database/query`, { query })
  authConfig = (ref) => this.request('GET', `/projects/${ref}/config/auth`)
  updateAuthConfig = (ref, patch) => this.request('PATCH', `/projects/${ref}/config/auth`, patch)
  secretNames = async (ref) => (await this.request('GET', `/projects/${ref}/secrets`)).map((s) => s.name)
  deleteSecrets = (ref, names) => this.request('DELETE', `/projects/${ref}/secrets`, names)
  setSecrets = (ref, values) =>
    this.request('POST', `/projects/${ref}/secrets`, Object.entries(values).map(([name, value]) => ({ name, value })))
  functions = (ref) => this.request('GET', `/projects/${ref}/functions`)
  deleteFunction = (ref, slug) => this.request('DELETE', `/projects/${ref}/functions/${slug}`)

  /** A new free project. The database password is random: Forza! never needs it. */
  async createProject({ name, organization, region }) {
    return this.request('POST', '/projects', {
      name,
      organization_slug: organization,
      db_pass: randomBytes(24).toString('base64url'),
      region_selection: { type: 'smartGroup', code: region },
    })
  }

  /** Deploys one server function from supabase/functions/<slug>, with the files it imports. */
  async deployFunction(ref, slug, { as = slug } = {}) {
    const entry = join(REPO, 'supabase', 'functions', slug, 'index.ts')
    const files = await importedFiles(entry)
    const rel = (f) => relative(REPO, f).split(sep).join(posix.sep)
    const form = new FormData()
    form.append('metadata', JSON.stringify({ name: as, entrypoint_path: rel(entry), verify_jwt: false }))
    for (const f of files) form.append('file', new Blob([await readFile(f)], { type: 'application/typescript' }), rel(f))
    return this.request('POST', `/projects/${ref}/functions/deploy?slug=${encodeURIComponent(as)}`, null, { form })
  }
}

/** The entry file plus every local file it imports (relative imports only), recursively. */
async function importedFiles(entry, seen = new Set()) {
  if (seen.has(entry)) return seen
  seen.add(entry)
  const code = await readFile(entry, 'utf8')
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    await importedFiles(join(dirname(entry), m[1]), seen)
  }
  return seen
}

/** Region group from the computer's time zone: the server ends up close to the family. */
export function regionForTimeZone(tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '') {
  if (/^(America|US|Canada|Brazil|Chile|Mexico)\//.test(tz)) return 'americas'
  if (/^(Asia|Australia|Pacific|Indian)\//.test(tz)) return 'apac'
  return 'emea'
}

export async function localMigrations() {
  const dir = join(REPO, 'supabase', 'migrations')
  const names = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
  return Promise.all(
    names.map(async (file) => ({ version: file.split('_')[0], name: file.replace(/^\d+_/, '').replace(/\.sql$/, ''), sql: await readFile(join(dir, file), 'utf8') })),
  )
}

/** Same bookkeeping table as the Supabase CLI, so both tools can be used on one project. */
const HISTORY = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`

const dollar = (text) => {
  let tag = 'forza'
  while (text.includes(`$${tag}$`)) tag += '_'
  return `$${tag}$${text}$${tag}$`
}

/** Applies the migrations the project does not have yet, each one atomically. */
export async function migrate(mgmt, ref, onStep = () => {}) {
  await mgmt.sql(ref, HISTORY)
  const applied = new Set((await mgmt.sql(ref, 'select version from supabase_migrations.schema_migrations')).map((r) => r.version))
  const todo = (await localMigrations()).filter((m) => !applied.has(m.version))
  for (const m of todo) {
    onStep(`Database: ${m.name.replaceAll('_', ' ')}`)
    // One request = one transaction: the change and its bookkeeping row land together, or neither does.
    await mgmt.sql(
      ref,
      `${m.sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${dollar(m.version)}, ${dollar(m.name)}, array[${dollar(m.sql)}]);`,
    )
  }
  return todo.map((m) => m.version)
}

/**
 * Brings a project up to date with this copy of Forza!: database, functions, sign-in settings,
 * optional AI key. Safe to run again after updating Forza!.
 */
export async function install(mgmt, ref, { appUrl, geminiKey, onStep = () => {} }) {
  onStep('Waiting for the project to be ready')
  for (let i = 0; ; i++) {
    const p = await mgmt.project(ref)
    if (p.status === 'ACTIVE_HEALTHY') break
    if (i > 90) throw new Error(`The project is not ready (status ${p.status}). Try again in a few minutes.`)
    await new Promise((r) => setTimeout(r, 5000))
  }

  onStep('Database')
  const applied = await migrate(mgmt, ref, onStep)

  for (const slug of FUNCTIONS) {
    onStep(`Server function: ${slug}`)
    await mgmt.deployFunction(ref, slug)
  }

  onStep('Sign-in settings')
  const auth = await mgmt.authConfig(ref)
  const allow = new Set(String(auth.uri_allow_list ?? '').split(',').filter(Boolean))
  if (appUrl) allow.add(appUrl)
  await mgmt.updateAuthConfig(ref, {
    // Only the coach creates accounts.
    disable_signup: true,
    // Setup codes (one-time sign-in links) stay valid for 24 hours.
    mailer_otp_exp: 86400,
    ...(appUrl ? { site_url: appUrl, uri_allow_list: [...allow].join(',') } : {}),
  })

  if (geminiKey) {
    onStep('Food photo AI key')
    await mgmt.setSecrets(ref, { GEMINI_API_KEY: geminiKey })
  }

  onStep('Keys')
  const keys = await mgmt.apiKeys(ref)
  const pick = (type, legacy) => keys.find((k) => k.type === type)?.api_key ?? keys.find((k) => k.name === legacy)?.api_key
  const secret = pick('secret', 'service_role')
  const publishable = pick('publishable', 'anon')
  if (!secret || /[^\x20-\x7e]|·/.test(secret)) throw new Error('Supabase did not return the secret key.')
  return { url: `https://${ref}.supabase.co`, secret, publishable, applied }
}
