// Unit tests for Forza! Coach: `npm test` in the coach folder (Node's built-in test runner).
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseNodes, parsePower } from '../lib/adb.mjs'
import { convert, effortToRir, parseValue, sessionDate, uuid5 } from '../lib/bws-convert.mjs'
import { cleanName, monthsSince } from '../lib/bws-extract.mjs'
import { regionForTimeZone } from '../lib/project.mjs'

test('session ids match the first import (re-importing never duplicates)', () => {
  assert.equal(uuid5('bws:Workout A:Feb 16'), '65a6632e-b6ec-5b3c-9213-82b8f85220b4')
})

test('set values', () => {
  assert.deepEqual(parseValue('20 kgs x 15'), { weight_kg: 20, reps: 15 })
  assert.deepEqual(parseValue('+12 kgs x 20'), { weight_kg: 12, reps: 20 })
  assert.deepEqual(parseValue('x 12'), { weight_kg: null, reps: 12 })
  assert.deepEqual(parseValue('45s'), { duration_s: 45 })
  assert.deepEqual(parseValue('1m 30s'), { duration_s: 90 })
  assert.deepEqual(parseValue('1:05'), { duration_s: 65 })
  assert.equal(parseValue('-'), null)
  assert.deepEqual(parseValue('45 lbs x 10'), { weight_kg: 20.5, reps: 10 })
  assert.throws(() => parseValue('banana'))
})

test('effort dot colours', () => {
  assert.equal(effortToRir([79, 155, 142]), 3) // green: easy
  assert.equal(effortToRir([240, 190, 40]), 2) // yellow: moderate
  assert.equal(effortToRir([235, 90, 60]), 1) // orange-red: hard
  assert.equal(effortToRir([246, 246, 248]), null) // no dot
})

test('dates without a year land in the last 12 months', () => {
  const now = new Date(2027, 1, 10)
  assert.equal(sessionDate('Feb 3', now).getFullYear(), 2027)
  assert.equal(sessionDate('Feb 20', now).getFullYear(), 2026)
  assert.equal(sessionDate('Oct 26', now).getFullYear(), 2026)
  assert.deepEqual(monthsSince(new Date(2026, 9, 26), new Date(2026, 11, 2)), ['Dec', 'Nov', 'Oct'])
  assert.equal(monthsSince(null, new Date(2026, 11, 2)).length, 12)
})

test('icons are stripped from exercise names', () => {
  assert.equal(cleanName('Barbell Back Squat \u{F0001}'), 'Barbell Back Squat')
})

test('conversion: warm-ups, plan days, unknown exercises', () => {
  const raw = {
    profile: { goal: 'Lose Fat', started: 'Started Oct 6, 2026 78 kgs at start', steps: 7000, program: 'Intermediate' },
    plan: {
      schedule: { thu: 'Workout A', sat: 'Rest' },
      workouts: [{ name: 'Workout A', exercises: [{ bws: 'Barbell Back Squat', sets: 6, reps: '6-10' }, { bws: 'Mystery Plank', sets: 3, reps: '30s' }] }],
    },
    sessions: [
      {
        name: 'Workout A ',
        date: 'Oct 23',
        duration_min: 60,
        exercises: [
          { name: 'Barbell Back Squat', sets: [{ value: '40 kgs x 8', effort_rgb: [79, 155, 142] }, { value: '80 kgs x 8', effort_rgb: [235, 90, 60] }, { value: '80 kgs x 7', effort_rgb: [235, 90, 60] }] },
          { name: 'Mystery Plank', sets: [{ value: '40s', effort_rgb: [246, 246, 248] }] },
        ],
      },
    ],
  }
  const out = convert(raw, [{ id: 'back_squat', kind: 'reps' }], { now: new Date(2026, 9, 29) })
  const [s] = out.sessions
  assert.equal(s.name, 'Workout A')
  assert.equal(s.sets[0].is_warmup, true)
  assert.equal(s.sets[0].rir, null)
  assert.equal(s.sets[1].rir, 1)
  assert.equal(s.sets[3].exercise_id, 'custom:mystery_plank')
  assert.deepEqual(out.custom_exercises.map((c) => [c.key, c.kind]), [['mystery_plank', 'time']])
  const [t] = out.templates
  assert.equal(t.weekday, 3)
  // BWS counts optional sets: the plan keeps what was really done recently (2 working sets).
  assert.equal(t.exercises[0].sets, 2)
  assert.equal(t.exercises[1].rep_min, 30)
  assert.deepEqual(out.profile, { goal: 'fat_loss', start_weight_kg: 78, steps_goal: 7000, workouts_per_week: 1, experience: 'intermediate' })
})

test('plan: workouts done this week use known history, timed targets, never empty', () => {
  const raw = {
    plan: {
      schedule: { sun: 'Workout C', wed: 'Core', thu: 'Ghost' },
      workouts: [
        { name: 'Workout C', exercises: null },
        { name: 'Core', exercises: [{ bws: 'Ground Sit', sets: 3, reps: 'Duration' }] },
        { name: 'Ghost', exercises: null },
      ],
    },
    sessions: [],
  }
  const knownSessions = [
    { id: 'a', name: 'Workout C', started_at: '2026-10-25T17:00:00Z', sets: [
      { exercise_id: 'hip_thrust', is_warmup: true, reps: 10 },
      { exercise_id: 'hip_thrust', is_warmup: false, reps: 12 },
      { exercise_id: 'hip_thrust', is_warmup: false, reps: 10 },
    ] },
  ]
  const out = convert(raw, [{ id: 'hip_thrust', kind: 'reps' }], { now: new Date(2026, 9, 29), knownSessions })
  assert.deepEqual(out.sessions, [])
  const c = out.templates.find((t) => t.name === 'Workout C')
  assert.equal(c.fromHistory, true)
  assert.deepEqual(c.exercises.map((e) => [e.exercise_id, e.sets, e.rep_min, e.rep_max]), [['hip_thrust', 2, 10, 12]])
  const core = out.templates.find((t) => t.name === 'Core')
  assert.deepEqual([core.exercises[0].rep_min, core.exercises[0].rep_max], [20, 45])
  assert.equal(out.custom_exercises[0].kind, 'time')
  assert.equal(out.templates.some((t) => t.name === 'Ghost'), false)
})

test('uiautomator dump parsing', () => {
  const xml = `<?xml version="1.0"?><hierarchy><node text="Workout A, Oct 26, ." content-desc="" clickable="true" bounds="[0,500][1080,600]" /><node text="" content-desc="Settings &amp; more" clickable="false" bounds="[10,10][110,60]" /><node text="" content-desc="" bounds="[0,0][1,1]" /></hierarchy>`
  assert.deepEqual(parseNodes(xml), [
    { x: 540, y: 550, top: 500, bottom: 600, label: 'Workout A, Oct 26, .', click: true },
    { x: 60, y: 35, top: 10, bottom: 60, label: 'Settings & more', click: false },
  ])
})

test('phone idle time from dumpsys power', () => {
  const text = `  mWakefulness=Awake\n  mLastWakeTime=184567155 (180841 ms ago)\n mLastUserActivityTime(excludingAttention)=184570850\n`
  assert.deepEqual(parsePower(text), { awake: true, idleMs: 177146 })
  assert.deepEqual(parsePower('  mWakefulness=Asleep\n'), { awake: false, idleMs: 0 })
})

test('server region from the time zone', () => {
  assert.equal(regionForTimeZone('Europe/Rome'), 'emea')
  assert.equal(regionForTimeZone('America/New_York'), 'americas')
  assert.equal(regionForTimeZone('Australia/Sydney'), 'apac')
})

// Linux only: elsewhere this would write to the real Keychain / Credential Manager.
test('keys fall back to a private file when no password store answers', { skip: platform() !== 'linux' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forza-coach-'))
  process.env.FORZA_COACH_HOME = dir
  const secrets = await import(`../lib/secrets.mjs?test=${Date.now()}`)
  try {
    await secrets.setSecret('forza-test', 'y')
    assert.equal(await secrets.getSecret('forza-test'), 'y')
    if (secrets.store === 'file') assert.match(await readFile(join(dir, 'secrets.json'), 'utf8'), /"forza-test": "y"/)
    await secrets.deleteSecret('forza-test')
    assert.equal(await secrets.getSecret('forza-test'), null)
  } finally {
    delete process.env.FORZA_COACH_HOME
    await rm(dir, { recursive: true, force: true })
  }
})
