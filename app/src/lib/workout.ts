// The workout in progress lives on the phone (localStorage) until it is finished,
// so closing the app or losing signal at the gym never loses a set.
import { supabase } from './supabase'
import type { Exercise, SetLog, TemplateExercise, WorkoutTemplate } from './types'

export interface ActiveSet {
  weight: number | null
  reps: number | null
  duration: number | null
  rir: number | null
  done: boolean
  doneAt: string | null
  /** Warm-up set: lighter, not counted in progress. */
  warmup?: boolean
}

export interface Suggestion {
  kind: 'first' | 'increase' | 'more_reps' | 'repeat' | 'lighter'
  weight: number | null
  reps: number
}

export interface ActiveExercise {
  exercise_id: string
  rep_min: number
  rep_max: number
  rest_s: number
  note?: string | null
  superset?: number | null
  sets: ActiveSet[]
  last: { weight: number | null; reps: number | null; duration: number | null }[]
  suggestion: Suggestion | null
}

export interface ActiveWorkout {
  id: string
  template_id: string | null
  name: string
  started_at: string
  exercises: ActiveExercise[]
  rest: { endsAt: number; total: number } | null
}

const ACTIVE = 'forza.active'
const OUTBOX = 'forza.outbox'

export function loadActive(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(ACTIVE)
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null
  } catch {
    return null
  }
}

export function saveActive(w: ActiveWorkout | null): void {
  try {
    if (w) localStorage.setItem(ACTIVE, JSON.stringify(w))
    else localStorage.removeItem(ACTIVE)
  } catch {
    // storage full or blocked: the workout still lives in memory
  }
}

/** Weight jump used when it's time to progress. */
export function increment(ex: Exercise | undefined): number {
  switch (ex?.equipment) {
    case 'barbell':
      return 2.5
    case 'dumbbell':
      return 2
    case 'machine':
    case 'cable':
      return 2.5
    default:
      return 2.5
  }
}

/**
 * "Double progression", the simplest method that works for beginners:
 * stay at a weight until every set reaches the top of the rep range, then add a little weight.
 */
export function suggest(ex: Exercise | undefined, te: Pick<TemplateExercise, 'rep_min' | 'rep_max' | 'target_kg'>, last: SetLog[]): Suggestion {
  const working = last.filter((s) => !s.is_warmup)
  if (!working.length) return { kind: 'first', weight: te.target_kg ?? null, reps: te.rep_min }
  const weights = working.map((s) => Number(s.weight_kg ?? 0))
  const topWeight = Math.max(...weights)
  const atTop = working.filter((s) => Number(s.weight_kg ?? 0) === topWeight)
  const allHitMax = atTop.every((s) => (s.reps ?? 0) >= te.rep_max)
  const anyBelowMin = atTop.some((s) => (s.reps ?? 0) < te.rep_min)
  const maxedOut = atTop.every((s) => s.rir === 0)
  if (ex?.kind === 'time' || ex?.kind === 'cardio') {
    // For timed exercises "reps" carries seconds: aim a little longer than last time.
    const best = Math.max(...working.map((s) => s.duration_s ?? 0))
    return { kind: 'more_reps', weight: topWeight || null, reps: best + (ex.kind === 'time' ? 5 : 60) }
  }
  if (ex?.kind === 'bodyweight' && topWeight === 0) {
    const best = Math.max(...working.map((s) => s.reps ?? 0))
    return { kind: 'more_reps', weight: null, reps: best + 1 }
  }
  if (allHitMax) {
    return { kind: 'increase', weight: round(topWeight + increment(ex)), reps: te.rep_min }
  }
  if (anyBelowMin && maxedOut) {
    return { kind: 'lighter', weight: round(topWeight * 0.9), reps: te.rep_min }
  }
  const bestReps = Math.min(te.rep_max, Math.max(...atTop.map((s) => s.reps ?? 0)) + 1)
  return { kind: anyBelowMin ? 'repeat' : 'more_reps', weight: topWeight, reps: Math.max(te.rep_min, bestReps) }
}

function round(n: number): number {
  return Math.round(n * 4) / 4
}

/** Lifts where a short warm-up ramp really helps (heavier, multi-joint). */
const BIG_LIFTS = new Set([
  'back_squat',
  'deadlift',
  'romanian_deadlift',
  'bench_press',
  'incline_bench_press',
  'overhead_press',
  'barbell_row',
  'hip_thrust',
  'leg_press',
  'hack_squat',
  'db_bench_press',
  'incline_db_press',
])

export function wantsWarmup(te: Pick<TemplateExercise, 'warmup'>, ex: Exercise | undefined): boolean {
  if (te.warmup !== undefined && te.warmup !== null) return te.warmup
  return Boolean(ex && (BIG_LIFTS.has(ex.id) || ex.equipment === 'barbell'))
}

/** Warm-up ramp towards the working weight, e.g. 100 kg → 50×8, 70×4, 85×2. */
export function warmupSets(workingKg: number, ex: Exercise | undefined): { weight: number; reps: number }[] {
  if (workingKg < 20) return []
  const step = ex?.equipment === 'dumbbell' ? 2 : 2.5
  const r = (w: number) => Math.max(step, Math.round(w / step) * step)
  const ramp: [number, number][] = workingKg >= 60 ? [[0.5, 8], [0.7, 4], [0.85, 2]] : [[0.5, 8], [0.75, 4]]
  return ramp.map(([p, reps]) => ({ weight: r(workingKg * p), reps }))
}

export function startFromTemplate(
  t: Pick<WorkoutTemplate, 'id' | 'name' | 'exercises'> | null,
  exercises: Map<string, Exercise>,
  lastSets: Map<string, SetLog[]>,
  name?: string,
): ActiveWorkout {
  const list: TemplateExercise[] = t?.exercises ?? []
  return {
    id: crypto.randomUUID(),
    template_id: t?.id ?? null,
    name: name ?? t?.name ?? 'Workout',
    started_at: new Date().toISOString(),
    rest: null,
    exercises: list.map((te) => buildExercise(te, exercises.get(te.exercise_id), lastSets.get(te.exercise_id) ?? [])),
  }
}

export function buildExercise(te: TemplateExercise, ex: Exercise | undefined, last: SetLog[]): ActiveExercise {
  const s = suggest(ex, te, last)
  const isTime = ex?.kind === 'time' || ex?.kind === 'cardio'
  const working = s.weight ?? (last.length ? Math.max(...last.map((l) => Number(l.weight_kg ?? 0))) : 0)
  const warm: ActiveSet[] = wantsWarmup(te, ex)
    ? warmupSets(working, ex).map((w) => ({ weight: w.weight, reps: w.reps, duration: null, rir: null, done: false, doneAt: null, warmup: true }))
    : []
  return {
    exercise_id: te.exercise_id,
    rep_min: te.rep_min,
    rep_max: te.rep_max,
    rest_s: te.rest_s,
    note: te.note ?? null,
    superset: te.superset ?? null,
    suggestion: s,
    last: last.map((l) => ({ weight: l.weight_kg, reps: l.reps, duration: l.duration_s })),
    sets: [
      ...warm,
      ...Array.from({ length: Math.max(1, te.sets) }, (_, i) => ({
        weight: s.weight ?? last[i]?.weight_kg ?? null,
        reps: null,
        duration: isTime ? (last[i]?.duration_s ?? null) : null,
        rir: null,
        done: false,
        doneAt: null,
      })),
    ],
  }
}

// ---------------------------------------------------------------------------
// Saving (with an offline outbox)
// ---------------------------------------------------------------------------

interface Payload {
  p_session: Record<string, unknown>
  p_sets: Record<string, unknown>[]
}

export function toPayload(w: ActiveWorkout, effort: number | null, notes: string): Payload {
  const sets: Record<string, unknown>[] = []
  w.exercises.forEach((ex, order) => {
    ex.sets
      .filter((s) => s.done)
      .forEach((s, i) => {
        sets.push({
          exercise_id: ex.exercise_id,
          exercise_order: order,
          set_index: i,
          weight_kg: s.weight,
          reps: s.reps,
          duration_s: s.duration,
          rir: s.rir,
          is_warmup: Boolean(s.warmup),
          performed_at: s.doneAt,
        })
      })
  })
  return {
    p_session: {
      id: w.id,
      template_id: w.template_id,
      name: w.name,
      started_at: w.started_at,
      finished_at: new Date().toISOString(),
      effort,
      notes: notes || null,
    },
    p_sets: sets,
  }
}

function readOutbox(): Payload[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]') as Payload[]
  } catch {
    return []
  }
}

function writeOutbox(items: Payload[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function pendingCount(): number {
  return readOutbox().length
}

/** Queues a finished workout and tries to upload it. Returns true if it reached the server. */
export async function submitWorkout(p: Payload): Promise<boolean> {
  writeOutbox([...readOutbox().filter((x) => x.p_session.id !== p.p_session.id), p])
  const left = await flushOutbox()
  return !left.some((x) => x.p_session.id === p.p_session.id)
}

let flushing: Promise<Payload[]> | null = null

export function flushOutbox(): Promise<Payload[]> {
  if (flushing) return flushing
  flushing = (async () => {
    const remaining: Payload[] = []
    for (const p of readOutbox()) {
      const { error } = await supabase.rpc('save_workout', p as unknown as Record<string, unknown>)
      if (error) remaining.push(p)
    }
    writeOutbox(remaining)
    return remaining
  })().finally(() => {
    flushing = null
  })
  return flushing
}
