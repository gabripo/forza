// Setup codes: Forza! Coach shows a QR code (or a link) that contains
//   - the family's server address and its public key,
//   - a one-time sign-in token (valid 24 hours, usable once),
// so the person is signed in without typing an email or a password.
// Everything sits after "#", which browsers never send to any server.
import { signInWithDeviceKey } from './deviceKey'
import { SERVER_KEY, serverKey, serverUrl, supabase } from './supabase'

export interface ConnectCode {
  url: string
  key: string
  token: string | null
  /** Instead of a token: a device key, from Forza! signed in in Safari on the same iPhone (appCodeLink). */
  device: string | null
  name: string | null
}

const PENDING = 'forza.pendingSignIn'
const PENDING_DEVICE = 'forza.pendingDevice'

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
  const device = q.get('d')
  return {
    url: url.replace(/\/$/, ''),
    key,
    token: token && /^[\w-]{20,}$/.test(token) ? token : null,
    device: device && /^fd_[0-9a-f]{64}$/.test(device) ? device : null,
    name: q.get('n'),
  }
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
      localStorage.removeItem('forza.deviceKey')
      if (c.token) sessionStorage.setItem(PENDING, c.token)
      if (c.device) sessionStorage.setItem(PENDING_DEVICE, c.device)
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
  } else if (c.device) {
    if ((await signInWithDeviceKey(c.device)) !== 'done') return 'expired'
  }
  location.replace(home)
  return null
}

async function signInWithToken(token: string): Promise<'expired' | null> {
  // The new sign-in takes the place of the one on the phone, if any, only when the code works: an expired code
  // leaves the person signed in. (If the code is someone else's, the app then makes a device key for them.)
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' })
  return error ? 'expired' : null
}

/** After switching servers the app reloads; the sign-in then finishes here. */
export async function finishPendingSignIn(): Promise<'expired' | null> {
  let token: string | null = null
  let device: string | null = null
  try {
    token = sessionStorage.getItem(PENDING)
    device = sessionStorage.getItem(PENDING_DEVICE)
    sessionStorage.removeItem(PENDING)
    sessionStorage.removeItem(PENDING_DEVICE)
  } catch {
    return null
  }
  if (token) return signInWithToken(token)
  if (device) return (await signInWithDeviceKey(device)) === 'done' ? null : 'expired'
  return null
}
