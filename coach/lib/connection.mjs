// The Forza! server this computer manages: its address and keys from the password store.
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'
import { getConfig, getSecret } from './secrets.mjs'

export const DEFAULT_APP_URL = 'https://gabripo.github.io/forza/'
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** { url, key, publishable, ref, appUrl, db }, or null when Forza! is not set up yet. */
export async function loadConnection({ local = false } = {}) {
  let conf
  if (local) {
    // Public demo keys printed by `supabase status` for the local stack only.
    const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: REPO, encoding: 'utf8' }))
    conf = { url: status.API_URL, key: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY, publishable: status.PUBLISHABLE_KEY ?? status.ANON_KEY, ref: null, appUrl: 'http://localhost:5173/' }
  } else {
    const [url, key, config] = await Promise.all([getSecret('supabase-url'), getSecret('service-role-key'), getConfig()])
    if (!url || !key) return null
    conf = { url, key, publishable: config.publishable ?? null, ref: config.ref ?? url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null, appUrl: config.appUrl ?? DEFAULT_APP_URL }
  }
  // `ws` gives Node 20 the WebSocket that supabase-js expects (Node 22+ has it built in).
  const db = createClient(conf.url, conf.key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } })
  return { ...conf, db }
}
