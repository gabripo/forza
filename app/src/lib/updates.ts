// New versions of the app. A phone keeps the app open in the background for days (an iPhone above all) and looks
// for a new version only when the app starts from scratch: here it also looks each time the app comes back to the
// screen. The new version takes over at once only on a tab's first page, where nothing is being typed; elsewhere it
// waits for the next such page, so no meal or workout half entered is lost.
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

const SAFE = new Set(['/', '/train', '/check', '/food', '/learn'])
// Not more than one look a minute.
const EVERY = 60_000

let waiting = false

/** A tab's first page, not reached right after saving something (a meal just saved still has a question to ask). */
function onSafePage(): boolean {
  const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/'
  const state = (window.history.state as { usr?: unknown } | null)?.usr
  return SAFE.has(path) && state == null
}

function reloadIfSafe() {
  if (waiting && onSafePage()) window.location.reload()
}

export function startUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      let last = Date.now()
      const look = () => {
        if (!navigator.onLine || Date.now() - last < EVERY) return
        last = Date.now()
        registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        reloadIfSafe()
        look()
      })
      setInterval(look, 60 * EVERY)
    },
    // The new version is in place: the page shown is still the old one until it reloads.
    onNeedReload() {
      waiting = true
      reloadIfSafe()
    },
  })
}

/** Inside the router: a new version waiting takes over on the next safe page. */
export function useUpdateOnSafePage() {
  const location = useLocation()
  useEffect(() => {
    reloadIfSafe()
  }, [location])
}
