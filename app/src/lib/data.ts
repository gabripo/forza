// All reads and writes to Supabase live here, so pages stay simple.
import { useCallback, useEffect, useRef, useState } from 'react'
import catalogue from '../data/exercises.json'
import { daysAgo, localDay } from './calc'
import { supabase } from './supabase'
import type {
  Activity,
  BodyWeight,
  Checkin,
  DailySteps,
  Exercise,
  ExerciseKind,
  FoodLog,
  Profile,
  ProgressPhoto,
  SetLog,
  WorkoutSession,
  WorkoutTemplate,
} from './types'

const BASE = import.meta.env.BASE_URL

// ---------------------------------------------------------------------------
// Generic async hook
// ---------------------------------------------------------------------------

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fnRef.current())
      setError(null)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** Supabase returns at most 1000 rows per request: fetch every page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const rows = check(await page(from, from + size - 1))
    out.push(...rows)
    if (rows.length < size) return out
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  return check(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle())
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  return check(await supabase.from('profiles').update(patch).eq('id', userId).select().single())
}

// ---------------------------------------------------------------------------
// Exercises: built-in catalogue + custom ones + administrator overrides
// ---------------------------------------------------------------------------

interface CatalogueEntry {
  id: string
  src?: string
  name: { en: string; it: string }
  muscles: string[]
  equipment: string
  kind: string
  level: number
  steps: { en: string[]; it: string[] }
  tip?: { en: string; it: string }
}

export const CATALOGUE: Exercise[] = (catalogue as CatalogueEntry[]).map((e) => ({
  id: e.id,
  name: e.name,
  muscles: e.muscles,
  equipment: e.equipment,
  kind: e.kind as ExerciseKind,
  level: (e.level === 2 ? 2 : 1) as 1 | 2,
  images: e.src ? [`${BASE}exercises/${e.id}/0.jpg`, `${BASE}exercises/${e.id}/1.jpg`] : [],
  steps: e.steps,
  tip: e.tip,
}))

export async function loadExercises(): Promise<Map<string, Exercise>> {
  const map = new Map(CATALOGUE.map((e) => [e.id, { ...e }]))
  const [custom, overrides] = await Promise.all([
    supabase.from('custom_exercises').select('*'),
    supabase.from('exercise_overrides').select('*'),
  ])
  for (const c of custom.data ?? []) {
    map.set(c.id, {
      id: c.id,
      name: { en: c.name_en, it: c.name_it || c.name_en },
      muscles: c.muscles ?? [],
      equipment: c.equipment,
      kind: c.kind,
      level: 1,
      images: c.image_urls ?? [],
      steps: { en: c.steps_en ?? [], it: c.steps_it?.length ? c.steps_it : (c.steps_en ?? []) },
      video_url: c.video_url,
      custom: true,
    })
  }
  for (const o of overrides.data ?? []) {
    const ex = map.get(o.exercise_id)
    if (ex) {
      ex.video_url = o.video_url ?? ex.video_url
      if (o.note_en) ex.tip = { en: o.note_en, it: o.note_it || o.note_en }
    }
  }
  return map
}

export async function createCustomExercise(input: {
  name: string
  muscles: string[]
  equipment: string
  kind: ExerciseKind
  video_url?: string
}): Promise<string> {
  const row = check(
    await supabase
      .from('custom_exercises')
      .insert({
        name_en: input.name,
        name_it: input.name,
        muscles: input.muscles,
        equipment: input.equipment,
        kind: input.kind,
        video_url: input.video_url || null,
      })
      .select('id')
      .single(),
  ) as { id: string }
  return row.id
}

// ---------------------------------------------------------------------------
// Weight and steps
// ---------------------------------------------------------------------------

export async function getWeights(sinceDays = 365): Promise<BodyWeight[]> {
  return fetchAll<BodyWeight>((from, to) =>
    supabase
      .from('body_weights')
      .select('id, measured_at, weight_kg, body_fat_pct, source')
      .gte('measured_at', daysAgo(sinceDays).toISOString())
      .order('measured_at')
      .range(from, to),
  )
}

export async function addWeight(kg: number, at = new Date()): Promise<void> {
  check(await supabase.from('body_weights').insert({ weight_kg: kg, measured_at: at.toISOString(), source: 'manual' }))
}

export async function deleteWeight(id: number): Promise<void> {
  check(await supabase.from('body_weights').delete().eq('id', id))
}

export async function importWeights(rows: { measured_at: string; weight_kg: number; body_fat_pct?: number | null }[], source: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, source }))
    check(await supabase.from('body_weights').upsert(chunk, { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true }))
  }
}

export async function getSteps(sinceDays = 30): Promise<DailySteps[]> {
  return check(
    await supabase.from('daily_steps').select('day, steps, source').gte('day', localDay(daysAgo(sinceDays))).order('day'),
  )
}

export async function setSteps(day: string, steps: number): Promise<void> {
  check(await supabase.from('daily_steps').upsert({ day, steps, source: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' }))
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  return check(
    await supabase.from('workout_templates').select('*').eq('archived', false).order('position').order('created_at'),
  )
}

export async function getTemplate(id: string): Promise<WorkoutTemplate | null> {
  return check(await supabase.from('workout_templates').select('*').eq('id', id).maybeSingle())
}

export async function saveTemplate(t: Partial<WorkoutTemplate> & { name: string }): Promise<WorkoutTemplate> {
  const row = {
    name: t.name,
    notes: t.notes ?? null,
    position: t.position ?? 0,
    weekday: t.weekday ?? null,
    exercises: t.exercises ?? [],
  }
  if (t.id) return check(await supabase.from('workout_templates').update(row).eq('id', t.id).select().single())
  return check(await supabase.from('workout_templates').insert(row).select().single())
}

export async function archiveTemplate(id: string): Promise<void> {
  check(await supabase.from('workout_templates').update({ archived: true }).eq('id', id))
}

export interface SessionWithSets extends WorkoutSession {
  sets: SetLog[]
}

export async function getSessions(sinceDays = 365): Promise<SessionWithSets[]> {
  const since = daysAgo(sinceDays).toISOString()
  const [sessions, sets] = await Promise.all([
    fetchAll<WorkoutSession>((from, to) =>
      supabase.from('workout_sessions').select('*').gte('started_at', since).order('started_at', { ascending: false }).range(from, to),
    ),
    fetchAll<SetLog & { id: number }>((from, to) =>
      supabase.from('set_logs').select('*').gte('performed_at', since).order('id').range(from, to),
    ),
  ])
  sets.sort((a, b) => a.exercise_order - b.exercise_order || a.set_index - b.set_index)
  const bySession = new Map<string, SetLog[]>()
  for (const s of sets) {
    const list = bySession.get(s.session_id) ?? []
    list.push(s)
    bySession.set(s.session_id, list)
  }
  return sessions.map((s) => ({ ...s, sets: bySession.get(s.id) ?? [] }))
}

export async function getSession(id: string): Promise<SessionWithSets | null> {
  const [session, sets] = await Promise.all([
    supabase.from('workout_sessions').select('*').eq('id', id).maybeSingle(),
    supabase.from('set_logs').select('*').eq('session_id', id).order('exercise_order').order('set_index'),
  ])
  const s = check(session) as WorkoutSession | null
  return s ? { ...s, sets: check(sets) as SetLog[] } : null
}

export async function deleteSession(id: string): Promise<void> {
  check(await supabase.from('workout_sessions').delete().eq('id', id))
}

/** For each exercise, the sets of the most recent session where it was done. */
export async function getLastSets(exerciseIds: string[]): Promise<Map<string, SetLog[]>> {
  const out = new Map<string, SetLog[]>()
  if (!exerciseIds.length) return out
  const rows = check(
    await supabase
      .from('set_logs')
      .select('*')
      .in('exercise_id', exerciseIds)
      .eq('is_warmup', false)
      .order('performed_at', { ascending: false })
      .limit(400),
  ) as SetLog[]
  const sessionOf = new Map<string, string>()
  for (const r of rows) {
    if (!sessionOf.has(r.exercise_id)) sessionOf.set(r.exercise_id, r.session_id)
    if (sessionOf.get(r.exercise_id) === r.session_id) {
      const list = out.get(r.exercise_id) ?? []
      list.push(r)
      out.set(r.exercise_id, list)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.set_index - b.set_index)
  return out
}

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------

export async function getFood(sinceDays = 0): Promise<FoodLog[]> {
  return check(
    await supabase.from('food_logs').select('*').gte('eaten_at', daysAgo(sinceDays).toISOString()).order('eaten_at'),
  )
}

export async function addFood(log: Omit<FoodLog, 'id'>): Promise<void> {
  check(await supabase.from('food_logs').insert(log))
}

export async function deleteFood(id: string): Promise<void> {
  check(await supabase.from('food_logs').delete().eq('id', id))
}

export async function uploadFoodPhoto(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  check(await supabase.storage.from('food-photos').upload(path, blob, { contentType: 'image/jpeg' }))
  return path
}

export async function foodPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('food-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export interface AiPlate {
  is_food: boolean
  title: string
  items: { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number }[]
  ultra_processed: boolean
  confidence: 'low' | 'medium' | 'high'
  tip: string
}

async function invokeFoodAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('food-estimate', { body: { ...body, mime: 'image/jpeg' } })
  if (error) {
    let code = 'ai_failed'
    try {
      const res = await (error as { context?: Response }).context?.json()
      code = res?.error ?? code
    } catch {
      // keep default
    }
    throw new Error(code)
  }
  return data as T
}

export function estimatePlate(input: { image: string; note: string; locale: string; goal: string; meal: string }): Promise<AiPlate> {
  return invokeFoodAi<AiPlate>(input)
}

export interface AiLabel {
  is_label: boolean
  name: string
  brand: string
  /** Per 100 g (or 100 ml). */
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  serving_g: number
}

/** Reads a nutrition facts label from a photo (for products not in the barcode database). */
export function readLabel(input: { image: string; locale: string }): Promise<AiLabel> {
  return invokeFoodAi<AiLabel>({ ...input, mode: 'label' })
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export async function getCheckins(): Promise<Checkin[]> {
  return check(await supabase.from('checkins').select('*').order('created_at', { ascending: false }).limit(50))
}

export async function addCheckin(c: Omit<Checkin, 'id' | 'created_at'> & { snapshot?: unknown }): Promise<void> {
  check(await supabase.from('checkins').insert(c))
}

// ---------------------------------------------------------------------------
// Health sync key (for the Apple Shortcut and the Android helper)
// ---------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hasSyncKey(): Promise<{ exists: boolean; lastUsed: string | null }> {
  const row = check(await supabase.from('sync_tokens').select('last_used_at').maybeSingle()) as { last_used_at: string | null } | null
  return { exists: Boolean(row), lastUsed: row?.last_used_at ?? null }
}

/** Creates a new personal sync key. The old one stops working. */
export async function createSyncKey(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const key = 'fz_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  check(await supabase.from('sync_tokens').upsert({ token_hash: await sha256Hex(key), last_used_at: null }, { onConflict: 'user_id' }))
  try {
    localStorage.setItem('forza.syncKey', key)
  } catch {
    // shown once anyway
  }
  return key
}

export function savedSyncKey(): string | null {
  try {
    return localStorage.getItem('forza.syncKey')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Activities (walks etc. synced from the phone's health app, or added by hand)
// ---------------------------------------------------------------------------

export async function getActivities(sinceDays = 14): Promise<Activity[]> {
  return check(
    await supabase.from('activities').select('*').gte('started_at', daysAgo(sinceDays).toISOString()).order('started_at', { ascending: false }),
  )
}

export async function addActivity(a: { kind: string; minutes: number; title?: string; at?: Date }): Promise<void> {
  const end = a.at ?? new Date()
  const start = new Date(end.getTime() - a.minutes * 60_000)
  check(
    await supabase
      .from('activities')
      .insert({ kind: a.kind, title: a.title ?? null, started_at: start.toISOString(), ended_at: end.toISOString(), source: 'manual' }),
  )
}

export async function deleteActivity(id: number): Promise<void> {
  check(await supabase.from('activities').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Progress photos
// ---------------------------------------------------------------------------

export async function getPhotos(): Promise<ProgressPhoto[]> {
  return check(await supabase.from('progress_photos').select('*').order('taken_at', { ascending: false }))
}

export async function addPhoto(userId: string, blob: Blob, weightKg: number | null, note: string | null): Promise<void> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  check(await supabase.storage.from('progress-photos').upload(path, blob, { contentType: 'image/jpeg' }))
  check(await supabase.from('progress_photos').insert({ path, weight_kg: weightKg, note }))
}

export async function deletePhoto(photo: ProgressPhoto): Promise<void> {
  await supabase.storage.from('progress-photos').remove([photo.path])
  check(await supabase.from('progress_photos').delete().eq('id', photo.id))
}

export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map()
  const { data } = await supabase.storage.from('progress-photos').createSignedUrls(paths, 3600)
  return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path ?? '', d.signedUrl as string]))
}

// ---------------------------------------------------------------------------
// Guided lessons
// ---------------------------------------------------------------------------

export async function getReadLessons(): Promise<Set<string>> {
  const rows = check(await supabase.from('lesson_progress').select('lesson_id')) as { lesson_id: string }[]
  return new Set(rows.map((r) => r.lesson_id))
}

export async function markLessonRead(lessonId: string, read = true): Promise<void> {
  if (read) check(await supabase.from('lesson_progress').upsert({ lesson_id: lessonId }, { onConflict: 'user_id,lesson_id' }))
  else check(await supabase.from('lesson_progress').delete().eq('lesson_id', lessonId))
}
