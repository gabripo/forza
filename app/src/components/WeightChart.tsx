import { dailyWeights, weightTrend } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import type { BodyWeight } from '../lib/types'
import { LineChart } from './charts'

/** Raw weigh-ins as dots + the smoothed trend as a line (daily weight jumps around; the trend doesn't). */
export function WeightChart({ weights, target, height }: { weights: BodyWeight[]; target?: number | null; height?: number }) {
  const { t, num, date } = useI18n()
  const trend = weightTrend(dailyWeights(weights))
  const at = (day: string) => new Date(`${day}T12:00:00`).getTime()
  return (
    <LineChart
      height={height}
      emptyText={t('weight.empty')}
      formatY={(v) => num(v, 1)}
      formatX={(ms) => date(new Date(ms))}
      goal={target ? { v: target, label: t('weight.target', { kg: num(target, 1) }) } : undefined}
      series={[
        { id: 'raw', label: t('weight.weighIns'), color: 'var(--series-muted)', style: 'dots', points: trend.map((p) => ({ t: at(p.day), v: p.kg })) },
        { id: 'trend', label: t('weight.trend'), color: 'var(--series-1)', style: 'line', points: trend.map((p) => ({ t: at(p.day), v: p.trend })) },
      ]}
    />
  )
}
