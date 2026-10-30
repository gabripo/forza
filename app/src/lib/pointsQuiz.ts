// "Gain Family Points": two review questions a day from the lessons already read, 5 points for each right
// answer. It keeps points coming after every lesson and quiz is done, and it is spaced repetition: a question
// answered wrong comes back the next day, one answered right comes back later and later.
import type { Topic } from '../pages/learn/content'
import type { Question } from '../pages/learn/more'
import { quizOf } from './knowledge'

export const DAILY_QUESTIONS = 2
/** Days until a question answered right comes back, after 1, 2, 3, 4 or more right answers in a row. */
const INTERVALS = [3, 7, 21, 60]

export interface BankQuestion extends Question {
  /** '<lesson id>:<question index>' */
  id: string
  lesson: Topic
}

export interface QuizAnswer {
  day: string
  question_id: string
  correct: boolean
  answered_at: string
}

/** Every question of the lessons this person has read. */
export function questionBank(lessons: Topic[], read: Set<string>): BankQuestion[] {
  return lessons.filter((t) => read.has(t.id)).flatMap((t) => quizOf(t).map((q, i) => ({ ...q, id: `${t.id}:${i}`, lesson: t })))
}

/** A small, stable hash: the same person and day always get the same order. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const dayNumber = (day: string) => Math.round(new Date(`${day}T12:00:00Z`).getTime() / 86_400_000)

/**
 * Today's questions. They stay the same all day: answers given today are kept in their place and the rest is
 * chosen from the days before. Order of choice: answered wrong last time, never asked, answered right and due
 * again (the longest overdue first), then the ones coming back soonest. Two lessons rather than one, if possible.
 */
export function todaysQuestions(bank: BankQuestion[], answers: QuizAnswer[], today: string, seed: string): BankQuestion[] {
  const byId = new Map(bank.map((q) => [q.id, q]))
  const answeredToday = answers
    .filter((a) => a.day === today)
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))
    .map((a) => byId.get(a.question_id))
    .filter((q): q is BankQuestion => Boolean(q))
  const history = new Map<string, QuizAnswer[]>()
  for (const a of answers.filter((x) => x.day < today).sort((x, y) => x.day.localeCompare(y.day))) {
    history.set(a.question_id, [...(history.get(a.question_id) ?? []), a])
  }
  const now = dayNumber(today)
  const ranked = bank
    .filter((q) => !answeredToday.includes(q))
    .map((q) => {
      const past = history.get(q.id) ?? []
      const last = past.at(-1)
      const tie = hash(`${seed}:${today}:${q.id}`) / 2 ** 32
      if (!last) return { q, group: 1, key: tie }
      let streak = 0
      for (let i = past.length - 1; i >= 0 && past[i].correct; i--) streak++
      const due = dayNumber(last.day) + (last.correct ? INTERVALS[Math.min(streak, INTERVALS.length) - 1] : 1)
      if (!last.correct && due <= now) return { q, group: 0, key: tie }
      if (due <= now) return { q, group: 2, key: due + tie }
      return { q, group: 3, key: due + tie }
    })
    .sort((a, b) => a.group - b.group || a.key - b.key)
    .map((x) => x.q)
  const picked = [...answeredToday]
  for (const q of ranked) {
    if (picked.length >= DAILY_QUESTIONS) break
    if (!picked.some((p) => p.lesson.id === q.lesson.id)) picked.push(q)
  }
  for (const q of ranked) {
    if (picked.length >= DAILY_QUESTIONS) break
    if (!picked.includes(q)) picked.push(q)
  }
  return picked.slice(0, Math.max(DAILY_QUESTIONS, answeredToday.length))
}

/** The options in a new order every time the question comes back, so the answer is remembered, not its place. */
export function shuffled(q: BankQuestion, key: string): { options: Question['options']; answer: number } {
  const order = q.options.map((_, i) => i).sort((a, b) => hash(`${key}:${a}`) - hash(`${key}:${b}`))
  return { options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) }
}

export interface QuizToday {
  unlocked: boolean
  done: boolean
  pointsToday: number
  /** The next question to answer today, for a teaser. */
  next: BankQuestion | null
}

/** Where today's quiz stands, for the cards on Home and Learn. */
export function quizToday(lessons: Topic[], read: Set<string>, answers: QuizAnswer[], today: string, seed: string, pointsEach: number): QuizToday {
  const bank = questionBank(lessons, read)
  const todays = answers.filter((a) => a.day === today)
  const questions = bank.length >= DAILY_QUESTIONS ? todaysQuestions(bank, answers, today, seed) : []
  return {
    unlocked: bank.length >= DAILY_QUESTIONS,
    done: todays.length >= DAILY_QUESTIONS,
    pointsToday: todays.filter((a) => a.correct).length * pointsEach,
    next: questions.find((q) => !todays.some((a) => a.question_id === q.id)) ?? null,
  }
}
