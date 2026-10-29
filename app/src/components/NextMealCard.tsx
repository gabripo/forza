import { CheckCircle2, RefreshCw, Utensils } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Targets } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import { nextMeal } from '../lib/nextMeal'
import type { FoodLog } from '../lib/types'
import { Button } from './ui'

/**
 * "What next?" after a meal is logged: one dish for the next meal that brings what the day is missing,
 * already sized to the calories left. One tap logs it (pre-filled, to adjust if needed).
 */
export function NextMealCard({ food, targets, justLogged = false }: { food: FoodLog[]; targets: Targets; justLogged?: boolean }) {
  const { t, l, locale, num } = useI18n()
  const navigate = useNavigate()
  const [pick, setPick] = useState(0)
  const next = nextMeal(food, targets, locale, new Date(), pick)
  if (!next) return null

  return (
    <section className="rounded-3xl bg-leaf-soft p-4">
      {justLogged ? (
        <p className="mb-2 flex items-center gap-2 font-bold text-leaf">
          <CheckCircle2 className="size-5" aria-hidden /> {t('nextMeal.saved')}
        </p>
      ) : null}
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-leaf uppercase">
        <Utensils className="size-4" aria-hidden /> {t('nextMeal.title', { meal: t(`meal.${next.meal}`) })}
      </p>
      <p className="mt-1 text-ink-2">{t(`nextMeal.why.${next.focus}`)}</p>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-card p-3">
        <span className="text-4xl" aria-hidden>
          {next.idea.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg leading-tight font-bold">{l(next.idea.name)}</span>
          <span className="block text-sm text-ink-2">
            ≈ {num(next.totals.kcal)} kcal · {t('macro.protein')} {num(next.totals.protein_g)} g · {t('macro.fat')} {num(next.totals.fat_g)} g
          </span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="leaf" onClick={() => navigate('/food/add', { state: { items: next.items, meal: next.meal } })}>
          {t('nextMeal.log')}
        </Button>
        {next.others > 1 ? (
          <Button variant="ghost" onClick={() => setPick(pick + 1)}>
            <RefreshCw className="size-4" aria-hidden /> {t('nextMeal.another')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
