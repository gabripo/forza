import { BookPlus, Check, Share2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../lib/auth'
import type { Targets } from '../lib/calc'
import { getFamilyPeople, shareMeals } from '../lib/data'
import { totalsOf, type Totals } from '../lib/dayCheck'
import { useI18n } from '../lib/i18n'
import type { FoodItem, FoodLog, Meal } from '../lib/types'
import { Button, NumberInput, Segmented, Sheet } from './ui'

/** Each nutrient of a meal (or a plate) and how much of the day's target it is. */
export function MealNumbers({ totals, targets, salt = false }: { totals: Totals; targets: Targets; salt?: boolean }) {
  const { t, num } = useI18n()
  const rows: [string, number | null, number, number?][] = [
    [t('macro.kcal'), totals.kcal, targets.kcal],
    [t('macro.protein'), totals.protein_g, targets.protein_g],
    [t('macro.carbs'), totals.carbs_g, targets.carbs_g],
    [t('macro.fat'), totals.fat_g, targets.fat_g],
    [t('macro.satfat'), totals.satfat_g, targets.satfat_g, 1],
    [t('macro.fiber'), totals.fiber_g, targets.fiber_g],
    [t('macro.sugar'), totals.sugar_g, 0],
    ...(salt ? ([[t('macro.salt'), totals.salt_g, targets.salt_g, 1]] as [string, number | null, number, number][]) : []),
  ]
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, v, target, digits], i) => (
          <tr key={label} className={i === 0 ? 'text-base font-bold' : ''}>
            <th scope="row" className="py-1 text-left font-semibold">
              {label}
            </th>
            <td className="py-1 text-right tabular">{v == null ? '—' : `${num(v, digits ?? 0)}${i === 0 ? ' kcal' : ' g'}`}</td>
            <td className="py-1 pl-3 text-right text-sm font-normal whitespace-nowrap text-ink-3 tabular">{v != null && target > 0 ? t('mealSheet.ofDay', { p: Math.round((v / target) * 100) }) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A meal of the day opened: what it brings, food by food, sharing it with whoever ate the same, or keeping it as a recipe. */
export function MealSheet({ meal, entries, targets, onClose, onShare, onRecipe }: { meal: Meal | null; entries: FoodLog[]; targets: Targets; onClose: () => void; onShare: (ids: string[]) => void; onRecipe?: (logs: FoodLog[]) => void }) {
  const { t, num } = useI18n()
  const { profile } = useApp()
  const totals = totalsOf(entries)
  const foods: FoodItem[] = entries.flatMap((e) => (e.items?.length ? e.items : [{ name: e.title, grams: 0, kcal: Number(e.kcal), protein_g: Number(e.protein_g), carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }]))
  return (
    <Sheet open={Boolean(meal)} onClose={onClose} title={meal ? t('mealSheet.title', { meal: t(`meal.${meal}`) }) : ''}>
      {meal ? (
        <div className="grid gap-4">
          <MealNumbers totals={totals} targets={targets} salt={Boolean(profile?.track_salt)} />
          <div>
            <p className="mb-1 font-bold">{t('mealSheet.items')}</p>
            <ul className="grid gap-1 text-sm">
              {foods.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {f.name}
                    {f.grams ? <span className="text-ink-3"> · {num(f.grams)} g</span> : null}
                  </span>
                  <span className="text-ink-2 tabular">
                    {num(f.kcal)} kcal · P {num(f.protein_g)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {/* Meals from another app too (Build With Science, Health Connect): the copies are the family's own. */}
          {entries.length ? (
            <Button variant="secondary" onClick={() => onShare(entries.map((e) => e.id))}>
              <Share2 className="size-5" aria-hidden /> {t('mealSheet.share')}
            </Button>
          ) : null}
          {entries.length && onRecipe ? (
            <Button variant="secondary" onClick={() => onRecipe(entries)}>
              <BookPlus className="size-5" aria-hidden /> {t('mealSheet.makeRecipe')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}

const SHARES = [0.25, 0.5, 0.75, 1]

/** How much of the whole meal one person had: a quarter, half, three quarters, all of it, or another percentage. */
function ShareOf({ name, share, wholeKcal, onChange }: { name: string; share: number | null; wholeKcal: number; onChange: (share: number | null) => void }) {
  const { t, num } = useI18n()
  const [other, setOther] = useState<number | null>(share !== null && !SHARES.includes(share) ? Math.round(share * 100) : null)
  return (
    <div className="grid gap-2 px-1 pt-2">
      <p className="text-sm font-semibold">{t('share.howMuch', { name })}</p>
      <Segmented<number>
        value={other === null ? share : null}
        onChange={(v) => {
          setOther(null)
          onChange(v)
        }}
        options={SHARES.map((v) => ({ value: v, label: `${num(v * 100)}%` }))}
      />
      <div className="flex items-center gap-2 text-sm">
        <span>{t('eaten.other')}</span>
        <div className="w-20">
          <NumberInput
            decimals={false}
            value={other}
            onChange={(v) => {
              setOther(v)
              onChange(v && v >= 5 && v <= 300 ? Math.round(v) / 100 : null)
            }}
            aria-label={t('share.percentOf', { name })}
          />
        </div>
        <span>%</span>
        <span className="ml-auto text-ink-2 tabular">{share === null ? t('share.outOfRange') : `${num(Math.round(wholeKcal * share))} kcal`}</span>
      </div>
    </div>
  )
}

/**
 * One person cooked, more ate: the meal goes into the food log of the people chosen, at the same time and part of
 * the day, each with how much of it they had: a percentage of the whole meal as logged (a Cookidoo dish logged whole
 * and eaten only in part counts whole). They can change their copy. Give it a new key for each meal shared, so it
 * starts afresh.
 */
export function ShareMealSheet({ meals, onClose, onShared }: { meals: FoodLog[] | null; onClose: () => void; onShared?: (n: number) => void }) {
  const { t, num } = useI18n()
  const { session } = useApp()
  const [people, setPeople] = useState<{ id: string; display_name: string }[] | null>(null)
  // The people chosen, in the order they were, each with their share of the whole meal (null: a percentage not allowed).
  const [chosen, setChosen] = useState<{ id: string; share: number | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    if (!meals || !session || people) return
    void getFamilyPeople(session.user.id).then(setPeople, () => setPeople([]))
  }, [meals, session, people])

  // How much of the whole meal this person ate, when the same for all of it: the others start with the same.
  const own = (meals ?? []).map((m) => Number(m.eaten_share) || 1)
  const mine = own.length && own.every((s) => s === own[0]) ? own[0] : 1
  const wholeKcal = (meals ?? []).reduce((s, m) => s + Number(m.kcal) / (Number(m.eaten_share) || 1), 0)
  const ready = Boolean(meals?.length) && chosen.length > 0 && chosen.every((c) => c.share !== null)

  async function share() {
    if (!meals || !ready) return
    setBusy(true)
    try {
      await shareMeals(
        meals.map((m) => m.id),
        chosen.map((c) => ({ id: c.id, share: c.share ?? 1 })),
      )
      setDone(chosen.length)
      onShared?.(chosen.length)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={Boolean(meals)} onClose={onClose} title={t('share.title')}>
      {meals ? (
        done !== null ? (
          <div className="grid gap-3 text-center">
            <p className="text-lg font-bold text-leaf">
              <Check className="mr-1 inline size-5" aria-hidden /> {t('share.done', { n: done })}
            </p>
            <p className="text-sm text-ink-2">{t('share.editLater')}</p>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-ink-2">{t('share.text')}</p>
            {people === null ? (
              <p className="text-ink-3">…</p>
            ) : people.length === 0 ? (
              <p className="rounded-2xl bg-card-2 p-3">{t('share.none')}</p>
            ) : (
              <ul className="grid gap-3">
                {people.map((p) => {
                  const pick = chosen.find((c) => c.id === p.id)
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setChosen((xs) => (pick ? xs.filter((x) => x.id !== p.id) : [...xs, { id: p.id, share: mine }]))}
                        aria-pressed={Boolean(pick)}
                        className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left font-semibold ${pick ? 'border-leaf bg-leaf-soft' : 'border-line bg-card'}`}
                      >
                        <Users className="size-5 text-ink-3" aria-hidden />
                        <span className="flex-1">{p.display_name}</span>
                        {pick ? <Check className="size-5 text-leaf" aria-hidden /> : null}
                      </button>
                      {pick ? (
                        <ShareOf
                          name={p.display_name}
                          share={pick.share}
                          wholeKcal={wholeKcal}
                          onChange={(share) => setChosen((xs) => xs.map((x) => (x.id === p.id ? { ...x, share } : x)))}
                        />
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            {/* A dish logged whole and eaten only in part: the percentages are of all of it, not of this person's part. */}
            {mine !== 1 && chosen.length ? <p className="text-sm text-ink-2">{t('share.ofWhole', { pct: num(Math.round(mine * 100)) })}</p> : null}
            <Button size="lg" block onClick={() => void share()} loading={busy} disabled={!ready}>
              <Share2 className="size-5" aria-hidden /> {t('share.button')}
            </Button>
          </div>
        )
      ) : null}
    </Sheet>
  )
}
