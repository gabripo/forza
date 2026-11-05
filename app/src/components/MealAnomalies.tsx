import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { localDay, round1, scaleItem } from '../lib/calc'
import { fixFood, markFoodChecked } from '../lib/data'
import { useI18n } from '../lib/i18n'
import { isSynced, mealAnomalies, nextCheck, type MealAnomaly } from '../lib/mealAnomaly'
import type { FoodItem, FoodLog } from '../lib/types'
import { Button, NumberInput, Sheet } from './ui'

const keyOf = (a: MealAnomaly) => `${a.day}|${a.meal}`
const describe = (items: FoodItem[], num: (n: number) => string) => items.map((i) => (i.grams > 0 ? `${i.name} ${num(i.grams)} g` : i.name)).join(', ')
const sum = (items: FoodItem[], k: 'kcal' | 'protein_g') => items.reduce((s, i) => s + (Number(i[k]) || 0), 0)

/**
 * The time, moved on when a meal is due to be looked at (10:00, 15:30, 21:30) and when the app comes back to the
 * front; `refresh` then reads the meals again, as some arrive from elsewhere (another app, the family, Coach).
 */
function useCheckTime(refresh: () => void): Date {
  const [now, setNow] = useState(() => new Date())
  const again = useRef(refresh)
  useEffect(() => {
    again.current = refresh
  })
  useEffect(() => {
    const tick = () => {
      setNow(new Date())
      again.current()
    }
    const timer = window.setTimeout(tick, Math.max(1000, nextCheck(now).getTime() - Date.now() + 1000))
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [now])
  return now
}

/**
 * Meals of the last week that look logged by mistake, one card each (up to `limit`, the others on the Food page):
 * the person corrects the meal or says it is right, and until then the card stays.
 */
export function MealAnomalyCards({ food, onChanged, limit = 3, moreTo }: { food: FoodLog[]; onChanged: () => void; limit?: number; moreTo?: string }) {
  const { t, num, date, locale } = useI18n()
  const now = useCheckTime(onChanged)
  const found = useMemo(() => mealAnomalies(food, locale, now), [food, locale, now])
  const [fixing, setFixing] = useState<MealAnomaly | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const when = (day: string) =>
    day === localDay(now) ? t('anomaly.today') : day === localDay(yesterday) ? t('anomaly.yesterday') : t('anomaly.on', { date: date(day, { weekday: 'long', day: 'numeric' }) })
  const titleOf = (a: MealAnomaly) => t('anomaly.title', { meal: t(`meal.${a.meal}`), day: when(a.day) })

  async function itIsRight(a: MealAnomaly) {
    setBusy(keyOf(a))
    setFailed(null)
    try {
      await markFoodChecked(a.entries.map((e) => e.id))
      onChanged()
    } catch {
      setFailed(keyOf(a))
    } finally {
      setBusy(null)
    }
  }

  if (!found.length) return null
  return (
    <>
      {found.slice(0, limit).map((a) => {
        const k = keyOf(a)
        const synced = a.entries.filter(isSynced)
        const onlySynced = synced.length === a.entries.length
        const named = a.named
        return (
          <section key={k} className="rounded-3xl border-2 border-sun bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-sun uppercase">
              <AlertTriangle className="size-5" aria-hidden /> {t('anomaly.label')}
            </p>
            <p className="mt-1 text-lg leading-snug font-bold">{titleOf(a)}</p>
            <p className="mt-1 text-ink-2">
              {named
                ? t('anomaly.named', {
                    title: named.log.title,
                    logged: describe(named.log.items ?? [], num) || t('anomaly.nothing'),
                    kcal: num(Number(named.log.kcal)),
                    maybe: describe(named.items, num),
                    maybeKcal: num(sum(named.items, 'kcal')),
                  })
                : a.reason === 'heavy' && a.heavy
                  ? t('anomaly.heavy', { kcal: num(Number(a.heavy.kcal)), p: num(Number(a.heavy.protein_g)) })
                  : t(a.usual?.own ? 'anomaly.light' : 'anomaly.lightTypical', { kcal: num(a.kcal), usual: num(a.usual?.kcal ?? 0) })}
            </p>
            {synced.length ? <p className="mt-1 text-sm text-ink-3">{t('anomaly.synced', { app: synced[0].origin || 'Health Connect' })}</p> : null}
            <p className="mt-2 font-semibold">{t(onlySynced ? 'anomaly.askSynced' : 'anomaly.ask')}</p>
            {failed === k ? <p className="mt-2 rounded-xl bg-danger-soft p-2 text-sm">{t('common.saveError')}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {onlySynced ? null : (
                <Button onClick={() => setFixing(a)} disabled={busy === k}>
                  {t('anomaly.fix')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => void itIsRight(a)} loading={busy === k}>
                {t(onlySynced ? 'anomaly.done' : 'anomaly.right')}
              </Button>
            </div>
          </section>
        )
      })}
      {found.length > limit ? (
        moreTo ? (
          <Link to={moreTo} className="-mt-2 text-center text-sm font-semibold text-brand-ink">
            {t('anomaly.more', { n: found.length - limit })}
          </Link>
        ) : (
          <p className="-mt-2 text-center text-sm text-ink-3">{t('anomaly.more', { n: found.length - limit })}</p>
        )
      ) : null}
      <Sheet open={Boolean(fixing)} onClose={() => setFixing(null)} title={fixing ? titleOf(fixing) : ''}>
        {fixing ? (
          <FixMeal
            key={keyOf(fixing)}
            anomaly={fixing}
            today={fixing.day === localDay(now)}
            onSaved={() => {
              setFixing(null)
              onChanged()
            }}
          />
        ) : null}
      </Sheet>
    </>
  )
}

type Row = { base: FoodItem; item: FoodItem }
const rowsOf = (items: FoodItem[]): Row[] => items.map((it) => ({ base: it, item: it }))

/**
 * The meal's foods, to correct: amounts, foods out. For a food named but logged as something else, the foods its
 * name says come ready instead (a typical portion each), so a look and a tap are enough.
 */
function FixMeal({ anomaly, today, onSaved }: { anomaly: MealAnomaly; today: boolean; onSaved: () => void }) {
  const { t, num } = useI18n()
  const navigate = useNavigate()
  // The entry found odd first, then the rest of that meal.
  const editable = anomaly.entries.filter((e) => !isSynced(e)).sort((a, b) => Number(b.id === anomaly.named?.log.id) - Number(a.id === anomaly.named?.log.id))
  const [rows, setRows] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(editable.map((e) => [e.id, rowsOf(anomaly.named?.log.id === e.id ? anomaly.named.items : (e.items ?? []))])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  /** A new amount for one food: grams when it has them, otherwise its calories; the rest follows. */
  function setAmount(id: string, i: number, v: number | null) {
    if (!v) return
    setRows({
      ...rows,
      [id]: rows[id].map((r, j) => {
        const from = r.base.grams > 0 ? r.base.grams : r.base.kcal
        return j === i && from > 0 ? { ...r, item: scaleItem(r.base, v / from) } : r
      }),
    })
  }

  async function save() {
    setSaving(true)
    setError(false)
    try {
      const changed = editable.filter((e) => anomaly.named?.log.id === e.id || JSON.stringify(rows[e.id].map((r) => r.item)) !== JSON.stringify(e.items ?? []))
      for (const e of changed) await fixFood(e.id, rows[e.id].map((r) => r.item))
      const rest = anomaly.entries.filter((e) => !changed.includes(e)).map((e) => e.id)
      if (rest.length) await markFoodChecked(rest)
      onSaved()
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const all = Object.values(rows).flat().map((r) => r.item)
  return (
    <div className="grid gap-4">
      <p className="text-ink-2">{t(anomaly.named ? 'anomaly.fixNamed' : anomaly.reason === 'heavy' ? 'anomaly.fixHeavy' : 'anomaly.fixLight')}</p>
      {editable.map((e) => {
        const items = rows[e.id].map((r) => r.item)
        return (
          <section key={e.id} className="grid gap-2 rounded-2xl bg-card-2 p-3">
            <p className="font-semibold">{e.title}</p>
            {anomaly.named?.log.id === e.id ? (
              <p className="text-sm text-ink-3">{t('anomaly.before', { what: describe(e.items ?? [], num) || t('anomaly.nothing'), kcal: num(Number(e.kcal)) })}</p>
            ) : null}
            {items.length ? (
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
                      <NumberInput decimals={false} value={it.grams > 0 ? it.grams : it.kcal} onChange={(v) => setAmount(e.id, i, v)} aria-label={t('anomaly.amount', { name: it.name })} />
                    </div>
                    <span className="w-8 text-sm text-ink-2">{it.grams > 0 ? 'g' : 'kcal'}</span>
                    <button
                      onClick={() => setRows({ ...rows, [e.id]: rows[e.id].filter((_, j) => j !== i) })}
                      disabled={items.length === 1}
                      className="grid size-10 place-items-center text-ink-3 disabled:opacity-30"
                      aria-label={t('anomaly.remove', { name: it.name })}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">{t('anomaly.noFoods')}</p>
            )}
          </section>
        )
      })}
      <p className="font-semibold">{t('anomaly.total', { kcal: num(sum(all, 'kcal')), p: num(round1(sum(all, 'protein_g'))) })}</p>
      {/* Something missing from today's meal: logged on top, the usual way. */}
      {today && anomaly.reason === 'light' ? (
        <Button variant="secondary" onClick={() => navigate('/food/add', { state: { meal: anomaly.meal } })}>
          <Plus className="size-5" aria-hidden /> {t('anomaly.addMissing')}
        </Button>
      ) : null}
      {error ? <p className="rounded-xl bg-danger-soft p-2 text-sm">{t('common.saveError')}</p> : null}
      <Button size="lg" onClick={() => void save()} loading={saving}>
        {t('anomaly.save')}
      </Button>
    </div>
  )
}
