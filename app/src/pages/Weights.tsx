import { FileUp, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { LogWeightSheet } from '../components/LogWeightSheet'
import { Button, Card, Empty, Loading, PageHeader } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { useApp } from '../lib/auth'
import { parseWeightCsv, type ParsedWeight } from '../lib/csv'
import { deleteWeight, getWeights, importWeights, useAsync } from '../lib/data'
import { useI18n } from '../lib/i18n'

export function Weights() {
  const { t, kg, date } = useI18n()
  const { profile } = useApp()
  const { data, loading, reload } = useAsync(() => getWeights(3650), [])
  const [logOpen, setLogOpen] = useState(false)
  const [pending, setPending] = useState<ParsedWeight[] | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setCsvError(null)
    const { rows, error } = parseWeightCsv(await file.text())
    if (error) setCsvError(t(`weights.csv.${error}`))
    else setPending(rows)
  }

  async function confirmImport() {
    if (!pending) return
    setImporting(true)
    try {
      await importWeights(pending, 'eufy_csv')
      setPending(null)
      await reload()
    } finally {
      setImporting(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm(t('weights.confirmDelete'))) return
    await deleteWeight(id)
    void reload()
  }

  if (loading && !data) return <Loading />
  const weights = data ?? []

  return (
    <div className="grid gap-4">
      <PageHeader title={t('weights.title')} back="/" />
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" onClick={() => setLogOpen(true)}>
          <Plus className="size-5" aria-hidden /> {t('weight.log')}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => fileRef.current?.click()}>
          <FileUp className="size-5" aria-hidden /> {t('weights.import')}
        </Button>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {csvError ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{csvError}</p> : null}
      {pending ? (
        <Card tone="sky">
          <p className="mb-3">
            {t('weights.csv.found', {
              n: pending.length,
              from: pending.length ? date(pending[0].measured_at) : '',
              to: pending.length ? date(pending[pending.length - 1].measured_at) : '',
            })}
          </p>
          <div className="flex gap-2">
            <Button onClick={confirmImport} loading={importing}>
              {t('weights.csv.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <WeightChart weights={weights} target={profile?.target_weight_kg} />
      </Card>
      <Card title={t('weights.all')}>
        {weights.length === 0 ? (
          <Empty icon="⚖️" title={t('weight.empty')} />
        ) : (
          <ul className="grid gap-1">
            {[...weights].reverse().slice(0, 200).map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-1">
                <span className="flex-1">
                  <span className="font-semibold">{kg(Number(w.weight_kg))} kg</span>
                  <span className="ml-2 text-sm text-ink-2">{date(w.measured_at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </span>
                <span className="text-xs text-ink-3">{t(`source.${w.source}`)}</span>
                {w.id ? (
                  <button onClick={() => remove(w.id!)} className="grid size-10 place-items-center text-ink-3" aria-label={t('common.delete')}>
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm text-ink-3">{t('weights.eufyHint')}</p>
      <LogWeightSheet open={logOpen} onClose={() => setLogOpen(false)} onSaved={reload} />
    </div>
  )
}
