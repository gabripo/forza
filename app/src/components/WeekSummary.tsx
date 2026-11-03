import { CalendarRange } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { WeekSummary } from '../lib/weekSummary'
import { Button } from './ui'

const SEEN = 'forza.weekSummarySeen'

function seen(): string | null {
  try {
    return localStorage.getItem(SEEN)
  } catch {
    return null
  }
}

const signed = (n: number, fmt: (v: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`

/**
 * "What happened last week", once a week (until "Got it"): food, weight, workouts and steps against the plan,
 * then how the energy estimate and the target moved, with the weekly calorie proposal when one is due. Kind
 * words only: a week is a step, not an exam.
 */
export function WeekSummaryCard({ summary, onChanged }: { summary: WeekSummary; onChanged: () => void }) {
  const { t, num, kg, date } = useI18n()
  const { profile, saveProfile } = useApp()
  const [hidden, setHidden] = useState(() => seen() === summary.from)
  const [busy, setBusy] = useState(false)
  if (hidden || !profile) return null
  const s = summary
  const c = s.checkin
  const proposal = c.due && c.change !== 0 && c.verdict !== 'not_enough_data'

  async function close(apply: boolean) {
    if (!profile) return
    setBusy(true)
    try {
      // The weekly check-in is answered here too: no second question on the Food page.
      if (c.due) await saveProfile({ kcal_adjust: (profile.kcal_adjust ?? 0) + (apply ? c.change : 0), kcal_checkin_at: new Date().toISOString() })
      try {
        localStorage.setItem(SEEN, s.from)
      } catch {
        // shown again next time: no harm
      }
      setHidden(true)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const range = `${date(s.from, { day: 'numeric', month: 'short' })} – ${date(s.to, { day: 'numeric', month: 'short' })}`
  const rows: [string, string][] = [
    // Days right on target are told only when there are some: never "0 days".
    ['🍽️', t(s.daysOnTarget ? 'week.foodOnTarget' : 'week.food', { days: s.foodDays, kcal: num(s.avgKcal), target: num(s.targetNow), onTarget: s.daysOnTarget, protein: num(s.avgProtein) })],
    ['⚖️', s.trendChange !== null ? t('week.weight', { change: signed(s.trendChange, (v) => kg(v)), pace: signed(s.paceKgPerWeek, (v) => num(v, 2)) }) : t('week.weightFew', { n: s.weighIns })],
    ['💪', t('week.workouts', { n: s.workouts, goal: s.workoutsGoal })],
    ...(s.avgSteps !== null ? ([['👟', t('week.steps', { n: num(s.avgSteps), goal: num(s.stepsGoal) })]] as [string, string][]) : []),
    ['🔥', Math.abs(s.tdeeNow - s.tdeeBefore) >= 20 ? t('week.energyMoved', { now: num(s.tdeeNow), before: num(s.tdeeBefore) }) : t('week.energySame', { now: num(s.tdeeNow) })],
    ['🎯', s.targetNow !== s.targetBefore ? t('week.targetMoved', { now: num(s.targetNow), before: num(s.targetBefore) }) : t('week.targetSame', { now: num(s.targetNow) })],
  ]

  return (
    <section className="rounded-3xl border-2 border-leaf bg-card p-4" aria-label={t('week.title')}>
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-leaf uppercase">
        <CalendarRange className="size-5" aria-hidden /> {t('week.title')}
      </p>
      <p className="text-sm text-ink-3">{range}</p>
      <ul className="mt-3 grid gap-2">
        {rows.map(([emoji, text]) => (
          <li key={emoji} className="flex gap-3">
            <span className="text-xl" aria-hidden>
              {emoji}
            </span>
            <span className="leading-snug">{text}</span>
          </li>
        ))}
      </ul>
      {s.method === 'blended' ? <p className="mt-2 text-sm text-ink-3">{t('week.measured')}</p> : null}

      {proposal ? (
        <div className="mt-3 rounded-2xl bg-sky-soft p-3">
          <p className="font-bold">{t('week.proposal', { change: signed(c.change, (v) => num(v)), target: num(s.targetNow + c.change) })}</p>
          <p className="mt-1 text-sm text-ink-2">{t(`kcalCheckin.${c.verdict}`)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void close(true)} loading={busy}>
              {t('kcalCheckin.apply')}
            </Button>
            <Button variant="secondary" onClick={() => void close(false)} disabled={busy}>
              {t('kcalCheckin.keep')}
            </Button>
          </div>
        </div>
      ) : null}

      <p className="mt-3 rounded-2xl bg-leaf-soft p-3 text-center font-bold">{t('week.cheer')}</p>
      {!proposal ? (
        <Button className="mt-3" variant="secondary" onClick={() => void close(false)} loading={busy}>
          {t('week.done')}
        </Button>
      ) : null}
    </section>
  )
}
