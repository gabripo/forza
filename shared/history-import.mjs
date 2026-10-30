// Imports a "forza-history-v1" file (docs/import-format.md) into one account.
// Shared by the app (a person importing their own file) and Forza! Coach (the family coach
// importing for someone), so both behave exactly the same.
//
// Idempotent: sessions and meals keep the ids in the file, so importing the same file twice
// (or a newer export that overlaps) changes nothing that was already there.

/** @param {{ data: any, error: any }} res */
const check = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { status: 400 })
  return data
}

const PROFILE_FIELDS = ['sex', 'birth_year', 'height_cm', 'goal', 'activity_level', 'start_weight_kg', 'target_weight_kg', 'steps_goal', 'workouts_per_week', 'experience']

export function cleanTemplate(t) {
  return {
    name: String(t.name ?? '').trim() || 'Workout',
    notes: t.notes || null,
    position: Number(t.position ?? 0),
    weekday: t.weekday === '' || t.weekday == null ? null : Number(t.weekday),
    exercises: (t.exercises ?? []).map((e) => ({
      exercise_id: String(e.exercise_id),
      sets: Number(e.sets) || 3,
      rep_min: Number(e.rep_min) || 8,
      rep_max: Number(e.rep_max) || 12,
      rest_s: Number(e.rest_s) || 0,
      target_kg: e.target_kg === '' || e.target_kg == null ? null : Number(e.target_kg),
      note: e.note || null,
      superset: e.superset === '' || e.superset == null ? null : Number(e.superset),
      warmup: e.warmup === '' || e.warmup == null ? null : e.warmup === true || e.warmup === 'true',
    })),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db  service-role client (coach) or the person's own client (app)
 * @param {string} userId
 * @param {any} data  the parsed file
 * @param {{ byCoach?: boolean, onProgress?: (text: string) => void }} [options]
 *   byCoach: plans are marked "managed by the coach" and unknown exercises become shared ones.
 */
export async function importHistory(db, userId, data, options = {}) {
  const { byCoach = false, onProgress = () => {} } = options
  if (data?.format !== 'forza-history-v1') throw Object.assign(new Error('Unknown file format (expected forza-history-v1)'), { status: 400 })
  const result = { profile: 0, templates: 0, sessions: 0, sets: 0, weights: 0, food: 0, custom_exercises: 0 }

  // Profile: before the person's first set-up it pre-fills the questions; afterwards it only fills
  // what is still empty, so it never overwrites what the person chose.
  if (data.profile) {
    const current = check(await db.from('profiles').select('*').eq('id', userId).single())
    const patch = {}
    for (const k of PROFILE_FIELDS) {
      if (data.profile[k] != null && (current[k] == null || !current.onboarded_at)) patch[k] = data.profile[k]
    }
    if (Object.keys(patch).length) {
      check(await db.from('profiles').update(patch).eq('id', userId))
      result.profile = Object.keys(patch).length
    }
  }

  // Exercises that only exist in the source app become custom exercises (reused by name).
  const customIds = new Map()
  for (const c of data.custom_exercises ?? []) {
    // Same name, any capitalisation ("Ground sit" = "Ground Sit"); % and _ are wildcards in ilike.
    let query = db.from('custom_exercises').select('id').ilike('name_en', c.name_en.replace(/[\\%_]/g, (ch) => `\\${ch}`))
    query = byCoach ? query.is('owner_id', null) : query.or(`owner_id.is.null,owner_id.eq.${userId}`)
    const found = check(await query.limit(1).maybeSingle())
    const row =
      found ??
      check(
        await db
          .from('custom_exercises')
          .insert({
            ...(byCoach ? { owner_id: null } : {}),
            name_en: c.name_en,
            name_it: c.name_it || c.name_en,
            kind: c.kind ?? 'reps',
            muscles: c.muscles ?? [],
            equipment: c.equipment ?? 'other',
            video_url: c.video_url ?? null,
          })
          .select('id')
          .single(),
      )
    if (!found) result.custom_exercises++
    customIds.set(c.key, row.id)
  }
  const resolve = (id) => (String(id).startsWith('custom:') ? customIds.get(String(id).slice(7)) ?? String(id) : id)
  for (const t of data.templates ?? []) for (const e of t.exercises ?? []) e.exercise_id = resolve(e.exercise_id)
  for (const s of data.sessions ?? []) for (const x of s.sets ?? []) x.exercise_id = resolve(x.exercise_id)

  // Plan: a workout with the same name as an existing one is updated (its old version is kept).
  const templateIds = new Map()
  const existing = check(await db.from('workout_templates').select('id, name').eq('user_id', userId).eq('archived', false))
  for (const [i, t] of (data.templates ?? []).entries()) {
    const row = { ...cleanTemplate({ ...t, position: t.position ?? i }), user_id: userId, managed_by_admin: byCoach }
    const same = existing.find((e) => e.name === row.name)
    const saved = same
      ? check(await db.from('workout_templates').update(row).eq('id', same.id).select('id, name').single())
      : check(await db.from('workout_templates').insert(row).select('id, name').single())
    templateIds.set(saved.name, saved.id)
    result.templates++
  }
  for (const e of existing) if (!templateIds.has(e.name)) templateIds.set(e.name, e.id)

  const sessions = data.sessions ?? []
  for (let i = 0; i < sessions.length; i += 100) {
    onProgress(`workouts ${i + 1}-${Math.min(i + 100, sessions.length)} of ${sessions.length}`)
    const chunk = sessions.slice(i, i + 100)
    const rows = chunk.map((s) => ({
      id: s.id,
      user_id: userId,
      template_id: templateIds.get(s.name) ?? null,
      name: s.name,
      started_at: s.started_at,
      finished_at: s.finished_at ?? null,
      effort: s.effort ?? null,
      notes: s.notes ?? null,
      source: 'import',
    }))
    check(await db.from('workout_sessions').upsert(rows, { onConflict: 'id' }))
    check(await db.from('set_logs').delete().in('session_id', rows.map((r) => r.id)))
    const sets = chunk.flatMap((s) =>
      (s.sets ?? []).map((x) => ({
        session_id: s.id,
        user_id: userId,
        exercise_id: x.exercise_id,
        exercise_order: x.exercise_order,
        set_index: x.set_index,
        weight_kg: x.weight_kg ?? null,
        reps: x.reps ?? null,
        duration_s: x.duration_s ?? null,
        rir: x.rir ?? null,
        is_warmup: Boolean(x.is_warmup),
        performed_at: x.performed_at ?? s.started_at,
      })),
    )
    for (let j = 0; j < sets.length; j += 1000) check(await db.from('set_logs').insert(sets.slice(j, j + 1000)))
    result.sessions += rows.length
    result.sets += sets.length
  }

  const weights = (data.weights ?? []).map((w) => ({
    user_id: userId,
    measured_at: w.measured_at,
    weight_kg: w.weight_kg,
    body_fat_pct: w.body_fat_pct ?? null,
    source: 'import',
  }))
  for (let i = 0; i < weights.length; i += 500) {
    check(await db.from('body_weights').upsert(weights.slice(i, i + 500), { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true }))
  }
  result.weights = weights.length

  const food = (data.food ?? []).map((f) => ({
    id: f.id,
    user_id: userId,
    eaten_at: f.eaten_at,
    meal: ['breakfast', 'lunch', 'dinner', 'snack'].includes(f.meal) ? f.meal : 'snack',
    title: String(f.title ?? '').slice(0, 200) || 'Meal',
    items: f.items ?? [],
    kcal: Number(f.kcal) || 0,
    protein_g: Number(f.protein_g) || 0,
    carbs_g: Number(f.carbs_g) || 0,
    fat_g: Number(f.fat_g) || 0,
    fiber_g: Number(f.fiber_g) || 0,
    sugar_g: Number(f.sugar_g) || 0,
    source: 'import',
    // The app the meal comes from ("Build With Science"), shown next to it in Forza!.
    origin: typeof f.origin === 'string' ? f.origin.slice(0, 60) : null,
  }))
  for (let i = 0; i < food.length; i += 500) {
    onProgress(`meals ${i + 1}-${Math.min(i + 500, food.length)} of ${food.length}`)
    check(await db.from('food_logs').upsert(food.slice(i, i + 500), { onConflict: 'id' }))
  }
  result.food = food.length
  return result
}
