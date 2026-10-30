import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { kcalFloor, PACE_KCAL } from '../lib/calc'
import { useApp } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Pace, Profile } from '../lib/types'
import { Button, NumberInput, Segmented, Sheet } from './ui'

const STEP = 50

type Source = 'forza' | 'bws' | 'manual'

/**
 * Change the daily calorie target: how fast to go towards the goal and a manual adjustment, a number set by
 * hand (the macros follow it), or Build With Science's target. Every change is saved at once (the coach can do
 * the same in Coach).
 */
export function TargetSheet({ open, onClose, onChanged, current }: { open: boolean; onClose: () => void; onChanged: () => void; current: number }) {
  const { t, num, date } = useI18n()
  const { profile, saveProfile } = useApp()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)
  if (!profile) return null
  const goal = profile.goal ?? 'maintain'
  const bws = profile.bws_targets?.kcal ? profile.bws_targets : null
  const source: Source = profile.kcal_source === 'bws' && bws ? 'bws' : profile.kcal_source === 'manual' && profile.kcal_target ? 'manual' : 'forza'
  const following = source !== 'forza'
  const typed = draft ?? profile.kcal_target ?? current
  const setTarget = (v: number) => setDraft(Math.max(800, Math.min(6000, Math.round(v))))

  async function save(patch: Partial<Profile>) {
    setSaving(true)
    try {
      await saveProfile(patch)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const manual = profile.kcal_manual ?? 0
  const setManual = (v: number) => save({ kcal_manual: Math.max(-1500, Math.min(1500, v)) })

  return (
    <Sheet open={open} onClose={onClose} title={t('target.title')}>
      <div className="grid gap-5">
        <section>
          <p className="mb-2 font-semibold">{t('target.source')}</p>
          <Segmented<Source>
            value={source}
            onChange={(v) => {
              setDraft(null)
              void save(v === 'manual' ? { kcal_source: 'manual', kcal_target: profile.kcal_target ?? current } : { kcal_source: v })
            }}
            options={[
              { value: 'forza', label: 'Forza!' },
              ...(bws ? [{ value: 'bws' as const, label: 'Build With Science' }] : []),
              { value: 'manual', label: t('target.byHand') },
            ]}
          />
          {source === 'bws' && bws ? (
            <p className="mt-1 text-sm text-ink-3">
              {t('target.sourceHint', { range: `${num(bws.kcal[0])}–${num(bws.kcal[1])}`, date: profile.bws_targets_at ? date(profile.bws_targets_at, { day: 'numeric', month: 'short' }) : '—' })}
            </p>
          ) : null}
        </section>

        {source === 'manual' ? (
          <section>
            <p className="mb-2 font-semibold">{t('target.daily')}</p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="lg" onClick={() => setTarget(typed - STEP)} disabled={saving} aria-label={t('target.less')}>
                <Minus className="size-5" aria-hidden />
              </Button>
              <div className="flex-1">
                <NumberInput decimals={false} value={typed} onChange={(v) => setDraft(v)} aria-label={t('target.daily')} className="text-center text-2xl font-extrabold" />
              </div>
              <Button variant="secondary" size="lg" onClick={() => setTarget(typed + STEP)} disabled={saving} aria-label={t('target.more')}>
                <Plus className="size-5" aria-hidden />
              </Button>
            </div>
            <p className="mt-1 text-sm text-ink-3">{t('target.dailyHint')}</p>
            {typed < kcalFloor(profile) ? <p className="mt-1 text-sm font-semibold text-danger">{t('target.belowFloor', { kcal: num(kcalFloor(profile)) })}</p> : null}
            {draft !== null && draft !== profile.kcal_target ? (
              <Button block className="mt-2" loading={saving} disabled={!draft || draft < 800} onClick={() => void save({ kcal_target: Math.max(800, Math.min(6000, draft)) }).then(() => setDraft(null))}>
                {t('common.save')}
              </Button>
            ) : null}
          </section>
        ) : null}

        {!following && goal !== 'maintain' ? (
          <section>
            <p className="mb-2 font-semibold">{t('target.pace')}</p>
            <Segmented<Pace>
              value={profile.goal_pace ?? 'normal'}
              onChange={(v) => void save({ goal_pace: v })}
              options={(['slow', 'normal', 'fast'] as const).map((p) => ({ value: p, label: t(`paceName.${p}`) }))}
            />
            <p className="mt-1 text-sm text-ink-3">
              {t(`target.paceHint.${goal}`, {
                kcal: num(Math.abs(PACE_KCAL[goal][profile.goal_pace ?? 'normal'])),
                kg: num(Math.abs((PACE_KCAL[goal][profile.goal_pace ?? 'normal'] * 7) / 7700), 2),
              })}
            </p>
          </section>
        ) : null}

        {!following ? (
          <section>
            <p className="mb-2 font-semibold">{t('target.manual')}</p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="lg" onClick={() => setManual(manual - STEP)} disabled={saving} aria-label={t('target.less')}>
                <Minus className="size-5" aria-hidden />
              </Button>
              <p className="flex-1 text-center text-2xl font-extrabold tabular">
                {manual > 0 ? '+' : manual < 0 ? '−' : ''}
                {num(Math.abs(manual))} kcal
              </p>
              <Button variant="secondary" size="lg" onClick={() => setManual(manual + STEP)} disabled={saving} aria-label={t('target.more')}>
                <Plus className="size-5" aria-hidden />
              </Button>
            </div>
            <p className="mt-1 text-sm text-ink-3">{t('target.manualHint')}</p>
            {manual ? (
              <Button variant="ghost" className="mt-1" onClick={() => setManual(0)} disabled={saving}>
                {t('target.reset')}
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
    </Sheet>
  )
}
