import { Lightbulb, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/auth'
import { localDay, type Targets } from '../lib/calc'
import { catchUp, kcalPicks, proteinPicks, type CatchUpPick, type Shortfall } from '../lib/catchUp'
import { useFoodDb } from '../lib/foodDb'
import { useI18n } from '../lib/i18n'
import type { FoodDay, FoodLog } from '../lib/types'
import { mealForNow } from './PlateResult'
import { Button } from './ui'

const KEY = 'forza.catchUp'
const seenToday = () => {
  try {
    return localStorage.getItem(KEY) === localDay(new Date())
  } catch {
    return false
  }
}

/**
 * After days short of protein (or of calories, when not losing fat): how short, and a few foods that bring it, the
 * person's own first, each one tap away from being logged. Until today catches up, or "Got it" for today.
 */
export function CatchUpCard({ food, notes, targets }: { food: FoodLog[]; notes: FoodDay[]; targets: Targets }) {
  const { t, num, locale } = useI18n()
  const { profile } = useApp()
  const db = useFoodDb()
  const [hidden, setHidden] = useState(seenToday)
  const goal = profile?.goal ?? 'maintain'
  const found = useMemo(() => catchUp(food, notes, targets, goal), [food, notes, targets, goal])
  if (hidden || (!found.protein && !found.kcal)) return null

  function hide() {
    try {
      localStorage.setItem(KEY, localDay(new Date()))
    } catch {
      // Shown again next time: no harm.
    }
    setHidden(true)
  }

  const said = (s: Shortfall, unit: 'protein' | 'kcal') =>
    s.short >= 2
      ? t(s.short === s.of ? `catchUp.${unit}All` : `catchUp.${unit}Days`, { n: s.short, of: s.of, eaten: num(s.eaten), target: num(s.target) })
      : t(`catchUp.${unit}Yesterday`, { eaten: num(s.eaten), target: num(s.target) })

  return (
    <section className="rounded-3xl bg-sky-soft p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-sky uppercase">
        <Lightbulb className="size-4" aria-hidden /> {t('catchUp.label')}
      </p>
      {found.protein ? (
        <div className="mt-1">
          <p className="text-lg leading-snug font-bold">{said(found.protein, 'protein')}</p>
          {goal === 'fat_loss' ? <p className="mt-1 text-ink-2">{t('catchUp.deficit')}</p> : null}
          <p className="mt-2 font-semibold">{t('catchUp.proteinHow', { g: num(found.protein.target - found.protein.eaten) })}</p>
          <Picks picks={proteinPicks(goal, db, locale)} show="protein" />
        </div>
      ) : null}
      {found.kcal ? (
        <div className={found.protein ? 'mt-4' : 'mt-1'}>
          <p className="text-lg leading-snug font-bold">{said(found.kcal, 'kcal')}</p>
          <p className="mt-2 font-semibold">{t(found.kcal.target - found.kcal.eaten > 500 ? 'catchUp.kcalHowBig' : 'catchUp.kcalHow', { kcal: num(found.kcal.target - found.kcal.eaten) })}</p>
          <Picks picks={kcalPicks(goal, db, locale)} show="kcal" />
        </div>
      ) : null}
      <Button variant="ghost" className="mt-2 -ml-2" onClick={hide}>
        {t('catchUp.gotIt')}
      </Button>
    </section>
  )
}

/** Each food in one usual portion, with what it brings, and a tap to log it (to adjust if needed). */
function Picks({ picks, show }: { picks: CatchUpPick[]; show: 'protein' | 'kcal' }) {
  const { t, num } = useI18n()
  const navigate = useNavigate()
  return (
    <ul className="mt-2 grid gap-2">
      {picks.map((p) => (
        <li key={p.item.foodId ?? p.item.dbId ?? p.item.name} className="flex items-center gap-3 rounded-2xl bg-card p-3">
          <span className="min-w-0 flex-1">
            <span className="block leading-tight font-semibold">{p.item.name}</span>
            <span className="block text-sm text-ink-2">
              {p.unit ?? `${num(p.item.grams)} g`} ·{' '}
              {show === 'protein'
                ? t('catchUp.bringsProtein', { p: num(p.item.protein_g), kcal: num(p.item.kcal) })
                : t('catchUp.bringsKcal', { kcal: num(p.item.kcal), p: num(p.item.protein_g) })}
              {p.usual ? ` · ${t('catchUp.usual')}` : ''}
            </span>
          </span>
          <Button variant="secondary" onClick={() => navigate('/food/add', { state: { items: [p.item], meal: mealForNow() } })} aria-label={t('catchUp.add', { name: p.item.name })}>
            <Plus className="size-4" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  )
}
