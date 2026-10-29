// Automatic Build With Science sync: while Forza! Coach runs, it looks every minute for the phones
// that have automatic sync turned on (connected with USB or Wi-Fi debugging). When one has been left
// unlocked and untouched for a few minutes, it imports the new workouts, then goes back to the home
// screen. A notification on the phone says what is happening; touching the phone stops it.
import { Device, findAdb } from './adb.mjs'
import { getConfig, setConfig } from './secrets.mjs'

const IDLE_MS = 3 * 60_000
const RETRY_MS = 10 * 60_000
const PLAN_EVERY_MS = 24 * 3600_000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TEXT = {
  en: {
    start: 'Importing your new Build With Science workouts into Forza!. Please leave the phone for a minute.',
    done: (n) => (n ? `Forza!: ${n} new workout${n === 1 ? '' : 's'} imported from Build With Science.` : 'Forza! is up to date with Build With Science.'),
  },
  it: {
    start: 'Sto importando i nuovi allenamenti di Build With Science in Forza!. Lascia il telefono per un minuto.',
    done: (n) => (n ? `Forza!: ${n} ${n === 1 ? 'nuovo allenamento importato' : 'nuovi allenamenti importati'} da Build With Science.` : 'Forza! è aggiornato con Build With Science.'),
  },
}

export async function autoSyncSettings() {
  return (await getConfig()).autoSync ?? {}
}

/** Turns automatic sync on or off for one person; `patch` keeps fields not given. */
export async function saveAutoSync(userId, patch) {
  const all = await autoSyncSettings()
  const next = { ...all, [userId]: { everyHours: 3, plan: true, ...all[userId], ...patch } }
  if (patch === null) delete next[userId]
  await setConfig({ autoSync: next })
  return next[userId] ?? null
}

/**
 * One check. `startJob(kind, run)` runs the import as a Coach job (so its log is visible);
 * `runImport(options)` does the import itself; `busy()` says whether an import is already running.
 */
export async function autoSyncTick({ db, busy, startJob, runImport }) {
  if (!db || busy()) return
  const settings = Object.entries(await autoSyncSettings()).filter(([, a]) => a.enabled && a.serial)
  if (!settings.length) return
  const adb = await findAdb()
  if (!adb) return
  for (const d of await Device.list(adb)) {
    if (d.state !== 'device') continue
    const device = new Device(adb, d.serial)
    const match = settings.find(([, a]) => a.serial === d.serial || d.serial.includes(a.serial))
    const hw = match ? match[1].serial : await device.hardwareSerial().catch(() => '')
    const entry = match ?? settings.find(([, a]) => a.serial === hw)
    if (!entry) continue
    const [userId, a] = entry
    const now = Date.now()
    if (a.lastRun && now - a.lastRun < (a.everyHours ?? 3) * 3600_000) continue
    if (a.lastAttempt && now - a.lastAttempt < RETRY_MS) continue
    const state = await device.readiness()
    if (!state.awake || state.locked || state.idleMs < IDLE_MS) continue

    await saveAutoSync(userId, { lastAttempt: now })
    const { data: profile } = await db.from('profiles').select('locale').eq('id', userId).maybeSingle()
    const text = TEXT[profile?.locale === 'it' ? 'it' : 'en']
    startJob('bws-auto', async (log, signal) => {
      try {
        log('Automatic sync: the phone is idle, starting')
        await device.notify(text.start)
        await sleep(8000)
        // Someone picked the phone up after the notice: try again later.
        if ((await device.readiness()).idleMs < 8000) throw new Error('The phone is being used: will try again later')
        const plan = !a.lastPlan || now - a.lastPlan > PLAN_EVERY_MS ? a.plan !== false : false
        const result = await runImport({ db, userId, since: 'new', serial: d.serial, plan, profile: false, log, signal })
        await device.shell('input', 'keyevent', 'KEYCODE_HOME')
        await device.notify(text.done(result.sessions))
        await saveAutoSync(userId, { lastRun: Date.now(), ...(plan ? { lastPlan: Date.now() } : {}), lastResult: `${result.sessions} new workouts`, lastError: null })
        return result
      } catch (e) {
        await saveAutoSync(userId, { lastError: e.message })
        throw e
      }
    }, { userId })
    return
  }
}
