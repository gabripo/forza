import { useMemo, useState } from 'react'
import { strengthHistory } from '../lib/calc'
import { useApp } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { SetLog } from '../lib/types'
import { LineChart } from './charts'
import { cx } from './ui'

/** Estimated max strength per exercise over time, with chips to switch exercise. */
export function StrengthChart({ sets, height }: { sets: SetLog[]; height?: number }) {
  const { t, l, num, date } = useI18n()
  const { exercises } = useApp()
  const history = useMemo(() => strengthHistory(sets), [sets])
  const options = useMemo(
    () =>
      [...history]
        .filter(([id, pts]) => pts.length >= 2 && pts.some((p) => p.best > 0) && exercises.get(id)?.kind !== 'cardio')
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)
        .map(([id]) => id),
    [history, exercises],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const current = picked && options.includes(picked) ? picked : options[0]

  if (!current) {
    return <div className="grid h-40 place-items-center rounded-2xl bg-card-2 p-4 text-center text-ink-2">{t('strength.empty')}</div>
  }
  const points = history.get(current)!.filter((p) => p.best > 0)
  const first = points[0].best
  const last = points[points.length - 1].best
  const change = ((last - first) / first) * 100

  return (
    <div className="grid gap-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {options.map((id) => (
          <button
            key={id}
            onClick={() => setPicked(id)}
            aria-pressed={id === current}
            className={cx(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold',
              id === current ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-card text-ink-2',
            )}
          >
            {l(exercises.get(id)?.name) || id}
          </button>
        ))}
      </div>
      <p className="text-ink-2">
        {t('strength.estimatedMax')}: <b className="text-ink">{num(last, 1)} kg</b>{' '}
        <span className={change >= 0 ? 'font-bold text-leaf' : 'font-bold text-danger'}>
          ({change >= 0 ? '+' : ''}
          {num(change, 0)}%)
        </span>
      </p>
      <LineChart
        height={height}
        formatY={(v) => num(v, 0)}
        formatX={(ms) => date(new Date(ms))}
        series={[
          {
            id: current,
            label: t('strength.estimatedMax'),
            color: 'var(--series-1)',
            style: 'both',
            points: points.map((p) => ({ t: new Date(`${p.day}T12:00:00`).getTime(), v: Math.round(p.best * 10) / 10 })),
          },
        ]}
      />
      <p className="text-sm text-ink-3">{t('strength.explain')}</p>
    </div>
  )
}
