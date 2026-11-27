// Staying signed in. The sign-in itself is a token that changes every hour; an iPhone can lose the last change it
// saved, and the server then ends the sign-in (it takes the older token for a stolen one). So each phone also keeps
// a key of its own, made once when it signs in and never changed: with it the app signs in again by itself, instead
// of asking the family coach for a new code. Only the key's hash is on the server; signing out makes it useless.
import { serverKey, serverUrl, supabase } from './supabase'

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

function newKey(): string {
  return 'fd_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Forza! opened in Safari on an iPhone or iPad, not from its icon on the Home Screen (which keeps a sign-in of its own). */
export function iosBrowser(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone()
}

function standalone(): boolean {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone)
}

/** A short name for the phone, for the coach: "iPhone", "Android", … */
function deviceName(): string {
  const ua = navigator.userAgent
  const kind = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Browser'
  const app = standalone() ? 'app' : 'browser'
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
  const key = newKey()
  const { error } = await supabase.rpc('remember_device', { p_hash: await sha256Hex(key), p_device: deviceName() })
  if (error) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, user: userId, server: serverUrl } satisfies Saved))
  } catch {
    // storage blocked: the phone simply cannot sign in again by itself
    return
  }
  // A key that came from Safari (signInWithDeviceKey): used, and now replaced by this phone's own.
  if (s?.user === '') await supabase.rpc('forget_device', { p_hash: await sha256Hex(s.key) }).then(
    () => {},
    () => {},
  )
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

/**
 * Signed in in Safari on an iPhone, the Forza! icon on the Home Screen still asks for a code: a link that signs the
 * icon in with a key made here, for the person signed in. Null when the server cannot be reached.
 */
export async function appCodeLink(name: string): Promise<string | null> {
  const key = newKey()
  const { error } = await supabase.rpc('remember_device', { p_hash: await sha256Hex(key), p_device: `${deviceName()} → app` })
  if (error) return null
  const q = new URLSearchParams({ u: serverUrl, k: serverKey, d: key, n: name })
  return `${location.origin}${location.pathname}#/welcome?${q}`
}

/**
 * Signs in with a key from appCodeLink. It is kept without a person: once signed in, this phone makes a key of its
 * own (rememberDevice), and the one that came through the clipboard is then forgotten, so it works only once.
 */
export async function signInWithDeviceKey(key: string): Promise<'done' | 'offline' | 'refused'> {
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, user: '', server: serverUrl } satisfies Saved))
  } catch {
    return 'offline'
  }
  return signInAgain()
}
