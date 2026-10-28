import { Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mealForNow, PlateResult } from '../../components/PlateResult'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Segmented, Sheet } from '../../components/ui'
import { FOODS, foodAt, type Food } from '../../data/foods'
import { useApp } from '../../lib/auth'
import { scorePlate, sumItems } from '../../lib/calc'
import { addFood } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { FoodItem, Meal } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'

const PROCESSED = new Set(['biscuits', 'croissant', 'soda', 'ice_cream'])

export function FoodManual() {
  const { t, l } = useI18n()
  const { profile } = useApp()
  const { energy } = useEnergy()
  const navigate = useNavigate()
  const [meal, setMeal] = useState<Meal>(mealForNow())
  const [items, setItems] = useState<(FoodItem & { foodId?: string })[]>([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState<number | null>(null)
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return FOODS.slice(0, 12)
    return FOODS.filter((f) => f.name.en.toLowerCase().includes(needle) || f.name.it.toLowerCase().includes(needle))
  }, [q])

  if (!profile || !energy) return <Loading />
  const totals = sumItems(items)
  const processed = items.some((i) => i.foodId && PROCESSED.has(i.foodId))

  function addPicked() {
    if (!picked || !grams) return
    setItems((xs) => [...xs, { name: l(picked.name), grams, foodId: picked.id, ...foodAt(picked, grams) }])
    setPicked(null)
    setQ('')
  }

  async function save() {
    if (!energy) return
    setBusy(true)
    try {
      const now = new Date()
      const s = scorePlate(totals, meal, energy.targets.kcal, processed, now)
      await addFood({
        eaten_at: now.toISOString(),
        meal,
        title: items.map((i) => i.name).join(', ').slice(0, 120),
        items: items.map(({ foodId: _drop, ...rest }) => rest),
        ...totals,
        score_fat_loss: s.fatLoss,
        score_muscle_gain: s.muscleGain,
        photo_path: null,
        source: 'manual',
        ai_notes: null,
      })
      navigate('/food')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('manual.title')} back="/food" />
      <Segmented<Meal>
        value={meal}
        onChange={setMeal}
        options={(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((m) => ({ value: m, label: t(`meal.${m}`) }))}
      />

      <Card title={t('manual.yourPlate')}>
        {items.length === 0 ? <p className="text-ink-2">{t('manual.emptyPlate')}</p> : null}
        <ul className="grid gap-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{it.name}</p>
                <p className="text-sm text-ink-2">
                  {it.grams} g · {it.kcal} kcal · P {it.protein_g} g
                </p>
              </div>
              <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="grid size-10 place-items-center text-ink-3" aria-label={t('common.delete')}>
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('manual.addFood')}>
        <div className="relative mb-3">
          <Search className="absolute top-3.5 left-3 size-5 text-ink-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('manual.search')} className="pl-10" />
        </div>
        <ul className="grid gap-1">
          {results.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => {
                  setPicked(f)
                  setGrams(f.portion)
                }}
                className="flex w-full items-center gap-2 rounded-2xl p-2 text-left active:bg-card-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l(f.name)}</span>
                  <span className="block text-sm text-ink-2">
                    {t('manual.per100', { kcal: f.kcal, p: f.protein })}
                  </span>
                </span>
                <Plus className="size-5 text-brand" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" block onClick={() => setCustom(true)}>
          {t('manual.custom')}
        </Button>
      </Card>

      {items.length ? (
        <>
          <Card>
            <PlateResult totals={totals} meal={meal} goal={profile.goal ?? 'maintain'} dailyKcal={energy.targets.kcal} ultraProcessed={processed} eatenAt={new Date()} />
          </Card>
          <Button size="lg" variant="leaf" block onClick={save} loading={busy}>
            {t('snap.save')}
          </Button>
        </>
      ) : null}

      <Sheet open={Boolean(picked)} onClose={() => setPicked(null)} title={picked ? l(picked.name) : ''}>
        {picked ? (
          <div className="grid gap-4">
            <Field label={t('manual.howMuch')} hint={picked.unit ? `${l(picked.unit)} ≈ ${picked.portion} g` : undefined}>
              <NumberInput decimals={false} value={grams} onChange={setGrams} autoFocus />
            </Field>
            <div className="grid grid-cols-4 gap-2">
              {[0.5, 1, 1.5, 2].map((k) => (
                <Button key={k} variant="secondary" size="sm" onClick={() => setGrams(Math.round(picked.portion * k))}>
                  {k === 1 ? (picked.unit ? l(picked.unit) : `${picked.portion} g`) : `×${k}`}
                </Button>
              ))}
            </div>
            {grams ? (
              <p className="text-ink-2">
                {(() => {
                  const n = foodAt(picked, grams)
                  return `${n.kcal} kcal · ${t('macro.protein')} ${n.protein_g} g · ${t('macro.carbs')} ${n.carbs_g} g · ${t('macro.fat')} ${n.fat_g} g`
                })()}
              </p>
            ) : null}
            <Button size="lg" block onClick={addPicked} disabled={!grams}>
              {t('manual.add')}
            </Button>
          </div>
        ) : null}
      </Sheet>
      <CustomItemSheet
        open={custom}
        onClose={() => setCustom(false)}
        onAdd={(it) => {
          setItems((xs) => [...xs, it])
          setCustom(false)
        }}
      />
    </div>
  )
}

function CustomItemSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (i: FoodItem) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState<number | null>(null)
  const [p, setP] = useState<number | null>(null)
  const [c, setC] = useState<number | null>(null)
  const [f, setF] = useState<number | null>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('manual.custom')}>
      <div className="grid gap-3">
        <Field label={t('picker.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="kcal">
            <NumberInput value={kcal} onChange={setKcal} />
          </Field>
          <Field label={`${t('macro.protein')} (g)`}>
            <NumberInput value={p} onChange={setP} />
          </Field>
          <Field label={`${t('macro.carbs')} (g)`}>
            <NumberInput value={c} onChange={setC} />
          </Field>
          <Field label={`${t('macro.fat')} (g)`}>
            <NumberInput value={f} onChange={setF} />
          </Field>
        </div>
        <Button
          size="lg"
          block
          disabled={!name.trim() || !kcal}
          onClick={() => onAdd({ name: name.trim(), grams: 0, kcal: kcal ?? 0, protein_g: p ?? 0, carbs_g: c ?? 0, fat_g: f ?? 0, fiber_g: 0, sugar_g: 0 })}
        >
          {t('manual.add')}
        </Button>
      </div>
    </Sheet>
  )
}
