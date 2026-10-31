import { Barcode, Camera, Check, Globe, PenLine, Plus, Search, Star, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { mealForNow, PlateResult } from '../../components/PlateResult'
import { Scanner } from '../../components/Scanner'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Segmented, Sheet } from '../../components/ui'
import { FOODS, foodAt, PROCESSED_FOODS, type Food } from '../../data/foods'
import { dbProduct, frequentFoods, plainItem, rememberItems, searchAll, searchOnline, useFoodDb, type LoggedItem, type Pick } from '../../lib/foodDb'
import { useApp } from '../../lib/auth'
import { scorePlate, sumItems } from '../../lib/calc'
import { addFood, readLabel } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { compressPhoto } from '../../lib/image'
import { lookupBarcode, productAt, rememberProduct, type Product } from '../../lib/products'
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
  const [items, setItems] = useState<(LoggedItem & { processed?: boolean })[]>(from?.items ?? [])
  const [scanning, setScanning] = useState(params.get('scan') === '1')
  const [looking, setLooking] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const labelInput = useRef<HTMLInputElement>(null)
  const db = useFoodDb()
  const [q, setQ] = useState('')
  const [online, setOnline] = useState<Product[] | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState(false)
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState<number | null>(null)
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)

  // The person's usual foods first, then the family's, then the app's own table; everyday names count too.
  const frequent = useMemo(() => frequentFoods(db, 8), [db])
  const results = useMemo((): Pick[] => (q.trim() ? searchAll(q, db) : FOODS.slice(0, 12).map((food) => ({ kind: 'builtin', food, uses: 0 }))), [q, db])

  async function findOnline() {
    setOnlineBusy(true)
    setOnlineError(false)
    try {
      setOnline(await searchOnline(q, locale))
    } catch {
      setOnlineError(true)
    } finally {
      setOnlineBusy(false)
    }
  }

  function pick(p: Pick) {
    if (p.kind === 'db') setProduct(dbProduct(p.food))
    else {
      setPicked(p.food)
      setGrams(p.food.portion)
    }
  }

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
        per100: { kcal: Math.round(r.kcal), protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, fiber_g: r.fiber_g, sugar_g: r.sugar_g, ...(r.salt_g != null ? { salt_g: r.salt_g } : {}), ...(r.satfat_g != null ? { satfat_g: r.satfat_g } : {}) },
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
    if (p.source === 'openfoodfacts' || p.source === 'label') rememberProduct(p)
    const origin = p.source === 'openfoodfacts' ? 'barcode' : p.source === 'family' ? undefined : p.source
    const barcode = /^\d{6,14}$/.test(p.code) ? p.code : undefined
    setItems((xs) => [...xs, { ...productAt(p, grams), processed: p.ultraProcessed, barcode, brand: p.brand, origin, dbId: p.dbId }])
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
        items: items.map(plainItem),
        ...totals,
        score_fat_loss: s.fatLoss,
        score_muscle_gain: s.muscleGain,
        photo_path: null,
        source: items.some((i) => i.barcode) ? 'barcode' : 'manual',
        ai_notes: null,
      })
      rememberItems(items, 'manual')
      navigate('/food', { state: { logged: true } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('manual.title')} back="/food">
        {/* At the top as soon as the plate has a food (scanned, searched or typed), not below the search. */}
        {items.length ? (
          <Button variant="leaf" block onClick={save} loading={busy}>
            <Check className="size-5" aria-hidden /> {t('snap.save')}
          </Button>
        ) : null}
      </PageHeader>
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
        {!q.trim() && frequent.length ? (
          <>
            <p className="mb-1 text-sm font-semibold text-ink-2">{t('manual.yourFoods')}</p>
            <ul className="mb-3 grid gap-1">
              {frequent.map((p) => (
                <PickRow key={`${p.kind}:${p.food.id}`} pick={p} onPick={pick} />
              ))}
            </ul>
          </>
        ) : null}
        <div className="relative mb-3">
          <Search className="absolute top-3.5 left-3 size-5 text-ink-3" aria-hidden />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOnline(null)
            }}
            placeholder={t('manual.search')}
            className="pl-10"
          />
        </div>
        <ul className="grid gap-1">
          {results.map((p) => (
            <PickRow key={`${p.kind}:${p.food.id}`} pick={p} onPick={pick} />
          ))}
        </ul>
        {/* Open Food Facts: millions of products, many Italian, found by name. */}
        {q.trim().length >= 3 ? (
          online ? (
            <>
              <p className="mt-3 mb-1 text-sm font-semibold text-ink-2">{online.length ? t('manual.online') : t('manual.onlineNone')}</p>
              <ul className="grid gap-1">
                {online.map((p) => (
                  <li key={p.code}>
                    <button onClick={() => setProduct(p)} className="flex w-full items-center gap-2 rounded-2xl p-2 text-left active:bg-card-2">
                      {p.image ? <img src={p.image} alt="" className="size-10 shrink-0 rounded-lg bg-white object-contain" /> : null}
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
          ) : (
            <Button variant="secondary" block className="mt-2" onClick={() => void findOnline()} loading={onlineBusy}>
              <Globe className="size-5" aria-hidden /> {t('manual.searchOnline')}
            </Button>
          )
        ) : null}
        {onlineError ? <p className="mt-2 rounded-2xl bg-sun-soft p-3 text-sm">{t('manual.onlineFailed')}</p> : null}
        <Button variant="ghost" block onClick={() => setCustom(true)}>
          {t('manual.custom')}
        </Button>
      </Card>

      {items.length ? (
        <Card>
          <PlateResult totals={totals} meal={meal} goal={profile.goal ?? 'maintain'} dailyKcal={energy.targets.kcal} ultraProcessed={processed} eatenAt={new Date()} />
        </Card>
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

/** One food in a list: the person's usual ones have a star, family ones their brand. */
function PickRow({ pick, onPick }: { pick: Pick; onPick: (p: Pick) => void }) {
  const { t, l } = useI18n()
  const name = pick.kind === 'builtin' ? l(pick.food.name) : pick.food.name
  const per100 = pick.kind === 'builtin' ? { kcal: pick.food.kcal, p: pick.food.protein } : { kcal: Math.round(Number(pick.food.kcal)), p: Number(pick.food.protein_g) }
  return (
    <li>
      <button onClick={() => onPick(pick)} className="flex w-full items-center gap-2 rounded-2xl p-2 text-left active:bg-card-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 font-semibold">
            {pick.uses ? <Star className="size-4 shrink-0 fill-sun text-sun" aria-label={t('food.usual')} /> : null}
            <span className="truncate">{name}</span>
          </span>
          <span className="block text-sm text-ink-2">
            {pick.kind === 'db' && pick.food.brand ? `${pick.food.brand} · ` : ''}
            {t('manual.per100', per100)}
            {pick.kind === 'db' ? ` · ${t('manual.family')}` : ''}
          </span>
        </span>
        <Plus className="size-5 text-brand" aria-hidden />
      </button>
    </li>
  )
}

/** A food that is in no list: its values for the amount eaten (it joins the family's foods once logged). */
function CustomItemSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (i: LoggedItem) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [grams, setGrams] = useState<number | null>(100)
  const [kcal, setKcal] = useState<number | null>(null)
  const [p, setP] = useState<number | null>(null)
  const [c, setC] = useState<number | null>(null)
  const [f, setF] = useState<number | null>(null)
  const [salt, setSalt] = useState<number | null>(null)
  const [satfat, setSatfat] = useState<number | null>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('manual.custom')}>
      <div className="grid gap-3">
        <Field label={t('picker.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('manual.customGrams')} hint={t('manual.customHint')}>
          <NumberInput decimals={false} value={grams} onChange={setGrams} />
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
          <Field label={`${t('macro.satfat')} (g)`} hint={t('manual.optional')}>
            <NumberInput value={satfat} onChange={setSatfat} />
          </Field>
          <Field label={`${t('macro.salt')} (g)`} hint={t('manual.optional')}>
            <NumberInput value={salt} onChange={setSalt} />
          </Field>
        </div>
        <Button
          size="lg"
          block
          disabled={!name.trim() || !kcal}
          onClick={() =>
            onAdd({ name: name.trim(), grams: grams ?? 0, kcal: kcal ?? 0, protein_g: p ?? 0, carbs_g: c ?? 0, fat_g: f ?? 0, fiber_g: 0, sugar_g: 0, ...(salt != null ? { salt_g: salt } : {}), ...(satfat != null ? { satfat_g: satfat } : {}), origin: 'manual' })
          }
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
              <p className="text-ink-3">{product.source === 'label' ? t('scan.fromLabel') : product.source === 'family' ? t('manual.fromFamily') : t('scan.fromOff')}</p>
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
