import { Camera, ChevronLeft, Globe, PenLine, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { readLabel } from '../lib/data'
import { dbProduct, familyProduct, fixProduct, searchAll, searchOnline, useFoodDb, type Pick } from '../lib/foodDb'
import { valuesOf, type Values } from '../lib/foodValues'
import { useI18n } from '../lib/i18n'
import { compressPhoto } from '../lib/image'
import { lookupBarcode, productAt, productItem, rememberProduct, type Product, type ProductItem } from '../lib/products'
import { FOOD_FORMATS, validGtin } from '../lib/scan'
import { NutrientFields } from './FoodValues'
import { Scanner } from './Scanner'
import { Button, Field, Input, NumberInput, Sheet } from './ui'

type Label = Awaited<ReturnType<typeof readLabel>>

/** A nutrition label read from a photo, as a product with this code. */
const labelProduct = (r: Label, code: string, unnamed: string): Product => ({
  code,
  name: r.name || unnamed,
  brand: r.brand || null,
  image: null,
  per100: { kcal: Math.round(r.kcal), protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, fiber_g: r.fiber_g, sugar_g: r.sugar_g, ...(r.salt_g != null ? { salt_g: r.salt_g } : {}), ...(r.satfat_g != null ? { satfat_g: r.satfat_g } : {}) },
  servingG: r.serving_g > 0 ? r.serving_g : null,
  ultraProcessed: false,
  source: 'label',
})

/** Where a product's values come from, in a few words. */
const SOURCE_KEY: Record<Product['source'], string> = { label: 'scan.fromLabel', family: 'manual.fromFamily', manual: 'scan.fromYou', openfoodfacts: 'scan.fromOff', web: 'scan.fromOff' }

/**
 * How much of a product: one serving (or 100 g) to start, a few quick amounts, its values for the amount. After a scan,
 * `onWrong` offers "Non è questo?" at the bottom, to put a wrong product right.
 */
export function ProductSheet({ product, onClose, onAdd, addLabel, onWrong }: { product: Product | null; onClose: () => void; onAdd: (p: Product, grams: number) => void; addLabel?: string; onWrong?: () => void }) {
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
              <p className="text-ink-3">{t(SOURCE_KEY[product.source])}</p>
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
            {addLabel ?? t('manual.add')}
          </Button>
          {onWrong ? (
            <Button variant="ghost" block onClick={onWrong}>
              {t('fix.ask')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}

/**
 * Adding a packaged food by its barcode: the camera (or the numbers typed), then the family's product with that
 * barcode, or else the one in Open Food Facts; an unknown one is read from a photo of its nutrition label. Then how
 * much, and `onAdd`. A wrong product ("Non è questo?") is put right there, for the family's next scans too.
 * `onCustom`, when given, offers typing the values in for a product neither knows.
 */
export function BarcodeAdd({
  open,
  onOpenChange,
  onAdd,
  onCustom,
  onBusy,
  addLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: ProductItem) => void
  onCustom?: () => void
  onBusy?: (busy: boolean) => void
  addLabel?: string
}) {
  const { t, locale } = useI18n()
  const [product, setProduct] = useState<Product | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  // The product being put right ("Non è questo?").
  const [fixing, setFixing] = useState<Product | null>(null)
  const labelInput = useRef<HTMLInputElement>(null)
  useEffect(() => onBusy?.(looking), [looking, onBusy])

  async function onCode(raw: string) {
    onOpenChange(false)
    const code = raw.replace(/\D/g, '')
    if (!validGtin(code)) {
      setNotFound(code || raw)
      return
    }
    setLooking(true)
    try {
      // The family's own first: a product someone put right counts over Open Food Facts.
      const family = await familyProduct(code).catch(() => null)
      const p = family ? { ...dbProduct(family), code } : await lookupBarcode(code, locale)
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
      setNotFound(null)
      setProduct(labelProduct(r, notFound, t('scan.unnamed')))
    } catch (e) {
      const code = (e as Error).message
      setLabelError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setLooking(false)
      if (labelInput.current) labelInput.current.value = ''
    }
  }

  /**
   * The product put right: kept for its barcode (the family's database, and this phone for when offline), or used
   * this time only, as a food of its own without the barcode. Then how much of it.
   */
  async function fixed(p: Product, remember: boolean, source: 'label' | 'manual') {
    if (remember) {
      const id = await fixProduct(p, p.code, source)
      const kept: Product = { ...p, source: 'family', dbId: id }
      rememberProduct(kept)
      setProduct(kept)
    } else setProduct({ ...p, code: `once-${p.code}` })
    setFixing(null)
  }

  return (
    <>
      {open ? <Scanner formats={FOOD_FORMATS} title={t('scan.title')} hint={t('scan.hint')} allowTyping onResult={(v) => void onCode(v)} onClose={() => onOpenChange(false)} /> : null}
      <ProductSheet
        product={product}
        onClose={() => setProduct(null)}
        addLabel={addLabel}
        onAdd={(p, grams) => {
          onAdd(productItem(p, grams))
          setProduct(null)
        }}
        onWrong={
          product && /^\d{6,14}$/.test(product.code)
            ? () => {
                setFixing(product)
                setProduct(null)
              }
            : undefined
        }
      />
      <Sheet open={Boolean(fixing)} onClose={() => setFixing(null)} title={t('fix.ask')}>
        {fixing ? <FixProduct key={fixing.code} product={fixing} onFixed={fixed} /> : null}
      </Sheet>
      <Sheet open={notFound !== null} onClose={() => setNotFound(null)} title={t('scan.notFoundTitle')}>
        <div className="grid gap-3">
          <p className="text-ink-2">{t('scan.notFound', { code: notFound ?? '' })}</p>
          <input ref={labelInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onLabel(e.target.files?.[0])} />
          <Button size="lg" block onClick={() => labelInput.current?.click()} loading={looking}>
            <Camera className="size-5" aria-hidden /> {t('scan.photoLabel')}
          </Button>
          {labelError ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{labelError}</p> : null}
          {onCustom ? (
            <Button
              variant="secondary"
              block
              onClick={() => {
                setNotFound(null)
                onCustom()
              }}
            >
              <PenLine className="size-5" aria-hidden /> {t('manual.custom')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            block
            onClick={() => {
              setNotFound(null)
              onOpenChange(true)
            }}
          >
            {t('scan.again')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}

type Draft = { name: string; brand: string; serving: number | null; values: Values; source: 'label' | 'manual' }

const draftOf = (p: Product, source: 'label' | 'manual'): Draft => ({ name: p.name, brand: p.brand ?? '', serving: p.servingG, values: valuesOf(p.per100), source })

/**
 * "Non è questo?": the product scanned is not the one in hand, or its values are wrong. Read its nutrition label from
 * a photo, find the right product (the family's, the app's, Open Food Facts'), or correct the values by hand; then
 * keep it for this barcode, for the whole family's next scans, or use it this time only.
 */
function FixProduct({ product, onFixed }: { product: Product; onFixed: (p: Product, remember: boolean, source: 'label' | 'manual') => Promise<void> }) {
  const { t, l, locale, num } = useI18n()
  const db = useFoodDb()
  const [step, setStep] = useState<'choose' | 'search' | 'form'>('choose')
  const [draft, setDraft] = useState<Draft>(() => draftOf(product, 'manual'))
  const [q, setQ] = useState('')
  const [online, setOnline] = useState<Product[] | null>(null)
  const [busy, setBusy] = useState<'label' | 'online' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)
  const labelInput = useRef<HTMLInputElement>(null)
  const found = useMemo((): Pick[] => (q.trim() ? searchAll(q, db, 12) : []), [q, db])

  async function readIt(file: File | undefined) {
    if (!file) return
    setBusy('label')
    setError(null)
    try {
      const photo = await compressPhoto(file, 1600)
      const r = await readLabel({ image: photo.base64, locale })
      if (!r.is_label || !r.kcal) return setError(t('scan.noLabel'))
      // The label's values; the name stays the product's unless the label says one.
      setDraft({ ...draftOf(labelProduct(r, product.code, product.name), 'label'), name: r.name || product.name, brand: r.brand || product.brand || '' })
      setStep('form')
    } catch (e) {
      const code = (e as Error).message
      setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setBusy(null)
      if (labelInput.current) labelInput.current.value = ''
    }
  }

  async function findOnline() {
    setBusy('online')
    setError(null)
    try {
      setOnline(await searchOnline(q, locale))
    } catch {
      setError(t('manual.onlineFailed'))
    } finally {
      setBusy(null)
    }
  }

  /** Another product chosen: its name and values, to check before keeping them. */
  function choose(p: Product) {
    setDraft(draftOf(p, 'manual'))
    setStep('form')
  }

  async function save() {
    setBusy('save')
    setError(null)
    try {
      const v = draft.values
      await onFixed(
        {
          code: product.code,
          name: draft.name.trim(),
          brand: draft.brand.trim() || null,
          image: null,
          per100: { kcal: v.kcal ?? 0, protein_g: v.protein_g ?? 0, carbs_g: v.carbs_g ?? 0, fat_g: v.fat_g ?? 0, fiber_g: v.fiber_g ?? 0, sugar_g: v.sugar_g ?? 0, ...(v.salt_g != null ? { salt_g: v.salt_g } : {}), ...(v.satfat_g != null ? { satfat_g: v.satfat_g } : {}) },
          servingG: draft.serving && draft.serving > 0 ? draft.serving : null,
          ultraProcessed: false,
          source: draft.source === 'label' ? 'label' : 'manual',
        },
        remember,
        draft.source,
      )
    } catch {
      setError(t('fix.saveFailed'))
    } finally {
      setBusy(null)
    }
  }

  const back = (
    <button onClick={() => setStep('choose')} className="-ml-1 inline-flex items-center gap-1 justify-self-start text-sm font-semibold text-brand-ink">
      <ChevronLeft className="size-4" aria-hidden /> {t('fix.back')}
    </button>
  )

  if (step === 'search') {
    return (
      <div className="grid gap-3">
        {back}
        <div className="relative">
          <Search className="absolute top-3.5 left-3 size-5 text-ink-3" aria-hidden />
          <Input
            value={q}
            autoFocus
            onChange={(e) => {
              setQ(e.target.value)
              setOnline(null)
            }}
            placeholder={t('manual.search')}
            className="pl-10"
          />
        </div>
        <ul className="grid gap-1">
          {found.map((p) => {
            const name = p.kind === 'builtin' ? l(p.food.name) : p.food.name
            const kcal = p.kind === 'builtin' ? p.food.kcal : Math.round(Number(p.food.kcal))
            const pick = (): Product =>
              p.kind === 'db'
                ? dbProduct(p.food)
                : { code: p.food.id, name, brand: null, image: null, per100: { kcal: p.food.kcal, protein_g: p.food.protein, carbs_g: p.food.carbs, fat_g: p.food.fat, fiber_g: p.food.fiber, sugar_g: p.food.sugar, salt_g: p.food.salt, satfat_g: p.food.satfat }, servingG: p.food.portion, ultraProcessed: false, source: 'manual' }
            return (
              <li key={`${p.kind}:${p.food.id}`}>
                <button onClick={() => choose(pick())} className="w-full rounded-2xl p-2 text-left active:bg-card-2">
                  <span className="block font-semibold">{name}</span>
                  <span className="block text-sm text-ink-2">
                    {p.kind === 'db' && p.food.brand ? `${p.food.brand} · ` : ''}
                    {t('manual.per100', { kcal: num(kcal), p: num(p.kind === 'builtin' ? p.food.protein : Number(p.food.protein_g)) })}
                  </span>
                </button>
              </li>
            )
          })}
          {(online ?? []).map((p) => (
            <li key={`off:${p.code}`}>
              <button onClick={() => choose(p)} className="flex w-full items-center gap-2 rounded-2xl p-2 text-left active:bg-card-2">
                {p.image ? <img src={p.image} alt="" className="size-10 shrink-0 rounded-lg bg-white object-contain" /> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-sm text-ink-2">
                    {p.brand ? `${p.brand} · ` : ''}
                    {t('manual.per100', { kcal: p.per100.kcal, p: p.per100.protein_g })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {q.trim().length >= 3 && !online ? (
          <Button variant="secondary" block onClick={() => void findOnline()} loading={busy === 'online'}>
            <Globe className="size-5" aria-hidden /> {t('manual.searchOnline')}
          </Button>
        ) : null}
        {online && !online.length ? <p className="text-sm text-ink-2">{t('manual.onlineNone')}</p> : null}
        {error ? <p className="rounded-2xl bg-sun-soft p-3 text-sm">{error}</p> : null}
      </div>
    )
  }

  if (step === 'form') {
    return (
      <div className="grid gap-3">
        {back}
        <Field label={t('picker.name')}>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label={t('fix.brand')}>
            <Input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} maxLength={60} />
          </Field>
          <Field label={t('fix.serving')}>
            <NumberInput decimals={false} value={draft.serving} onChange={(v) => setDraft({ ...draft, serving: v })} />
          </Field>
        </div>
        <p className="font-semibold">{t('fix.per100')}</p>
        <NutrientFields values={draft.values} onChange={(values) => setDraft({ ...draft, values })} />
        <label className="flex items-start gap-2 rounded-2xl bg-card-2 p-3 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 size-5" />
          <span>
            <b>{t('fix.remember')}</b>
            <span className="block text-ink-2">{t(remember ? 'fix.rememberHint' : 'fix.onceHint', { code: product.code })}</span>
          </span>
        </label>
        {error ? <p className="rounded-2xl bg-danger-soft p-3 text-sm">{error}</p> : null}
        <Button size="lg" block onClick={() => void save()} loading={busy === 'save'} disabled={!draft.name.trim() || draft.values.kcal == null}>
          {t('fix.use')}
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <p className="rounded-2xl bg-card-2 p-3 text-sm">
        {t('fix.current', { code: product.code, name: product.brand && !product.name.includes(product.brand) ? `${product.name} (${product.brand})` : product.name, kcal: num(product.per100.kcal) })}
      </p>
      <p className="text-ink-2">{t('fix.how')}</p>
      <input ref={labelInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void readIt(e.target.files?.[0])} />
      <Button size="lg" block onClick={() => labelInput.current?.click()} loading={busy === 'label'}>
        <Camera className="size-5" aria-hidden /> {t('fix.label')}
      </Button>
      <Button variant="secondary" block onClick={() => setStep('search')}>
        <Search className="size-5" aria-hidden /> {t('fix.search')}
      </Button>
      <Button variant="secondary" block onClick={() => setStep('form')}>
        <PenLine className="size-5" aria-hidden /> {t('fix.byHand')}
      </Button>
      {error ? <p className="rounded-2xl bg-sun-soft p-3 text-sm">{error}</p> : null}
    </div>
  )
}
