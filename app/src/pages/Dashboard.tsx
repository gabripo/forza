import { BookOpen, Camera, Check, ChevronRight, Footprints, Lightbulb, Play, Plus, Scale, Settings as SettingsIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart, MacroBar, Ring } from '../components/charts'
import { LogWeightSheet } from '../components/LogWeightSheet'
import { StrengthChart } from '../components/StrengthChart'
import { Button, Card, Loading, Progress, cx } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { tipOfTheDay } from '../data/tips'
import { useApp } from '../lib/auth'
import { dailyWeights, daysAgo, localDay, weekStart, weightTrend } from '../lib/calc'
import { getActivities, getFood, getReadLessons, getSessions, getSteps, getTemplates, getWeights, useAsync } from '../lib/data'
import { computeEnergy } from '../lib/energy'
import { useI18n } from '../lib/i18n'
import { activityMinutes, nextTemplate } from '../lib/plan'
import { TOPICS } from './learn/content'

export function Dashboard() {
  const { t, l, num, kg, date } = useI18n()
  const { profile } = useApp()
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const { data, loading, reload } = useAsync(
    () => Promise.all([getWeights(180), getSessions(120), getSteps(60), getFood(28), getTemplates(), getActivities(3), getReadLessons()]),
    [],
  )

  const view = useMemo(() => {
    if (!data || !profile) return null
    const [weights, sessions, steps, food, templates, activities, readLessons] = data
    const energy = computeEnergy(profile, weights, steps, sessions, food)
    const trend = weightTrend(dailyWeights(weights))
    const today = localDay(new Date())
    const todayFood = food.filter((f) => localDay(new Date(f.eaten_at)) === today)
    const eaten = todayFood.reduce(
      (a, f) => ({ kcal: a.kcal + Number(f.kcal), protein: a.protein + Number(f.protein_g) }),
      { kcal: 0, protein: 0 },
    )
    // Workouts per week, last 8 weeks
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = weekStart(daysAgo(7 * (7 - i)))
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      const n = sessions.filter((s) => {
        const d = new Date(s.started_at)
        return d >= start && d < end
      }).length
      return { key: start.toISOString(), label: date(start, { day: 'numeric', month: 'numeric' }), value: n, highlight: i === 7 }
    })
    const thisWeek = weeks[7].value
    const lastSession = sessions[0]
    const daysSinceLast = lastSession ? Math.floor((Date.now() - new Date(lastSession.started_at).getTime()) / 86_400_000) : null
    const trainedToday = lastSession && localDay(new Date(lastSession.started_at)) === today
    const stepsToday = steps.find((s) => s.day === today)?.steps ?? null
    const next = nextTemplate(templates, sessions)
    const weighedToday = weights.some((w) => localDay(new Date(w.measured_at)) === today)
    const activeMinutes = activities.filter((a) => localDay(new Date(a.started_at)) === today).reduce((m, a) => m + activityMinutes(a), 0)
    const nextLesson = TOPICS.find((x) => !readLessons.has(x.id)) ?? null
    const startKg = Number(profile.start_weight_kg ?? trend[0]?.kg ?? 0)
    const nowKg = trend.at(-1)?.trend ?? null
    return {
      weights,
      sessions,
      energy,
      eaten,
      weeks,
      thisWeek,
      daysSinceLast,
      trainedToday,
      stepsToday,
      next,
      weighedToday,
      todayFoodCount: todayFood.length,
      activeMinutes,
      nextLesson,
      lessonsRead: readLessons.size,
      startKg,
      nowKg,
      allSets: sessions.flatMap((s) => s.sets),
    }
  }, [data, profile, date])

  if (loading && !data) return <Loading />
  if (!view || !profile) return null

  const goal = profile.workouts_per_week
  const message = view.trainedToday
    ? t('dash.msg.trainedToday')
    : view.thisWeek >= goal
      ? t('dash.msg.weekDone')
      : view.daysSinceLast !== null && view.daysSinceLast >= 4
        ? t('dash.msg.comeBack')
        : t('dash.msg.default')
  const tip = tipOfTheDay()
  const tipTopic = TOPICS.find((x) => x.id === tip.topic)
  const hour = new Date().getHours()
  const hello = hour < 12 ? t('dash.morning') : hour < 18 ? t('dash.afternoon') : t('dash.evening')
  const delta = view.nowKg !== null && view.startKg ? view.nowKg - view.startKg : null

  return (
    <div className="grid gap-4">
      <header className="pt-safe flex items-start justify-between gap-3 pt-4">
        <div>
          <p className="text-ink-2">{date(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {hello}, {profile.display_name}!
          </h1>
          <p className="mt-1 text-lg text-ink-2">{message}</p>
        </div>
        <Link to="/settings" className="grid size-12 shrink-0 place-items-center rounded-full bg-card-2" aria-label={t('settings.title')}>
          <SettingsIcon className="size-6" />
        </Link>
      </header>

      {/* Daily checklist */}
      <Checklist
        items={[
          {
            key: 'workout',
            done: Boolean(view.trainedToday) || (view.next?.daysAway ?? 0) > 0,
            label: view.trainedToday ? t('check.list.workoutDone') : (view.next?.daysAway ?? 0) > 0 ? t('check.list.restDay') : t('check.list.workout', { name: view.next?.template.name ?? '' }),
            to: view.next && !view.trainedToday && (view.next.daysAway ?? 0) === 0 ? `/train?start=${view.next.template.id}` : '/train',
          },
          { key: 'weight', done: view.weighedToday, label: view.weighedToday ? t('check.list.weighed') : t('check.list.weigh'), onClick: () => setLogOpen(true) },
          { key: 'food', done: view.todayFoodCount > 0, label: view.todayFoodCount ? t('check.list.foodDone', { n: view.todayFoodCount }) : t('check.list.food'), to: '/food' },
          {
            key: 'steps',
            done: (view.stepsToday ?? 0) >= profile.steps_goal,
            label: t('check.list.steps', { n: num(view.stepsToday ?? 0), goal: num(profile.steps_goal) }),
            to: '/settings/health',
          },
        ]}
      />

      {/* Next workout */}
      <Card tone="brand">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-ink">
              {!view.next ? t('dash.nextUp') : view.next.daysAway === 0 ? t('train.today') : view.next.daysAway ? t('train.onDay', { day: date(addDays(view.next.daysAway), { weekday: 'long' }) }) : t('dash.nextUp')}
            </p>
            <p className="text-xl leading-tight font-bold">{view.next ? view.next.template.name : t('dash.noPlan')}</p>
            {view.next ? <p className="text-sm text-ink-2">{t('train.nExercises', { n: view.next.template.exercises.length })}</p> : null}
            {view.activeMinutes ? (
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-2">
                <Footprints className="size-4" aria-hidden /> {t('dash.activeToday', { n: view.activeMinutes })}
              </p>
            ) : null}
          </div>
          {view.next ? (
            <Button size="lg" variant={view.next.daysAway ? 'secondary' : 'primary'} onClick={() => navigate(`/train?start=${view.next!.template.id}`)}>
              <Play className="size-5" aria-hidden /> {t('train.start')}
            </Button>
          ) : (
            <Button size="lg" onClick={() => navigate('/train/new')}>
              <Plus className="size-5" aria-hidden /> {t('train.create')}
            </Button>
          )}
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" className="h-auto flex-col py-3 leading-tight" onClick={() => setLogOpen(true)}>
          <Scale className="size-6 text-brand" aria-hidden /> {t('weight.log')}
        </Button>
        <Button variant="secondary" size="lg" className="h-auto flex-col py-3 leading-tight" onClick={() => navigate('/food/snap')}>
          <Camera className="size-6 text-brand" aria-hidden /> {t('food.snap')}
        </Button>
      </div>

      {/* Weight */}
      <Card
        title={t('dash.weight')}
        action={
          <Link to="/weights" className="inline-flex items-center text-sm font-semibold text-brand-ink">
            {t('common.all')} <ChevronRight className="size-4" />
          </Link>
        }
      >
        {view.nowKg !== null ? (
          <p className="mb-2 text-ink-2">
            <b className="text-2xl text-ink">{kg(view.nowKg)} kg</b>{' '}
            {delta !== null && Math.abs(delta) >= 0.1 ? (
              <span>
                {t('dash.sinceStart', { delta: `${delta > 0 ? '+' : '−'}${kg(Math.abs(delta))}` })}
              </span>
            ) : null}
          </p>
        ) : null}
        <WeightChart weights={view.weights} target={profile.target_weight_kg} />
        <p className="mt-2 text-sm text-ink-3">{t('weight.trendExplain')}</p>
      </Card>

      {/* Strength */}
      <Card title={t('dash.strength')}>
        <StrengthChart sets={view.allSets} />
      </Card>

      {/* Week */}
      <Card title={t('dash.thisWeek')}>
        <p className="mb-2 text-lg">
          <b>{t('dash.workoutsOf', { n: view.thisWeek, goal })}</b>
        </p>
        <BarChart bars={view.weeks} goal={{ v: goal, label: t('dash.goal') }} />
        <div className="mt-4 flex items-center gap-3">
          <Footprints className="size-6 text-ink-2" aria-hidden />
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-semibold">{t('dash.stepsToday')}</span>
              <span className="tabular text-ink-2">
                {view.stepsToday !== null ? num(view.stepsToday) : '—'} / {num(profile.steps_goal)}
              </span>
            </div>
            <Progress value={view.stepsToday ?? 0} max={profile.steps_goal} color="var(--leaf)" />
            {view.energy.avgSteps !== null ? (
              <p className="mt-1 text-sm text-ink-3">{t('dash.stepsAvg', { n: num(view.energy.avgSteps) })}</p>
            ) : (
              <Link to="/settings/health" className="mt-1 block text-sm font-semibold text-brand-ink">
                {t('dash.connectSteps')}
              </Link>
            )}
          </div>
        </div>
      </Card>

      {/* Food today */}
      <Card
        title={t('dash.foodToday')}
        action={
          <Link to="/food" className="inline-flex items-center text-sm font-semibold text-brand-ink">
            {t('common.open')} <ChevronRight className="size-4" />
          </Link>
        }
      >
        <div className="flex items-center gap-4">
          <Ring value={view.eaten.kcal} max={view.energy.targets.kcal} size={112}>
            <div>
              <div className="text-xl font-extrabold tabular">{num(view.eaten.kcal)}</div>
              <div className="text-xs text-ink-2">/ {num(view.energy.targets.kcal)} kcal</div>
            </div>
          </Ring>
          <div className="flex-1">
            <MacroBar label={t('macro.protein')} value={view.eaten.protein} target={view.energy.targets.protein_g} color="var(--macro-protein)" />
            <p className="mt-2 text-sm text-ink-3">{t('dash.proteinWhy')}</p>
          </div>
        </div>
      </Card>

      {/* Next lesson */}
      {view.nextLesson ? (
        <Link to={`/learn/${view.nextLesson.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sky-soft text-3xl" aria-hidden>
            {view.nextLesson.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-sky">
              <BookOpen className="size-4" aria-hidden /> {t('learn.nextLesson')} · {view.lessonsRead + 1}/{TOPICS.length}
            </span>
            <span className="block leading-tight font-bold">{l(view.nextLesson.title)}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
        </Link>
      ) : null}

      {/* Tip */}
      <Card tone="sun">
        <div className="flex gap-3">
          <Lightbulb className="mt-0.5 size-6 shrink-0 text-sun" aria-hidden />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sun">{t('dash.tip')}</p>
            <p className="text-lg">{l(tip.text)}</p>
            {tipTopic ? (
              <Link to={`/learn/${tipTopic.id}`} className="mt-1 inline-flex items-center font-semibold text-brand-ink">
                {t('dash.learnMore')}: {l(tipTopic.title)} <ChevronRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <LogWeightSheet open={logOpen} onClose={() => setLogOpen(false)} onSaved={reload} last={view.nowKg ? Math.round(view.nowKg * 10) / 10 : null} />
    </div>
  )
}

function addDays(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

interface ChecklistItem {
  key: string
  done: boolean
  label: string
  to?: string
  onClick?: () => void
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  const { t } = useI18n()
  const done = items.filter((i) => i.done).length
  return (
    <Card title={t('check.list.title')} action={<span className="text-sm font-bold text-ink-2">{t('check.list.count', { n: done, total: items.length })}</span>}>
      <ul className="grid gap-1">
        {items.map((i) => {
          const body = (
            <>
              <span
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full border-2',
                  i.done ? 'border-leaf bg-leaf text-white dark:text-black' : 'border-line text-transparent',
                )}
                aria-hidden
              >
                <Check className="size-4" strokeWidth={3} />
              </span>
              <span className={cx('flex-1 text-left', i.done && 'text-ink-2')}>{i.label}</span>
              {!i.done ? <ChevronRight className="size-4 text-ink-3" aria-hidden /> : null}
            </>
          )
          const cls = 'flex w-full items-center gap-3 rounded-2xl px-1 py-2 active:bg-card-2'
          return (
            <li key={i.key} aria-label={`${i.label}${i.done ? ' ✓' : ''}`}>
              {i.to ? (
                <Link to={i.to} className={cls}>
                  {body}
                </Link>
              ) : (
                <button onClick={i.onClick} className={cls}>
                  {body}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
