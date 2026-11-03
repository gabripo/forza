import { Camera, ChefHat, ImagePlus, Mic, Sparkles, Square, ThumbsUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mealForNow } from '../../components/PlateResult'
import { Button, Card, Field, Loading, PageHeader, Segmented } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { localDay } from '../../lib/calc'
import { pickFromMenu, type MenuDish, type MenuPick as Pick } from '../../lib/data'
import { logsOfDay, totalsOf } from '../../lib/dayCheck'
import { useI18n } from '../../lib/i18n'
import { compressPhoto } from '../../lib/image'
import type { Meal } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'
import { mergeSpeech } from '../../lib/voice'

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition

/**
 * "What should I order?" A photo of the restaurant's menu, or the dishes written or said: a quick AI reads the menu,
 * a stronger one picks the dish that fits today best (what was already eaten, the targets) and says why, simply.
 */
export function MenuPick() {
  const { t, num, locale } = useI18n()
  const { profile } = useApp()
  const navigate = useNavigate()
  const { energy, food } = useEnergy()
  const [meal, setMeal] = useState<Meal>(mealForNow())
  const [photo, setPhoto] = useState<{ url: string; base64: string } | null>(null)
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Pick | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const rec = useRef<Recognition | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setResult(null)
    setError(null)
    setText('')
    // A menu is small print: a larger photo than for a plate.
    const c = await compressPhoto(file, 1600)
    setPhoto({ url: c.url, base64: c.base64 })
  }

  function listen() {
    if (!SpeechRecognition) return
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new SpeechRecognition()
    r.lang = locale === 'it' ? 'it-IT' : 'en-GB'
    r.interimResults = true
    r.continuous = !/android/i.test(navigator.userAgent)
    const before = text.trim()
    r.onresult = (e) => {
      let said = ''
      for (const res of Array.from(e.results)) said = mergeSpeech(said, res[0].transcript)
      setText([before, said].filter(Boolean).join(', '))
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setPhoto(null)
    setResult(null)
    setListening(true)
    r.start()
  }

  async function choose() {
    if (!profile || !energy || (!photo && !text.trim())) return
    setBusy(true)
    setError(null)
    try {
      const today = logsOfDay(food, localDay(new Date()))
      const day = totalsOf(today)
      const tg = energy.targets
      setResult(
        await pickFromMenu({
          ...(photo ? { image: photo.base64 } : { text: text.trim() }),
          locale,
          goal: profile.goal ?? 'maintain',
          meal: t(`meal.${meal}`).toLowerCase(),
          hour: new Date().getHours(),
          eaten: today.map((f) => `${t(`meal.${f.meal}`)}: ${f.title}`),
          day: { ...day, satfat_g: day.satfat_g ?? 0, salt_g: day.salt_g ?? 0 },
          targets: { kcal: tg.kcal, protein_g: tg.protein_g, carbs_g: tg.carbs_g, fat_g: tg.fat_g, fiber_g: tg.fiber_g, satfat_g: tg.satfat_g },
        }),
      )
    } catch (e) {
      const code = (e as Error).message
      setError(t(code === 'not_a_menu' ? 'menu.notMenu' : code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setBusy(false)
    }
  }

  function logIt(d: MenuDish) {
    navigate('/food/add', {
      state: { meal, items: [{ name: d.name, grams: Math.round(d.portion_g), kcal: Math.round(d.kcal), protein_g: d.protein_g, carbs_g: d.carbs_g, fat_g: d.fat_g, fiber_g: d.fiber_g, sugar_g: d.sugar_g, satfat_g: d.satfat_g, origin: 'ai' }] },
    })
  }

  if (!profile || !energy) return <Loading />
  const chosen = result ? result.dishes[result.choice] : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t('menu.title')} subtitle={t('menu.subtitle')} back="/food" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />

      <Segmented<Meal> value={meal} onChange={setMeal} options={(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((m) => ({ value: m, label: t(`meal.${m}`) }))} />

      {photo ? <img src={photo.url} alt={t('menu.photo')} className="max-h-64 w-full rounded-3xl object-cover" /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant={photo ? 'secondary' : 'primary'} onClick={() => cameraRef.current?.click()}>
          <Camera className="size-5" aria-hidden /> {t('menu.takePhoto')}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => galleryRef.current?.click()}>
          <ImagePlus className="size-5" aria-hidden /> {t('snap.gallery')}
        </Button>
      </div>

      <Field label={t('menu.orWrite')} hint={SpeechRecognition ? t('menu.writeHint') : t('menu.keyboardHint')}>
        <div className="flex gap-2">
          <textarea
            value={text}
            rows={3}
            onChange={(e) => {
              setText(e.target.value)
              setPhoto(null)
              setResult(null)
            }}
            placeholder={t('menu.placeholder')}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-sky"
          />
          {SpeechRecognition ? (
            <button
              onClick={listen}
              className={`grid size-14 shrink-0 place-items-center self-start rounded-full text-white dark:text-black ${listening ? 'animate-pulse bg-danger' : 'bg-brand'}`}
              aria-label={listening ? t('voice.stop') : t('voice.speak')}
            >
              {listening ? <Square className="size-6" aria-hidden /> : <Mic className="size-7" aria-hidden />}
            </button>
          ) : null}
        </div>
      </Field>

      {!result ? (
        <Button size="lg" block onClick={() => void choose()} loading={busy} disabled={!photo && !text.trim()}>
          <Sparkles className="size-5" aria-hidden /> {busy ? t('menu.thinking') : t('menu.choose')}
        </Button>
      ) : null}
      {error ? <p className="rounded-2xl bg-danger-soft p-3">{error}</p> : null}

      {result && chosen ? (
        <>
          {/* The choice first, with why, in everyday words; numbers after. */}
          <section className="rounded-3xl bg-leaf-soft p-4">
            <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-leaf uppercase">
              <ChefHat className="size-5" aria-hidden /> {t('menu.best')}
            </p>
            <p className="mt-1 text-2xl leading-tight font-extrabold">{chosen.name}</p>
            {chosen.description ? <p className="text-ink-2">{chosen.description}</p> : null}
            <p className="mt-3 text-lg leading-snug">{result.why}</p>
            {result.tweak ? <p className="mt-2 rounded-2xl bg-card p-3">💡 {result.tweak}</p> : null}
            <p className="mt-3 text-sm text-ink-2">
              ≈ {num(chosen.kcal)} kcal · {t('macro.protein')} {num(chosen.protein_g)} g · {t('macro.fat')} {num(chosen.fat_g)} g
            </p>
            <Button className="mt-3" variant="leaf" onClick={() => logIt(chosen)}>
              {t('menu.logIt')}
            </Button>
          </section>

          {result.also.length ? (
            <Card title={t('menu.also')}>
              <ul className="grid gap-3">
                {result.also.map((a) => (
                  <li key={a.dish}>
                    <p className="font-bold">
                      <ThumbsUp className="mr-1 inline size-4 text-leaf" aria-hidden /> {result.dishes[a.dish].name}
                    </p>
                    <p className="text-sm text-ink-2">{a.why}</p>
                    <button className="mt-1 text-sm font-semibold text-brand-ink" onClick={() => logIt(result.dishes[a.dish])}>
                      {t('menu.logThis')}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result.rather_not.length ? (
            <Card title={t('menu.ratherNot')}>
              <ul className="grid gap-3">
                {result.rather_not.map((a) => (
                  <li key={a.dish}>
                    <p className="font-bold">{result.dishes[a.dish].name}</p>
                    <p className="text-sm text-ink-2">{a.why}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <details className="rounded-3xl border border-line bg-card p-4">
            <summary className="cursor-pointer font-bold">{t('menu.allDishes', { n: result.dishes.length })}</summary>
            <ul className="mt-2 grid gap-1 text-sm">
              {result.dishes.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="text-ink-2 tabular">
                    ≈ {num(d.kcal)} kcal · P {num(d.protein_g)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">{t('menu.estimates')}</p>
          </details>

          <Button variant="secondary" onClick={() => setResult(null)}>
            {t('menu.again')}
          </Button>
        </>
      ) : null}
    </div>
  )
}
