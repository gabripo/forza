// Setup codes: Forza! Coach shows a QR code (or a link) that contains
//   - the family's server address and its public key,
//   - a one-time sign-in token (valid 24 hours, usable once),
// so the person is signed in without typing an email or a password.
// Everything sits after "#", which browsers never send to any server.
import { SERVER_KEY, serverKey, serverUrl, supabase } from './supabase'

export interface ConnectCode {
  url: string
  key: string
  token: string | null
  name: string | null
}

const PENDING = 'forza.pendingSignIn'

/** Reads a setup link ("https://…/forza/#/welcome?u=…&k=…&t=…") or just its "#/welcome?…" part. */
export function parseConnect(text: string): ConnectCode | null {
  const hash = text.slice(text.indexOf('#') + 1)
  if (!hash.startsWith('/welcome?')) return null
  const q = new URLSearchParams(hash.slice('/welcome?'.length))
  const url = q.get('u') ?? ''
  const key = q.get('k') ?? ''
  try {
    const u = new URL(url)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !local) return null
  } catch {
    return null
  }
  if (!/^[\w.-]{20,}$/.test(key)) return null
  const token = q.get('t')
  return { url: url.replace(/\/$/, ''), key, token: token && /^[\w-]{20,}$/.test(token) ? token : null, name: q.get('n') }
}

export function sameServer(c: ConnectCode): boolean {
  return c.url === serverUrl && c.key === serverKey
}

/**
 * Switches to the code's server (reloading the app) and/or signs in with its token.
 * Returns an error code, or null when done.
 */
export async function applyConnectCode(c: ConnectCode): Promise<'expired' | null> {
  const home = `${location.pathname}${location.search}#/`
  if (!sameServer(c)) {
    try {
      localStorage.setItem(SERVER_KEY, JSON.stringify({ url: c.url, key: c.key }))
      // A session from another server is useless here.
      localStorage.removeItem('forza.auth')
      if (c.token) sessionStorage.setItem(PENDING, c.token)
    } catch {
      // storage blocked: nothing we can do
    }
    location.replace(home)
    location.reload()
    return null
  }
  if (c.token) {
    const err = await signInWithToken(c.token)
    if (err) return err
  }
  location.replace(home)
  return null
}

async function signInWithToken(token: string): Promise<'expired' | null> {
  await supabase.auth.signOut({ scope: 'local' })
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' })
  return error ? 'expired' : null
}

/** After switching servers the app reloads; the sign-in then finishes here. */
export async function finishPendingSignIn(): Promise<'expired' | null> {
  let token: string | null = null
  try {
    token = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
  } catch {
    return null
  }
  return token ? signInWithToken(token) : null
}
