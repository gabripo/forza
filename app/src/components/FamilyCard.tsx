import { ChevronRight, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { localDay } from '../lib/calc'
import { getFamilyOverview, useAsync, type FamilyMember } from '../lib/data'
import { eatenOf } from '../lib/family'
import { useI18n } from '../lib/i18n'
import { Card } from './ui'

/** Calories eaten against the target, as a thin bar: red past it by more than 5%. */
export function KcalBar({ eaten, target }: { eaten: number; target: number | null }) {
  const pct = target ? Math.min(100, (eaten / target) * 100) : 0
  const over = target ? eaten > target * 1.05 : false
  return (
    <div className="h-2 overflow-hidden rounded-full bg-card-2" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? 'var(--danger)' : 'var(--brand)' }} />
    </div>
  )
}

/** One line per person: name, calories eaten of the target, how many meals. */
export function FamilyLine({ person, me }: { person: FamilyMember; me: boolean }) {
  const { t, num } = useI18n()
  const eaten = eatenOf(person.meals)
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">
          {person.name}
          {me ? <span className="font-normal text-ink-3"> · {t('family.you')}</span> : null}
        </span>
        <span className="shrink-0 text-sm text-ink-2 tabular">
          <b className="text-ink">{num(eaten.kcal)}</b>
          {person.target ? ` / ${num(person.target.kcal)}` : ''} kcal
        </span>
      </div>
      <KcalBar eaten={eaten.kcal} target={person.target?.kcal ?? null} />
      <span className="text-xs text-ink-3">{person.meals.length ? t('family.meals', { n: person.meals.length }) : t('family.nothingYet')}</span>
    </div>
  )
}

/** Home, for the family coach: everyone's day in a few lines, and the way to the whole overview. */
export function FamilyTodayCard({ me }: { me: string }) {
  const { t } = useI18n()
  const [today] = useState(() => localDay(new Date()))
  const { data } = useAsync(() => getFamilyOverview(today), [today])
  if (!data?.length) return null
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Users className="size-5 text-brand" aria-hidden /> {t('family.homeTitle')}
        </span>
      }
      action={
        <Link to="/family" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
          {t('family.open')} <ChevronRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <Link to="/family" className="-m-1 grid gap-3 rounded-2xl p-1 active:bg-card-2" aria-label={t('family.open')}>
        {[...data.filter((p) => p.id === me), ...data.filter((p) => p.id !== me)].map((p) => (
          <FamilyLine key={p.id} person={p} me={p.id === me} />
        ))}
      </Link>
    </Card>
  )
}
