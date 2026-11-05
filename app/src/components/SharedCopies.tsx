import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { round1, scaleItem } from '../lib/calc'
import { deleteSharedCopies, getSharedCopies, updateSharedMeal } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { FoodItem, FoodLog, SharedCopy } from '../lib/types'
import { Button, NumberInput } from './ui'

// Shares of the whole meal as logged, as when sharing it.
const PORTIONS = [0.25, 0.5, 0.75, 1, 1.5]

const sum = (items: FoodItem[], k: 'kcal' | 'protein_g') => items.reduce((s, i) => s + (Number(i[k]) || 0), 0)

/**
 * Under a meal this person shared: the copies in the others' food logs. The one who cooked knows how much each
 * one had, so they change it here: a portion of the whole meal, a food taken out or put back, an amount.
 */
export function SharedCopies({ meal }: { meal: FoodLog }) {
  const { t, num } = useI18n()
  const [copies, setCopies] = useState<SharedCopy[] | null>(null)
  // Each food with the values it started from: amounts typed one key at a time are scaled from those.
  const [editing, setEditing] = useState<{ id: string; rows: { base: FoodItem; item: FoodItem }[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    getSharedCopies(meal.id).then(
      (c) => live && setCopies(c),
      () => live && setCopies([]),
    )
    return () => {
      live = false
    }
  }, [meal.id])

  if (!copies?.length) return null
  // The meal as this person logged it: what a portion is measured against, and the foods to put back.
  const original: FoodItem[] = meal.items?.length ? meal.items : [{ name: meal.title, grams: 0, kcal: Number(meal.kcal), protein_g: Number(meal.protein_g), carbs_g: Number(meal.carbs_g), fat_g: Number(meal.fat_g), fiber_g: Number(meal.fiber_g), sugar_g: Number(meal.sugar_g) }]
  // A dish logged whole and eaten only in part: what the others had is a share of all of it.
  const mine = Number(meal.eaten_share) || 1
  const wholeKcal = sum(original, 'kcal') / mine

  const rowsOf = (items: FoodItem[]) => items.map((it) => ({ base: it, item: it }))
  const items = editing?.rows.map((r) => r.item) ?? []

  async function save() {
    if (!editing?.rows.length) return
    setSaving(true)
    setError(false)
    try {
      await updateSharedMeal(editing.id, items)
      setCopies(await getSharedCopies(meal.id))
      setEditing(null)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  /** Shared by mistake, or not eaten after all: out of that person's food log. */
  async function remove(c: SharedCopy) {
    if (!window.confirm(t('sharedCopies.removeConfirm', { name: c.person }))) return
    setSaving(true)
    setError(false)
    try {
      await deleteSharedCopies([c.id])
      if (editing?.id === c.id) setEditing(null)
      setCopies(await getSharedCopies(meal.id))
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  /** A new amount for one food: grams when it has them, otherwise its calories; the rest follows. */
  function setAmount(i: number, v: number | null) {
    if (!editing || !v) return
    setEditing({
      ...editing,
      rows: editing.rows.map((r, j) => {
        const from = r.base.grams > 0 ? r.base.grams : r.base.kcal
        return j === i && from > 0 ? { ...r, item: scaleItem(r.base, v / from) } : r
      }),
    })
  }

  return (
    <div className="grid gap-2 rounded-2xl bg-card-2 p-3">
      <p className="flex items-center gap-2 font-semibold">
        <Users className="size-5 text-ink-3" aria-hidden /> {t('sharedCopies.title')}
      </p>
      <ul className="grid gap-2">
        {copies.map((c) => {
          const open = editing?.id === c.id
          const k = wholeKcal > 0 ? Number(c.kcal) / wholeKcal : null
          return (
            <li key={c.id} className="rounded-xl bg-card p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <b>{c.person}</b>
                  <span className="block text-sm text-ink-2">
                    {num(Number(c.kcal))} kcal · {t('macro.protein')} {num(Number(c.protein_g))} g
                    {k !== null ? ` · ${t('sharedCopies.ofWhole', { pct: Math.round(k * 100) })}` : ''}
                  </span>
                </span>
                {open ? null : (
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ id: c.id, rows: rowsOf(c.items?.length ? c.items : original) })}>
                    <Pencil className="size-4" aria-hidden /> {t('sharedCopies.change')}
                  </Button>
                )}
                <button onClick={() => void remove(c)} disabled={saving} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2 disabled:opacity-40" aria-label={t('sharedCopies.remove', { name: c.person })}>
                  <Trash2 className="size-5" />
                </button>
              </div>
              {open && editing ? (
                <div className="mt-2 grid gap-3">
                  {/* Their portion of the whole meal, compared with this person's. */}
                  <div>
                    <p className="mb-1 text-sm font-semibold">{t('sharedCopies.portion', { name: c.person })}</p>
                    <div className="flex flex-wrap gap-1">
                      {PORTIONS.map((p) => (
                        <Button key={p} size="sm" variant="secondary" className="bg-card-2" onClick={() => setEditing({ ...editing, rows: rowsOf(original.map((it) => scaleItem(it, p / mine))) })}>
                          {num(p * 100)}%
                        </Button>
                      ))}
                    </div>
                  </div>
                  <ul className="grid gap-2">
                    {items.map((it, i) => (
                      <li key={`${it.name}-${i}`} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block truncate font-semibold">{it.name}</span>
                          <span className="text-ink-2">
                            {num(it.kcal)} kcal · P {num(it.protein_g)}
                          </span>
                        </span>
                        <div className="w-20">
                          <NumberInput decimals={false} value={it.grams > 0 ? it.grams : it.kcal} onChange={(v) => setAmount(i, v)} aria-label={t('sharedCopies.amount', { name: it.name })} />
                        </div>
                        <span className="w-8 text-sm text-ink-2">{it.grams > 0 ? 'g' : 'kcal'}</span>
                        <button
                          onClick={() => setEditing({ ...editing, rows: editing.rows.filter((_, j) => j !== i) })}
                          disabled={items.length === 1}
                          className="grid size-10 place-items-center text-ink-3 disabled:opacity-30"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="size-5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {/* Foods of the meal they did not have: back in with one tap, as this person had them. */}
                  {original
                    .filter((o) => !items.some((it) => it.name === o.name))
                    .map((o) => (
                      <button key={o.name} onClick={() => setEditing({ ...editing, rows: [...editing.rows, { base: o, item: o }] })} className="flex items-center gap-2 text-left text-sm font-semibold text-brand-ink">
                        <Plus className="size-4" aria-hidden /> {t('sharedCopies.putBack', { name: o.name })}
                      </button>
                    ))}
                  <p className="text-sm font-semibold">{t('sharedCopies.total', { kcal: num(sum(items, 'kcal')), p: num(round1(sum(items, 'protein_g'))) })}</p>
                  {error ? <p className="rounded-xl bg-danger-soft p-2 text-sm">{t('common.saveError')}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void save()} loading={saving}>
                      {t('sharedCopies.save', { name: c.person })}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {error && !editing ? <p className="rounded-xl bg-danger-soft p-2 text-sm">{t('common.saveError')}</p> : null}
      <p className="text-xs text-ink-3">{t('sharedCopies.hint')}</p>
    </div>
  )
}
