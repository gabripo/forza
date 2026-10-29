// One Build With Science import, from the phone to the person's Forza! account.
// Used by the Coach dashboard and by `node cli.mjs bws`.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importHistory } from '../../shared/history-import.mjs'
import { Device, findAdb } from './adb.mjs'
import { convert } from './bws-convert.mjs'
import { BwsExtractor, monthsSince } from './bws-extract.mjs'
import { configDir } from './secrets.mjs'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CATALOGUE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'src', 'data', 'exercises.json')

export const rawFile = (userId) => join(configDir(), `bws-${userId}.json`)
export const historyFile = (userId) => join(configDir(), `forza-history-${userId}.json`)

/**
 * @param {object} o
 * @param {import('@supabase/supabase-js').SupabaseClient} o.db  service-role client
 * @param {string} o.userId
 * @param {'new' | 'all'} [o.since]  'new': skip workouts already in Forza!
 * @param {string | null} [o.serial]  which phone, when several are connected
 * @param {boolean} [o.saveOnly]  only write the file (configDir/forza-history-<id>.json)
 */
export async function runBwsImport({ db, userId, since = 'new', serial = null, plan = true, profile = true, saveOnly = false, log = console.log, signal }) {
  const adb = await findAdb()
  if (!adb) throw new Error('adb is not installed: use "Download Android tools" first.')
  const device = await new Device(adb, serial).init()
  log(`Phone screen ${device.width}×${device.height}, ${device.density} dpi`)
  const x = new BwsExtractor(device, { onLog: log, signal })

  // What was read before stays on this computer, so a stopped run continues where it was.
  let raw = { sessions: [] }
  try {
    raw = JSON.parse(await readFile(rawFile(userId), 'utf8'))
  } catch {
    // first run for this person
  }
  const saveRaw = async () => {
    await mkdir(configDir(), { recursive: true })
    await writeFile(rawFile(userId), JSON.stringify(raw), { mode: 0o600 })
  }

  await x.launch()
  if (profile) raw.profile = await x.profile()
  if (plan) {
    const previous = raw.plan
    raw.plan = await x.plan()
    // A day already done this week shows no preview: keep the one read on an earlier run, if any.
    for (const w of raw.plan.workouts) w.exercises ??= previous?.workouts?.find((p) => p.name === w.name)?.exercises ?? null
  }
  await saveRaw()

  const known = new Set(raw.sessions.map((s) => `${s.name.trim()}|${s.date}`))
  let from = null
  if (since === 'new') {
    // Workouts already in Forza! (imported earlier, maybe from another computer) are skipped too.
    const { data: rows, error } = await db.from('workout_sessions').select('name, started_at').eq('user_id', userId).eq('source', 'import')
    if (error) throw new Error(error.message)
    for (const r of rows) {
      const d = new Date(r.started_at)
      known.add(`${r.name.trim()}|${MON[d.getMonth()]} ${d.getDate()}`)
      if (!from || d > from) from = d
    }
  }
  const fresh = []
  await x.history({
    months: monthsSince(from),
    until: from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null,
    known,
    onSession: async (s) => {
      raw.sessions.push(s)
      fresh.push(s)
      await saveRaw()
    },
  })

  const catalogue = JSON.parse(await readFile(CATALOGUE, 'utf8'))
  // The plan needs recent history (set counts, workouts done this week): use what Forza! already has,
  // since this computer may not have read the older workouts itself.
  const knownSessions = await recentSessions(db, userId)
  const file = convert(raw, catalogue, { knownSessions })
  await writeFile(historyFile(userId), JSON.stringify(file, null, 1), { mode: 0o600 })
  log(`Read ${file.sessions.length} workouts and ${file.templates.length} plan workouts`)
  if (saveOnly) return { file: historyFile(userId), sessions: file.sessions.length }
  // "New only" sends just the workouts read now; the plan only when it was read now.
  const freshIds = new Set(convert({ sessions: fresh }, catalogue).sessions.map((s) => s.id))
  const upload = since === 'new' ? { ...file, sessions: file.sessions.filter((s) => freshIds.has(s.id)), templates: plan ? file.templates : [] } : file
  if (!profile) delete upload.profile
  // A workout rebuilt from history never replaces one already in the plan (it would lose supersets).
  if (upload.templates.some((t) => t.fromHistory)) {
    const { data: existing } = await db.from('workout_templates').select('name').eq('user_id', userId).eq('archived', false)
    const names = new Set((existing ?? []).map((t) => t.name))
    upload.templates = upload.templates.filter((t) => !t.fromHistory || !names.has(t.name))
  }
  log(`Importing into Forza! (${upload.sessions.length} workouts${upload.templates.length ? ', the plan' : ''})`)
  const result = await importHistory(db, userId, upload, { byCoach: true, onProgress: log })
  log(`Done: ${result.sessions} workouts, ${result.sets} sets, ${result.templates} plan workouts`)
  return result
}

/** The person's last 90 days of workouts in Forza!, in forza-history format. */
async function recentSessions(db, userId) {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: sessions } = await db.from('workout_sessions').select('id, name, started_at').eq('user_id', userId).gte('started_at', since)
  if (!sessions?.length) return []
  const sets = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('set_logs').select('session_id, exercise_id, is_warmup, reps, duration_s, weight_kg').eq('user_id', userId).gte('performed_at', since).order('id').range(from, from + 999)
    sets.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return sessions.map((s) => ({ ...s, sets: sets.filter((x) => x.session_id === s.id) }))
}
