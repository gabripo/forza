// Reads Build With Science on this phone with the same code Forza! Coach uses over a cable
// (bws-extract.mjs and bws-convert.mjs, copied here when the helper is built). Instead of ADB, the
// "device" is the helper's accessibility service, reached through window.ForzaBws (BwsSync.kt).
import { convert } from './bws-convert.mjs'
import { BwsExtractor, Stop, monthsSince } from './bws-extract.mjs'
import { sessionDate } from './bws-dates.mjs'

const bridge = window.ForzaBws
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** This phone, with the same methods as Coach's ADB Device (coach/lib/adb.mjs). */
class PhoneDevice {
  constructor() {
    Object.assign(this, JSON.parse(bridge.info()))
  }

  // Reference layout (1080×2400, 420 dpi) → this phone, as in adb.mjs.
  get k() {
    return this.density / 420
  }
  cx = () => Math.round(this.width / 2)
  left = (px) => Math.round(px * this.k)
  right = (px) => Math.round(this.width - (1080 - px) * this.k)
  top = (px) => Math.round(px * this.k)
  bottom = (px) => Math.round(this.height - (2400 - px) * this.k)

  async tap(x, y, wait = 1200) {
    bridge.tap(Math.round(x), Math.round(y))
    await sleep(wait)
  }

  async swipe(x1, y1, x2, y2, ms = 1400, wait = 1200) {
    bridge.swipe(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), Math.round(ms))
    await sleep(wait)
  }

  async back(wait = 1500) {
    bridge.back()
    await sleep(wait)
  }

  async launch(pkg) {
    bridge.launch(pkg)
  }

  async dump() {
    for (let i = 0; i < 6; i++) {
      // uiautomator waits for the screen to settle before reading it: so do we.
      await sleep(400)
      const nodes = bridge.dump()
      if (nodes) return JSON.parse(nodes)
      await sleep(1000)
    }
    throw new Error('Cannot read the phone screen (is it locked?)')
  }

  async screencap() {
    if (!bridge.screenshot()) throw new Error('Cannot take a screenshot of Build With Science.')
    return { rgb: (x, y) => JSON.parse(bridge.rgb(Math.round(x), Math.round(y))) }
  }

  async foreground() {
    return JSON.parse(bridge.foreground())
  }
}

async function run() {
  const c = JSON.parse(bridge.config())
  const log = (text) => bridge.log(String(text))
  const x = new BwsExtractor(new PhoneDevice(), { onLog: log, signal: { get aborted() { return bridge.cancelled() } } })

  // Workouts already in Forza! are skipped; dates as the history screen shows them, in this phone's time.
  const known = new Set()
  let from = null
  for (const r of c.imported ?? []) {
    const d = new Date(r.started_at)
    known.add(`${r.name.trim()}|${MON[d.getMonth()]} ${d.getDate()}`)
    if (!from || d > from) from = d
  }

  const raw = { sessions: [] }
  await x.launch()
  if (c.plan) {
    raw.profile = await x.profile()
    raw.plan = await x.plan()
    // A day already done this week shows no preview: keep the one read on an earlier run, if any.
    for (const w of raw.plan.workouts) w.exercises ??= c.previousPlan?.workouts?.find((p) => p.name === w.name)?.exercises ?? null
  }
  await x.history({
    months: monthsSince(from),
    until: from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null,
    known,
    onSession: (s) => {
      raw.sessions.push(s)
      bridge.progress(raw.sessions.length)
    },
  })

  // The food log, for the days Forza! does not have yet through Health Connect.
  if (c.food?.days) {
    const fromHealthConnect = new Set(c.food.hcDays ?? [])
    const iso = (label) => {
      const d = sessionDate(label)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    raw.food = await x.foodLog({
      days: c.food.days,
      skip: (label) => fromHealthConnect.has(iso(label)),
      // Build With Science's daily target, which the person can follow in Forza!.
      onTargets: (targets) => {
        raw.bwsTargets = targets
      },
    })
    raw.foodDays = raw.food.map((d) => iso(d.date))
  }

  // Converted here, in this phone's time zone, exactly as Coach does on the family computer.
  const catalogue = await (await fetch('exercises.json')).json()
  const file = convert(raw, catalogue, { knownSessions: c.recent ?? [] })
  const fresh = new Set(convert({ sessions: raw.sessions }, catalogue).sessions.map((s) => s.id))
  const upload = { ...file, sessions: file.sessions.filter((s) => fresh.has(s.id)), templates: c.plan ? file.templates : [], food_days: raw.foodDays ?? [], bws_targets: raw.bwsTargets ?? null }
  if (!c.plan) delete upload.profile
  return { file: upload, plan: raw.plan ?? null, read: raw.sessions.length }
}

run()
  .then((result) => bridge.done(JSON.stringify(result)))
  .catch((e) => bridge.fail(e instanceof Stop ? e.message : String(e?.message ?? e)))
