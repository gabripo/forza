import { CalendarCheck, CheckCircle2, CircleDashed, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/auth'
import { localDay, type Targets } from '../lib/calc'
import { setFoodDay } from '../lib/data'
import { dayQuestion, evaluateDay, type Totals } from '../lib/dayCheck'
import { useI18n } from '../lib/i18n'
import { loggableDay, startMeal, type LogStart } from '../lib/logDay'
import type { FoodDay, FoodLog, Meal } from '../lib/types'
import { Button } from './ui'

/**
 * The whole day at a glance, above the meals (snacks included): a score and what went well and what to add,
 * said kindly. Today is judged on the hours gone by.
 */
export function DayEvaluationCard({ totals, targets, day }: { totals: Totals; targets: Targets; day: string }) {
  const { t } = useI18n()
  const e = evaluateDay(totals, targets, day)
  const tone = e.band === 'great' || e.band === 'good' ? 'bg-leaf-soft' : e.band === 'okay' ? 'bg-sun-soft' : 'bg-card-2'
  return (
    <section className={`rounded-3xl p-4 ${tone}`} aria-label={t(e.inProgress ? 'dayEval.titleToday' : 'dayEval.title')}>
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-card text-xl font-extrabold tabular shadow-sm">{e.score}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-wide text-ink-2 uppercase">{t(e.inProgress ? 'dayEval.titleToday' : 'dayEval.title')}</p>
          <p className="text-lg leading-tight font-bold">{t(`dayEval.${e.inProgress ? 'bandToday' : 'band'}.${e.band}`)}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {e.good.map((g) => (
          <li key={g} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-sm font-semibold text-leaf">
            <CheckCircle2 className="size-4" aria-hidden /> {t(`dayEval.good.${g}`)}
          </li>
        ))}
        {e.todo.map((x) => (
          <li key={x} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-sm font-semibold text-ink">
            <CircleDashed className="size-4 text-sun" aria-hidden /> {t(`dayEval.todo.${x}`)}
          </li>
        ))}
      </ul>
      {e.inProgress ? <p className="mt-2 text-xs text-ink-3">{t('dayEval.inProgress')}</p> : null}
    </section>
  )
}

const PATTERN_ASKED = 'forza.skipPatternAsked'

function patternAsked(): Meal[] {
  try {
    const all = JSON.parse(localStorage.getItem(PATTERN_ASKED) ?? '{}') as Record<string, string>
    // "No, it just happened": not asked again for two weeks.
    return Object.entries(all)
      .filter(([, at]) => Date.now() - new Date(at).getTime() < 14 * 86_400_000)
      .map(([m]) => m as Meal)
  } catch {
    return []
  }
}

function rememberAsked(meal: Meal) {
  try {
    const all = JSON.parse(localStorage.getItem(PATTERN_ASKED) ?? '{}') as Record<string, string>
    localStorage.setItem(PATTERN_ASKED, JSON.stringify({ ...all, [meal]: new Date().toISOString() }))
  } catch {
    // asked again next time: no harm
  }
}

/**
 * Once a day is over, one question at a time about it: was a meal skipped, was everything logged, is a meal
 * always skipped (intermittent fasting)? The answers keep the averages right: a day not all logged is left out.
 */
export function DayQuestionCard({ food, notes, targets, onAnswered }: { food: FoodLog[]; notes: FoodDay[]; targets: Targets; onAnswered: () => void }) {
  const { t, date } = useI18n()
  const { profile, saveProfile } = useApp()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [asked, setAsked] = useState(patternAsked)
  if (!profile) return null
  const q = done ? null : dayQuestion(food, notes, profile.skip_meals ?? [], targets.kcal, new Date(), asked)
  if (!q) return done ? <p className="rounded-3xl bg-leaf-soft p-3 text-center font-semibold text-leaf">{t('dayQ.thanks')}</p> : null

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const when = (day: string) => (day === localDay(yesterday) ? t('dayQ.yesterday') : t('dayQ.on', { date: date(day, { weekday: 'long', day: 'numeric' }) }))
  const meal = (m: Meal) => t(`meal.${m}`).toLowerCase()
  const note = (day: string) => notes.find((n) => n.day === day)

  async function answer(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      setDone(true)
      onAnswered()
      // The next question, if any, shows up after a moment.
      setTimeout(() => setDone(false), 1500)
    } finally {
      setBusy(false)
    }
  }

  let title = ''
  let text: string | null = null
  let yes = ''
  let no = ''
  let onYes: () => Promise<void> = async () => {}
  let onNo: () => Promise<void> = async () => {}
  // Eaten but not logged: it can go into that day now, on that meal (or the first one missing).
  let add: LogStart | null = null
  if (q.kind === 'skipped') {
    title = t('dayQ.skippedTitle', { meal: meal(q.meal), day: when(q.day) })
    yes = t('dayQ.skippedYes')
    no = t('dayQ.skippedNo')
    onYes = () => setFoodDay(q.day, { skipped: [...(note(q.day)?.skipped ?? []), q.meal] })
    onNo = () => setFoodDay(q.day, { status: 'incomplete' })
    add = { day: q.day, meal: q.meal }
  } else if (q.kind === 'incomplete') {
    title = t('dayQ.incompleteTitle', { day: when(q.day), kcal: q.kcal, target: q.target })
    text = t('dayQ.incompleteText')
    yes = t('dayQ.incompleteYes')
    no = t('dayQ.incompleteNo')
    onYes = () => setFoodDay(q.day, { status: 'complete' })
    onNo = () => setFoodDay(q.day, { status: 'incomplete' })
    add = { day: q.day, meal: startMeal(q.day, food) }
  } else {
    title = t('dayQ.patternTitle', { meal: meal(q.meal), n: q.days })
    text = t('dayQ.patternText')
    yes = t('dayQ.patternYes')
    no = t('dayQ.patternNo')
    onYes = () => saveProfile({ skip_meals: [...(profile.skip_meals ?? []), q.meal] })
    onNo = async () => {
      rememberAsked(q.meal)
      setAsked(patternAsked())
    }
  }

  return (
    <section className="rounded-3xl border-2 border-sky bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-sky uppercase">
        <CalendarCheck className="size-5" aria-hidden /> {t('dayQ.label')}
      </p>
      <p className="mt-1 text-lg leading-snug font-bold">{title}</p>
      {text ? <p className="mt-1 text-ink-2">{text}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void answer(onYes)} loading={busy}>
          {yes}
        </Button>
        <Button variant="secondary" onClick={() => void answer(onNo)} disabled={busy}>
          {no}
        </Button>
        {add && loggableDay(add.day) ? (
          <Button variant="ghost" onClick={() => navigate('/food/add', { state: add })} disabled={busy}>
            <Plus className="size-5" aria-hidden /> {t('dayQ.addNow')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
