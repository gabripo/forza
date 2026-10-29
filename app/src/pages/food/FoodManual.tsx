import { Barcode, Camera, PenLine, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { mealForNow, PlateResult } from '../../components/PlateResult'
import { Scanner } from '../../components/Scanner'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Segmented, Sheet } from '../../components/ui'
import { FOODS, foodAt, PROCESSED_FOODS, type Food } from '../../data/foods'
import { useApp } from '../../lib/auth'
import { scorePlate, sumItems } from '../../lib/calc'
import { addFood, readLabel } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { compressPhoto } from '../../lib/image'
import { lookupBarcode, productAt, recentProducts, rememberProduct, type Product } from '../../lib/products'
import { FOOD_FORMATS, validGtin } from '../../lib/scan'
import type { FoodItem, Meal } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'


export function FoodManual() {
  const { t, l, locale } = useI18n()
  const { profile } = useApp()
  const { energy } = useEnergy()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Coming from a photo ("adjust by hand"): start from what the AI saw.
  const from = useLocation().state as { items?: FoodItem[]; meal?: Meal } | null
  const [meal, setMeal] = useState<Meal>(from?.meal ?? mealForNow())
  const [items, setItems] = useState<(FoodItem & { foodId?: string; processed?: boolean; barcode?: string })[]>(from?.items ?? [])
  const [scanning, setScanning] = useState(params.get('scan') === '1')
  const [looking, setLooking] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const labelInput = useRef<HTMLInputElement>(null)
  const recent = useMemo(() => recentProducts(), [])
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
  const processed = items.some((i) => i.processed || (i.foodId && PROCESSED_FOODS.has(i.foodId)))

  async function onCode(raw: string) {
    setScanning(false)
    const code = raw.replace(/\D/g, '')
    if (!validGtin(code)) {
      setNotFound(code || raw)
      return
    }
    setLooking(true)
    try {
      const p = await lookupBarcode(code, locale)
      if (p) setProduct(p)
      else setNotFound(code)
    } catch {
      setNotFound(code)
    } finally {
      setLooking(false)
    }
  }

  /** Product unknown: read the nutrition label from a photo instead. */
  async function onLabel(file: File | undefined) {
    if (!file || !notFound) return
    setLabelError(null)
    setLooking(true)
    try {
      const photo = await compressPhoto(file, 1600)
      const r = await readLabel({ image: photo.base64, locale })
      if (!r.is_label || !r.kcal) {
        setLabelError(t('scan.noLabel'))
        return
      }
      const p: Product = {
        code: notFound,
        name: r.name || t('scan.unnamed'),
        brand: r.brand || null,
        image: null,
        per100: { kcal: Math.round(r.kcal), protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, fiber_g: r.fiber_g, sugar_g: r.sugar_g },
        servingG: r.serving_g > 0 ? r.serving_g : null,
        ultraProcessed: false,
        source: 'label',
      }
      setNotFound(null)
      setProduct(p)
    } catch (e) {
      const code = (e as Error).message
      setLabelError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setLooking(false)
    }
  }

  function addProduct(p: Product, grams: number) {
    rememberProduct(p)
    setItems((xs) => [...xs, { ...productAt(p, grams), processed: p.ultraProcessed, barcode: p.code }])
    setProduct(null)
  }

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
        items: items.map(({ foodId: _drop, processed: _p, barcode: _b, ...rest }) => rest),
        ...totals,
        score_fat_loss: s.fatLoss,
        score_muscle_gain: s.muscleGain,
        photo_path: null,
        source: items.some((i) => i.barcode) ? 'barcode' : 'manual',
        ai_notes: null,
      })
      navigate('/food', { state: { logged: true } })
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
        <Button block variant="secondary" className="mb-3" onClick={() => setScanning(true)} loading={looking}>
          <Barcode className="size-5" aria-hidden /> {t('scan.button')}
        </Button>
        {!q.trim() && recent.length ? (
          <>
            <p className="mb-1 text-sm font-semibold text-ink-2">{t('scan.recent')}</p>
            <ul className="mb-3 grid gap-1">
              {recent.slice(0, 5).map((p) => (
                <li key={p.code}>
                  <button onClick={() => setProduct(p)} className="flex w-full items-center gap-2 rounded-2xl p-2 text-left active:bg-card-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block text-sm text-ink-2">
                        {p.brand ? `${p.brand} · ` : ''}
                        {t('manual.per100', { kcal: p.per100.kcal, p: p.per100.protein_g })}
                      </span>
                    </span>
                    <Plus className="size-5 text-brand" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
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
      {scanning ? (
        <Scanner formats={FOOD_FORMATS} title={t('scan.title')} hint={t('scan.hint')} allowTyping onResult={onCode} onClose={() => setScanning(false)} />
      ) : null}
      <ProductSheet product={product} onClose={() => setProduct(null)} onAdd={addProduct} />
      <Sheet open={notFound !== null} onClose={() => setNotFound(null)} title={t('scan.notFoundTitle')}>
        <div className="grid gap-3">
          <p className="text-ink-2">{t('scan.notFound', { code: notFound ?? '' })}</p>
          <input ref={labelInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onLabel(e.target.files?.[0])} />
          <Button size="lg" block onClick={() => labelInput.current?.click()} loading={looking}>
            <Camera className="size-5" aria-hidden /> {t('scan.photoLabel')}
          </Button>
          {labelError ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{labelError}</p> : null}
          <Button
            variant="secondary"
            block
            onClick={() => {
              setNotFound(null)
              setCustom(true)
            }}
          >
            <PenLine className="size-5" aria-hidden /> {t('manual.custom')}
          </Button>
          <Button variant="ghost" block onClick={() => { setNotFound(null); setScanning(true) }}>
            {t('scan.again')}
          </Button>
        </div>
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

function ProductSheet({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd: (p: Product, grams: number) => void }) {
  const { t } = useI18n()
  const [grams, setGrams] = useState<number | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  // Start from one serving (or 100 g) each time a new product opens.
  if (product && shown !== product.code) {
    setShown(product.code)
    setGrams(product.servingG ?? 100)
  }
  const presets = product
    ? [
        ...(product.servingG ? [{ label: t('scan.serving', { g: product.servingG }), g: product.servingG }] : []),
        ...(product.servingG ? [{ label: '×2', g: product.servingG * 2 }] : []),
        { label: '50 g', g: 50 },
        { label: '100 g', g: 100 },
      ]
    : []
  const n = product && grams ? productAt(product, grams) : null
  return (
    <Sheet open={Boolean(product)} onClose={onClose} title={product?.name ?? ''}>
      {product ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-3">
            {product.image ? <img src={product.image} alt="" className="size-16 rounded-2xl bg-white object-contain" /> : null}
            <div className="min-w-0 text-sm text-ink-2">
              {product.brand ? <p className="font-semibold text-ink">{product.brand}</p> : null}
              <p>{t('manual.per100', { kcal: product.per100.kcal, p: product.per100.protein_g })}</p>
              <p className="text-ink-3">{product.source === 'label' ? t('scan.fromLabel') : t('scan.fromOff')}</p>
            </div>
          </div>
          <Field label={t('manual.howMuch')}>
            <NumberInput decimals={false} value={grams} onChange={setGrams} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {presets.map((x) => (
              <Button key={x.label} variant="secondary" size="sm" onClick={() => setGrams(Math.round(x.g))}>
                {x.label}
              </Button>
            ))}
          </div>
          {n ? (
            <p className="text-ink-2">
              {n.kcal} kcal · {t('macro.protein')} {n.protein_g} g · {t('macro.carbs')} {n.carbs_g} g · {t('macro.fat')} {n.fat_g} g
            </p>
          ) : null}
          {product.ultraProcessed ? <p className="rounded-2xl bg-card-2 p-3 text-sm">{t('scan.ultraProcessed')}</p> : null}
          <Button size="lg" block disabled={!grams} onClick={() => grams && onAdd(product, grams)}>
            {t('manual.add')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}
