import { Check, Share2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../lib/auth'
import type { Targets } from '../lib/calc'
import { getFamilyPeople, shareMeals } from '../lib/data'
import { totalsOf, type Totals } from '../lib/dayCheck'
import { useI18n } from '../lib/i18n'
import type { FoodItem, FoodLog, Meal } from '../lib/types'
import { Button, Segmented, Sheet } from './ui'

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

/** A meal of the day opened: what it brings, food by food, and sharing it with whoever ate the same. */
export function MealSheet({ meal, entries, targets, onClose, onShare }: { meal: Meal | null; entries: FoodLog[]; targets: Targets; onClose: () => void; onShare: (ids: string[]) => void }) {
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
        </div>
      ) : null}
    </Sheet>
  )
}

/**
 * One person cooked, more ate: the meal goes into the food log of the people chosen, at the same time and part of
 * the day, with their own portion (the same, half, one and a half, double). They can change their copy.
 * Give it a new key for each meal shared, so it starts afresh.
 */
export function ShareMealSheet({ ids, onClose, onShared }: { ids: string[] | null; onClose: () => void; onShared?: (n: number) => void }) {
  const { t } = useI18n()
  const { session } = useApp()
  const [people, setPeople] = useState<{ id: string; display_name: string }[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [factor, setFactor] = useState(1)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    if (!ids || !session || people) return
    void getFamilyPeople(session.user.id).then(setPeople, () => setPeople([]))
  }, [ids, session, people])

  async function share() {
    if (!ids || !chosen.length) return
    setBusy(true)
    try {
      await shareMeals(ids, chosen, factor)
      setDone(chosen.length)
      onShared?.(chosen.length)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={Boolean(ids)} onClose={onClose} title={t('share.title')}>
      {ids ? (
        done !== null ? (
          <div className="grid gap-3 text-center">
            <p className="text-lg font-bold text-leaf">
              <Check className="mr-1 inline size-5" aria-hidden /> {t('share.done', { n: done })}
            </p>
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
              <ul className="grid gap-2">
                {people.map((p) => {
                  const on = chosen.includes(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setChosen((xs) => (on ? xs.filter((x) => x !== p.id) : [...xs, p.id]))}
                        aria-pressed={on}
                        className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left font-semibold ${on ? 'border-leaf bg-leaf-soft' : 'border-line bg-card'}`}
                      >
                        <Users className="size-5 text-ink-3" aria-hidden />
                        <span className="flex-1">{p.display_name}</span>
                        {on ? <Check className="size-5 text-leaf" aria-hidden /> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div>
              <p className="mb-1 font-semibold">{t('share.portion')}</p>
              <Segmented<number>
                value={factor}
                onChange={setFactor}
                options={[
                  { value: 0.5, label: '½' },
                  { value: 1, label: t('share.same') },
                  { value: 1.5, label: '×1½' },
                  { value: 2, label: '×2' },
                ]}
              />
            </div>
            <Button size="lg" block onClick={() => void share()} loading={busy} disabled={!chosen.length}>
              <Share2 className="size-5" aria-hidden /> {t('share.button')}
            </Button>
          </div>
        )
      ) : null}
    </Sheet>
  )
}
