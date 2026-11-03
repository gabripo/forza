import { useMemo } from 'react'
import { useApp } from '../lib/auth'
import { getFoodDays, getFoodTotals, getSessions, getSteps, getTargetHistory, getWeights, useAsync } from '../lib/data'
import { pastTargets, targetSeries } from '../lib/energy'
import { useI18n } from '../lib/i18n'
import { LineChart } from './charts'
import { Loading } from './ui'

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime()

/**
 * The daily targets over time: the calories to eat and the energy the body uses, kept each day (and worked out
 * again from the logs for the weeks before). Told as a path, never as a judgement: targets follow the body.
 */
export function TargetHistory() {
  const { t, num, date } = useI18n()
  const { profile } = useApp()
  const { data } = useAsync(
    () => Promise.all([getTargetHistory(400), getWeights(400), getSteps(400), getSessions(400), getFoodTotals(400), getFoodDays(400).catch(() => [])]),
    [],
  )
  const series = useMemo(() => {
    if (!data || !profile) return null
    const [kept, weights, steps, sessions, food, notes] = data
    return targetSeries(kept, pastTargets(profile, weights, steps, sessions, food, notes, 26))
  }, [data, profile])

  if (!series) return <Loading />
  if (series.length < 2) return <p className="text-ink-2">{t('targetHistory.soon')}</p>
  const first = series[0]
  const last = series.at(-1)!
  const weeks = Math.max(1, Math.round((noon(last.day) - noon(first.day)) / (7 * 86_400_000)))
  const tdeeUp = first.tdee && last.tdee ? last.tdee - first.tdee : 0
  const estimatedUntil = series.filter((p) => p.estimated).at(-1)?.day
  return (
    <div className="grid gap-4">
      <p className="text-lg leading-snug font-bold">{t('targetHistory.since', { date: date(first.day, { day: 'numeric', month: 'long' }), weeks })}</p>
      <LineChart
        series={[
          { id: 'kcal', label: t('targetHistory.kcal'), color: 'var(--series-1)', style: series.length > 40 ? 'line' : 'both', points: series.map((p) => ({ t: noon(p.day), v: p.kcal })) },
          ...(series.some((p) => p.tdee) ? [{ id: 'tdee', label: t('targetHistory.tdee'), color: 'var(--series-2)', style: 'line' as const, points: series.filter((p) => p.tdee).map((p) => ({ t: noon(p.day), v: p.tdee! })) }] : []),
        ]}
        formatY={(v) => num(v)}
        formatValue={(v) => `${num(v)} kcal`}
        formatX={(ms) => date(new Date(ms), { day: 'numeric', month: 'short' })}
      />
      <ul className="grid gap-2 text-ink-2">
        <li>{t('targetHistory.now', { kcal: num(last.kcal), p: num(last.protein_g), c: num(last.carbs_g), f: num(last.fat_g) })}</li>
        <li>{tdeeUp >= 50 ? t('targetHistory.tdeeUp', { n: num(tdeeUp) }) : t('targetHistory.follows')}</li>
      </ul>
      {estimatedUntil ? <p className="text-xs text-ink-3">{t('targetHistory.estimated', { date: date(estimatedUntil, { day: 'numeric', month: 'short' }) })}</p> : null}
      <p className="rounded-2xl bg-leaf-soft p-3 text-center text-lg font-bold">{t('targetHistory.cheer')}</p>
    </div>
  )
}
