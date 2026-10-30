import { Mic, Sparkles, Square, Trash2, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlateAdvice } from '../../components/PlateAdvice'
import { mealForNow } from '../../components/PlateResult'
import { Button, Card, Field, Loading, NumberInput, PageHeader, Segmented, cx } from '../../components/ui'
import { PROCESSED_FOODS } from '../../data/foods'
import { useApp } from '../../lib/auth'
import { round1, scorePlate, sumItems } from '../../lib/calc'
import { addFood, estimateText, tidyText, transcribeAudio } from '../../lib/data'
import { plainItem, rememberItems, useFoodDb, withUsual, type LoggedItem } from '../../lib/foodDb'
import { useI18n } from '../../lib/i18n'
import type { Meal } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'
import { mergeSpeech, parseMeal } from '../../lib/voice'

type Item = LoggedItem & { usual?: boolean }

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

/** The phone's own speech recognition (Chrome on Android, Safari on iPhone): nothing to install, no model to run. */
const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition

/** Without it (Firefox): the voice is recorded and the food AI writes it down. */
const CAN_RECORD = typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })

/**
 * Log a meal by saying it: "two eggs, a slice of wholegrain bread and a coffee". The words are matched
 * to the built-in food table on the phone; only foods it does not know go to the food AI. Advice comes
 * first, the numbers after, and the grams can be changed only on request.
 */
export function FoodVoice() {
  const { t, locale, num } = useI18n()
  const { profile } = useApp()
  const { energy } = useEnergy()
  const navigate = useNavigate()
  const [meal, setMeal] = useState<Meal>(mealForNow())
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Item[] | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const [aiTitle, setAiTitle] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adjust, setAdjust] = useState(false)
  const [saving, setSaving] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [tidying, setTidying] = useState(false)
  // The words before the AI tidied them, to go back with one tap.
  const [untidy, setUntidy] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  useFoodDb()

  useEffect(
    () => () => {
      rec.current?.stop()
      recorder.current?.stop()
    },
    [],
  )

  /** Records the voice and has the food AI write it down (browsers without speech recognition). */
  async function record() {
    if (listening) {
      recorder.current?.stop()
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicError(true)
      return
    }
    const r = new MediaRecorder(stream)
    const chunks: Blob[] = []
    r.ondataavailable = (e) => chunks.push(e.data)
    r.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop())
      setListening(false)
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/ogg' })
      if (!blob.size) return
      setTranscribing(true)
      try {
        const { text: said } = await transcribeAudio({ audio: await toBase64(blob), mime: blob.type, locale })
        if (said.trim()) setText((before) => [before.trim(), said.trim()].filter(Boolean).join(', '))
      } catch (e) {
        const code = (e as Error).message
        setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'voice.noTranscribe' : 'voice.transcribeFailed'))
      } finally {
        setTranscribing(false)
      }
    }
    recorder.current = r
    reset()
    setMicError(false)
    setListening(true)
    r.start()
  }

  function listen() {
    if (!SpeechRecognition) {
      if (CAN_RECORD) void record()
      else textRef.current?.focus()
      return
    }
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new SpeechRecognition()
    r.lang = locale === 'it' ? 'it-IT' : 'en-GB'
    r.interimResults = true
    // On Android, continuous listening repeats earlier words in every new piece: one sentence at a
    // time works better there (tap again to add more).
    r.continuous = !/android/i.test(navigator.userAgent)
    const before = text.trim()
    r.onresult = (e) => {
      let said = ''
      for (const result of Array.from(e.results)) said = mergeSpeech(said, result[0].transcript)
      setText([before, said].filter(Boolean).join(', '))
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicError(true)
    }
    r.onend = () => setListening(false)
    rec.current = r
    reset()
    setMicError(false)
    setListening(true)
    r.start()
  }

  function reset() {
    setItems(null)
    setTip(null)
    setAiTitle(null)
    setMissing([])
    setError(null)
    setAdjust(false)
  }

  /** The AI rewrites the dictated words as a clean list (one food and its amount per line), to check or edit. */
  async function tidy() {
    if (!text.trim()) return
    setTidying(true)
    setError(null)
    try {
      const { text: clean } = await tidyText({ text, locale })
      if (clean.trim() && clean.trim() !== text.trim()) {
        setUntidy(text)
        setText(clean.trim())
        reset()
      }
    } catch (e) {
      const code = (e as Error).message
      setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setTidying(false)
    }
  }

  /** Known foods are read on the phone; the AI is asked only about the rest, or about everything on request. */
  async function analyse(wholeByAi = false) {
    if (!profile || !text.trim()) return
    rec.current?.stop()
    const parsed = parseMeal(text, locale)
    // The person's own products stand for the foods they name: their mozzarella, their yogurt.
    const local = { ...parsed, items: parsed.items.map((it) => withUsual(it, it.said, it.amountSaid)) }
    setError(null)
    if (!wholeByAi && !local.unknown.length) {
      setItems(local.items)
      setMissing([])
      return
    }
    setBusy(true)
    try {
      const ai = await estimateText({ text: wholeByAi ? text : local.unknown.join(', '), locale, goal: profile.goal ?? 'maintain', meal })
      const found = (ai.is_food ? ai.items : []).map((i) => withUsual({ ...i, origin: 'ai' as const }, i.name))
      setItems(wholeByAi ? found : [...local.items, ...found])
      setTip(ai.tip || null)
      setAiTitle(wholeByAi ? ai.title : null)
      setMissing(found.length ? [] : local.unknown)
    } catch (e) {
      const code = (e as Error).message
      if (wholeByAi) setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
      // Without the AI the known foods still count; the rest can be added by hand.
      else {
        setItems(local.items)
        setMissing(local.unknown)
      }
    } finally {
      setBusy(false)
    }
  }

  /** Changing grams scales that item's nutrients proportionally. */
  function setGrams(i: number, grams: number | null) {
    setItems((xs) =>
      (xs ?? []).map((x, j) => {
        if (j !== i || !grams || x.grams <= 0) return x
        const k = grams / x.grams
        return { ...x, grams, kcal: Math.round(x.kcal * k), protein_g: round1(x.protein_g * k), carbs_g: round1(x.carbs_g * k), fat_g: round1(x.fat_g * k), fiber_g: round1(x.fiber_g * k), sugar_g: round1(x.sugar_g * k), ...(x.salt_g != null ? { salt_g: Math.round(x.salt_g * k * 100) / 100 } : {}), ...(x.satfat_g != null ? { satfat_g: round1(x.satfat_g * k) } : {}) }
      }),
    )
  }

  const processed = (items ?? []).some((i) => i.foodId && PROCESSED_FOODS.has(i.foodId))

  async function save() {
    if (!items?.length || !energy) return
    setSaving(true)
    try {
      const totals = sumItems(items)
      const now = new Date()
      const s = scorePlate(totals, meal, energy.targets.kcal, processed, now)
      const said = text.trim()
      await addFood({
        eaten_at: now.toISOString(),
        meal,
        title: (aiTitle || said.charAt(0).toUpperCase() + said.slice(1)).slice(0, 120),
        items: items.map(plainItem),
        ...totals,
        score_fat_loss: s.fatLoss,
        score_muscle_gain: s.muscleGain,
        photo_path: null,
        source: 'voice',
        ai_notes: tip,
      })
      rememberItems(items, 'ai')
      navigate('/food', { state: { logged: true } })
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <Loading />
  const totals = items ? sumItems(items) : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t('voice.title')} back="/food" />

      <Segmented<Meal>
        value={meal}
        onChange={setMeal}
        options={(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((m) => ({ value: m, label: t(`meal.${m}`) }))}
      />

      {SpeechRecognition || CAN_RECORD ? (
        <div className="grid justify-items-center gap-2 py-2">
          <button
            onClick={listen}
            disabled={transcribing}
            className={cx(
              'grid size-28 place-items-center rounded-full text-white shadow-lg transition dark:text-black',
              listening ? 'animate-pulse bg-danger' : 'bg-brand active:scale-95',
            )}
            aria-label={listening ? t('voice.stop') : t('voice.speak')}
          >
            {listening ? <Square className="size-10" aria-hidden /> : <Mic className="size-12" aria-hidden />}
          </button>
          <p className="text-center text-lg font-semibold">{transcribing ? t('voice.transcribing') : listening ? t(SpeechRecognition ? 'voice.listening' : 'voice.recording') : t('voice.speak')}</p>
          <p className="text-center text-sm text-ink-3">{t('voice.example')}</p>
          {micError ? <p className="rounded-2xl bg-danger-soft p-3 text-sm">{t('voice.micBlocked')}</p> : null}
        </div>
      ) : (
        // No speech recognition in this browser: the keyboard's microphone key does the same job.
        <Card tone="sky">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Mic className="size-6 text-sky" aria-hidden /> {t('voice.keyboard')}
          </p>
          <p className="mt-1 text-sm text-ink-2">{t('voice.example')}</p>
        </Card>
      )}

      <Field label={t('voice.what')} hint={items ? undefined : t('voice.editHint')}>
        <textarea
          ref={textRef}
          value={text}
          autoFocus={!SpeechRecognition && !CAN_RECORD}
          rows={3}
          onChange={(e) => {
            setUntidy(null)
            setText(e.target.value)
            reset()
          }}
          className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-lg outline-none focus:border-sky"
        />
      </Field>

      {/* The AI puts dictated words in order: one food and its amount per line, mistakes fixed. */}
      {text.trim() && !listening ? (
        <div className="-mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void tidy()} loading={tidying} disabled={transcribing}>
            <Wand2 className="size-4" aria-hidden /> {t('voice.tidy')}
          </Button>
          {untidy !== null ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText(untidy)
                setUntidy(null)
                reset()
              }}
            >
              <Undo2 className="size-4" aria-hidden /> {t('voice.untidy')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!items ? (
        <Button size="lg" block onClick={() => analyse()} loading={busy} disabled={!text.trim() || listening}>
          <Sparkles className="size-5" aria-hidden /> {busy ? t('snap.thinking') : t('voice.analyse')}
        </Button>
      ) : null}
      {error ? <p className="rounded-2xl bg-danger-soft p-3">{error}</p> : null}

      {items && totals && energy ? (
        items.length ? (
          <>
            {/* Advice first: what to do with this meal, before any number. */}
            <PlateAdvice
              totals={totals}
              meal={meal}
              dailyKcal={energy.targets.kcal}
              ultraProcessed={processed}
              tip={tip}
              voice
              onRetake={() => {
                setText('')
                reset()
                listen()
              }}
              onAdjust={() => setAdjust(true)}
            />
            <Card>
              <p className="text-2xl font-extrabold tabular">
                {num(totals.kcal)} kcal <span className="text-base font-semibold text-ink-2">· {t('macro.protein')} {num(totals.protein_g)} g</span>
              </p>
              <ul className="mt-3 grid gap-2">
                {items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{it.name}</p>
                      <p className="text-sm text-ink-2">
                        {adjust ? `${it.kcal} kcal · P ${it.protein_g} · C ${it.carbs_g} · F ${it.fat_g}` : `${num(it.grams)} g · ${it.kcal} kcal`}
                      </p>
                      {it.usual ? <p className="text-xs font-semibold text-leaf">★ {t('food.usual')}</p> : null}
                    </div>
                    {/* Quantities change only when asked for: one less thing to look at. */}
                    {adjust ? (
                      <>
                        <div className="w-20">
                          <NumberInput decimals={false} value={it.grams} onChange={(v) => setGrams(i, v)} aria-label={t('snap.grams', { name: it.name })} />
                        </div>
                        <span className="text-sm text-ink-2">g</span>
                        <button onClick={() => setItems((xs) => (xs ?? []).filter((_, j) => j !== i))} className="grid size-10 place-items-center text-ink-3" aria-label={t('common.delete')}>
                          <Trash2 className="size-5" />
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
              {missing.length ? <p className="mt-3 rounded-2xl bg-sun-soft p-3 text-sm">{t('voice.missing', { words: missing.join(', ') })}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {!adjust ? (
                  <Button variant="secondary" onClick={() => setAdjust(true)}>
                    {t('voice.adjust')}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => analyse(true)} loading={busy}>
                  <Sparkles className="size-4" aria-hidden /> {t('voice.askAi')}
                </Button>
              </div>
            </Card>
            <Button size="lg" variant="leaf" block onClick={save} loading={saving}>
              {t('snap.save')}
            </Button>
          </>
        ) : (
          <Card tone="sun">
            <p>{t('voice.nothing')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => analyse(true)} loading={busy}>
                <Sparkles className="size-4" aria-hidden /> {t('voice.askAi')}
              </Button>
              <Button variant="secondary" onClick={() => navigate('/food/add', { state: { meal } })}>
                {t('food.manual')}
              </Button>
            </div>
          </Card>
        )
      ) : null}
    </div>
  )
}
