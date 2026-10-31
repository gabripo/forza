import { type ReactNode, useMemo, useState } from 'react'
import { BarChart, LineChart } from '../components/charts'
import { StrengthChart } from '../components/StrengthChart'
import { Card, Field, Input, Loading, PageHeader, Segmented } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { useApp } from '../lib/auth'
import { daysAgo, localDay, weekStart } from '../lib/calc'
import { getFood, getFoodTotals, getSessions, getSteps, getWeights, useAsync } from '../lib/data'
import { computeEnergy } from '../lib/energy'
import { useI18n } from '../lib/i18n'

type Range = 30 | 90 | 180 | 365 | 3650

const DAY = 86_400_000
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime()
const midnight = (day: string) => new Date(`${day}T00:00:00`)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** One measure: its headline numbers, then the chart (touch or hover a point to read it). */
function Panel({ title, value, change, children }: { title: string; value?: ReactNode; change?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} action={value ? <span className="text-right"><b className="block text-lg tabular">{value}</b>{change ? <span className="block text-xs text-ink-2">{change}</span> : null}</span> : null}>
      {children}
    </Card>
  )
}

/**
 * Everything over time, on one page: weight and body fat, strength, workouts and volume a week, steps, calories and
 * protein. One period for all (a ready-made one, or any two days); every chart answers a touch with the value of that
 * day or week.
 */
export function ProgressDashboard() {
  const { t, num, kg, date } = useI18n()
  const { profile } = useApp()
  const [range, setRange] = useState<Range | null>(90)
  // Two days chosen by hand (both included), used when no ready-made period is.
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null)
  const today = localDay(new Date())
  const { data, loading } = useAsync(() => Promise.all([getWeights(3650), getSessions(3650), getSteps(3650), getFood(28)]), [])
  // Food goes back as far as the period does, a year at a time so that moving a day does not load it again.
  const foodDays = range === 3650 ? 3650 : !range && custom ? Math.max(400, Math.ceil((Date.now() - midnight(custom.from).getTime()) / DAY / 365) * 365) : 400
  const meals = useAsync(() => getFoodTotals(foodDays), [foodDays])

  const view = useMemo(() => {
    if (!data || !profile) return null
    const [weights, sessions, steps, recentFood] = data
    const food = meals.data ?? []
    const energy = computeEnergy(profile, weights, steps, sessions, recentFood)

    // The period: a ready-made one ends today ("all" starts at the first thing recorded), or the two chosen days.
    const firstSession = sessions.at(-1)
    const firstDay = [weights[0]?.measured_at, firstSession?.started_at, steps[0]?.day && `${steps[0].day}T12:00:00`, food[0]?.eaten_at]
      .filter((x): x is string => Boolean(x))
      .map((x) => localDay(new Date(x)))
      .sort()[0]
    const period = range === 3650 ? { from: firstDay ?? today, to: today } : range ? { from: localDay(daysAgo(range)), to: today } : (custom ?? { from: today, to: today })
    const since = midnight(period.from)
    const until = new Date(midnight(period.to).getTime() + DAY)
    const inRange = (iso: string) => {
      const d = new Date(iso)
      return d >= since && d < until
    }

    // Weeks, Monday first, from the start of the period (or the first workout, for "all").
    const from = weekStart(range === 3650 && firstSession ? new Date(firstSession.started_at) : since)
    const end = Math.min(until.getTime(), Date.now())
    const weeks: { start: Date; key: string }[] = []
    for (let d = new Date(from); d.getTime() < end; d.setDate(d.getDate() + 7)) weeks.push({ start: new Date(d), key: localDay(d) })
    const weekOf = (iso: string) => localDay(weekStart(new Date(iso)))
    const recent = sessions.filter((s) => inRange(s.started_at))
    const perWeek = weeks.map((w) => ({ key: w.key, label: date(w.start, { day: 'numeric', month: 'numeric' }), value: recent.filter((s) => weekOf(s.started_at) === w.key).length }))
    const volume = weeks.map((w) => ({
      key: w.key,
      label: date(w.start, { day: 'numeric', month: 'numeric' }),
      value: Math.round(
        recent.filter((s) => weekOf(s.started_at) === w.key).flatMap((s) => s.sets).filter((x) => !x.is_warmup).reduce((v, x) => v + Number(x.weight_kg ?? 0) * Number(x.reps ?? 0), 0),
      ),
    }))

    const stepDays = steps.filter((s) => s.day >= period.from && s.day <= period.to && s.steps > 0)
    const foodDays = new Map<string, { kcal: number; protein: number }>()
    for (const f of food.filter((x) => inRange(x.eaten_at))) {
      const d = localDay(new Date(f.eaten_at))
      const x = foodDays.get(d) ?? { kcal: 0, protein: 0 }
      x.kcal += Number(f.kcal)
      x.protein += Number(f.protein_g)
      foodDays.set(d, x)
    }
    const eaten = [...foodDays].sort((a, b) => a[0].localeCompare(b[0]))
    const kgs = weights.filter((w) => inRange(w.measured_at))
    const fat = kgs.filter((w) => w.body_fat_pct != null).map((w) => ({ t: new Date(w.measured_at).getTime(), v: Number(w.body_fat_pct) }))
    return {
      period,
      days: Math.round((until.getTime() - since.getTime()) / DAY),
      weights: kgs,
      fat,
      sets: recent.flatMap((s) => s.sets),
      perWeek,
      volume,
      steps: stepDays.map((s) => ({ t: noon(s.day), v: s.steps })),
      kcal: eaten.map(([d, x]) => ({ t: noon(d), v: Math.round(x.kcal) })),
      protein: eaten.map(([d, x]) => ({ t: noon(d), v: Math.round(x.protein) })),
      targets: energy.targets,
      workouts: recent.length,
    }
  }, [data, meals.data, profile, range, custom, today, date])

  if ((loading && !data) || (meals.loading && !meals.data) || !profile) return <Loading />
  if (!view) return null
  const choose = (a: string, b: string) => {
    if (!a || !b) return // a date being typed or cleared
    setRange(null)
    setCustom(a <= b ? { from: a, to: b } : { from: b, to: a })
  }
  const dense = view.days > 90
  const fmtDay = (ms: number) => date(new Date(ms), { day: 'numeric', month: 'short' })
  const first = view.weights[0]
  const lastW = view.weights.at(-1)
  const kgChange = first && lastW ? Number(lastW.weight_kg) - Number(first.weight_kg) : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} back="/check" />
      <Segmented<Range>
        value={range}
        onChange={setRange}
        options={[
          { value: 30, label: t('dashboard.r1m') },
          { value: 90, label: t('dashboard.r3m') },
          { value: 180, label: t('dashboard.r6m') },
          { value: 365, label: t('dashboard.r1y') },
          { value: 3650, label: t('dashboard.rAll') },
        ]}
      />
      {/* Any two days: the ready-made periods fill these in, and changing one makes the period your own. */}
      <div className="-mt-1 grid grid-cols-2 gap-3">
        <Field label={t('dashboard.from')}>
          <Input type="date" value={view.period.from} max={view.period.to} onChange={(e) => choose(e.target.value, view.period.to)} />
        </Field>
        <Field label={t('dashboard.to')}>
          <Input type="date" value={view.period.to} min={view.period.from} max={today} onChange={(e) => choose(view.period.from, e.target.value)} />
        </Field>
      </div>

      <Panel
        title={t('check.weight')}
        value={lastW ? `${kg(Number(lastW.weight_kg))} kg` : undefined}
        change={kgChange !== null ? t('dashboard.change', { v: `${kgChange > 0 ? '+' : kgChange < 0 ? '−' : ''}${kg(Math.abs(kgChange))} kg` }) : undefined}
      >
        <WeightChart weights={view.weights} target={profile.target_weight_kg} />
      </Panel>

      {view.fat.length >= 2 ? (
        <Panel title={t('dashboard.bodyFat')} value={`${num(view.fat.at(-1)!.v, 1)}%`} change={t('dashboard.change', { v: `${num(view.fat.at(-1)!.v - view.fat[0].v, 1)} %` })}>
          <LineChart series={[{ id: 'fat', label: t('dashboard.bodyFat'), color: 'var(--series-1)', style: dense ? 'line' : 'both', points: view.fat }]} formatY={(v) => num(v, 0)} formatValue={(v) => `${num(v, 1)}%`} formatX={fmtDay} />
        </Panel>
      ) : null}

      <Panel title={t('check.strength')}>
        <StrengthChart sets={view.sets} />
      </Panel>

      <Panel title={t('dashboard.workouts')} value={String(view.workouts)} change={t('dashboard.perWeek', { n: num(view.workouts / Math.max(1, view.perWeek.length), 1) })}>
        <BarChart bars={view.perWeek} goal={{ v: profile.workouts_per_week, label: t('dashboard.goal') }} />
      </Panel>

      <Panel title={t('dashboard.volume')} value={`${num(avg(view.volume.map((v) => v.value).filter(Boolean)) ?? 0)} kg`} change={t('dashboard.weekAverage')}>
        <BarChart bars={view.volume} formatValue={(v) => `${num(v)} kg`} />
      </Panel>

      <Panel title={t('dashboard.steps')} value={view.steps.length ? num(avg(view.steps.map((s) => s.v)) ?? 0) : undefined} change={view.steps.length ? t('dashboard.dayAverage') : undefined}>
        <LineChart
          series={[{ id: 'steps', label: t('dashboard.steps'), color: 'var(--series-1)', style: dense ? 'line' : 'both', points: view.steps }]}
          goal={{ v: profile.steps_goal, label: t('dashboard.goal') }}
          formatY={(v) => num(v)}
          formatX={fmtDay}
          emptyText={t('dashboard.none')}
        />
      </Panel>

      <Panel title={t('dashboard.calories')} value={view.kcal.length ? `${num(avg(view.kcal.map((s) => s.v)) ?? 0)} kcal` : undefined} change={view.kcal.length ? t('dashboard.dayAverage') : undefined}>
        <LineChart
          series={[{ id: 'kcal', label: t('dashboard.calories'), color: 'var(--series-1)', style: dense ? 'line' : 'both', points: view.kcal }]}
          goal={{ v: view.targets.kcal, label: t('dashboard.target') }}
          formatY={(v) => num(v)}
          formatValue={(v) => `${num(v)} kcal`}
          formatX={fmtDay}
          emptyText={t('dashboard.none')}
        />
      </Panel>

      <Panel title={t('macro.protein')} value={view.protein.length ? `${num(avg(view.protein.map((s) => s.v)) ?? 0)} g` : undefined} change={view.protein.length ? t('dashboard.dayAverage') : undefined}>
        <LineChart
          series={[{ id: 'protein', label: t('macro.protein'), color: 'var(--series-1)', style: dense ? 'line' : 'both', points: view.protein }]}
          goal={{ v: view.targets.protein_g, label: t('dashboard.target') }}
          formatY={(v) => num(v)}
          formatValue={(v) => `${num(v)} g`}
          formatX={fmtDay}
          emptyText={t('dashboard.none')}
        />
      </Panel>
    </div>
  )
}
