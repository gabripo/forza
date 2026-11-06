// All reads and writes to Supabase live here, so pages stay simple.
import { useCallback, useEffect, useRef, useState } from 'react'
import catalogue from '../data/exercises.json'
import { daysAgo, localDay, sumItems } from './calc'
import { supabase } from './supabase'
import type { WorkoutMove } from './plan'
import type { QuizAnswer } from './pointsQuiz'
import type { AiRecipe, Per100 } from './recipeIdea'
import type { LessonRow } from './rewards'
import type {
  Activity,
  BodyWeight,
  Checkin,
  DailySteps,
  Exercise,
  ExerciseKind,
  FoodDay,
  FoodItem,
  FoodLog,
  Meal,
  Profile,
  Recipe,
  TargetDay,
  ProgressPhoto,
  SetLog,
  SharedCopy,
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
      archived: c.archived ?? false,
    })
  }
  for (const o of overrides.data ?? []) {
    const ex = map.get(o.exercise_id)
    if (ex) {
      ex.video_url = o.video_url ?? ex.video_url
      // The coach's photos, GIFs or video replace the built-in photos.
      if (o.media_urls?.length) ex.images = o.media_urls
      if (o.note_en) ex.tip = { en: o.note_en, it: o.note_it || o.note_en }
    }
  }
  return map
}

export async function createCustomExercise(input: {
  name: string
  /** Its Italian name, when it differs (an exercise from the library). */
  name_it?: string
  muscles: string[]
  equipment: string
  kind: ExerciseKind
  video_url?: string
  steps_en?: string[]
  steps_it?: string[]
  image_urls?: string[]
}): Promise<string> {
  const row = check(
    await supabase
      .from('custom_exercises')
      .insert({
        name_en: input.name,
        name_it: input.name_it || input.name,
        muscles: input.muscles,
        equipment: input.equipment,
        kind: input.kind,
        video_url: input.video_url || null,
        steps_en: input.steps_en ?? [],
        steps_it: input.steps_it ?? [],
        image_urls: input.image_urls ?? [],
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

/** Workouts moved to another day, from two weeks ago on. */
export async function getMoves(): Promise<WorkoutMove[]> {
  const since = localDay(daysAgo(14))
  return check(await supabase.from('workout_moves').select('id, template_id, from_day, to_day').or(`from_day.gte.${since},to_day.gte.${since}`)) as WorkoutMove[]
}

/** Moves a planned workout to another day, this time only; back to its own day removes the move. */
export async function moveWorkout(templateId: string, fromDay: string, toDay: string): Promise<void> {
  if (fromDay === toDay) {
    check(await supabase.from('workout_moves').delete().eq('template_id', templateId).eq('from_day', fromDay))
    return
  }
  check(await supabase.from('workout_moves').upsert({ template_id: templateId, from_day: fromDay, to_day: toDay }, { onConflict: 'user_id,template_id,from_day' }))
}

/** Saves a workout logged or changed after the fact (any day): the session and all its sets. */
export async function saveSession(session: Omit<WorkoutSession, 'source'>, sets: Omit<SetLog, 'session_id'>[]): Promise<void> {
  check(await supabase.rpc('save_workout', { p_session: { ...session, source: 'app' }, p_sets: sets }))
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

/**
 * The person signed in. Reads of the food log ask for their own meals by name: the family coach may also see the
 * meals they logged for the others, which are not theirs.
 */
async function myId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('not_signed_in')
  return data.session.user.id
}

/** Only when and how much, for charts: light enough for years of meals (paged, so none are cut off). */
export async function getFoodTotals(sinceDays: number): Promise<Pick<FoodLog, 'eaten_at' | 'kcal' | 'protein_g'>[]> {
  const me = await myId()
  return fetchAll<Pick<FoodLog, 'eaten_at' | 'kcal' | 'protein_g'>>((from, to) =>
    supabase.from('food_logs').select('eaten_at, kcal, protein_g').eq('user_id', me).gte('eaten_at', daysAgo(sinceDays).toISOString()).order('eaten_at').order('id').range(from, to),
  )
}

export async function getFood(sinceDays = 0): Promise<FoodLog[]> {
  const me = await myId()
  return check(
    await supabase.from('food_logs').select('*').eq('user_id', me).gte('eaten_at', daysAgo(sinceDays).toISOString()).order('eaten_at'),
  )
}

/** Logs a meal; returns its id (to share it with whoever ate the same). */
export async function addFood(log: Omit<FoodLog, 'id'>): Promise<string> {
  return (check(await supabase.from('food_logs').insert(log).select('id').single()) as { id: string }).id
}

/**
 * Logs these meals again today, each at its own time of day (or now, if that time has not come yet).
 * The copies are this person's own meals: no photo, and not marked as coming from another app.
 */
export async function copyMealsToToday(logs: FoodLog[]): Promise<string[]> {
  const now = new Date()
  const rows = logs.map((f) => {
    const at = new Date(f.eaten_at)
    const today = new Date(now)
    today.setHours(at.getHours(), at.getMinutes(), 0, 0)
    const { meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, score_fat_loss, score_muscle_gain, ai_notes } = f
    return { meal, title, items, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, satfat_g, score_fat_loss, score_muscle_gain, ai_notes, eaten_at: (today > now ? now : today).toISOString(), source: 'manual' as const }
  })
  return (check(await supabase.from('food_logs').insert(rows).select('id')) as { id: string }[]).map((r) => r.id)
}

/** Changes a logged meal: which meal of the day it was, or its scores once worked out. */
export async function updateFood(id: string, patch: Partial<Pick<FoodLog, 'meal' | 'score_fat_loss' | 'score_muscle_gain'>>): Promise<void> {
  check(await supabase.from('food_logs').update(patch).eq('id', id))
}

/** One meal, wherever in time it is (the food pages load only the last weeks). */
export async function getFoodLog(id: string): Promise<FoodLog | null> {
  return check(await supabase.from('food_logs').select('*').eq('id', id).maybeSingle()) as FoodLog | null
}

/** A meal changed after it was logged: its foods and amounts, the totals with them, its name, part of the day and score. */
export async function changeFood(id: string, patch: Pick<FoodLog, 'items' | 'meal' | 'title' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'score_fat_loss' | 'score_muscle_gain'> & Partial<Pick<FoodLog, 'salt_g' | 'satfat_g'>>): Promise<void> {
  check(await supabase.from('food_logs').update({ salt_g: null, satfat_g: null, ...patch }).eq('id', id))
}

/**
 * How much of a logged meal was eaten (a share of it as logged: ½, ¾…): every food and total follows, worked out
 * from the meal as logged, so the share can be changed again later. The score is worked out again by the page.
 */
export async function setEatenShare(log: FoodLog, share: number): Promise<FoodLog> {
  const k = share / (Number(log.eaten_share) || 1)
  const r1 = (n: number) => Math.round(n * 10) / 10
  // One decimal even on grams and calories: going from ½ back to all of it comes back to what was logged.
  const items = (log.items ?? []).map((it) => ({
    ...it,
    grams: r1(it.grams * k),
    kcal: r1(it.kcal * k),
    protein_g: r1(it.protein_g * k),
    carbs_g: r1(it.carbs_g * k),
    fat_g: r1(it.fat_g * k),
    fiber_g: r1(it.fiber_g * k),
    sugar_g: r1(it.sugar_g * k),
    ...(it.salt_g != null ? { salt_g: Math.round(it.salt_g * k * 100) / 100 } : {}),
    ...(it.satfat_g != null ? { satfat_g: r1(it.satfat_g * k) } : {}),
  }))
  const patch = {
    items,
    kcal: r1(Number(log.kcal) * k),
    protein_g: r1(Number(log.protein_g) * k),
    carbs_g: r1(Number(log.carbs_g) * k),
    fat_g: r1(Number(log.fat_g) * k),
    fiber_g: r1(Number(log.fiber_g) * k),
    sugar_g: r1(Number(log.sugar_g) * k),
    salt_g: log.salt_g == null ? null : Math.round(Number(log.salt_g) * k * 100) / 100,
    satfat_g: log.satfat_g == null ? null : r1(Number(log.satfat_g) * k),
    eaten_share: share,
    score_fat_loss: null,
    score_muscle_gain: null,
  }
  return check(await supabase.from('food_logs').update(patch).eq('id', log.id).select().single()) as FoodLog
}

/**
 * A meal corrected after it was found odd: its foods are replaced, the totals follow, the score is worked out again
 * by the page, and the meal counts as looked at.
 */
export async function fixFood(id: string, items: FoodItem[]): Promise<void> {
  const t = sumItems(items)
  const r1 = (n: number) => Math.round(n * 10) / 10
  const patch = {
    items,
    kcal: Math.round(t.kcal),
    protein_g: r1(t.protein_g),
    carbs_g: r1(t.carbs_g),
    fat_g: r1(t.fat_g),
    fiber_g: r1(t.fiber_g),
    sugar_g: r1(t.sugar_g),
    salt_g: t.salt_g ?? null,
    satfat_g: t.satfat_g ?? null,
    score_fat_loss: null,
    score_muscle_gain: null,
    checked_at: new Date().toISOString(),
  }
  check(await supabase.from('food_logs').update(patch).eq('id', id))
}

/** Meals found odd that the person says are right: not asked about again. */
export async function markFoodChecked(ids: string[]): Promise<void> {
  check(await supabase.from('food_logs').update({ checked_at: new Date().toISOString() }).in('id', ids))
}

export async function deleteFoods(ids: string[]): Promise<void> {
  check(await supabase.from('food_logs').delete().in('id', ids))
}

export async function deleteFood(id: string): Promise<void> {
  check(await supabase.from('food_logs').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// The family's food: people, shared meals, recipes
// ---------------------------------------------------------------------------

/** The family coach, who logs meals for the others too (chosen in Forza! Coach); null when there is none. */
export async function getFamilyCoach(): Promise<string | null> {
  const { data, error } = await supabase.from('family').select('coach_id').maybeSingle()
  return error ? null : ((data as { coach_id: string | null } | null)?.coach_id ?? null)
}

/** Everyone in the family but this person, by name. */
export async function getFamilyPeople(myId: string): Promise<{ id: string; display_name: string }[]> {
  const rows = check(await supabase.rpc('family_people')) as { id: string; display_name: string }[]
  return rows.filter((p) => p.id !== myId)
}

/** Copies these meals into the food logs of the people who ate the same (each portion × factor). */
/** Each person's share of the whole meal as logged (1 = all of it; a dish eaten only in part counts whole). */
export async function shareMeals(ids: string[], people: { id: string; share: number }[]): Promise<number> {
  return check(await supabase.rpc('share_meal', { p_ids: ids, p_users: people.map((p) => p.id), p_shares: people.map((p) => p.share) })) as number
}

/** The copies of one of this person's meals that they shared: whose log, and what each one had. */
export async function getSharedCopies(mealId: string): Promise<SharedCopy[]> {
  return check(await supabase.rpc('shared_copies', { p_from: mealId })) as SharedCopy[]
}

/** Changes someone's copy of a meal this person shared (their portion, foods out or back in, amounts). */
export async function updateSharedMeal(id: string, items: FoodItem[]): Promise<void> {
  check(await supabase.rpc('update_shared_meal', { p_id: id, p_items: items }))
}

/** Takes copies of a meal this person shared out of the others' food logs; returns how many went. */
export async function deleteSharedCopies(ids: string[]): Promise<number> {
  return check(await supabase.rpc('delete_shared_copies', { p_ids: ids })) as number
}

export async function getRecipes(): Promise<Recipe[]> {
  return check(await supabase.from('recipes').select('*').order('updated_at', { ascending: false })) as Recipe[]
}

/** Saves a recipe (and its food in the family database, per 100 g of the dish); returns its id. */
export async function saveRecipe(r: { id?: string; name: string; servings: number; total_g: number | null; items: FoodItem[]; source?: Recipe['source']; source_url?: string | null }): Promise<string> {
  return check(await supabase.rpc('save_recipe', { p_recipe: r })) as string
}

export async function deleteRecipe(id: string): Promise<void> {
  check(await supabase.from('recipes').delete().eq('id', id))
}

/** Reads a recipe page (Cookidoo, the Bimby recipe site, any page with a recipe in it) on the server. */
export async function importRecipe(url: string): Promise<{ name: string; servings: number | null; ingredients: string[]; nutrition: { kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number } | null; image: string | null }> {
  const { data, error } = await supabase.functions.invoke('food-search', { body: { mode: 'recipe', url } })
  if (error) throw new Error(((await (error as { context?: Response }).context?.json?.().catch(() => null)) as { error?: string } | null)?.error ?? 'recipe_failed')
  return data
}

/** A Thermomix (Bimby) recipe found by a search: in Italian from the Bimby recipe community. */
export interface FoundRecipe {
  title: string
  url: string
  image: string | null
  rating: number | null
}

/** Searches Thermomix recipes in the person's language; also gives the address of Cookidoo's own search. */
export async function searchBimby(q: string, locale: string): Promise<{ results: FoundRecipe[]; cookidooUrl: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('food-search', { body: { mode: 'recipe_search', q, locale } })
  if (error) throw new Error('search_failed')
  return data
}

// ---------------------------------------------------------------------------
// Each day's food, checked; the targets over time
// ---------------------------------------------------------------------------

export async function getFoodDays(sinceDays = 60): Promise<FoodDay[]> {
  return check(await supabase.from('food_days').select('day, status, skipped').gte('day', localDay(daysAgo(sinceDays))).order('day')) as FoodDay[]
}

export async function setFoodDay(day: string, patch: { status?: FoodDay['status']; skipped?: Meal[] }): Promise<void> {
  check(await supabase.from('food_days').upsert({ day, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' }))
}

export async function getTargetHistory(sinceDays = 3650): Promise<TargetDay[]> {
  return check(await supabase.from('target_history').select('day, kcal, protein_g, carbs_g, fat_g, tdee, method, weight_kg').gte('day', localDay(daysAgo(sinceDays))).order('day')) as TargetDay[]
}

/** Today's targets, kept once a day (a later change the same day replaces them). */
export async function saveTargetDay(t: TargetDay): Promise<void> {
  check(await supabase.from('target_history').upsert(t, { onConflict: 'user_id,day' }))
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
  const { data, error } = await supabase.functions.invoke('food-estimate', { body: { mime: 'image/jpeg', ...body } })
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

/** A meal described in words (dictated): the same answer as a photo. */
export function estimateText(input: { text: string; locale: string; goal: string; meal: string }): Promise<AiPlate> {
  return invokeFoodAi<AiPlate>({ ...input, mode: 'text' })
}

/** A recorded voice note turned into words, for browsers without speech recognition (Firefox). */
export function transcribeAudio(input: { audio: string; mime: string; locale: string }): Promise<{ text: string }> {
  return invokeFoodAi<{ text: string }>({ ...input, mode: 'transcribe' })
}

/** A dish of a restaurant menu with rough values for one portion. */
export interface MenuDish {
  name: string
  description: string
  portion_g: number
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  satfat_g: number
}

/** The menu read, the dish chosen for today (by its place in the list) and why, in everyday words. */
export interface MenuPick {
  dishes: MenuDish[]
  choice: number
  why: string
  tweak: string
  also: { dish: number; why: string }[]
  rather_not: { dish: number; why: string }[]
}

/** "What should I order?": a menu (photo or words) and the person's day so far; read by a quick AI, chosen by a stronger one. */
export function pickFromMenu(input: { image?: string; text?: string; locale: string; goal: string; meal: string; hour: number; eaten: string[]; day: Record<string, number>; targets: Record<string, number> }): Promise<MenuPick> {
  return invokeFoodAi<MenuPick>({ ...input, mode: 'menu' })
}

/**
 * "Build your own recipe": the foods someone has (with their values, when known) and what is left of their day; up to
 * three recipes for the meal, the amounts to be fitted by the app.
 */
export function recipesFromAi(input: { foods: { name: string; per100: Per100 | null }[]; locale: string; goal: string; meal: string; eaten: string[]; target: Record<string, number> }): Promise<{ recipes: AiRecipe[] }> {
  return invokeFoodAi<{ recipes: AiRecipe[] }>({ ...input, mode: 'recipe' })
}

/** An exercise of the free exercise database that may be the one described. */
export interface LibraryMatch {
  id: string
  name_en: string
  name_it: string
  why: string
  equipment: string
  muscles: string[]
  images: string[]
  instructions: string[]
}

/** Exercises found from a description in everyday words ("I raise a knee and touch it with the opposite elbow"). */
export async function findExercises(query: string, locale: string): Promise<LibraryMatch[]> {
  return (await invokeFoodAi<{ matches: LibraryMatch[] }>({ mode: 'exercise', query, locale })).matches
}

/** One exercise of the database, ready to add: short steps in both languages, its kind, its photos in the project's storage. */
export function exerciseFromLibrary(id: string): Promise<{ source_id: string; name_en: string; name_it: string; kind: ExerciseKind; equipment: string; muscles: string[]; steps_en: string[]; steps_it: string[]; image_urls: string[] }> {
  return invokeFoodAi({ mode: 'exercise_add', id })
}

/** Dictated words rewritten as a clean list of foods with their amounts, one per line. */
export function tidyText(input: { text: string; locale: string }): Promise<{ text: string }> {
  return invokeFoodAi<{ text: string }>({ ...input, mode: 'tidy' })
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
  salt_g?: number
  satfat_g?: number
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

/** What the phone found on its last sync, per kind of data (see health-ingest). */
export interface SyncReport {
  app?: 'android'
  source?: string
  types?: Record<string, { allowed: boolean; found: number; sources: string[] }>
  received?: { steps: number; weights: number; activities: number; meals: number }
}

export async function hasSyncKey(): Promise<{ exists: boolean; lastUsed: string | null; report: SyncReport | null }> {
  const row = check(await supabase.from('sync_tokens').select('last_used_at, last_report').maybeSingle()) as { last_used_at: string | null; last_report: SyncReport | null } | null
  return { exists: Boolean(row), lastUsed: row?.last_used_at ?? null, report: row?.last_report ?? null }
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

export async function getLessonProgress(): Promise<LessonRow[]> {
  return check(await supabase.from('lesson_progress').select('lesson_id, read_at, quiz_score, quiz_passed_at')) as LessonRow[]
}

/** Daily points quiz answers of the last half year (enough to know when each question comes back). */
export async function getQuizAnswers(): Promise<QuizAnswer[]> {
  return check(await supabase.from('quiz_answers').select('day, question_id, correct, answered_at').gte('day', localDay(daysAgo(180)))) as QuizAnswer[]
}

/** Saves one answer of the daily points quiz (two a day at most); returns today's points from it. */
export async function answerPointsQuiz(day: string, questionId: string, correct: boolean): Promise<number> {
  return check(await supabase.rpc('answer_points_quiz', { p_day: day, p_question: questionId, p_correct: correct })) as number
}

/** Saves a quiz result (and marks the lesson read). A pass is kept even if a later try goes worse. */
export async function saveQuiz(lessonId: string, score: number): Promise<void> {
  const passed = score >= 100
  const { data } = await supabase.from('lesson_progress').select('quiz_passed_at, quiz_score').eq('lesson_id', lessonId).maybeSingle()
  check(
    await supabase.from('lesson_progress').upsert(
      {
        lesson_id: lessonId,
        quiz_score: Math.max(score, data?.quiz_score ?? 0),
        quiz_passed_at: data?.quiz_passed_at ?? (passed ? new Date().toISOString() : null),
      },
      { onConflict: 'user_id,lesson_id' },
    ),
  )
}

export interface BoardRow {
  user_id: string
  display_name: string
  points: number
  workouts: number
  lessons: number
  active_days: number
  is_me: boolean
}

/** The family challenge board (only people who joined it; empty if you did not join). */
export async function familyBoard(days = 7): Promise<BoardRow[]> {
  return check(await supabase.rpc('family_board', { p_days: days })) as BoardRow[]
}

export async function markLessonRead(lessonId: string, read = true): Promise<void> {
  if (read) check(await supabase.from('lesson_progress').upsert({ lesson_id: lessonId }, { onConflict: 'user_id,lesson_id' }))
  else check(await supabase.from('lesson_progress').delete().eq('lesson_id', lessonId))
}
