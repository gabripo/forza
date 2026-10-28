import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import { scoreBand, scorePlate, type PlateTotals } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import type { Goal, Meal } from '../lib/types'
import { MacroBar } from './charts'
import { cx } from './ui'

const BAND_STYLE = {
  great: 'bg-leaf-soft text-leaf',
  good: 'bg-leaf-soft text-leaf',
  okay: 'bg-sun-soft text-sun',
  rethink: 'bg-danger-soft text-danger',
}

function ScoreTile({ label, score, main }: { label: string; score: number; main: boolean }) {
  const { t } = useI18n()
  const band = scoreBand(score)
  return (
    <div className={cx('rounded-2xl p-3', main ? 'ring-2 ring-brand' : '', BAND_STYLE[band])}>
      <p className="text-sm font-semibold opacity-90">{label}</p>
      <p className="text-3xl font-extrabold">
        {score}
        <span className="text-base">/100</span>
      </p>
      <p className="text-sm font-bold">{t(`score.${band}`)}</p>
    </div>
  )
}

/** Totals, macro split, goal scores and the reasons behind them. */
export function PlateResult({
  totals,
  meal,
  goal,
  dailyKcal,
  ultraProcessed,
  eatenAt,
}: {
  totals: PlateTotals
  meal: Meal
  goal: Goal
  dailyKcal: number
  ultraProcessed: boolean
  eatenAt: Date
}) {
  const { t, num } = useI18n()
  const s = scorePlate(totals, meal, dailyKcal, ultraProcessed, eatenAt)
  const budget = Math.round(dailyKcal * { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 }[meal])
  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-ink-2">{t('food.total')}</p>
          <p className="text-4xl font-extrabold">
            {num(totals.kcal)} <span className="text-lg font-semibold text-ink-2">kcal</span>
          </p>
        </div>
        <p className="text-right text-sm text-ink-2">{t('food.mealBudget', { meal: t(`meal.${meal}`), kcal: num(budget) })}</p>
      </div>
      <div className="grid gap-2">
        <MacroBar label={t('macro.protein')} value={totals.protein_g} target={Math.max(totals.protein_g, 30)} color="var(--macro-protein)" />
        <MacroBar label={t('macro.carbs')} value={totals.carbs_g} target={Math.max(totals.carbs_g, 60)} color="var(--macro-carbs)" />
        <MacroBar label={t('macro.fat')} value={totals.fat_g} target={Math.max(totals.fat_g, 25)} color="var(--macro-fat)" />
        <MacroBar label={t('macro.fiber')} value={totals.fiber_g} target={Math.max(totals.fiber_g, 10)} color="var(--macro-fiber)" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ScoreTile label={t('goal.fat_loss')} score={s.fatLoss} main={goal === 'fat_loss'} />
        <ScoreTile label={t('goal.muscle_gain')} score={s.muscleGain} main={goal === 'muscle_gain'} />
      </div>
      <ul className="grid gap-1.5">
        {s.reasons.map((r) => (
          <li key={r.key} className="flex items-start gap-2">
            {r.good ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-leaf" aria-label={t('status.good')} />
            ) : r.key === 'kcal_low' ? (
              <MinusCircle className="mt-0.5 size-5 shrink-0 text-sun" aria-label={t('status.ok')} />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-label={t('status.warn')} />
            )}
            <span>{t(`reason.${r.key}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function mealForNow(d = new Date()): Meal {
  const h = d.getHours()
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner'
}
