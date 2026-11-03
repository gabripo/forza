import { HeartHandshake } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Button, Sheet } from './ui'

// A week as it really goes: some days over, some under; its average right on the target.
const WEEK = [0.92, 1.14, 0.97, 0.84, 1.08, 1.19, 0.86]

/**
 * Why one day's numbers matter little: what counts is what is done most days, and a home that makes it easy.
 * Shown next to the numbers, to keep the mind serene as well as the body healthy.
 */
export function ConsistencyInfographic() {
  const { t, date } = useI18n()
  const W = 320
  const H = 150
  const pad = { l: 8, r: 8, t: 14, b: 22 }
  const band = (W - pad.l - pad.r) / WEEK.length
  const y = (v: number) => pad.t + (1 - v / 1.3) * (H - pad.t - pad.b)
  const average = WEEK.reduce((a, b) => a + b, 0) / WEEK.length
  const monday = new Date(2026, 0, 5)
  return (
    <div className="grid gap-5">
      <figure className="grid gap-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('consistency.chartLabel')}>
          {WEEK.map((v, i) => {
            const x = pad.l + band * i + band * 0.2
            return <rect key={i} x={x} y={y(v)} width={band * 0.6} height={y(0) - y(v)} rx={4} fill={v > 1.05 ? 'var(--macro-carbs)' : v < 0.9 ? 'var(--series-muted)' : 'var(--series-1)'} />
          })}
          <line x1={pad.l} x2={W - pad.r} y1={y(1)} y2={y(1)} stroke="var(--ink)" strokeDasharray="5 4" strokeWidth={1.5} />
          <line x1={pad.l} x2={W - pad.r} y1={y(average)} y2={y(average)} stroke="var(--leaf)" strokeWidth={3} opacity={0.85} />
          <text x={W - pad.r} y={y(1) - 5} textAnchor="end" fontSize={11} fill="var(--ink)">
            {t('consistency.target')}
          </text>
          {WEEK.map((_, i) => {
            const d = new Date(monday)
            d.setDate(d.getDate() + i)
            return (
              <text key={i} x={pad.l + band * (i + 0.5)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--axis)">
                {date(d, { weekday: 'narrow' })}
              </text>
            )
          })}
        </svg>
        <figcaption className="text-sm text-ink-2">
          <span className="mr-1 inline-block h-1 w-4 rounded bg-leaf align-middle" aria-hidden /> {t('consistency.caption')}
        </figcaption>
      </figure>

      <section>
        <h3 className="mb-2 font-extrabold">{t('consistency.envTitle')}</h3>
        <ul className="grid grid-cols-2 gap-2">
          {(['kitchen', 'plan', 'sleep', 'together'] as const).map((k) => (
            <li key={k} className="rounded-2xl bg-card-2 p-3">
              <span className="text-2xl" aria-hidden>
                {{ kitchen: '🏠', plan: '🗓️', sleep: '😴', together: '👨‍👩‍👧' }[k]}
              </span>
              <p className="mt-1 text-sm leading-snug">{t(`consistency.env.${k}`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-extrabold">{t('consistency.trapsTitle')}</h3>
        <ul className="grid gap-2">
          {(['allOrNothing', 'perfect', 'scale'] as const).map((k) => (
            <li key={k} className="grid gap-1 rounded-2xl border border-line p-3">
              <p className="text-sm text-ink-2 line-through decoration-danger/60">💭 {t(`consistency.trap.${k}.thought`)}</p>
              <p className="font-semibold">✅ {t(`consistency.trap.${k}.better`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-2xl bg-leaf-soft p-3 text-center font-bold">{t('consistency.closing')}</p>
    </div>
  )
}

/** A small link next to the numbers that opens the infographic. */
export function ConsistencyLink({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" className={className} onClick={() => setOpen(true)}>
        <HeartHandshake className="size-4" aria-hidden /> {t('consistency.link')}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('consistency.title')}>
        <ConsistencyInfographic />
      </Sheet>
    </>
  )
}
