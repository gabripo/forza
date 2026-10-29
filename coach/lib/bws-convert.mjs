// Converts what bws-extract.mjs read from Build With Science into a forza-history-v1 file
// (docs/import-format.md): plan, workout history, goal and settings.
import { createHash } from 'node:crypto'

// Build With Science name → Forza! exercise id (app/src/data/exercises.json)
export const MAP = {
  'Low Incline Dumbbell Press': 'incline_db_press',
  'Barbell Back Squat': 'back_squat',
  'Chest Supported Machine Row': 'machine_row',
  'Seated Leg Curls': 'seated_leg_curl',
  'Behind Body Cable Curls': 'bayesian_cable_curl',
  'Single Arm Overhead Rope Extensions': 'single_arm_overhead_cable_extension',
  'Flat Dumbbell Press': 'db_bench_press',
  'Dumbbell Romanian Deadlift (Hamstring Focused)': 'db_romanian_deadlift',
  'Lat Pulldowns': 'lat_pulldown',
  'Reverse Lunges (*knee friendly)': 'reverse_lunge',
  'Cable Lateral Raise': 'cable_lateral_raise',
  'Reverse Crunches': 'reverse_crunch',
  'Seated Dumbbell Shoulder Press': 'db_shoulder_press',
  '3 Point Dumbbell Row': 'one_arm_db_row',
  'Barbell Hip Thrust': 'hip_thrust',
  'Seated Leg Extensions': 'leg_extension',
  'Dumbbell Fly': 'db_fly',
  'Standing Weighted Calf Raises (Barbell or Dumbbell)': 'db_calf_raise',
  'Dumbbell Reverse Flyes': 'db_reverse_fly',
  'Russian Twists': 'russian_twist',
  'Triceps Kickback': 'triceps_kickback',
  'Lying Dumbbell Curls': 'lying_db_curl',
  'Boat hold': 'boat_hold',
  'Half-way Push-up Isometric': 'half_pushup_hold',
  'Preacher Curl Isometric': 'preacher_curl_hold',
  'Rear Delt Cable Fly': 'cable_rear_delt_fly',
  'Barbell Bench Press': 'bench_press',
  'Barbell Romanian Deadlift': 'romanian_deadlift',
  'Chin-Ups': 'chin_up',
  'Standing Mid-Chest Cable Fly': 'cable_fly',
  'Dumbbell Chest Supported Row (mid/upper back focused)': 'incline_db_row',
  'Weighted External Rotations': 'external_rotation',
  'LU Raises': 'lu_raise',
  'Lying Leg Curls': 'lying_leg_curl',
  'Pec-Deck Machine Fly': 'pec_deck',
  'Smith Machine Squat': 'smith_squat',
  'Low Incline Smith Machine Press': 'smith_incline_press',
  'Incline Dumbbell Curls': 'incline_db_curl',
  'Seated Dumbbell Curls': 'db_curl',
  'Dumbbell Overhead Tricep Extensions': 'db_overhead_extension',
  'Incline Dumbbell Overhead Extensions': 'db_overhead_extension',
  '(Bodyweight) Single Leg Hip Thrusts': 'single_leg_hip_thrust',
}

const COMPOUND = new Set(['back_squat', 'incline_db_press', 'db_bench_press', 'db_romanian_deadlift', 'hip_thrust', 'machine_row', 'lat_pulldown', 'db_shoulder_press', 'one_arm_db_row', 'reverse_lunge', 'bench_press', 'romanian_deadlift', 'smith_squat', 'smith_incline_press', 'chin_up'])
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Forza! weekdays: 0 = Monday … 6 = Sunday
const WEEKDAY = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
const NS = '6f0f1c1e-7a62-4c55-9a8e-0f6d1f2a3b4c'

/** RFC 4122 version 5 UUID (SHA-1 of a namespace and a name). */
export function uuid5(name, ns = NS) {
  const hash = createHash('sha1').update(Buffer.from(ns.replace(/-/g, ''), 'hex')).update(name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const h = hash.subarray(0, 16).toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const slug = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

/** BWS shows effort as a coloured dot: orange-red = hard (about 1 rep left), yellow = moderate, green = easy. */
export function effortToRir([r, g, b]) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const s = max === 0 ? 0 : (max - min) / max
  if (s < 0.15) return null // no dot (timed sets)
  const d = max - min
  let h
  if (max === r / 255) h = ((g - b) / 255 / d) % 6
  else if (max === g / 255) h = (b - r) / 255 / d + 2
  else h = (r - g) / 255 / d + 4
  const hue = (h * 60 + 360) % 360
  if (hue >= 90 && hue <= 200) return 3
  if (hue >= 30 && hue < 90) return 2
  return 1
}

/** "20 kgs x 15", "+12 kgs x 20", "x 12", "12 reps", "45s", "1m 30s", "1:30" → set values. */
export function parseValue(v) {
  v = (v ?? '').trim()
  if (!v || v === '-') return null
  let m = /^(\+)?([\d.]+) (kgs?|lbs?) x (\d+)$/.exec(v)
  if (m) return { weight_kg: m[3].startsWith('lb') ? Math.round(Number(m[2]) * 0.45359237 * 4) / 4 : Number(m[2]), reps: Number(m[4]) }
  m = /^x (\d+)$/.exec(v) ?? /^(\d+) reps?$/.exec(v)
  if (m) return { weight_kg: null, reps: Number(m[1]) }
  m = /^(?:(\d+)m\s*)?(?:(\d+)s)?$/.exec(v)
  if (m && (m[1] || m[2])) return { duration_s: Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) }
  m = /^(\d+):(\d{2})$/.exec(v)
  if (m) return { duration_s: Number(m[1]) * 60 + Number(m[2]) }
  throw new Error(`Unknown set value "${v}"`)
}

/** "Oct 26" → a date in the 12 months up to `now` (the history screen shows no year). */
export function sessionDate(label, now = new Date()) {
  const [mon, day] = label.split(' ')
  const month = MONTHS.indexOf(mon)
  const year = month > now.getMonth() || (month === now.getMonth() && Number(day) > now.getDate()) ? now.getFullYear() - 1 : now.getFullYear()
  return new Date(year, month, Number(day), 18, 0)
}

/** Ids stay stable between imports. The first imports (2026) used the date without a year. */
function sessionId(name, label, date) {
  return uuid5(date.getFullYear() === 2026 ? `bws:${name}:${label}` : `bws:${name}:${label} ${date.getFullYear()}`)
}

function goalOf(text) {
  const t = (text ?? '').toLowerCase()
  if (/lose|fat|cut/.test(t)) return 'fat_loss'
  if (/build|gain|muscle|bulk/.test(t)) return 'muscle_gain'
  if (/maintain|recomp/.test(t)) return 'maintain'
  return null
}

/**
 * @param {{ profile?: any, plan?: any, sessions: any[] }} raw  what the extractor read
 * @param {any[]} catalogue  app/src/data/exercises.json
 */
export function convert(raw, catalogue, { now = new Date() } = {}) {
  const known = new Map(catalogue.map((e) => [e.id, e]))
  const custom = new Map()

  /** Forza! id for a BWS exercise; unknown ones become custom exercises. */
  const idFor = (bwsName, values = []) => {
    const name = bwsName.trim()
    if (MAP[name]) return MAP[name]
    const key = slug(name)
    if (!custom.has(key)) {
      const timed = values.some((v) => v?.duration_s)
      const weighted = values.some((v) => v?.weight_kg)
      custom.set(key, { key, name_en: name, name_it: name, kind: timed ? 'time' : weighted ? 'reps' : 'bodyweight', muscles: [], equipment: weighted ? 'other' : 'bodyweight' })
    }
    return `custom:${key}`
  }
  const kindOf = (id) => known.get(id)?.kind ?? custom.get(id.replace(/^custom:/, ''))?.kind ?? 'reps'

  const sessions = []
  for (const s of raw.sessions ?? []) {
    const name = s.name.trim()
    const start = sessionDate(s.date, now)
    const minutes = s.duration_min || 60
    const sets = []
    let order = 0
    for (const ex of s.exercises) {
      const parsed = ex.sets.map((x) => ({ ...parseValue(x.value), rir: effortToRir(x.effort_rgb) })).filter((p) => p.weight_kg !== undefined || p.reps || p.duration_s)
      if (!parsed.length) continue
      const exId = idFor(ex.name, parsed)
      // Warm-up sets: lighter than 70% of the top weight and before the first heavy set.
      const top = Math.max(...parsed.map((p) => p.weight_kg ?? 0))
      let heavySeen = false
      parsed.forEach((p, i) => {
        const w = p.weight_kg ?? 0
        const warm = top > 0 && !heavySeen && w < 0.7 * top
        heavySeen ||= w >= 0.9 * top
        sets.push({
          exercise_id: exId,
          exercise_order: order,
          set_index: i,
          weight_kg: p.weight_kg ?? null,
          reps: p.reps ?? null,
          duration_s: p.duration_s ?? null,
          rir: warm ? null : p.rir,
          is_warmup: warm,
          performed_at: new Date(start.getTime() + Math.min(minutes - 1, order * 9 + i * 2) * 60000).toISOString(),
        })
      })
      order++
    }
    sessions.push({
      id: sessionId(name, s.date, start),
      name,
      started_at: start.toISOString(),
      finished_at: new Date(start.getTime() + minutes * 60000).toISOString(),
      effort: null,
      notes: null,
      sets,
    })
  }
  sessions.sort((a, b) => a.started_at.localeCompare(b.started_at))

  // Working sets per exercise in the last 4 sessions: BWS counts optional extra sets in its plan.
  const recent = new Map()
  for (const s of sessions) {
    const counts = new Map()
    for (const x of s.sets) if (!x.is_warmup) counts.set(x.exercise_id, (counts.get(x.exercise_id) ?? 0) + 1)
    for (const [k, n] of counts) recent.set(k, [...(recent.get(k) ?? []), n])
  }
  const latestSets = (id) => (recent.has(id) ? Math.max(...recent.get(id).slice(-4)) : null)

  const templates = []
  const plan = raw.plan
  if (plan?.workouts?.length) {
    const weekdayOf = (name) => {
      const day = Object.entries(plan.schedule ?? {}).find(([, w]) => w === name)?.[0]
      return day ? WEEKDAY[day] : null
    }
    for (const w of plan.workouts) {
      // No preview (a day already done this week): rebuild it from the latest sessions with that name,
      // with the rep (or seconds) range actually used.
      const rows =
        w.exercises ??
        (() => {
          const recentOnes = sessions.filter((s) => s.name === w.name).slice(-3)
          const last = recentOnes.at(-1)
          if (!last) return []
          const ids = [...new Set(last.sets.map((x) => x.exercise_id))]
          return ids.map((id) => {
            const working = recentOnes.flatMap((s) => s.sets).filter((x) => x.exercise_id === id && !x.is_warmup)
            const values = working.map((x) => x.duration_s ?? x.reps).filter((v) => v > 0)
            const range = values.length ? `${Math.min(...values)}-${Math.max(...values)}${working.some((x) => x.duration_s) ? 's' : ''}` : '8-12'
            return { id, sets: last.sets.filter((x) => x.exercise_id === id && !x.is_warmup).length || 3, reps: range }
          })
        })()
      const exercises = rows.map((e) => {
        const id = e.id ?? idFor(e.bws)
        const kind = kindOf(id)
        const nums = (String(e.reps).match(/\d+/g) ?? []).map(Number)
        const timed = kind === 'time' || kind === 'cardio' || /s$|duration/.test(String(e.reps))
        const [repMin, repMax] = timed ? (nums.length ? [nums[0], nums[0] + 15] : [20, 45]) : nums.length >= 2 ? [nums[0], nums[1]] : nums.length ? [nums[0], nums[0]] : [8, 12]
        let rest = COMPOUND.has(id) ? 150 : e.superset ? 75 : 90
        if ((kind === 'time' || kind === 'bodyweight') && !COMPOUND.has(id)) rest = 60
        const recentSets = latestSets(id)
        return {
          exercise_id: id,
          sets: kind === 'reps' && recentSets ? Math.min(e.sets, recentSets) : e.sets,
          rep_min: repMin,
          rep_max: repMax,
          rest_s: rest,
          note: /per side/.test(String(e.reps)) ? 'reps per side' : null,
          superset: e.superset ?? null,
        }
      })
      templates.push({ name: w.name, notes: 'From Build With Science', weekday: weekdayOf(w.name), exercises })
    }
  }

  // Monday first, like the week in the app; unscheduled workouts last.
  templates.sort((x, y) => (x.weekday ?? 7) - (y.weekday ?? 7))

  const p = raw.profile ?? {}
  const startKg = (() => {
    const m = /([\d.]+)\s*(kgs?|lbs?)/.exec(p.started ?? '')
    if (!m) return null
    return m[2].startsWith('lb') ? Math.round(Number(m[1]) * 0.45359237 * 10) / 10 : Number(m[1])
  })()
  const workoutDays = Object.values(plan?.schedule ?? {}).filter((w) => w && !/^rest/i.test(w)).length
  const profile = {
    goal: goalOf(p.goal),
    start_weight_kg: startKg,
    steps_goal: p.steps || null,
    workouts_per_week: workoutDays ? Math.min(5, workoutDays) : null,
    experience: p.program ? (/beginner/i.test(p.program) ? 'beginner' : 'intermediate') : null,
  }

  return {
    format: 'forza-history-v1',
    source: 'Build With Science',
    profile,
    custom_exercises: [...custom.values()],
    templates,
    sessions,
    weights: [],
  }
}
