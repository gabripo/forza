#!/usr/bin/env node
// Forza! Coach from the command line, for advanced users and computers without a browser.
// Does the same as the dashboard (same code). Run `node cli.mjs help`.
import { setTimeout as sleep } from 'node:timers/promises'
import { runBwsImport } from './lib/bws-job.mjs'
import { DEFAULT_APP_URL, loadConnection } from './lib/connection.mjs'
import { install, Management } from './lib/project.mjs'
import { getSecret, setConfig, setSecret, store } from './lib/secrets.mjs'

const HELP = `Forza! Coach command line

  node cli.mjs install <project-ref> [--app-url URL]
      Installs or updates Forza! on a Supabase project (database, functions, sign-in settings)
      and stores its keys in this computer's password store. Needs a Supabase access token:
      SUPABASE_ACCESS_TOKEN=sbp_… (or one saved earlier by the dashboard).
      Optional: GEMINI_API_KEY=… to set the food photo AI key at the same time.

  node cli.mjs status
  node cli.mjs people
  node cli.mjs bws <email> [--all] [--save-only] [--serial SERIAL]
      Reads Build With Science from the phone connected with USB (ADB) and imports it.
      --all: everything from the last 12 months (default: only workouts not imported yet).
      --save-only: write the forza-history file without importing it.

Add --local to use the local "supabase start" stack.`

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const [command, target] = args.filter((a, i) => !a.startsWith('--') && !['--app-url', '--serial'].includes(args[i - 1]))
const local = flag('--local')

async function connection() {
  const c = await loadConnection({ local })
  if (!c) throw new Error('Forza! is not set up on this computer yet: run "node cli.mjs install <project-ref>" or open the dashboard.')
  return c
}

async function userByEmail(db, email) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const u = data.users.find((x) => x.email?.toLowerCase() === String(email).toLowerCase())
  if (!u) throw new Error(`No account with email ${email}`)
  return u
}

switch (command) {
  case 'install': {
    if (!target) throw new Error('Missing project ref (the abcd1234 in https://abcd1234.supabase.co)')
    const token = process.env.SUPABASE_ACCESS_TOKEN ?? (await getSecret('supabase-access-token'))
    if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)')
    const appUrl = (option('--app-url') ?? DEFAULT_APP_URL).replace(/\/?$/, '/')
    const r = await install(new Management(token), target, { appUrl, geminiKey: process.env.GEMINI_API_KEY ?? null, onStep: (s) => console.log(`→ ${s}`) })
    await setSecret('supabase-url', r.url)
    await setSecret('service-role-key', r.secret)
    await setConfig({ ref: target, publishable: r.publishable, appUrl })
    console.log(`✓ Forza! is ready on ${r.url} (keys saved in: ${store})`)
    break
  }
  case 'status': {
    const c = await loadConnection({ local })
    console.log(c ? `Server: ${c.url}\nApp: ${c.appUrl}\nKeys in: ${store}` : 'Not set up yet.')
    break
  }
  case 'people': {
    const { db } = await connection()
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
    const { data: profiles } = await db.from('profiles').select('id, display_name, onboarded_at')
    for (const u of data.users) {
      const p = profiles.find((x) => x.id === u.id)
      console.log(`${(p?.display_name || '—').padEnd(20)} ${u.email}${p?.onboarded_at ? '' : '  (set-up not done)'}`)
    }
    break
  }
  case 'bws': {
    const { db } = await connection()
    const user = await userByEmail(db, target)
    const controller = new AbortController()
    process.on('SIGINT', () => {
      console.log('\nStopping after the current step… (the part already read is kept)')
      controller.abort()
    })
    const r = await runBwsImport({
      db,
      userId: user.id,
      since: flag('--all') ? 'all' : 'new',
      serial: option('--serial'),
      saveOnly: flag('--save-only'),
      log: (line) => console.log(`${new Date().toLocaleTimeString('en-GB')}  ${line}`),
      signal: controller.signal,
    })
    console.log(r)
    await sleep(100)
    break
  }
  default:
    console.log(HELP)
}
process.exit(0)
