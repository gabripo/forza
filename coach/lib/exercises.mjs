// Exercises in Forza! Coach: photos, GIFs and videos for any exercise, and the family's own exercises.
import { randomBytes } from 'node:crypto'

const BUCKET = 'exercise-media'
const KINDS = new Set(['reps', 'bodyweight', 'time', 'cardio'])
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}
const MAX_BYTES = 25 * 1024 * 1024

function check({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

const bad = (message, status = 400) => Object.assign(new Error(message), { status })

/** Web addresses only, at most 12, in the order given. */
export function mediaList(urls) {
  if (!Array.isArray(urls)) return []
  return urls.map((u) => String(u).trim()).filter((u) => /^https?:\/\/\S+$/.test(u)).slice(0, 12)
}

/** Stores one photo, GIF or video of an exercise; the app shows it from its public address. */
export async function uploadMedia(db, { exercise_id, mime, data }) {
  if (!/^[\w-]{2,60}$/.test(String(exercise_id ?? ''))) throw bad('Unknown exercise')
  const ext = TYPES[mime]
  if (!ext) throw bad('Use a photo (JPEG, PNG, WebP), a GIF or a video (MP4, WebM, MOV)')
  const bytes = Buffer.from(String(data ?? ''), 'base64')
  if (!bytes.length) throw bad('The file is empty')
  if (bytes.length > MAX_BYTES) throw bad('Files can be up to 25 MB: shorten the video or lower its quality')
  const path = `${exercise_id}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
  check(await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, cacheControl: '31536000' }))
  return { url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
}

/** Removes stored files no longer listed (files elsewhere, such as links to other sites, are left alone). */
async function removeUnused(db, before, after) {
  const prefix = `/storage/v1/object/public/${BUCKET}/`
  const paths = before.filter((u) => !after.includes(u) && u.includes(prefix)).map((u) => decodeURIComponent(u.split(prefix)[1]))
  if (paths.length) await db.storage.from(BUCKET).remove(paths).catch(() => {})
}

/** A built-in exercise: the coach's video link, note and media (empty media = the built-in photos). */
export async function saveOverride(db, id, body) {
  const old = check(await db.from('exercise_overrides').select('media_urls').eq('exercise_id', id).maybeSingle())
  const media = body.media_urls === undefined ? (old?.media_urls ?? []) : mediaList(body.media_urls)
  const row = check(
    await db
      .from('exercise_overrides')
      .upsert({ exercise_id: id, video_url: body.video_url || null, note_en: body.note_en || null, note_it: body.note_it || null, media_urls: media, updated_at: new Date().toISOString() })
      .select()
      .single(),
  )
  await removeUnused(db, old?.media_urls ?? [], media)
  return row
}

function customRow(body) {
  const name = String(body.name_en ?? '').trim().slice(0, 80)
  if (!name) throw bad('The exercise needs an English name')
  const lines = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
  return {
    name_en: name,
    name_it: String(body.name_it ?? '').trim().slice(0, 80) || name,
    muscles: (Array.isArray(body.muscles) ? body.muscles : String(body.muscles ?? '').split(','))
      .map((m) => String(m).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
    equipment: String(body.equipment ?? 'other').trim().slice(0, 30) || 'other',
    kind: KINDS.has(body.kind) ? body.kind : 'reps',
    steps_en: lines(body.steps_en),
    steps_it: lines(body.steps_it),
    video_url: /^https?:\/\/\S+$/.test(String(body.video_url ?? '').trim()) ? String(body.video_url).trim() : null,
    image_urls: mediaList(body.image_urls),
  }
}

export async function addCustom(db, body) {
  return check(await db.from('custom_exercises').insert({ ...customRow(body), owner_id: null }).select().single())
}

export async function updateCustom(db, id, body) {
  const old = check(await db.from('custom_exercises').select('image_urls').eq('id', id).maybeSingle())
  if (!old) throw bad('This exercise is gone', 404)
  const row = check(await db.from('custom_exercises').update({ ...customRow(body), archived: Boolean(body.archived) }).eq('id', id).select().single())
  await removeUnused(db, old.image_urls ?? [], row.image_urls ?? [])
  return row
}

/**
 * Deletes a custom exercise. One that is in someone's plan or workouts is retired instead: it disappears from
 * the exercise lists, and the plans and the history keep showing it.
 */
export async function deleteCustom(db, id) {
  const old = check(await db.from('custom_exercises').select('image_urls').eq('id', id).maybeSingle())
  if (!old) throw bad('This exercise is gone', 404)
  const [plans, sets] = await Promise.all([
    // A JSON list containing this exercise (an array given to contains() would be read as a Postgres array).
    db.from('workout_templates').select('id', { count: 'exact', head: true }).eq('archived', false).filter('exercises', 'cs', JSON.stringify([{ exercise_id: id }])),
    db.from('set_logs').select('id', { count: 'exact', head: true }).eq('exercise_id', id),
  ])
  if (plans.error || sets.error) throw new Error((plans.error ?? sets.error).message || 'Could not check where the exercise is used')
  if (plans.count || sets.count) {
    check(await db.from('custom_exercises').update({ archived: true }).eq('id', id))
    return { archived: true, plans: plans.count ?? 0, sets: sets.count ?? 0 }
  }
  check(await db.from('custom_exercises').delete().eq('id', id))
  await removeUnused(db, old.image_urls ?? [], [])
  return { deleted: true }
}
