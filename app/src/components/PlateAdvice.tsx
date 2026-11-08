import { Camera, ChevronRight, Mic, PenLine } from 'lucide-react'
import { useState } from 'react'
import { localDay, scorePlate, type PlateTotals, type Targets } from '../lib/calc'
import { addTotals, logsOfDay, totalsOf } from '../lib/dayCheck'
import { useI18n } from '../lib/i18n'
import type { FoodLog, Meal } from '../lib/types'
import { MealNumbers } from './MealSheets'
import { Button, Sheet } from './ui'

/** Each weak point of a plate, as one clear thing to do. */
const ADVICE: Record<string, { emoji: string; key: string }> = {
  protein_low: { emoji: '💪', key: 'protein' },
  fiber_low: { emoji: '🥦', key: 'veg' },
  kcal_high: { emoji: '🍽️', key: 'smaller' },
  kcal_low: { emoji: '➕', key: 'more' },
  sugar_high: { emoji: '🍬', key: 'sugar' },
  processed: { emoji: '🏭', key: 'processed' },
  late_sugar: { emoji: '🌙', key: 'evening' },
  // About the whole day, with what was logged before.
  day_over: { emoji: '📊', key: 'dayOver' },
  day_protein: { emoji: '💪', key: 'dayProtein' },
  day_fiber: { emoji: '🥦', key: 'dayFiber' },
  day_satfat: { emoji: '🧈', key: 'daySatfat' },
}

/** What the rest of today brings to this plate: the same meal logged before, and the whole day with the plate. */
export interface PlateContext {
  food: FoodLog[]
  targets: Targets
  /** When the plate is eaten: now, or a meal of a day before being logged (judged with that day's food). */
  at?: Date
}

/** The plate is for a day before: the advice for the rest of the day no longer applies. */
const pastDay = (ctx: PlateContext | undefined, now: Date) => Boolean(ctx?.at && localDay(ctx.at) !== localDay(now))

function withToday(totals: PlateTotals, meal: Meal, ctx: PlateContext | undefined, now: Date) {
  if (!ctx) return null
  const today = logsOfDay(ctx.food, localDay(now))
  const before = totalsOf(today.filter((f) => f.meal === meal))
  const plate = { ...totals, satfat_g: totals.satfat_g ?? null, salt_g: totals.salt_g ?? null }
  return { before, hadBefore: today.some((f) => f.meal === meal), meal: addTotals(before, plate), day: addTotals(totalsOf(today), plate) }
}

/**
 * Advice for the whole day, once the plate is added: past the calories, or (late in the day) still short of
 * protein or fibre, or past the saturated fat limit. Most important first.
 */
function dayAdvice(day: ReturnType<typeof totalsOf>, tg: Targets, meal: Meal, now: Date): string[] {
  const out: string[] = []
  const late = meal === 'dinner' || now.getHours() >= 19
  if (day.kcal > tg.ranges.kcal[1] * 1.05) out.push('day_over')
  if (day.satfat_g != null && day.satfat_g > tg.satfat_g) out.push('day_satfat')
  if (late && day.protein_g < tg.ranges.protein_g[0] * 0.85) out.push('day_protein')
  if (late && day.fiber_g < tg.fiber_g * 0.7) out.push('day_fiber')
  return out
}

/**
 * Advice first, numbers later: after a photo, people see what to do ("Add protein!") before
 * calories and grams. Tapping a piece of advice explains it and offers to retake the photo (or
 * dictate again) or adjust the meal by hand.
 */
export function PlateAdvice({
  totals,
  meal,
  dailyKcal,
  ultraProcessed,
  tip,
  onRetake,
  onAdjust,
  voice = false,
  context,
}: {
  totals: PlateTotals
  meal: Meal
  dailyKcal: number
  ultraProcessed: boolean
  tip?: string | null
  onRetake: () => void
  onAdjust: () => void
  /** The meal was dictated: "again" means speaking again, not a new photo. */
  voice?: boolean
  /** Today's food and targets: the plate is judged with the same meal logged before, and the whole day. */
  context?: PlateContext
}) {
  const { t, num } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const now = new Date()
  const past = pastDay(context, now)
  const at = context?.at ?? now
  const today = withToday(totals, meal, context, at)
  // A second dish of the same lunch is judged with the first one: together they are the meal.
  const s = scorePlate(today?.hadBefore ? { ...today.meal, salt_g: today.meal.salt_g ?? undefined, satfat_g: today.meal.satfat_g ?? undefined } : totals, meal, dailyKcal, ultraProcessed, at)
  const fromDay = today && context && !past ? dayAdvice(today.day, context.targets, meal, at) : []
  const todo = [
    ...fromDay.map((key) => ({ key, good: false })),
    ...s.reasons.filter((r) => !r.good && ADVICE[r.key] && !(r.key === 'protein_low' && fromDay.includes('day_protein')) && !(r.key === 'kcal_high' && fromDay.includes('day_over'))),
  ].slice(0, 3)
  const good = s.reasons.filter((r) => r.good)
  const advice = open ? ADVICE[open] : null

  return (
    <section className={`rounded-3xl p-4 ${todo.length ? 'bg-sun-soft' : 'bg-leaf-soft'}`}>
      <h2 className="text-xl font-extrabold">{todo.length ? t('advice.title', { n: todo.length }) : t('advice.great')}</h2>
      {todo.length ? (
        <ul className="mt-3 grid gap-2">
          {todo.map((r) => (
            <li key={r.key}>
              <button onClick={() => setOpen(r.key)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm active:bg-card-2">
                <span className="text-3xl" aria-hidden>
                  {ADVICE[r.key].emoji}
                </span>
                <span className="flex-1 text-lg font-bold">{t(`advice.${ADVICE[r.key].key}.short`)}</span>
                <ChevronRight className="size-5 text-ink-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-ink-2">{good.map((r) => t(`reason.${r.key}`)).join(' · ')}</p>
      )}
      {tip ? <p className="mt-3 text-ink-2">💡 {tip}</p> : null}
      {today && context ? (
        <p className="mt-3 text-sm text-ink-2">
          {today.hadBefore ? `${t('advice.withBefore', { meal: t(`meal.${meal}`).toLowerCase(), kcal: num(today.before.kcal) })} ` : ''}
          {t(past ? 'advice.dayWith' : 'advice.todayWith', { kcal: num(today.day.kcal), target: num(context.targets.kcal) })}
        </p>
      ) : null}

      <Sheet open={Boolean(advice)} onClose={() => setOpen(null)} title={advice ? `${advice.emoji} ${t(`advice.${advice.key}.short`)}` : ''}>
        {advice ? (
          <div className="grid gap-3">
            <p className="text-lg">{t(`advice.${advice.key}.long`)}</p>
            <Button
              size="lg"
              block
              onClick={() => {
                setOpen(null)
                onRetake()
              }}
            >
              {voice ? <Mic className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />} {t(voice ? 'advice.redictate' : 'advice.retake')}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              block
              onClick={() => {
                setOpen(null)
                onAdjust()
              }}
            >
              <PenLine className="size-5" aria-hidden /> {t('advice.adjust')}
            </Button>
          </div>
        ) : null}
      </Sheet>
    </section>
  )
}

/**
 * While adding to a meal: what it already has, and the meal with this plate, nutrient by nutrient (and how much of
 * the day's target each is). Shown only when the meal already has something logged today.
 */
export function MealSoFar({ totals, meal, context, salt = false }: { totals: PlateTotals; meal: Meal; context: PlateContext; salt?: boolean }) {
  const { t, num } = useI18n()
  const now = new Date()
  const today = withToday(totals, meal, context, context.at ?? now)
  if (!today?.hadBefore) return null
  return (
    <details className="rounded-3xl border border-line bg-card p-4">
      <summary className="cursor-pointer font-bold">
        {t('mealSoFar.title', { meal: t(`meal.${meal}`) })}: {num(today.before.kcal)} → {num(today.meal.kcal)} kcal
      </summary>
      <p className="mt-2 text-sm text-ink-2">{t(pastDay(context, now) ? 'mealSoFar.textDay' : 'mealSoFar.text')}</p>
      <div className="mt-2">
        <MealNumbers totals={today.meal} targets={context.targets} salt={salt} />
      </div>
    </details>
  )
}
