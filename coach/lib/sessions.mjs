// Workouts from Forza! Coach: logging one afterwards, changing or deleting one on any day, and moving a planned
// workout to another day this time only.
import { randomUUID } from 'node:crypto'

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

const bad = (message, status = 400) => Object.assign(new Error(message), { status })
const DAY = /^\d{4}-\d{2}-\d{2}$/
const num = (v, max) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > max) throw bad(`A value is not a number between 0 and ${max}`)
  return n
}

/**
 * Saves a workout and all its sets (replacing the sets it had). { id?, template_id?, name, started_at, minutes,
 * effort?, notes?, exercises: [{ exercise_id, sets: [{ weight_kg, reps, duration_s, is_warmup }] }] }
 */
export async function saveSession(db, userId, body, id = null) {
  const start = new Date(body.started_at)
  if (Number.isNaN(start.getTime())) throw bad('When was the workout?')
  if (start.getTime() > Date.now() + 86_400_000) throw bad('A workout cannot be in the future: move the planned one instead')
  const minutes = Math.max(1, Math.min(600, Math.round(Number(body.minutes) || 45)))
  const exercises = (Array.isArray(body.exercises) ? body.exercises : [])
    .map((e) => ({
      exercise_id: String(e?.exercise_id ?? '').slice(0, 60),
      sets: (Array.isArray(e?.sets) ? e.sets : [])
        .map((s) => ({ weight_kg: num(s.weight_kg, 1000), reps: num(s.reps, 1000), duration_s: num(s.duration_s, 86_400), is_warmup: Boolean(s.is_warmup) }))
        .filter((s) => s.weight_kg || s.reps || s.duration_s),
    }))
    .filter((e) => e.exercise_id && e.sets.length)
  if (!exercises.length) throw bad('Add at least one exercise with a set')
  const effort = body.effort === '' || body.effort == null ? null : Math.max(1, Math.min(10, Math.round(Number(body.effort))))
  let sessionId = id
  if (id) {
    const old = check(await db.from('workout_sessions').select('id, user_id').eq('id', id).maybeSingle())
    if (!old) throw bad('This workout is gone', 404)
    userId = old.user_id
  } else sessionId = randomUUID()
  const row = {
    id: sessionId,
    user_id: userId,
    template_id: body.template_id || null,
    name: String(body.name ?? '').trim().slice(0, 80) || 'Workout',
    started_at: start.toISOString(),
    finished_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
    effort,
    notes: String(body.notes ?? '').trim().slice(0, 1000) || null,
  }
  if (id) check(await db.from('workout_sessions').update(row).eq('id', id))
  else check(await db.from('workout_sessions').insert({ ...row, source: 'coach' }))
  check(await db.from('set_logs').delete().eq('session_id', sessionId))
  const count = exercises.reduce((n, e) => n + e.sets.length, 0)
  let k = 0
  const sets = exercises.flatMap((e, order) =>
    e.sets.map((s, i) => ({
      session_id: sessionId,
      user_id: userId,
      exercise_id: e.exercise_id,
      exercise_order: order,
      set_index: i,
      ...s,
      // Spread over the workout, so the history reads in order.
      performed_at: new Date(start.getTime() + (++k / (count + 1)) * minutes * 60_000).toISOString(),
    })),
  )
  check(await db.from('set_logs').insert(sets))
  return { id: sessionId }
}

export async function deleteSession(db, id) {
  check(await db.from('workout_sessions').delete().eq('id', id))
  return { ok: true }
}

/** A planned workout done on another day, this time only; back to its own day removes the move. */
export async function moveWorkout(db, userId, { template_id, from_day, to_day }) {
  if (!DAY.test(from_day ?? '') || !DAY.test(to_day ?? '')) throw bad('Choose the day')
  const tpl = check(await db.from('workout_templates').select('id').eq('id', template_id).eq('user_id', userId).maybeSingle())
  if (!tpl) throw bad('This workout is not in their plan', 404)
  if (from_day === to_day) {
    check(await db.from('workout_moves').delete().eq('user_id', userId).eq('template_id', template_id).eq('from_day', from_day))
  } else {
    check(await db.from('workout_moves').upsert({ user_id: userId, template_id, from_day, to_day }, { onConflict: 'user_id,template_id,from_day' }))
  }
  return { ok: true }
}
