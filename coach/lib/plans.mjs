// Copying workouts from one person's plan to another's (Forza! Coach → Workout plan).
import { cleanTemplate } from '../../shared/history-import.mjs'

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

/**
 * Copies workouts (all of them, or the given template ids) from one person to another. A workout with the
 * same name is replaced, so copying twice never duplicates it (its previous version stays in Versions).
 * Starting weights are left out: they belong to the other person, and the app works out weights from the
 * new person's own sets.
 */
export async function copyWorkouts(db, { from, to, ids = null }) {
  if (from === to) throw Object.assign(new Error('Choose another person to copy to'), { status: 400 })
  let query = db.from('workout_templates').select('*').eq('user_id', from).eq('archived', false).order('position')
  if (ids?.length) query = query.in('id', ids)
  const source = check(await query)
  const existing = check(await db.from('workout_templates').select('id, name, position').eq('user_id', to).eq('archived', false))
  let position = Math.max(-1, ...existing.map((t) => t.position ?? 0)) + 1
  const result = { added: 0, replaced: 0 }
  for (const t of source) {
    const clean = cleanTemplate(t)
    const row = { ...clean, exercises: clean.exercises.map((e) => ({ ...e, target_kg: null })), managed_by_admin: true, user_id: to }
    const same = existing.find((e) => e.name === clean.name)
    if (same) {
      check(await db.from('workout_templates').update({ ...row, position: same.position }).eq('id', same.id))
      result.replaced++
    } else {
      check(await db.from('workout_templates').insert({ ...row, position: position++ }))
      result.added++
    }
  }
  return { copied: source.length, ...result }
}
