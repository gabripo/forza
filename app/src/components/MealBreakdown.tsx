import { useState } from 'react'
import type { Targets } from '../lib/calc'
import { totalsOf } from '../lib/dayCheck'
import { useI18n } from '../lib/i18n'
import type { FoodLog, Meal } from '../lib/types'
import { Card } from './ui'

// In the order of the day: the arcs follow it clockwise from the top.
const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']
const NUTRIENTS = [
  { key: 'kcal', label: 'kcal', unit: 'kcal' },
  { key: 'protein_g', label: 'protein', unit: 'g' },
  { key: 'carbs_g', label: 'carbs', unit: 'g' },
  { key: 'fat_g', label: 'fat', unit: 'g' },
] as const
type Nutrient = (typeof NUTRIENTS)[number]['key']

const SIZE = 168
const STROKE = 24
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R
/** A point of the ring at fraction f of the way round, clockwise from the top. */
const at = (f: number, r: number) => [SIZE / 2 + r * Math.sin(2 * Math.PI * f), SIZE / 2 - r * Math.cos(2 * Math.PI * f)] as const

type Entry = Pick<FoodLog, 'meal' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'satfat_g' | 'salt_g'>

/**
 * What each meal of a day brings to the day's target: the whole ring is the target (or all that was eaten, past it),
 * one arc per meal, and the rest of the target in grey. Calories, protein, carbs or fat.
 */
export function MealBreakdown({ entries, targets }: { entries: Entry[]; targets: Targets }) {
  const { t, num } = useI18n()
  const [nutrient, setNutrient] = useState<Nutrient>('kcal')
  // The meal pointed at, touched or focused: the others fade and the middle reads it.
  const [active, setActive] = useState<Meal | null>(null)
  const unit = NUTRIENTS.find((n) => n.key === nutrient)!.unit
  const target = targets[nutrient]
  const parts = MEALS.filter((m) => entries.some((e) => e.meal === m)).map((meal) => ({ meal, v: totalsOf(entries.filter((e) => e.meal === meal))[nutrient] }))
  const total = parts.reduce((s, p) => s + p.v, 0)
  const whole = Math.max(target, total, 1)
  const pct = (v: number) => (target > 0 ? Math.round((v / target) * 100) : 0)
  const value = (v: number) => `${num(Math.round(v))} ${unit}`

  const arcs = parts.map((p, i) => ({ ...p, start: parts.slice(0, i).reduce((s, q) => s + q.v, 0) / whole, len: p.v / whole }))
  const drawn = arcs.filter((a) => a.len > 0)
  const rest = Math.max(0, target - total)
  // A 2px gap of the card's colour between neighbours: between meals, and between the meals and the grey rest.
  const gaps = drawn.length > 1 || (drawn.length && rest > 0) ? [...drawn.map((a) => a.start), ...(rest > 0 ? [total / whole] : [])] : []
  const shown = active ? parts.find((p) => p.meal === active) : null
  const label = (p: { meal: Meal; v: number }) => `${t(`meal.${p.meal}`)} ${value(p.v)}, ${t('mealSplit.ofTarget', { p: pct(p.v) })}`

  return (
    <Card title={t('mealSplit.title')}>
      <p className="-mt-1 text-sm text-ink-2">{t(total > target ? 'mealSplit.textOver' : 'mealSplit.text')}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('mealSplit.what')}>
        {NUTRIENTS.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => setNutrient(n.key)}
            aria-pressed={nutrient === n.key}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${nutrient === n.key ? 'bg-ink text-card' : 'bg-card-2 text-ink-2'}`}
          >
            {t(`macro.${n.label}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} role="img" aria-label={t('mealSplit.aria', { what: t(`macro.${NUTRIENTS.find((n) => n.key === nutrient)!.label}`), list: parts.map(label).join('; ') })}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--card-2)" strokeWidth={STROKE} />
            {drawn.map((a) => (
              <circle
                key={a.meal}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={`var(--meal-${a.meal})`}
                strokeWidth={STROKE}
                strokeDasharray={`${a.len * C} ${C}`}
                strokeDashoffset={-a.start * C}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                opacity={active && active !== a.meal ? 0.3 : 1}
                className="cursor-pointer transition-opacity"
                onPointerEnter={() => setActive(a.meal)}
                onPointerLeave={() => setActive(null)}
                onClick={() => setActive(active === a.meal ? null : a.meal)}
              >
                <title>{label(a)}</title>
              </circle>
            ))}
            {gaps.map((f, i) => {
              const [x1, y1] = at(f, R - STROKE / 2 - 1)
              const [x2, y2] = at(f, R + STROKE / 2 + 1)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--card)" strokeWidth={2} pointerEvents="none" />
            })}
            {/* Past the target: where the target was, across the ring. */}
            {total > target && target > 0
              ? (() => {
                  const [x1, y1] = at(target / whole, R - STROKE / 2 - 4)
                  const [x2, y2] = at(target / whole, R + STROKE / 2 + 4)
                  return (
                    <g pointerEvents="none">
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--card)" strokeWidth={6} strokeLinecap="round" />
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
                    </g>
                  )
                })()
              : null}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-live="polite">
            <div className="max-w-24">
              {shown ? <div className="truncate text-xs font-semibold text-ink-2">{t(`meal.${shown.meal}`)}</div> : null}
              <div className="text-2xl font-extrabold tabular">{pct(shown ? shown.v : total)}%</div>
              <div className="text-xs text-ink-2">{shown ? value(shown.v) : t('mealSplit.ofTargetShort')}</div>
            </div>
          </div>
        </div>
        <ul className="grid w-full flex-1 gap-1">
          {parts.map((p) => (
            <li key={p.meal}>
              <button
                type="button"
                onPointerEnter={() => setActive(p.meal)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(p.meal)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === p.meal ? null : p.meal)}
                aria-pressed={active === p.meal}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left ${active === p.meal ? 'bg-card-2' : ''}`}
              >
                <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: `var(--meal-${p.meal})` }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">{t(`meal.${p.meal}`)}</span>
                <span className="tabular">{value(p.v)}</span>
                <span className="w-12 text-right text-sm text-ink-2 tabular">{pct(p.v)}%</span>
              </button>
            </li>
          ))}
          <li className="flex min-h-11 items-center gap-2 border-t border-line px-2 text-ink-2">
            {total > target ? (
              <span className="inline-block h-3 w-0.5 shrink-0 bg-ink" aria-hidden />
            ) : (
              <span className="inline-block size-3 shrink-0 rounded-full bg-card-2 ring-1 ring-line" aria-hidden />
            )}
            <span className="min-w-0 flex-1">{t(total > target ? 'mealSplit.over' : 'mealSplit.rest')}</span>
            <span className="tabular">{total > target ? `+${value(total - target)}` : value(rest)}</span>
            <span className="w-12 text-right text-sm tabular">{total > target ? `+${pct(total) - 100}` : pct(rest)}%</span>
          </li>
        </ul>
      </div>
    </Card>
  )
}
