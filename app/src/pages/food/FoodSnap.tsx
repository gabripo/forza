import { Camera, ImagePlus, Sparkles, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mealForNow, PlateResult } from '../../components/PlateResult'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Segmented } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { round1, scorePlate, sumItems } from '../../lib/calc'
import { addFood, estimatePlate, uploadFoodPhoto, type AiPlate } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { FoodItem, Meal } from '../../lib/types'
import { compressPhoto as compress } from '../../lib/image'
import { useEnergy } from '../../lib/useEnergy'

export function FoodSnap() {
  const { t, locale } = useI18n()
  const { profile, session } = useApp()
  const { energy } = useEnergy()
  const navigate = useNavigate()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<{ blob: Blob; base64: string; url: string } | null>(null)
  const [meal, setMeal] = useState<Meal>(mealForNow())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AiPlate | null>(null)
  const [items, setItems] = useState<FoodItem[]>([])
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setResult(null)
    setPhoto(await compress(file))
  }

  async function estimate() {
    if (!photo || !profile) return
    setBusy(true)
    setError(null)
    try {
      const r = await estimatePlate({ image: photo.base64, note, locale, goal: profile.goal ?? 'maintain', meal })
      if (!r.is_food || !r.items.length) {
        setError(t('snap.notFood'))
        return
      }
      setResult(r)
      setTitle(r.title)
      setItems(r.items.map((i) => ({ ...i, grams: Math.round(i.grams) })))
    } catch (e) {
      const code = (e as Error).message
      setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setBusy(false)
    }
  }

  /** Changing grams scales that item's nutrients proportionally. */
  function setGrams(i: number, grams: number | null) {
    setItems((xs) =>
      xs.map((x, j) => {
        if (j !== i || !grams || x.grams <= 0) return x
        const k = grams / x.grams
        return {
          ...x,
          grams,
          kcal: Math.round(x.kcal * k),
          protein_g: round1(x.protein_g * k),
          carbs_g: round1(x.carbs_g * k),
          fat_g: round1(x.fat_g * k),
          fiber_g: round1(x.fiber_g * k),
          sugar_g: round1(x.sugar_g * k),
        }
      }),
    )
  }

  async function save() {
    if (!result || !energy || !session) return
    setSaving(true)
    try {
      const totals = sumItems(items)
      const now = new Date()
      const s = scorePlate(totals, meal, energy.targets.kcal, result.ultra_processed, now)
      let photo_path: string | null = null
      try {
        if (photo) photo_path = await uploadFoodPhoto(session.user.id, photo.blob)
      } catch {
        photo_path = null // the log matters more than the picture
      }
      await addFood({
        eaten_at: now.toISOString(),
        meal,
        title: title.trim() || result.title,
        items,
        ...totals,
        score_fat_loss: s.fatLoss,
        score_muscle_gain: s.muscleGain,
        photo_path,
        source: 'ai',
        ai_notes: result.tip,
      })
      navigate('/food')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <Loading />

  return (
    <div className="grid gap-4">
      <PageHeader title={t('snap.title')} back="/food" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />

      {photo ? (
        <img src={photo.url} alt={t('snap.yourPhoto')} className="max-h-72 w-full rounded-3xl object-cover" />
      ) : (
        <Card tone="brand">
          <p className="mb-3 text-lg">{t('snap.intro')}</p>
          <ul className="mb-1 list-disc pl-5 text-sm text-ink-2">
            <li>{t('snap.tip1')}</li>
            <li>{t('snap.tip2')}</li>
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant={photo ? 'secondary' : 'primary'} onClick={() => cameraRef.current?.click()}>
          <Camera className="size-5" aria-hidden /> {photo ? t('snap.retake') : t('snap.take')}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => galleryRef.current?.click()}>
          <ImagePlus className="size-5" aria-hidden /> {t('snap.gallery')}
        </Button>
      </div>

      {photo && !result ? (
        <Card>
          <div className="grid gap-4">
            <Field label={t('snap.meal')}>
              <Segmented<Meal>
                value={meal}
                onChange={setMeal}
                options={(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((m) => ({ value: m, label: t(`meal.${m}`) }))}
              />
            </Field>
            <Field label={t('snap.note')} hint={t('snap.noteHint')}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('snap.notePlaceholder')} />
            </Field>
            {error ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p> : null}
            <Button size="lg" block onClick={estimate} loading={busy}>
              <Sparkles className="size-5" aria-hidden /> {busy ? t('snap.thinking') : t('snap.estimate')}
            </Button>
          </div>
        </Card>
      ) : null}

      {result && energy ? (
        <>
          <Card>
            <Field label={t('snap.dish')}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <p className="mt-4 mb-2 font-semibold">{t('snap.items')}</p>
            <ul className="grid gap-2">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{it.name}</p>
                    <p className="text-sm text-ink-2">
                      {it.kcal} kcal · P {it.protein_g} · C {it.carbs_g} · F {it.fat_g}
                    </p>
                  </div>
                  <div className="w-20">
                    <NumberInput decimals={false} value={it.grams} onChange={(v) => setGrams(i, v)} aria-label={t('snap.grams', { name: it.name })} />
                  </div>
                  <span className="text-sm text-ink-2">g</span>
                  <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="grid size-10 place-items-center text-ink-3" aria-label={t('common.delete')}>
                    <Trash2 className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-3">{t(`snap.confidence.${result.confidence}`)}</p>
          </Card>
          <Card>
            <PlateResult
              totals={sumItems(items)}
              meal={meal}
              goal={profile.goal ?? 'maintain'}
              dailyKcal={energy.targets.kcal}
              ultraProcessed={result.ultra_processed}
              eatenAt={new Date()}
            />
          </Card>
          {result.tip ? (
            <Card tone="sun">
              <p>
                <Sparkles className="mr-1 inline size-5 text-sun" aria-hidden /> {result.tip}
              </p>
            </Card>
          ) : null}
          <Button size="lg" variant="leaf" block onClick={save} loading={saving} disabled={!items.length}>
            {t('snap.save')}
          </Button>
        </>
      ) : null}
    </div>
  )
}
