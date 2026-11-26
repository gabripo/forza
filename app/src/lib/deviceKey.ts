// Staying signed in. The sign-in itself is a token that changes every hour; an iPhone can lose the last change it
// saved, and the server then ends the sign-in (it takes the older token for a stolen one). So each phone also keeps
// a key of its own, made once when it signs in and never changed: with it the app signs in again by itself, instead
// of asking the family coach for a new code. Only the key's hash is on the server; signing out makes it useless.
import { serverUrl, supabase } from './supabase'

const KEY = 'forza.deviceKey'

interface Saved {
  key: string
  user: string
  server: string
}

function saved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    return s?.key && s.server === serverUrl ? s : null
  } catch {
    return null
  }
}

function drop() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing kept
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A short name for the phone, for the coach: "iPhone", "Android", … */
function deviceName(): string {
  const ua = navigator.userAgent
  const kind = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Browser'
  const app = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone ? 'app' : 'browser'
  return `${kind} ${app}`
}

/** True when this phone can sign in again by itself. */
export function hasDeviceKey(): boolean {
  return saved() !== null
}

let making: Promise<void> | null = null

/** Once signed in: this phone gets its key (once per person). Quietly does nothing offline or on an older server. */
export function rememberDevice(userId: string): Promise<void> {
  making ??= makeKey(userId).finally(() => {
    making = null
  })
  return making
}

async function makeKey(userId: string): Promise<void> {
  const s = saved()
  if (s?.user === userId) return
  const key = 'fd_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
  const { error } = await supabase.rpc('remember_device', { p_hash: await sha256Hex(key), p_device: deviceName() })
  if (error) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, user: userId, server: serverUrl } satisfies Saved))
  } catch {
    // storage blocked: the phone simply cannot sign in again by itself
  }
}

/** Signing out (or in as someone else): this phone's key stops working. Call it while still signed in. */
export async function forgetDevice(): Promise<void> {
  const s = saved()
  drop()
  if (!s) return
  await supabase.rpc('forget_device', { p_hash: await sha256Hex(s.key) }).then(
    () => {},
    () => {},
  )
}

/**
 * Signs in again with this phone's key. 'done', 'offline' (try again later: the key is kept) or 'refused' (the key
 * no longer works: it is dropped, a new code is needed).
 */
export async function signInAgain(): Promise<'done' | 'offline' | 'refused'> {
  const s = saved()
  if (!s) return 'refused'
  const { data, error: failed } = await supabase.functions.invoke<{ token_hash?: string }>('device-sign-in', { body: { key: s.key } })
  if (failed) {
    // An answer from the server that the key is unknown: a new code is needed. Anything else: try again later.
    const status = (failed as { context?: Response }).context?.status
    if (status === 401) {
      drop()
      return 'refused'
    }
    return 'offline'
  }
  const token_hash = data?.token_hash
  if (!token_hash) return 'offline'
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })
  return error ? 'offline' : 'done'
}
