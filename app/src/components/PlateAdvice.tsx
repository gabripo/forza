import { Camera, ChevronRight, Mic, PenLine } from 'lucide-react'
import { useState } from 'react'
import { scorePlate, type PlateTotals } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import type { Meal } from '../lib/types'
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
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const s = scorePlate(totals, meal, dailyKcal, ultraProcessed, new Date())
  const todo = s.reasons.filter((r) => !r.good && ADVICE[r.key]).slice(0, 3)
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
