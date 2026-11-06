import { Camera, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { readLabel } from '../lib/data'
import { useI18n } from '../lib/i18n'
import { compressPhoto } from '../lib/image'
import { lookupBarcode, productAt, productItem, type Product, type ProductItem } from '../lib/products'
import { FOOD_FORMATS, validGtin } from '../lib/scan'
import { Scanner } from './Scanner'
import { Button, Field, NumberInput, Sheet } from './ui'

/** How much of a product: one serving (or 100 g) to start, a few quick amounts, its values for the amount. */
export function ProductSheet({ product, onClose, onAdd, addLabel }: { product: Product | null; onClose: () => void; onAdd: (p: Product, grams: number) => void; addLabel?: string }) {
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
            {addLabel ?? t('manual.add')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}

/**
 * Adding a packaged food by its barcode: the camera (or the numbers typed), then the product from Open Food Facts; an
 * unknown one is read from a photo of its nutrition label. Then how much, and `onAdd`. `onCustom`, when given, offers
 * typing the values in for a product neither knows.
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
      setNotFound(null)
      setProduct({
        code: notFound,
        name: r.name || t('scan.unnamed'),
        brand: r.brand || null,
        image: null,
        per100: { kcal: Math.round(r.kcal), protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, fiber_g: r.fiber_g, sugar_g: r.sugar_g, ...(r.salt_g != null ? { salt_g: r.salt_g } : {}), ...(r.satfat_g != null ? { satfat_g: r.satfat_g } : {}) },
        servingG: r.serving_g > 0 ? r.serving_g : null,
        ultraProcessed: false,
        source: 'label',
      })
    } catch (e) {
      const code = (e as Error).message
      setLabelError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setLooking(false)
      if (labelInput.current) labelInput.current.value = ''
    }
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
      />
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
