import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KcalBar } from '../components/FamilyCard'
import { useLogFor } from '../components/LogFor'
import { Button, Card, Loading, PageHeader } from '../components/ui'
import { useApp } from '../lib/auth'
import { daysAgo, localDay } from '../lib/calc'
import { getFamilyOverview, useAsync, type FamilyMember } from '../lib/data'
import { eatenOf, useIsFamilyCoach } from '../lib/family'
import { useI18n } from '../lib/i18n'
import { dayDate, LOG_DAYS_BACK, startMeal, type LogStart } from '../lib/logDay'
import type { Meal } from '../lib/types'

const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

/**
 * The family at a glance, for the family coach only: day by day, each person's daily targets and what they logged,
 * meal by meal. Kept short for a phone; Forza! Coach on the computer has everything else. From here a meal can be
 * logged for anyone, on the day shown.
 */
export function Family() {
  const { t, date } = useI18n()
  const { session } = useApp()
  const me = session?.user.id
  const coach = useIsFamilyCoach()
  const navigate = useNavigate()
  const logFor = useLogFor()
  const [offset, setOffset] = useState(0)
  const day = localDay(daysAgo(offset))
  const { data, loading, error } = useAsync(() => (coach ? getFamilyOverview(day) : Promise.resolve([])), [day, coach])

  if (coach === null) return <Loading />
  if (!coach) {
    return (
      <div className="grid gap-4">
        <PageHeader title={t('family.title')} back="/" />
        <Card>
          <p>{t('family.onlyCoach')}</p>
        </Card>
      </div>
    )
  }

  // The coach first, then everyone else by name.
  const people = data ? [...data.filter((p) => p.id === me), ...data.filter((p) => p.id !== me)] : []

  /** A meal for this person on the day shown, starting on the first main meal they have not logged. */
  function addFor(p: FamilyMember) {
    logFor.choose(p.id === me ? null : p.id)
    navigate('/food/add', { state: { day, meal: startMeal(day, p.meals) } satisfies LogStart })
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('family.title')} subtitle={t('family.subtitle')} back="/" />
      <div className="flex items-center justify-between rounded-3xl border border-line bg-card p-1">
        <button onClick={() => setOffset(Math.min(LOG_DAYS_BACK, offset + 1))} disabled={offset >= LOG_DAYS_BACK} className="grid size-11 place-items-center rounded-full active:bg-card-2 disabled:opacity-30" aria-label={t('food.prevDay')}>
          <ChevronLeft className="size-6" />
        </button>
        <p className="font-bold first-letter:uppercase">{offset === 0 ? t('food.today') : date(dayDate(day), { weekday: 'long', day: 'numeric', month: 'short' })}</p>
        <button onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} className="grid size-11 place-items-center rounded-full active:bg-card-2 disabled:opacity-30" aria-label={t('food.nextDay')}>
          <ChevronRight className="size-6" />
        </button>
      </div>
      {error ? <p className="rounded-2xl bg-danger-soft p-3">{t('family.failed')}</p> : null}
      {loading && !data ? <Loading /> : null}
      {people.map((p) => (
        <PersonCard key={p.id} person={p} me={p.id === me} day={day} onAdd={() => addFor(p)} />
      ))}
    </div>
  )
}

/** One person on one day: the targets, what was eaten of them, and the meals logged. */
function PersonCard({ person, me, day, onAdd }: { person: FamilyMember; me: boolean; day: string; onAdd: () => void }) {
  const { t, num, date } = useI18n()
  const eaten = eatenOf(person.meals)
  const tg = person.target
  const meals = MEALS.map((m) => ({ meal: m, logs: person.meals.filter((x) => x.meal === m) })).filter((g) => g.logs.length)
  return (
    <Card
      title={
        <span>
          {person.name}
          {me ? <span className="font-normal text-ink-3"> · {t('family.you')}</span> : null}
          {person.goal ? <span className="block text-sm font-normal text-ink-3">{t(`goal.${person.goal}`)}</span> : null}
        </span>
      }
      action={
        <Button size="sm" variant="secondary" onClick={onAdd} aria-label={t('family.addFor', { name: person.name })}>
          <Plus className="size-4" aria-hidden /> {t('family.add')}
        </Button>
      }
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="tabular">
          <b className="text-xl">{num(eaten.kcal)}</b>
          <span className="text-ink-2">{tg ? ` / ${num(tg.kcal)}` : ''} kcal</span>
        </span>
        {tg ? <span className="text-sm text-ink-2">{eaten.kcal <= tg.kcal ? t('family.left', { kcal: num(tg.kcal - eaten.kcal) }) : t('family.over', { kcal: num(eaten.kcal - tg.kcal) })}</span> : null}
      </div>
      <KcalBar eaten={eaten.kcal} target={tg?.kcal ?? null} />
      {tg ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {(
            [
              ['protein_g', 'macro.protein'],
              ['carbs_g', 'macro.carbs'],
              ['fat_g', 'macro.fat'],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <dt className="text-ink-3">{t(label)}</dt>
              <dd className="tabular">
                <b>{num(eaten[k])}</b> / {num(tg[k])} g
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {/* Targets are kept each day the person's app opens: an older one stands for a day without it. */}
      {!tg ? <p className="mt-2 text-sm text-ink-3">{t('family.noTarget')}</p> : tg.day !== day ? <p className="mt-2 text-xs text-ink-3">{t('family.targetFrom', { date: date(dayDate(tg.day), { day: 'numeric', month: 'short' }) })}</p> : null}
      {meals.length ? (
        <ul className="mt-3 grid gap-2 border-t border-line pt-3">
          {meals.map((g) => (
            <li key={g.meal}>
              <p className="flex items-baseline justify-between gap-2">
                <b>{t(`meal.${g.meal}`)}</b>
                <span className="text-sm text-ink-2 tabular">{num(eatenOf(g.logs).kcal)} kcal</span>
              </p>
              <p className="text-sm text-ink-2">{g.logs.map((l) => l.title).join(', ')}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-ink-3">{t('family.nothingYet')}</p>
      )}
    </Card>
  )
}
