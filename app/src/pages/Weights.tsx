import { FileUp, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { LogWeightSheet } from '../components/LogWeightSheet'
import { Button, Card, Empty, Loading, PageHeader, Segmented } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { useApp } from '../lib/auth'
import { memberFor, parseWeightCsv, type ParsedWeight } from '../lib/csv'
import { deleteWeight, getWeights, importWeights, useAsync } from '../lib/data'
import { useI18n } from '../lib/i18n'

export function Weights() {
  const { t, kg, date } = useI18n()
  const { profile } = useApp()
  const { data, loading, reload } = useAsync(() => getWeights(3650), [])
  const [logOpen, setLogOpen] = useState(false)
  const [parsed, setParsed] = useState<{ rows: ParsedWeight[]; members: string[] } | null>(null)
  // EufyLife exports the whole family: only this person's weigh-ins are imported.
  const [member, setMember] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setCsvError(null)
    const { rows, members, error } = parseWeightCsv(await file.text())
    if (error) setCsvError(t(`weights.csv.${error}`))
    else {
      setParsed({ rows, members })
      setMember(memberFor(profile?.display_name, members) ?? members[0] ?? null)
    }
  }

  async function confirmImport() {
    if (!fresh.length) return
    setImporting(true)
    try {
      await importWeights(fresh.map(({ member: _m, ...r }) => r), 'eufy_csv')
      setParsed(null)
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
  // A weigh-in already here (synced from the scale's app, typed in, or imported before) is not added again.
  const mine = parsed ? parsed.rows.filter((r) => !parsed.members.length || r.member === member) : []
  const known = weights.map((w) => new Date(w.measured_at).getTime())
  const fresh = mine.filter((r) => !known.some((k) => Math.abs(k - new Date(r.measured_at).getTime()) < 120_000))
  const pending = parsed ? mine : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t('weights.title')} back="/" />
      <p className="rounded-2xl bg-sky-soft p-3 text-sm">⏰ {t('weight.conditions')}</p>
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
          {parsed && parsed.members.length > 1 ? (
            <div className="mb-3">
              <p className="mb-2 font-semibold">{t('weights.csv.whose')}</p>
              <Segmented<string> value={member ?? ''} onChange={setMember} options={parsed.members.map((m) => ({ value: m, label: m }))} />
            </div>
          ) : null}
          <p className="mb-3">
            {t('weights.csv.found', {
              n: pending.length,
              from: pending.length ? date(pending[0].measured_at) : '',
              to: pending.length ? date(pending[pending.length - 1].measured_at) : '',
            })}
            {pending.length > fresh.length ? ` ${t('weights.csv.known', { n: pending.length - fresh.length })}` : ''}
          </p>
          <div className="flex gap-2">
            <Button onClick={confirmImport} loading={importing} disabled={!fresh.length}>
              {t('weights.csv.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setParsed(null)}>
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
