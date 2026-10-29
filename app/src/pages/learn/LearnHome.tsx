import { Check, ChevronRight, GraduationCap, Printer, Sparkles, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Progress, Segmented } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { getFood, getLessonProgress, getSessions, getSteps, getWeights, useAsync } from '../../lib/data'
import { computeEnergy } from '../../lib/energy'
import { useI18n } from '../../lib/i18n'
import { badges, POINTS, weekPoints } from '../../lib/rewards'
import { EXPERT_TOPICS, TOPICS } from './content'
import { TONES } from './Infographic'
import { QUIZZES } from './more'

type Track = 'course' | 'expert'

export function LearnHome() {
  const { t, l } = useI18n()
  const { profile } = useApp()
  const { data } = useAsync(() => Promise.all([getLessonProgress(), getFood(28), getWeights(30), getSteps(14), getSessions(14)]), [])
  const [track, setTrack] = useState<Track>('course')

  const view = useMemo(() => {
    if (!data || !profile) return null
    const [lessons, food, weights, steps, sessions] = data
    const energy = computeEnergy(profile, weights, steps, sessions, food)
    const input = {
      lessons,
      food,
      weights,
      steps,
      workouts: sessions,
      targets: energy.targets,
      stepsGoal: profile.steps_goal,
      baseIds: TOPICS.map((x) => x.id),
      expertIds: EXPERT_TOPICS.map((x) => x.id),
    }
    return { rows: new Map(lessons.map((r) => [r.lesson_id, r])), points: weekPoints(input), badges: badges(input) }
  }, [data, profile])

  const topics = track === 'course' ? TOPICS : EXPERT_TOPICS
  const done = topics.filter((x) => view?.rows.has(x.id)).length
  const nextId = topics.find((x) => !view?.rows.has(x.id))?.id
  // The badge closest to being earned: a near goal is the strongest pull.
  const nextBadge = view?.badges.filter((b) => !b.done).sort((a, b) => b.value / b.goal - a.value / a.goal)[0]

  return (
    <div className="grid gap-4">
      <PageHeader title={t('learn.title')} subtitle={t('learn.subtitle')} />

      {view ? (
        <div className="grid gap-3 rounded-3xl border border-line bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-sun-soft text-sun">
              <Trophy className="size-6" aria-hidden />
            </span>
            <div className="flex-1">
              <p className="text-2xl leading-none font-extrabold tabular">{view.points}</p>
              <p className="text-sm text-ink-2">{t('rewards.pointsWeek')}</p>
            </div>
            <Link to="/challenge" className="text-sm font-semibold text-brand-ink">
              {t('rewards.challenge')} →
            </Link>
          </div>
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t('rewards.badges')}>
            {view.badges.map((b) => (
              <li key={b.id} title={`${l(b.title)}: ${l(b.text)}`} className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${b.done ? 'bg-sun-soft' : 'bg-card-2 opacity-40 grayscale'}`}>
                <span aria-label={`${l(b.title)}${b.done ? ' ✓' : ''}`}>{b.emoji}</span>
              </li>
            ))}
          </ul>
          {nextBadge ? (
            <div>
              <p className="mb-1 text-sm">
                {t('rewards.nextBadge')} <b>{nextBadge.emoji} {l(nextBadge.title)}</b>: {l(nextBadge.text)} ({nextBadge.value}/{nextBadge.goal})
              </p>
              <Progress value={nextBadge.value} max={nextBadge.goal} color="var(--sun)" />
            </div>
          ) : null}
        </div>
      ) : null}

      <Segmented<Track>
        value={track}
        onChange={setTrack}
        options={[
          { value: 'course', label: `🌱 ${t('learn.basics')}` },
          { value: 'expert', label: `🎓 ${t('learn.expert')}` },
        ]}
      />

      <div className="rounded-3xl border border-line bg-card p-4">
        <div className="mb-2 flex justify-between font-bold">
          <span className="flex items-center gap-1">{track === 'course' ? <Sparkles className="size-4 text-sky" aria-hidden /> : <GraduationCap className="size-4 text-sky" aria-hidden />} {track === 'course' ? t('learn.course') : t('learn.expertTrack')}</span>
          <span className="text-ink-2">{t('learn.progress', { n: done, total: topics.length })}</span>
        </div>
        <Progress value={done} max={topics.length} color="var(--sky)" />
        {track === 'expert' ? <p className="mt-2 text-sm text-ink-2">{t('learn.expertIntro')}</p> : null}
      </div>

      <ol className="grid gap-3">
        {topics.map((topic, i) => {
          const tone = TONES[topic.tone]
          const row = view?.rows.get(topic.id)
          const isNext = topic.id === nextId
          return (
            <li key={topic.id}>
              <Link
                to={`/learn/${topic.id}`}
                className={`flex items-center gap-3 rounded-3xl border bg-card p-3 active:bg-card-2 ${isNext ? 'border-sky ring-2 ring-sky' : 'border-line'}`}
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl text-4xl" style={{ background: tone.bg }} aria-hidden>
                  {topic.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-ink-3">
                    {t('learn.lesson', { n: i + 1 })}
                    {isNext ? ` · ${t('learn.nextLesson')}` : ''}
                    {!row && QUIZZES[topic.id] ? ` · +${POINTS.lesson + POINTS.quiz} ${t('rewards.pts')}` : ''}
                  </span>
                  <span className="block leading-tight font-bold">{l(topic.title)}</span>
                  <span className="block text-sm text-ink-2">{l(topic.subtitle)}</span>
                </span>
                {row ? (
                  <span className="flex shrink-0 flex-col items-center gap-0.5">
                    <span className="grid size-7 place-items-center rounded-full bg-leaf text-white dark:text-black" aria-label={t('learn.read')}>
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    {row.quiz_passed_at ? <span className="text-xs" aria-label={t('quiz.passed')}>🏆</span> : null}
                  </span>
                ) : (
                  <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                )}
              </Link>
            </li>
          )
        })}
      </ol>
      <Link to={`/learn/print/${track}`} className="flex items-center justify-center gap-2 rounded-2xl bg-card-2 p-3 font-semibold">
        <Printer className="size-5" aria-hidden /> {t('learn.printAll')}
      </Link>
      <p className="text-center text-sm text-ink-3">{t('learn.printHint')}</p>
    </div>
  )
}
