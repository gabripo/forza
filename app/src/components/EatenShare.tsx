import { useState } from 'react'
import { setEatenShare } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { FoodLog } from '../lib/types'
import { Button, NumberInput, Segmented } from './ui'

const SHARES = [0.25, 0.5, 0.75, 1]

/**
 * A dish logged whole and eaten only in part (a portion of a Cookidoo recipe, a plate not finished): how much of
 * it, as a share of what was logged. Every food and total follows, and the choice can be changed again later,
 * always from the meal as logged.
 */
export function EatenShare({ meal, onChanged }: { meal: FoodLog; onChanged: (m: FoodLog) => void }) {
  const { t, num } = useI18n()
  const share = Number(meal.eaten_share) || 1
  const listed = SHARES.includes(share)
  const [other, setOther] = useState<number | null>(listed ? null : Math.round(share * 100))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function choose(v: number) {
    if (v === share || busy) return
    setBusy(true)
    setError(false)
    try {
      onChanged(await setEatenShare(meal, v))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <p className="font-semibold">{t('eaten.title')}</p>
      <Segmented<number> value={listed ? share : null} onChange={(v) => void choose(v)} options={SHARES.map((v) => ({ value: v, label: v === 1 ? t('eaten.all') : `${num(v * 100)}%` }))} />
      <div className="flex items-center gap-2 text-sm">
        <span>{t('eaten.other')}</span>
        <div className="w-20">
          <NumberInput decimals={false} value={other} onChange={setOther} aria-label={t('eaten.amount')} />
        </div>
        <span>%</span>
        <Button size="sm" variant="secondary" loading={busy} disabled={!other || other < 5 || other > 200} onClick={() => other && void choose(Math.round(other) / 100)}>
          {t('eaten.apply')}
        </Button>
      </div>
      <p className="text-sm text-ink-2">
        {t('eaten.now', { kcal: num(Number(meal.kcal)), p: num(Number(meal.protein_g)) })}
        {share !== 1 ? ` ${t('eaten.whole', { kcal: num(Math.round(Number(meal.kcal) / share)) })}` : ''}
      </p>
      {error ? <p className="rounded-xl bg-danger-soft p-2 text-sm">{t('common.saveError')}</p> : null}
      <p className="text-xs text-ink-3">{t('eaten.hint')}</p>
    </div>
  )
}
