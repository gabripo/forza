import { useState } from 'react'
import { addWeight } from '../lib/data'
import { useI18n } from '../lib/i18n'
import { Button, Field, NumberInput, Sheet } from './ui'

export function LogWeightSheet({ open, onClose, onSaved, last }: { open: boolean; onClose: () => void; onSaved: () => void; last?: number | null }) {
  const { t } = useI18n()
  const [kg, setKg] = useState<number | null>(last ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function save() {
    if (!kg || kg < 25 || kg > 350) return
    setBusy(true)
    setError(false)
    try {
      await addWeight(kg)
      onSaved()
      onClose()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('weight.log')}>
      <div className="grid gap-4">
        <p className="rounded-2xl bg-sky-soft p-3 text-sm">⏰ {t('weight.conditions')}</p>
        <Field label={t('weight.today')}>
          <NumberInput value={kg} onChange={setKg} autoFocus className="h-16 text-3xl" />
        </Field>
        {error ? <p className="font-semibold text-danger">{t('common.saveError')}</p> : null}
        <Button size="lg" block loading={busy} onClick={save} disabled={!kg}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
