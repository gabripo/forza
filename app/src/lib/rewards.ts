// Points, balanced days and badges. Rewards are for doing the healthy things (reading, learning,
// logging, moving), never for a number on the scale, so everyone can earn them from day one.
// The points use the same rules as the family challenge (family_board in the database).
import { daysAgo, localDay } from './calc'
import type { BodyWeight, DailySteps, FoodLog, L10n } from './types'

export const POINTS = { workout: 20, lesson: 10, quiz: 20, weighIn: 5, mealsDay: 10, stepsDay: 10 }

export interface LessonRow {
  lesson_id: string
  read_at: string
  quiz_score: number | null
  quiz_passed_at: string | null
}

export interface RewardInput {
  lessons: LessonRow[]
  food: FoodLog[]
  weights: BodyWeight[]
  steps: DailySteps[]
  workouts: { started_at: string }[]
  targets: { kcal: number; protein_g: number }
  stepsGoal: number
  baseIds: string[]
  expertIds: string[]
}

/** A day eaten "by the guidelines": 2+ meals logged, calories within ±15% of the target, protein at 80%+. */
export function balancedDays(food: FoodLog[], targets: { kcal: number; protein_g: number }): Map<string, boolean> {
  const byDay = new Map<string, { kcal: number; protein: number; meals: number }>()
  for (const f of food) {
    const d = localDay(new Date(f.eaten_at))
    const x = byDay.get(d) ?? { kcal: 0, protein: 0, meals: 0 }
    x.kcal += Number(f.kcal)
    x.protein += Number(f.protein_g)
    x.meals++
    byDay.set(d, x)
  }
  const out = new Map<string, boolean>()
  for (const [d, x] of byDay) {
    out.set(d, x.meals >= 2 && x.kcal >= targets.kcal * 0.85 && x.kcal <= targets.kcal * 1.15 && x.protein >= targets.protein_g * 0.8)
  }
  return out
}

/** Consecutive days up to yesterday or today where `ok(day)` is true. */
function streak(ok: (day: string) => boolean): number {
  let n = 0
  let i = ok(localDay(new Date())) ? 0 : 1
  while (ok(localDay(daysAgo(i)))) {
    n++
    i++
  }
  return n
}

export function weekPoints(x: RewardInput): number {
  const since = daysAgo(7)
  const inWeek = (d: string) => new Date(d) >= since
  const days = (dates: string[]) => new Set(dates.filter(inWeek).map((d) => localDay(new Date(d)))).size
  const mealDays = [...countBy(x.food.filter((f) => inWeek(f.eaten_at)).map((f) => localDay(new Date(f.eaten_at))))].filter(([, n]) => n >= 2).length
  return (
    x.workouts.filter((w) => inWeek(w.started_at)).length * POINTS.workout +
    x.lessons.filter((l) => inWeek(l.read_at)).length * POINTS.lesson +
    x.lessons.filter((l) => l.quiz_passed_at && inWeek(l.quiz_passed_at)).length * POINTS.quiz +
    days(x.weights.map((w) => w.measured_at)) * POINTS.weighIn +
    mealDays * POINTS.mealsDay +
    x.steps.filter((s) => new Date(`${s.day}T12:00:00`) >= since && s.steps >= x.stepsGoal).length * POINTS.stepsDay
  )
}

function countBy(xs: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

export interface Badge {
  id: string
  emoji: string
  title: L10n
  text: L10n
  value: number
  goal: number
  done: boolean
}

const B = (id: string, emoji: string, title: L10n, text: L10n, value: number, goal: number): Badge => ({ id, emoji, title, text, value: Math.min(value, goal), goal, done: value >= goal })

export function badges(x: RewardInput): Badge[] {
  const read = new Set(x.lessons.map((l) => l.lesson_id))
  const quizzes = x.lessons.filter((l) => l.quiz_passed_at).length
  const balanced = balancedDays(x.food, x.targets)
  const last7 = Array.from({ length: 7 }, (_, i) => localDay(daysAgo(i)))
  const proteinDays = new Map<string, number>()
  for (const f of x.food) proteinDays.set(localDay(new Date(f.eaten_at)), (proteinDays.get(localDay(new Date(f.eaten_at))) ?? 0) + Number(f.protein_g))
  const loggedDays = new Set(x.food.map((f) => localDay(new Date(f.eaten_at))))
  return [
    B('first_step', '🌱', { en: 'First step', it: 'Primo passo' }, { en: 'Read your first lesson', it: 'Leggi la prima lezione' }, read.size, 1),
    B('curious', '🔎', { en: 'Curious mind', it: 'Mente curiosa' }, { en: 'Read 5 lessons', it: 'Leggi 5 lezioni' }, read.size, 5),
    B('quiz', '🧠', { en: 'Quiz champion', it: 'Asso dei quiz' }, { en: 'Pass 5 quizzes', it: 'Supera 5 quiz' }, quizzes, 5),
    B('graduate', '🎓', { en: 'Course complete', it: 'Corso completato' }, { en: 'Finish the beginners’ course', it: 'Completa il corso base' }, x.baseIds.filter((id) => read.has(id)).length, x.baseIds.length),
    B('expert', '🏅', { en: 'Expert level', it: 'Livello esperto' }, { en: 'Read 3 expert lessons', it: 'Leggi 3 lezioni esperte' }, x.expertIds.filter((id) => read.has(id)).length, 3),
    B('balanced', '⚖️', { en: 'Balanced week', it: 'Settimana equilibrata' }, { en: '3 balanced days in a week', it: '3 giorni equilibrati in una settimana' }, last7.filter((d) => balanced.get(d)).length, 3),
    B('protein', '🥚', { en: 'Protein pro', it: 'Proteine al top' }, { en: 'Reach your protein 3 days in a row', it: 'Raggiungi le proteine 3 giorni di fila' }, streak((d) => (proteinDays.get(d) ?? 0) >= x.targets.protein_g), 3),
    B('logger', '📒', { en: 'Food diary', it: 'Diario alimentare' }, { en: 'Log meals 7 days in a row', it: 'Registra i pasti 7 giorni di fila' }, streak((d) => loggedDays.has(d)), 7),
  ]
}
