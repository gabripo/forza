// The built-in knowledge base and food table, as data: `npm run export-knowledge` writes them to
// shared/knowledge.json and shared/foods.json for Forza! Coach, which cannot read the app's TypeScript.
import { ALL_TOPICS, EXPERT_TOPICS } from '../pages/learn/content'
import { QUIZZES } from '../pages/learn/more'
import { FOODS } from './foods'
import { LESSON_SOURCES, SOURCES } from './sources'
import { TIPS } from './tips'

const expert = new Set(EXPERT_TOPICS.map((t) => t.id))

export const knowledge = {
  lessons: ALL_TOPICS.map((t, i) => ({
    ...t,
    track: expert.has(t.id) ? 'expert' : 'course',
    position: expert.has(t.id) ? i - (ALL_TOPICS.length - EXPERT_TOPICS.length) : i,
    sources: t.sources ?? LESSON_SOURCES[t.id] ?? [],
    quiz: QUIZZES[t.id] ?? null,
  })),
  tips: TIPS,
  sources: Object.values(SOURCES),
}

/** The built-in foods (values per 100 g), for adding meals in Coach. */
export const foods = FOODS
