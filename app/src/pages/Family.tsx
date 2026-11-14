import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KcalBar } from '../components/FamilyCard'
import { useLogFor } from '../components/LogFor'
import { Button, Card, Loading, PageHeader, Sheet } from '../components/ui'
import { useApp } from '../lib/auth'
import { daysAgo, localDay } from '../lib/calc'
import { getFamilyOverview, useAsync, type FamilyMember } from '../lib/data'
import { eatenOf, useIsFamilyCoach } from '../lib/family'
import { useI18n } from '../lib/i18n'
import { dayDate, LOG_DAYS_BACK, startMeal, type LogStart } from '../lib/logDay'
import { isSynced } from '../lib/mealAnomaly'
import type { Meal } from '../lib/types'

const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']
type FamilyMeal = FamilyMember['meals'][number]

/**
 * The family at a glance, for the family coach only: day by day, each person's daily targets and what they logged,
 * meal by meal, with each meal's macros. Kept short for a phone; Forza! Coach on the computer has everything else. A
 * meal opens to show its foods and to change them; a meal can be logged for anyone, on the day shown.
 */
export function Family() {
  const { t, date } = useI18n()
  const { session } = useApp()
  const me = session?.user.id
  const coach = useIsFamilyCoach()
  const navigate = useNavigate()
  const logFor = useLogFor()
  // Back from changing a meal: on the day it was eaten.
  const back = useLocation().state as { offset?: number } | null
  const [offset, setOffset] = useState(() => Math.min(LOG_DAYS_BACK, Math.max(0, Number(back?.offset) || 0)))
  // A meal opened: its foods, and the way to change them.
  const [opened, setOpened] = useState<{ person: FamilyMember; meal: Meal } | null>(null)
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
        <PersonCard key={p.id} person={p} me={p.id === me} day={day} onAdd={() => addFor(p)} onOpen={(meal) => setOpened({ person: p, meal })} />
      ))}
      <Sheet open={Boolean(opened)} onClose={() => setOpened(null)} title={opened ? t('family.mealOf', { meal: t(`meal.${opened.meal}`), name: opened.person.name }) : ''}>
        {opened ? (
          <MealFoods
            logs={opened.person.meals.filter((m) => m.meal === opened.meal)}
            onChange={(id) => navigate(`/food/edit/${id}`, { state: { back: '/family' } })}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

/** One person on one day: the targets, what was eaten of them, and the meals logged. */
function PersonCard({ person, me, day, onAdd, onOpen }: { person: FamilyMember; me: boolean; day: string; onAdd: () => void; onOpen: (meal: Meal) => void }) {
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
          {meals.map((g) => {
            const m = eatenOf(g.logs)
            return (
              <li key={g.meal}>
                {/* Each meal opens: its foods, and a way to change them. */}
                <button onClick={() => onOpen(g.meal)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-2xl px-2 py-1 text-left active:bg-card-2" aria-label={t('family.openMeal', { meal: t(`meal.${g.meal}`), name: person.name })}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <b>{t(`meal.${g.meal}`)}</b>
                      <span className="text-sm text-ink-2 tabular">{num(m.kcal)} kcal</span>
                    </span>
                    <MacroLine values={m} />
                    <span className="block text-sm text-ink-2">{g.logs.map((l) => l.title).join(', ')}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-ink-3">{t('family.nothingYet')}</p>
      )}
    </Card>
  )
}

/** Protein, carbs and fat of a meal or a food, on one small line. */
function MacroLine({ values }: { values: { protein_g: number; carbs_g: number; fat_g: number } }) {
  const { t, num } = useI18n()
  return (
    <span className="block text-xs text-ink-3 tabular">
      {t('macro.protein')} {num(Number(values.protein_g))} g · {t('macro.carbs')} {num(Number(values.carbs_g))} g · {t('macro.fat')} {num(Number(values.fat_g))} g
    </span>
  )
}

/**
 * One meal of someone, opened: each part logged (a plate, a recipe portion…) with its foods, calories and macros, and
 * the way to change its foods and amounts. Meals from another app are changed there.
 */
function MealFoods({ logs, onChange }: { logs: FamilyMeal[]; onChange: (id: string) => void }) {
  const { t, num } = useI18n()
  return (
    <ul className="grid gap-3">
      {logs.map((log) => (
        <li key={log.id} className="rounded-2xl bg-card-2 p-3">
          <p className="flex items-baseline justify-between gap-2">
            <b className="min-w-0">{log.title}</b>
            <span className="shrink-0 text-sm text-ink-2 tabular">{num(Number(log.kcal))} kcal</span>
          </p>
          <MacroLine values={log} />
          {log.items?.length ? (
            <ul className="mt-2 grid gap-1 border-t border-line pt-2 text-sm">
              {log.items.map((it, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    {it.name}
                    {it.grams > 0 ? <span className="text-ink-3"> · {num(it.grams)} g</span> : null}
                  </span>
                  <span className="shrink-0 text-ink-2 tabular">{num(Number(it.kcal))} kcal</span>
                </li>
              ))}
            </ul>
          ) : null}
          {isSynced(log) ? (
            <p className="mt-2 text-sm text-ink-3">{t('food.syncedFrom', { app: log.origin || 'Health Connect' })}</p>
          ) : (
            <Button size="sm" className="mt-2" onClick={() => onChange(log.id)}>
              <Pencil className="size-4" aria-hidden /> {t('family.change')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
