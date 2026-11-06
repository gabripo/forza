import { Plus, Sprout } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDay } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import { processedHabits, processedOn, swapsFor, type ProcessedKind, type SwapIdea } from '../lib/processed'
import type { FoodItem, FoodLog } from '../lib/types'
import { mealForNow } from './PlateResult'
import { Button, cx } from './ui'

const KEY = 'forza.processed'
/** "Got it" puts the card away for a week: a habit is not changed in a day, and nobody likes being told twice. */
const AWAY_DAYS = 7

const hiddenUntil = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * For whoever logs processed foods often (ice cream, biscuits, snacks…): did they know these fill up less and bring
 * fewer nutrients? Kind by kind, what they logged and many alternatives, each one tap away from being logged.
 */
export function ProcessedCard({ food }: { food: FoodLog[] }) {
  const { t, num } = useI18n()
  const [hidden, setHidden] = useState(() => hiddenUntil() >= localDay(new Date()))
  const habits = useMemo(() => processedHabits(food), [food])
  const [chosen, setChosen] = useState<ProcessedKind | null>(null)
  if (hidden || !habits) return null
  const kind = habits.kinds.find((k) => k.kind === chosen) ?? habits.kinds[0]

  function hide() {
    const until = new Date()
    until.setDate(until.getDate() + AWAY_DAYS - 1)
    try {
      localStorage.setItem(KEY, localDay(until))
    } catch {
      // Shown again next time: no harm.
    }
    setHidden(true)
  }

  return (
    <section className="rounded-3xl border-2 border-leaf bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-leaf uppercase">
        <Sprout className="size-5" aria-hidden /> {t('processed.label')}
      </p>
      <p className="mt-1 text-lg leading-snug font-bold">{t('processed.ask')}</p>
      <p className="mt-1 text-ink-2">{t('processed.seen', { meals: num(habits.meals), days: num(habits.days) })}</p>
      {habits.kinds.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('processed.kinds')}>
          {habits.kinds.map((k) => (
            <button
              key={k.kind}
              onClick={() => setChosen(k.kind)}
              aria-pressed={k.kind === kind.kind}
              className={cx('rounded-full border-2 px-3 py-1 text-sm font-semibold', k.kind === kind.kind ? 'border-leaf bg-leaf-soft' : 'border-line bg-card')}
            >
              {t(`processed.kind.${k.kind}`)} · {num(k.times)}
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-sm text-ink-3">{t('processed.logged', { names: kind.names.slice(0, 3).join(', ') })}</p>
      <p className="mt-1">{t(`processed.why.${kind.kind}`)}</p>
      <p className="mt-3 font-semibold">{t(`processed.instead.${kind.kind}`)}</p>
      <SwapList key={kind.kind} kind={kind.kind} />
      <Button variant="ghost" className="mt-2 -ml-2" onClick={hide}>
        {t('processed.gotIt')}
      </Button>
    </section>
  )
}

/** The alternatives, three at first and all of them on request, each with what it brings and a tap to log it. */
function SwapList({ kind }: { kind: ProcessedKind }) {
  const { t, locale } = useI18n()
  const [all, setAll] = useState(false)
  const swaps = swapsFor(kind, locale)
  const shown = all ? swaps : swaps.slice(0, 3)
  return (
    <>
      <ul className="mt-2 grid gap-2">
        {shown.map((w) => (
          <SwapRow key={w.id} swap={w} />
        ))}
      </ul>
      {swaps.length > shown.length ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => setAll(true)}>
          {t('processed.more', { n: swaps.length - shown.length })}
        </Button>
      ) : null}
    </>
  )
}

function SwapRow({ swap }: { swap: SwapIdea }) {
  const { t, num } = useI18n()
  const navigate = useNavigate()
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card-2 p-3">
      <span className="text-2xl" aria-hidden>
        {swap.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-tight font-semibold">{swap.name}</span>
        <span className="block text-sm text-ink-2">{swap.note}</span>
        <span className="block text-sm text-ink-3">{t('processed.brings', { kcal: num(swap.kcal), p: num(swap.protein_g) })}</span>
      </span>
      <Button variant="secondary" className="bg-card" onClick={() => navigate('/food/add', { state: { items: swap.items, meal: mealForNow() } })} aria-label={t('processed.add', { name: swap.name })}>
        <Plus className="size-4" aria-hidden />
      </Button>
    </li>
  )
}

/** While logging a plate with a processed food: what to have instead next time, in a line. */
export function ProcessedSwapHint({ items }: { items: FoodItem[] }) {
  const { t, locale } = useI18n()
  const found = processedOn(items)
  const [first] = found
  if (!first) return null
  const [kind, names] = first
  const ideas = swapsFor(kind, locale)
    .filter((w) => w.id !== 'one_scoop' && w.id !== 'diet_soda')
    .slice(0, 3)
    .map((w) => w.name)
  return (
    <p className="rounded-2xl bg-leaf-soft p-3 text-sm">
      <Sprout className="mr-1 inline size-4 text-leaf" aria-hidden />
      <b>{t('processed.nextTime', { name: names[0] })}</b> {ideas.join(' · ')}
    </p>
  )
}
