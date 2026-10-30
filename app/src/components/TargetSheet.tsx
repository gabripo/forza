import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { PACE_KCAL } from '../lib/calc'
import { useApp } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { Pace, Profile } from '../lib/types'
import { Button, Segmented, Sheet } from './ui'

const STEP = 50

/**
 * Change the daily calorie target: how fast to go towards the goal, a manual adjustment, and whether to
 * follow Build With Science's target. Every change is saved at once (the coach can do the same in Coach).
 */
export function TargetSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t, num, date } = useI18n()
  const { profile, saveProfile } = useApp()
  const [saving, setSaving] = useState(false)
  if (!profile) return null
  const goal = profile.goal ?? 'maintain'
  const bws = profile.bws_targets?.kcal ? profile.bws_targets : null
  const following = profile.kcal_source === 'bws' && bws

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
        {bws ? (
          <section>
            <p className="mb-2 font-semibold">{t('target.source')}</p>
            <Segmented<'forza' | 'bws'>
              value={following ? 'bws' : 'forza'}
              onChange={(v) => void save({ kcal_source: v })}
              options={[
                { value: 'forza', label: 'Forza!' },
                { value: 'bws', label: 'Build With Science' },
              ]}
            />
            <p className="mt-1 text-sm text-ink-3">
              {t('target.sourceHint', { range: `${num(bws.kcal[0])}–${num(bws.kcal[1])}`, date: profile.bws_targets_at ? date(profile.bws_targets_at, { day: 'numeric', month: 'short' }) : '—' })}
            </p>
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
