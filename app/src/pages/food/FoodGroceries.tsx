import { Check, Share2, ShoppingBasket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, Empty, Loading, PageHeader, Segmented, cx } from '../../components/ui'
import { localDay } from '../../lib/calc'
import { useFoodDb } from '../../lib/foodDb'
import { AISLES, FRUIT_A_DAY, groceryList, VEG_A_DAY, type GroceryItem } from '../../lib/grocery'
import { useI18n } from '../../lib/i18n'
import { useEnergy } from '../../lib/useEnergy'

const TICKS = 'forza.groceryTicks'

/** What was ticked off while shopping, on this phone: kept for a few days, then the list starts afresh. */
function readTicks(): Set<string> {
  try {
    const kept = JSON.parse(localStorage.getItem(TICKS) ?? 'null') as { day: string; keys: string[] } | null
    if (!kept) return new Set()
    const age = (new Date(localDay(new Date())).getTime() - new Date(kept.day).getTime()) / 86_400_000
    return age <= 3 ? new Set(kept.keys) : new Set()
  } catch {
    return new Set()
  }
}

function keepTicks(keys: Set<string>) {
  try {
    localStorage.setItem(TICKS, JSON.stringify({ day: localDay(new Date()), keys: [...keys] }))
  } catch {
    // ticks stay for this visit only
  }
}

/**
 * "Going shopping?": the foods the person logs, as a grocery list for the next days that fits their targets: whole
 * foods, enough protein, fruit and vegetables every day. Ticked off while shopping, shared as text.
 */
export function FoodGroceries() {
  const { t, num, locale } = useI18n()
  const { energy, food, loading } = useEnergy()
  const db = useFoodDb()
  const [days, setDays] = useState<3 | 7>(7)
  const [ticked, setTicked] = useState<Set<string>>(readTicks)
  const [copied, setCopied] = useState(false)
  const list = useMemo(() => (energy ? groceryList(food, db.foods, energy.targets, days, locale) : null), [energy, food, db.foods, days, locale])

  if (loading || !energy) return <Loading />
  const tg = energy.targets

  const amount = (it: GroceryItem) => {
    if (it.count) return t('grocery.eggs', { n: it.count })
    const big = it.grams >= 1000
    if (it.liquid) return big ? `${num(it.grams / 1000, 1)} l` : `${num(it.grams)} ml`
    return big ? `${num(it.grams / 1000, 1)} kg` : `${num(it.grams)} g`
  }
  const why = (it: GroceryItem) => (it.instead.length ? t(it.why === 'wholegrain' ? 'grocery.wholegrain' : 'grocery.instead', { names: it.instead.join(', ') }) : t(`grocery.why.${it.why}`))

  function tick(key: string) {
    const next = new Set(ticked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setTicked(next)
    keepTicks(next)
  }

  async function share() {
    if (!list) return
    const lines = [`${t('grocery.title')} · ${t(days === 7 ? 'grocery.week' : 'grocery.days3')}`]
    for (const aisle of AISLES) {
      const items = list.items.filter((i) => i.aisle === aisle)
      if (!items.length) continue
      lines.push('', t(`grocery.aisle.${aisle}`))
      for (const i of items) lines.push(`• ${i.name}: ${amount(i)}${i.pack ? ` (${t('grocery.packs', { n: Math.round(i.grams / i.pack), g: i.pack })})` : ''}`)
    }
    const text = lines.join('\n')
    try {
      if (navigator.share) return await navigator.share({ title: t('grocery.title'), text })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      // nothing to copy to: the list stays on screen
    }
  }

  const p = list?.perDay
  return (
    <div className="grid gap-4">
      <PageHeader title={t('grocery.title')} back="/food" />
      <p className="text-ink-2">{t('grocery.intro')}</p>
      <Segmented
        options={[
          { value: 3 as const, label: t('grocery.days3') },
          { value: 7 as const, label: t('grocery.week') },
        ]}
        value={days}
        onChange={setDays}
      />
      {!list || !p ? (
        <Card>
          <Empty icon={<ShoppingBasket className="size-10 text-brand" />} title={t('grocery.emptyTitle')} text={t('grocery.empty')} />
        </Card>
      ) : (
        <>
          {list.loggedDays < 7 ? <p className="rounded-2xl bg-sun-soft p-3 text-sm">{t('grocery.fewDays', { n: list.loggedDays })}</p> : null}
          {/* What the list brings, a day: against the targets, so it can be trusted at a glance. */}
          <Card title={t('grocery.perDay')} tone="leaf">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {(
                [
                  ['grocery.kcal', p.kcal, tg.kcal, 'kcal'],
                  ['macro.protein', p.protein_g, tg.protein_g, 'g'],
                  ['grocery.fiber', p.fiber_g, tg.fiber_g, 'g'],
                  ['grocery.fruitVeg', p.fruitVeg_g, VEG_A_DAY + FRUIT_A_DAY, 'g'],
                ] as const
              ).map(([label, got, want, unit]) => (
                <div key={label}>
                  <dt className="text-ink-2">{t(label)}</dt>
                  <dd className="tabular">
                    <b className="text-base">{num(got)}</b> / {num(want)} {unit}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          {AISLES.map((aisle) => {
            const items = list.items.filter((i) => i.aisle === aisle)
            if (!items.length) return null
            return (
              <Card key={aisle} title={t(`grocery.aisle.${aisle}`)}>
                <ul className="-my-1 divide-y divide-line">
                  {items.map((it) => {
                    const done = ticked.has(it.key)
                    return (
                      <li key={it.key}>
                        <button onClick={() => tick(it.key)} aria-pressed={done} aria-label={t('grocery.tick', { name: it.name })} className="flex w-full items-start gap-3 py-2 text-left">
                          <span className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2', done ? 'border-leaf bg-leaf text-white' : 'border-line')} aria-hidden>
                            {done ? <Check className="size-4" /> : null}
                          </span>
                          <span className={cx('min-w-0 flex-1', done && 'text-ink-3 line-through')}>
                            <span className="block font-semibold">{it.name}</span>
                            <span className="block text-xs text-ink-3">{why(it)}</span>
                          </span>
                          <span className={cx('shrink-0 text-right tabular', done && 'text-ink-3')}>
                            <b className="block">{amount(it)}</b>
                            {it.pack ? <span className="block text-xs text-ink-3">{t('grocery.packs', { n: Math.round(it.grams / it.pack), g: it.pack })}</span> : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
          <div className="grid gap-1 text-sm text-ink-2">
            <p>{t('grocery.asSold')}</p>
            <p>{t('grocery.eatOut')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void share()}>
              {copied ? <Check className="size-5" aria-hidden /> : <Share2 className="size-5" aria-hidden />} {copied ? t('grocery.copied') : t('grocery.share')}
            </Button>
            <Button
              variant="secondary"
              disabled={!ticked.size}
              onClick={() => {
                setTicked(new Set())
                keepTicks(new Set())
              }}
            >
              {t('grocery.untick')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
