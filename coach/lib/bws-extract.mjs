// Reads a person's data from the Build With Science app on an Android phone connected with ADB:
// goal and settings, the weekly plan, and every logged workout with its sets and effort.
//
// Build With Science has no export, so this reads the screens like a person would, through
// Android's accessibility tree (uiautomator) and screenshots (for the coloured effort dots).
// It only taps rows that open or close, "Preview" and "Back": never "Start", "Edit" or
// "Change". The phone must stay unlocked with Build With Science in front; if anything else
// comes to the front, it stops.
//
// Tested on a Pixel 7 with Build With Science 3.23. The layout is scaled to other screens, but a
// new app version may move things: the extractor then stops with a clear message.

import { sessionDate } from './bws-convert.mjs'

const PACKAGE = 'com.bws.appv2'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HEADER_RE = /^(?<name>.+?), (?<date>[A-Z][a-z]{2} \d{1,2})(?:, (?<prs>\d+))?, .$/u
const EXERCISE_RE = /^(?<name>.+?), (?<sets>\d+) sets?(?:, .)?$/u
const ICONS = /[\ue000-\uf8ff\u{f0000}-\u{fffff}\ufffc]/gu
const IS_ICON = /^[\ue000-\uf8ff\u{f0000}-\u{fffff}]+$/u
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const FULL_DAY = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const cleanName = (name) => name.replace(ICONS, '').replace(/, ,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '')

export class Stop extends Error {}

export class BwsExtractor {
  /** @param {import('./adb.mjs').Device} device */
  constructor(device, { onLog = () => {}, signal } = {}) {
    this.d = device
    this.log = onLog
    this.signal = signal
  }

  async guard() {
    if (this.signal?.aborted) throw new Stop('Stopped.')
    const { locked, focus } = await this.d.foreground()
    if (locked) throw new Stop('The phone is locked. Unlock it (and keep it unlocked) and try again.')
    if (focus && !focus.startsWith(PACKAGE)) throw new Stop(`Another app came to the front (${focus}). Open Build With Science again and retry.`)
  }

  /** Visible nodes; `clip` drops rows half hidden under the top bar. */
  async nodes({ clip = false } = {}) {
    const all = await this.d.dump()
    return clip ? all.filter((n) => n.bottom - n.top >= 20 && n.top >= this.d.top(280)) : all
  }

  find(nodes, label) {
    return nodes.find((n) => n.label === label || n.label.startsWith(`${label},`))
  }

  async tapNode(n, wait) {
    if (/\b(start|edit|change|delete|remove|skip|log)\b/i.test(n.label)) throw new Stop(`Refusing to tap "${n.label}"`)
    await this.d.tap(n.x, n.y, wait)
  }

  /** Content moves up by `dy` device pixels (negative: down). */
  async scroll(dy) {
    await this.guard()
    const d = this.d
    const start = dy > 0 ? d.bottom(1900) : d.top(500)
    const end = dy > 0 ? Math.max(d.top(350), start - dy) : Math.min(d.bottom(2050), start - dy)
    await d.swipe(d.cx(), start, d.cx(), end)
  }

  async scrollToTop() {
    for (let i = 0; i < 6; i++) await this.d.swipe(this.d.cx(), this.d.top(600), this.d.cx(), this.d.bottom(2000), 150, 150)
    await sleep(1000)
  }

  /** Restarts the app (like swiping it away), so it opens on its home screen: some screens never settle enough to be read. */
  async launch() {
    await this.d.shell('am', 'force-stop', PACKAGE)
    await sleep(1000)
    await this.d.shell('monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1')
    await sleep(7000)
    await this.guard()
  }

  async tab(name) {
    for (let i = 0; i < 4; i++) {
      const tabNode = (await this.nodes()).find((n) => n.label === name && n.click && n.y > this.d.bottom(2150))
      if (tabNode) return this.tapNode(tabNode, 2500)
      await this.d.back()
    }
    throw new Stop(`Cannot find the "${name}" tab. Is Build With Science open on its main screen?`)
  }

  /** Scrolls down until a node with this label shows up. */
  async scrollTo(label, tries = 6) {
    for (let i = 0; i < tries; i++) {
      const n = this.find(await this.nodes(), label)
      if (n && n.y < this.d.bottom(2150)) return n
      await this.scroll(this.d.top(900))
    }
    throw new Stop(`Cannot find "${label}" in Build With Science.`)
  }

  // -------------------------------------------------------------------------
  // Goal and settings
  // -------------------------------------------------------------------------

  async profile() {
    this.log('Reading goal and settings')
    await this.tab('Progress')
    await this.scrollToTop()
    const nodes = await this.nodes()
    const out = {}
    const goalTitle = this.find(nodes, 'CURRENT GOAL')
    if (goalTitle) out.goal = nodes.find((n) => n.y > goalTitle.y && n.y - goalTitle.y < this.d.top(120) && Math.abs(n.x - goalTitle.x) < 60)?.label ?? null
    out.pace = nodes.find((n) => /kgs?\/week|lbs?\/week/.test(n.label))?.label ?? null
    const started = this.find(nodes, 'Started')
    if (started) {
      const row = nodes.filter((n) => Math.abs(n.y - started.y) < 20).sort((a, b) => a.x - b.x)
      out.started = row.map((n) => n.label).join(' ')
    }
    // Settings: Profile icon (top right) → Settings.
    const icon = nodes.filter((n) => n.y < this.d.top(300) && n.x > this.d.right(900)).sort((a, b) => b.x - a.x)[0]
    if (icon) {
      await this.d.tap(icon.x, icon.y, 2500)
      const settings = this.find(await this.nodes(), 'Settings')
      if (settings) await this.tapNode(settings, 2000)
      // The settings page is long: the program and the step target are near the end.
      for (let i = 0; i < 10; i++) {
        const ns = await this.nodes()
        const steps = ns.find((n) => n.label.startsWith('Daily Steps Target,'))
        const programs = ns.filter((n) => /^(Beginner|Intermediate|Advanced)/.test(n.label) && n.click)
        if (programs.length) {
          // The selected program has a different icon from the others.
          const glyph = (p) => ns.find((n) => Math.abs(n.y - p.y) < 30 && n.x > this.d.right(850) && IS_ICON.test(n.label))?.label
          const glyphs = programs.map(glyph)
          const odd = programs.find((p, i) => glyphs.filter((g) => g === glyphs[i]).length === 1)
          if (odd) out.program = odd.label.split(',')[0]
        }
        if (steps) {
          out.steps = Number(steps.label.match(/(\d[\d,]*)/)?.[1].replace(/,/g, ''))
          break
        }
        await this.scroll(this.d.top(900))
      }
      await this.d.back()
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Weekly plan
  // -------------------------------------------------------------------------

  async plan() {
    this.log('Reading the weekly plan')
    await this.tab('Workout')
    await this.scrollToTop()
    const program = (await this.nodes()).find((n) => n.y < this.d.top(300) && n.click)?.label.split(', ').pop() ?? null
    // Collapse an opened day (usually today) so every day looks the same.
    const opened = (await this.nodes()).find((n) => n.label.startsWith('Collapse ') && n.click)
    if (opened) await this.d.tap(opened.x, opened.y, 1500)

    const schedule = {}
    const workouts = []
    for (const day of DAYS) {
      await this.guard()
      let nodes = await this.nodes()
      let dayNode = nodes.find((n) => n.label === day && n.x < this.d.left(150))
      for (let i = 0; !dayNode && i < 3; i++) {
        await this.scroll(this.d.top(500))
        nodes = await this.nodes()
        dayNode = nodes.find((n) => n.label === day && n.x < this.d.left(150))
      }
      if (!dayNode) throw new Stop(`Cannot find ${day} in the weekly schedule.`)
      const row = nodes.find((n) => n.click && Math.abs(n.y - dayNode.y) < 40 && n.x > this.d.left(400) && n.x < this.d.right(800))
      const tokens = (row?.label ?? '').split(', ').map(cleanName).filter(Boolean)
      const name = tokens.find((t) => !/^(Complete|Completed|Missed|Skipped|Upcoming|Rest Day|Today|\d+ more( activities)?|.* of activity|Start .*)$/i.test(t))
      if (!row || !name || tokens.includes('Rest Day')) {
        schedule[day.toLowerCase()] = 'rest'
        continue
      }
      schedule[day.toLowerCase()] = name
      if (workouts.some((w) => w.name === name)) continue
      // Open the day (tap its left part, far from the Start button), then its "Preview" button
      // ("Preview Workout" for days still to come). Days already done show "Review" (the session)
      // instead: their plan is rebuilt from the history.
      await this.d.tap(this.d.left(300), row.y, 2000)
      const button = async () => {
        const ns = await this.nodes()
        const open = ns.find((n) => n.label.startsWith(`Collapse ${FULL_DAY[day]}`) && n.click)
        return ns
          .filter((n) => /^(Preview|Review)/.test(n.label) && n.click && n.y < this.d.bottom(2150) && (!open || (n.y > open.y && n.y < open.y + this.d.top(700))))
          .sort((a, b) => a.y - b.y)[0]
      }
      let found = await button()
      if (!found) {
        // the opened day is near the bottom: bring its content into view
        await this.scroll(this.d.top(700))
        found = await button()
      }
      const preview = found?.label.startsWith('Preview') ? found : null
      if (!preview) {
        this.log(`  ${day} ${name}: done this week, the plan will come from the history`)
        workouts.push({ name, exercises: null })
      } else {
        await this.tapNode(preview, 3000)
        workouts.push({ name, exercises: await this.readPreview() })
        await this.d.back(2000)
        this.log(`  ${day} ${name}: ${workouts.at(-1).exercises.length} exercises`)
      }
      const collapse = (await this.nodes()).find((n) => n.label.startsWith('Collapse ') && n.click)
      if (collapse) await this.d.tap(collapse.x, collapse.y, 1500)
    }
    return { program, schedule, workouts }
  }

  /** Exercise rows of a workout preview: "Name, 7 sets • , 8-12 reps" and supersets. */
  async readPreview() {
    const rows = []
    const seen = new Set()
    let superset = 0
    let lastSets = 0
    for (let pass = 0; pass < 8; pass++) {
      const nodes = (await this.nodes({ clip: true })).filter((n) => n.click && Math.abs(n.x - this.d.cx()) < 6).sort((a, b) => a.y - b.y)
      let added = 0
      for (const n of nodes) {
        // rows seen on the previous screenful come back after scrolling
        if (seen.has(n.label)) continue
        const parts = n.label.split(', ').map(cleanName).filter(Boolean)
        const head = parts[0] ?? ''
        const ss = head.match(/^(\d+) SETS? • SUPERSET/i)
        let ex
        if (ss) {
          superset++
          lastSets = Number(ss[1])
          ex = { bws: parts[1], sets: lastSets, reps: parts[2] ?? '', superset }
        } else if (/ sets? •$/.test(parts[1] ?? '')) {
          ex = { bws: head, sets: Number(parts[1].match(/\d+/)[0]), reps: parts[2] ?? '' }
          lastSets = ex.sets
        } else if (parts.length === 2 && rows.length && rows.at(-1).superset) {
          // second exercise of a superset: same sets, same group
          ex = { bws: head, sets: lastSets, reps: parts[1], superset: rows.at(-1).superset }
        } else continue
        ex.reps = ex.reps.replace(/\s*reps?\b/i, '').trim()
        seen.add(n.label)
        rows.push(ex)
        added++
      }
      if (!added && pass > 0) break
      await this.scroll(this.d.top(900))
    }
    return rows
  }

  // -------------------------------------------------------------------------
  // Workout history
  // -------------------------------------------------------------------------

  async openHistory() {
    this.log('Opening Workout History')
    await this.tab('Progress')
    await this.scrollToTop()
    // The link sits inside the WORKOUTS card, which opens on tap.
    const card = (await this.nodes()).find((n) => n.label.startsWith('WORKOUTS,') && n.click)
    if (card && !this.find(await this.nodes(), 'See Full Workout Analysis')) await this.d.tap(card.x, card.y, 2000)
    await this.tapNode(await this.scrollTo('See Full Workout Analysis'), 3000)
    const all = this.find(await this.nodes(), 'See all')
    if (!all) throw new Stop('Cannot find "See all" under Recent Workouts.')
    await this.tapNode(all, 3000)
  }

  headers(nodes) {
    return nodes
      .filter((n) => n.click && Math.abs(n.x - this.d.cx()) < 6)
      .map((n) => ({ n, m: HEADER_RE.exec(n.label) }))
      .filter(({ n, m }) => m && !EXERCISE_RE.test(n.label))
      .map(({ n, m }) => ({ ...n, name: m.groups.name, date: m.groups.date, prs: m.groups.prs ?? null }))
  }

  async openMonth(month) {
    await this.scrollToTop()
    const later = MONTHS.indexOf(month) >= 7
    for (let i = 0; i < 5; i++) {
      const chip = (await this.nodes()).find((n) => n.label === month && n.click && n.y > this.d.top(440) && n.y < this.d.top(540))
      if (chip && chip.x > this.d.left(60) && chip.x < this.d.right(1020)) return this.d.tap(chip.x, chip.y, 2500)
      // move the chip bar: left for later months, right for earlier ones
      const y = this.d.top(488)
      if (later) await this.d.swipe(this.d.right(900), y, this.d.left(200), y, 400, 1000)
      else await this.d.swipe(this.d.left(200), y, this.d.right(900), y, 400, 1000)
    }
    return false
  }

  readSets(nodes, img, rowY, nextY) {
    const d = this.d
    const labels = nodes.filter((n) => Math.abs(n.x - d.left(160)) < 30 * d.k && n.y > rowY + d.top(60) && n.y < nextY - d.top(30) && n.label.length <= 3)
    return labels
      .filter((l) => l.label !== 'SET')
      .map((l) => ({
        set: l.label,
        value: nodes.find((n) => Math.abs(n.y - l.y) < 20 && n.x > d.left(300) && n.x < d.right(800))?.label ?? null,
        effort_rgb: img.rgb(d.right(920), l.y),
      }))
  }

  /** Opens one session, then each exercise in turn (the list is an accordion: one open at a time). */
  async session(h) {
    const d = this.d
    await this.guard()
    await d.tap(d.cx(), h.y)
    const findHdr = (nodes, near) => {
      const same = this.headers(nodes).filter((n) => n.name === h.name && n.date === h.date)
      return same.sort((a, b) => Math.abs(a.y - near) - Math.abs(b.y - near))[0] ?? null
    }
    let nodes
    let hdr
    for (let i = 0; ; i++) {
      if (i >= 6) throw new Stop(`Lost the session ${h.name} ${h.date}.`)
      nodes = await this.nodes({ clip: true })
      hdr = findHdr(nodes, h.y)
      if (hdr && hdr.y > d.top(300)) {
        // a session that was already open gets closed by the tap: open it again
        if (nodes.some((n) => n.label === 'Duration' && n.y - hdr.y > 0 && n.y - hdr.y < d.top(200))) break
        await d.tap(d.cx(), hdr.y)
        continue
      }
      await this.scroll(-d.top(500))
    }
    const info = { name: h.name, date: h.date, prs: h.prs }
    for (const n of nodes) {
      if (n.y <= hdr.y || n.y >= hdr.y + d.top(260)) continue
      if (/^\d+$/.test(n.label) && Math.abs(n.x - d.left(138)) < 60) info.duration_min = Number(n.label)
      if (/^[\d,]+$/.test(n.label) && Math.abs(n.x - d.left(498)) < 60) info.volume_kg = Number(n.label.replace(/,/g, ''))
    }

    const exercises = []
    const done = new Set()
    let tried = null
    let lastTop = hdr.y
    let cached = nodes
    const exName = (n) => cleanName(EXERCISE_RE.exec(n.label).groups.name)
    for (let step = 0; step < 60; step++) {
      nodes = (cached ?? (await this.nodes({ clip: true }))).sort((a, b) => a.y - b.y)
      cached = null
      // our header only moves up while we scroll down: a same-named header lower down is another session
      const cands = this.headers(nodes).filter((n) => n.name === h.name && n.date === h.date && n.y <= lastTop + 60)
      const here = cands.sort((a, b) => b.y - a.y)[0] ?? null
      const top = here?.y ?? 0
      if (here) lastTop = here.y
      const nxt = this.headers(nodes).filter((x) => x.y > top + 10 && x !== here)
      const bottom = nxt[0]?.y ?? 10_000
      const rows = nodes.filter((n) => n.click && Math.abs(n.x - d.cx()) < 6 && EXERCISE_RE.test(n.label) && n.y > top && n.y < bottom)
      rows.forEach((r, i) => {
        const nm = exName(r)
        r.key = `${nm}#${rows.slice(0, i).filter((q) => exName(q) === nm).length}`
      })
      const todo = rows.filter((r) => !done.has(r.key))
      if (!todo.length) {
        if (nxt.length && bottom < d.bottom(2250)) break
        const before = JSON.stringify(nodes.filter((n) => n.click).map((n) => [n.label, n.y]))
        await this.scroll(d.top(1000))
        cached = await this.nodes({ clip: true })
        if (JSON.stringify(cached.filter((n) => n.click).map((n) => [n.label, n.y])) === before) break // end of the list
        continue
      }
      const r = todo[0]
      if (r.y < d.top(320)) {
        await this.scroll(-d.top(400))
        continue
      }
      if (r.y > d.top(1350) && tried !== `${r.key}@${r.y}`) {
        tried = `${r.key}@${r.y}`
        await this.scroll(r.y - d.top(500))
        continue // if the list could not move (end of list), the next pass reads it where it is
      }
      await this.guard()
      const name = exName(r)
      await d.tap(d.cx(), r.y, 1000)
      let row = null
      let after
      for (let attempt = 0; attempt < 4 && !row; attempt++) {
        after = (await this.nodes({ clip: true })).sort((a, b) => a.y - b.y)
        // match by name: opening a row closes the previous one, which can move this one up
        const same = after.filter((n) => n.click && Math.abs(n.x - d.cx()) < 6 && EXERCISE_RE.test(n.label) && exName(n) === name)
        const opened = same.filter((n) => after.some((q) => q.label === 'SET' && q.y - n.y > 40 * d.k && q.y - n.y < 200 * d.k))
        if (opened.length) row = opened.sort((a, b) => Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0]
        else if (same.length) await d.tap(d.cx(), same.sort((a, b) => Math.abs(a.y - r.y) - Math.abs(b.y - r.y))[0].y, 1000)
        else await this.scroll(-d.top(400))
      }
      if (!row) throw new Stop(`Lost the exercise row ${name}.`)
      if (row.y > d.top(1350)) {
        // make room so all its sets are on screen (no-op at the end of the list)
        const expected = d.top(500)
        await this.scroll(row.y - d.top(500))
        after = (await this.nodes({ clip: true })).sort((a, b) => a.y - b.y)
        row = after
          .filter((n) => n.click && Math.abs(n.x - d.cx()) < 6 && EXERCISE_RE.test(n.label) && exName(n) === name)
          .sort((a, b) => Math.abs(a.y - expected) - Math.abs(b.y - expected))[0] ?? row
      }
      const img = await d.screencap()
      const below = after.filter((n) => n.click && Math.abs(n.x - d.cx()) < 6 && n.y > row.y + 10 && (EXERCISE_RE.test(n.label) || HEADER_RE.test(n.label))).map((n) => n.y)
      const nextY = below.length ? Math.min(...below) : d.bottom(2380)
      exercises.push({ name, sets_count: Number(EXERCISE_RE.exec(r.label).groups.sets), sets: this.readSets(after, img, row.y, nextY) })
      done.add(r.key)
      cached = after
    }
    info.exercises = exercises
    return info
  }

  /**
   * Every session in the given months (newest first), skipping keys already in `known`
   * ("name|Oct 26"). Calls onSession for each new one, so a long run can be resumed.
   * `until` (a Date): stop at the first screen of known sessions older than it.
   */
  async history({ months, known = new Set(), onSession = () => {}, until = null }) {
    await this.openHistory()
    const d = this.d
    for (const month of months) {
      this.log(`Month: ${month}`)
      if ((await this.openMonth(month)) === false) {
        this.log(`  no ${month} in the history`)
        continue
      }
      let stalls = 0
      let stuck = null
      for (;;) {
        await this.guard()
        const hs = this.headers(await this.nodes({ clip: true }))
        const pending = hs.filter((h) => !known.has(`${h.name.trim()}|${h.date}`) && h.date.startsWith(month))
        // Newest first: once everything on screen is known and older than the last import, stop.
        if (until && !pending.length && hs.some((h) => sessionDate(h.date) < until)) {
          this.log('  reached the workouts imported before: done')
          return
        }
        if (!pending.length) {
          const before = JSON.stringify(hs.map((h) => [h.name, h.date, h.y]))
          await this.scroll(d.top(1200))
          const after = JSON.stringify(this.headers(await this.nodes({ clip: true })).map((h) => [h.name, h.date, h.y]))
          stalls = after === before ? stalls + 1 : 0
          if (stalls >= 2 || (!hs.length && stalls >= 1)) break
          continue
        }
        stalls = 0
        const h = pending[0]
        if (h.y < d.top(380)) {
          await this.scroll(-d.top(400))
          continue
        }
        if (h.y > d.top(900) && stuck !== `${h.name}|${h.date}|${h.y}`) {
          stuck = `${h.name}|${h.date}|${h.y}`
          await this.scroll(h.y - d.top(400))
          continue // if the list could not move, the next pass reads it where it is
        }
        const s = await this.session(h)
        if (!s.exercises.length) throw new Stop(`No exercises read for ${h.name} ${h.date}.`)
        known.add(`${h.name.trim()}|${h.date}`)
        await onSession(s)
        this.log(`  ${h.date} ${h.name.trim()}: ${s.exercises.length} exercises, ${s.exercises.reduce((a, e) => a + e.sets.length, 0)} sets`)
        // close it again: a long list of open sessions makes the app sluggish
        for (let i = 0; i < 3; i++) {
          const hh = this.headers(await this.nodes({ clip: true })).find((x) => x.name === h.name && x.date === h.date)
          if (hh && hh.y > d.top(300) && hh.y < d.bottom(2200)) {
            await d.tap(d.cx(), hh.y, 1000)
            break
          }
          await this.scroll(-d.top(700))
        }
      }
    }
  }
}

/** Month chips to visit, newest first, from `since` (a Date) up to now; at most 12. */
export function monthsSince(since, now = new Date()) {
  const out = []
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  const stop = since ? new Date(since.getFullYear(), since.getMonth(), 1) : new Date(now.getFullYear() - 1, now.getMonth() + 1, 1)
  while (d >= stop && out.length < 12) {
    out.push(MONTHS[d.getMonth()])
    d.setMonth(d.getMonth() - 1)
  }
  return out
}
