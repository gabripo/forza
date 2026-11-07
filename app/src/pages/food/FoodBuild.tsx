import { Barcode, BookPlus, Camera, ChefHat, Mic, Plus, Sparkles, Square, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mealForNow } from '../../components/PlateResult'
import { BarcodeAdd } from '../../components/ProductAdd'
import { Button, Card, Input, Loading, PageHeader, Segmented, cx } from '../../components/ui'
import { FOODS, type Food } from '../../data/foods'
import { useApp } from '../../lib/auth'
import { localDay } from '../../lib/calc'
import { estimatePlate, recipesFromAi } from '../../lib/data'
import { logsOfDay } from '../../lib/dayCheck'
import { frequentFoods, searchAll, useFoodDb, type DbFood } from '../../lib/foodDb'
import { useI18n } from '../../lib/i18n'
import { compressPhoto } from '../../lib/image'
import type { ProductItem } from '../../lib/products'
import { appRecipe, fromAi, fromBuiltin, mealGoal, missing, type Ingredient, type RecipeIdea } from '../../lib/recipeIdea'
import { stepFromText } from '../../lib/recipeSteps'
import type { Meal } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'
import { mergeSpeech, parseMeal } from '../../lib/voice'

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

/** Told to the food AI with a photo of foods at home: they are ingredients, not a plate. */
const PHOTO_NOTE = 'These are ingredients I have at home, not a plate: list each food you can see, with a typical amount for one person.'

const byId = new Map(FOODS.map((f) => [f.id, f]))

const fromDb = (f: DbFood): Ingredient => ({
  key: `d:${f.id}`,
  name: f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.name} (${f.brand})` : f.name,
  per100: { kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g), fiber_g: Number(f.fiber_g), sugar_g: Number(f.sugar_g), ...(f.salt_g != null ? { salt_g: Number(f.salt_g) } : {}), ...(f.satfat_g != null ? { satfat_g: Number(f.satfat_g) } : {}) },
  portion: Number(f.portion_g) || 100,
  dbId: f.id,
  barcode: f.barcode ?? undefined,
  brand: f.brand,
  origin: f.source,
})

/** A product scanned (or put right), in the amount chosen: its values per 100 g, and that amount as its portion. */
const fromProduct = (it: ProductItem): Ingredient => {
  const k = it.grams > 0 ? 100 / it.grams : 0
  return {
    key: `p:${it.barcode ?? it.dbId ?? it.name}`,
    name: it.name,
    per100: k ? { kcal: it.kcal * k, protein_g: it.protein_g * k, carbs_g: it.carbs_g * k, fat_g: it.fat_g * k, fiber_g: it.fiber_g * k, sugar_g: it.sugar_g * k, ...(it.salt_g != null ? { salt_g: it.salt_g * k } : {}), ...(it.satfat_g != null ? { satfat_g: it.satfat_g * k } : {}) } : null,
    portion: it.grams || 100,
    barcode: it.barcode,
    brand: it.brand,
    dbId: it.dbId,
    origin: it.origin,
  }
}

/** Foods that make a dish (not ready-made dishes, drinks or treats), for the person's usual ones. */
const cooking = (f: Food) => !['dishes', 'drinks', 'treats'].includes(f.group)

/**
 * "No idea what to eat? Build your own recipe!": the foods someone has, typed, said, scanned or photographed, become
 * recipes for the next meal that fit what is left of the day (what was eaten, the targets), one tap away from being
 * logged. The food AI names the dishes and writes the steps; the amounts are always the app's.
 */
export function FoodBuild() {
  const { t, num, locale } = useI18n()
  const { profile } = useApp()
  const { energy, food } = useEnergy()
  const navigate = useNavigate()
  const db = useFoodDb()
  const [meal, setMeal] = useState<Meal>(mealForNow())
  const [ings, setIngs] = useState<Ingredient[]>([])
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [scanning, setScanning] = useState(false)
  // A barcode or a photo being read.
  const [looking, setLooking] = useState<'scan' | 'photo' | null>(null)
  const onScanBusy = useCallback((b: boolean) => setLooking((x) => (b ? 'scan' : x === 'scan' ? null : x)), [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ recipes: RecipeIdea[]; by: 'ai' | 'app'; note: string | null } | null>(null)
  const rec = useRef<Recognition | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const goal = useMemo(() => (energy ? mealGoal(food, energy.targets, meal) : null), [food, energy, meal])
  const usual = useMemo(
    () =>
      frequentFoods(db, 16)
        .flatMap((p) => (p.kind === 'builtin' ? (cooking(p.food) ? [fromBuiltin(p.food, locale)] : []) : p.food.source === 'recipe' ? [] : [fromDb(p.food)]))
        .filter((i) => !ings.some((x) => x.key === i.key))
        .slice(0, 8),
    [db, locale, ings],
  )

  if (!profile || !energy || !goal) return <Loading />
  // What the list lacks for a full meal; with recipes shown, judged on the one lowest in protein.
  const lacks = missing(ings, result ? ([...result.recipes].sort((a, b) => a.totals.protein_g - b.totals.protein_g)[0] ?? null) : null, goal)

  /** New foods on the list (the same food once); any recipes shown are for the old list, so they go. */
  function add(found: Ingredient[]) {
    setIngs((xs) => [...xs, ...found.filter((f, i) => !xs.some((x) => x.key === f.key) && found.findIndex((y) => y.key === f.key) === i)])
    setResult(null)
  }

  /** Words to foods: the app's table first, then the person's and the family's foods; the rest kept as said. */
  function addWords(words: string) {
    if (!words.trim()) return
    const parsed = parseMeal(words, locale)
    const found: Ingredient[] = parsed.items.flatMap((it) => {
      const f = byId.get(it.foodId)
      return f ? [fromBuiltin(f, locale)] : []
    })
    for (const word of parsed.unknown) {
      const pick = searchAll(word, db, 1)[0]
      if (pick) found.push(pick.kind === 'builtin' ? fromBuiltin(pick.food, locale) : fromDb(pick.food))
      else found.push({ key: `n:${word.toLowerCase()}`, name: word.charAt(0).toUpperCase() + word.slice(1), per100: null, portion: 100 })
    }
    add(found)
    setText('')
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
    let said = ''
    r.onresult = (e) => {
      said = ''
      for (const res of Array.from(e.results)) said = mergeSpeech(said, res[0].transcript)
      setText(said)
    }
    r.onend = () => {
      setListening(false)
      addWords(said)
    }
    r.onerror = () => setListening(false)
    rec.current = r
    setError(null)
    setListening(true)
    r.start()
  }

  /** A photo of the foods at home: the food AI says what it sees, with values for a typical amount. */
  async function onPhoto(file: File | undefined) {
    if (!file || !profile) return
    setLooking('photo')
    setError(null)
    try {
      const photo = await compressPhoto(file)
      const r = await estimatePlate({ image: photo.base64, note: PHOTO_NOTE, locale, goal: profile.goal ?? 'maintain', meal })
      const seen = (r.is_food ? r.items : []).filter((i) => i.name)
      if (!seen.length) return setError(t('build.notFood'))
      add(
        seen.map((i) => {
          const g = i.grams > 0 ? i.grams : 0
          const k = g ? 100 / g : 0
          return {
            key: `a:${i.name.toLowerCase()}`,
            name: i.name,
            per100: g ? { kcal: i.kcal * k, protein_g: i.protein_g * k, carbs_g: i.carbs_g * k, fat_g: i.fat_g * k, fiber_g: i.fiber_g * k, sugar_g: i.sugar_g * k } : null,
            portion: g || 100,
            origin: 'ai' as const,
          }
        }),
      )
    } catch (e) {
      const code = (e as Error).message
      setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setLooking(null)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  /** The AI's recipes, with the app's amounts; without the AI, the app's own simple dish. */
  async function suggest() {
    if (!profile || !energy || !goal || !ings.length) return
    setBusy(true)
    setError(null)
    try {
      const today = logsOfDay(food, localDay(new Date()))
      const ai = await recipesFromAi({
        foods: ings.map((i) => ({ name: i.name, per100: i.per100 })),
        locale,
        goal: profile.goal ?? 'maintain',
        meal: t(`meal.${meal}`).toLowerCase(),
        eaten: today.map((f) => `${t(`meal.${f.meal}`)}: ${f.title}`),
        target: { kcal: goal.kcal, protein_g: goal.protein_g, carbs_g: goal.carbs_g, fat_g: goal.fat_g, fiber_g: goal.fiber_g },
      })
      const recipes = (ai.recipes ?? []).map((r) => fromAi(r, ings, goal))
      if (!recipes.length) throw new Error('ai_failed')
      setResult({ recipes, by: 'ai', note: null })
    } catch (e) {
      const code = (e as Error).message
      const own = appRecipe(ings, goal, locale)
      setResult({ recipes: own ? [own] : [], by: 'app', note: code === 'daily_limit_reached' ? t('snap.limit') : null })
    } finally {
      setBusy(false)
    }
  }

  const unknown = ings.filter((i) => !i.per100)

  return (
    <div className="grid gap-4">
      <PageHeader title={t('build.title')} back="/food" />
      <p className="text-ink-2">{t('build.intro')}</p>
      <Segmented<Meal>
        value={meal}
        onChange={(m) => {
          setMeal(m)
          setResult(null)
        }}
        options={(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((m) => ({ value: m, label: t(`meal.${m}`) }))}
      />
      <Card tone="sky">
        <p className="text-lg font-bold">{t('build.goal', { meal: t(`meal.${meal}`), kcal: num(goal.kcal), p: num(goal.protein_g) })}</p>
        <p className="mt-1 text-sm text-ink-2">{t('build.goalHint')}</p>
      </Card>

      <Card title={t('build.ingredients')}>
        {ings.length ? (
          <ul className="mb-3 flex flex-wrap gap-2">
            {ings.map((i) => (
              <li key={i.key} className="flex items-center gap-1 rounded-full bg-card-2 py-1 pr-1 pl-3 text-sm font-semibold">
                <span>{i.name}</span>
                {i.per100 ? null : <span className="font-normal text-ink-3">· {t('build.unknown')}</span>}
                <button
                  onClick={() => {
                    setIngs((xs) => xs.filter((x) => x.key !== i.key))
                    setResult(null)
                  }}
                  className="grid size-8 place-items-center rounded-full text-ink-3 active:bg-card"
                  aria-label={t('build.remove', { name: i.name })}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-ink-2">{t('build.empty')}</p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addWords(text)
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('build.placeholder')} aria-label={t('build.placeholder')} />
          <Button type="submit" variant="secondary" disabled={!text.trim()}>
            {t('build.add')}
          </Button>
        </form>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SpeechRecognition ? (
            <Button variant="secondary" size="sm" className={cx(listening && 'animate-pulse')} onClick={listen}>
              {listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4 text-brand" aria-hidden />} {listening ? t('build.stop') : t('build.say')}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setScanning(true)} loading={looking === 'scan'} disabled={Boolean(looking)}>
            <Barcode className="size-4 text-brand" aria-hidden /> {t('build.scan')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => photoRef.current?.click()} loading={looking === 'photo'} disabled={Boolean(looking)}>
            <Camera className="size-4 text-brand" aria-hidden /> {t('build.photo')}
          </Button>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </div>
        {looking ? <p className="mt-2 text-sm text-ink-2">{t('build.looking')}</p> : null}
        {error ? <p className="mt-2 rounded-2xl bg-sun-soft p-3 text-sm">{error}</p> : null}
        {usual.length ? (
          <>
            <p className="mt-4 mb-1 text-sm font-semibold text-ink-2">{t('build.usual')}</p>
            <div className="flex flex-wrap gap-2">
              {usual.map((i) => (
                <button key={i.key} onClick={() => add([i])} className="flex items-center gap-1 rounded-full border-2 border-line px-3 py-1 text-sm font-semibold active:bg-card-2">
                  <Plus className="size-4 text-brand" aria-hidden /> {i.name}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </Card>

      {/* What a full meal still needs: protein, vegetables, or enough calories. */}
      {ings.length && lacks.length ? (
        <Card>
          {lacks.map((m) => (
            <div key={m.what} className="mb-3 last:mb-0">
              <p className="font-semibold">{t(`build.lacks.${m.what}`)}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {m.foods.map((f) => (
                  <button key={f.id} onClick={() => add([fromBuiltin(f, locale)])} className="flex items-center gap-1 rounded-full border-2 border-line px-3 py-1 text-sm font-semibold active:bg-card-2">
                    <Plus className="size-4 text-brand" aria-hidden /> {f.name[locale]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <Button size="lg" block onClick={() => void suggest()} loading={busy} disabled={!ings.length}>
        <Sparkles className="size-5" aria-hidden /> {busy ? t('build.thinking') : t(result ? 'build.again' : 'build.suggest')}
      </Button>

      {result ? (
        <>
          {result.by === 'app' ? (
            <p className="rounded-2xl bg-card-2 p-3 text-sm">
              {result.note ? `${result.note} ` : ''}
              {t('build.appOnly')}
              {unknown.length ? ` ${t('build.skipped', { names: unknown.map((i) => i.name).join(', ') })}` : ''}
            </p>
          ) : null}
          {result.recipes.map((r, i) => (
            <RecipeCard
              key={`${r.name}-${i}`}
              recipe={r}
              goalKcal={goal.kcal}
              meal={meal}
              onLog={() => navigate('/food/add', { state: { items: r.items, meal } })}
              onSave={() => navigate('/food/recipes/new', { state: { draft: { name: r.name, servings: 1, added: r.items, steps: r.steps.map(stepFromText) } } })}
            />
          ))}
          {!result.recipes.length ? <p className="rounded-2xl bg-sun-soft p-3">{t('build.none')}</p> : null}
        </>
      ) : null}

      {/* The same scan as "Add a meal": the family's product first, a label photo when unknown, "Non è questo?". */}
      <BarcodeAdd open={scanning} onOpenChange={setScanning} onBusy={onScanBusy} onAdd={(it) => add([fromProduct(it)])} addLabel={t('build.addScanned')} />
    </div>
  )
}

/** One recipe: what it is, why it fits, the foods in their amounts, the steps, and a tap to log it. */
function RecipeCard({ recipe: r, goalKcal, meal, onLog, onSave }: { recipe: RecipeIdea; goalKcal: number; meal: Meal; onLog: () => void; onSave: () => void }) {
  const { t, num } = useI18n()
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="text-4xl" aria-hidden>
          {r.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-snug font-bold">{r.name}</h2>
          <p className="text-sm text-ink-2">
            {[r.minutes ? t('build.minutes', { n: num(r.minutes) }) : null, r.by === 'app' ? t('build.byApp') : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {r.why ? <p className="mt-2">{r.why}</p> : null}
      <p className={cx('mt-3 rounded-2xl p-2 text-sm', r.fit === 'fits' ? 'bg-leaf-soft' : 'bg-sun-soft')}>
        <b>{t('build.totals', { kcal: num(r.totals.kcal), p: num(r.totals.protein_g), c: num(r.totals.carbs_g), f: num(r.totals.fat_g) })}</b>
        <span className="block">{t(`build.${r.fit}`, { kcal: num(goalKcal), meal: t(`meal.${meal}`).toLowerCase() })}</span>
        {r.proteinLow ? <span className="block">{t('build.proteinLow')}</span> : null}
      </p>
      <p className="mt-3 font-semibold">{t('build.foods')}</p>
      <ul className="mt-1 grid gap-1 text-sm">
        {r.items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="min-w-0 flex-1">
              {it.name}
              {it.pantry ? <span className="text-ink-3"> · {t('build.pantry')}</span> : null}
            </span>
            <span className="text-ink-2 tabular">{num(it.grams)} g</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-semibold">{t('build.steps')}</p>
      <ol className="mt-1 grid list-decimal gap-1 pl-5">
        {r.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <Button block className="mt-4" onClick={onLog}>
        <ChefHat className="size-5" aria-hidden /> {t('build.log')}
      </Button>
      {/* Liked it: kept with the family's recipes, its steps too, to cook and log again. */}
      <Button block variant="secondary" className="mt-2" onClick={onSave}>
        <BookPlus className="size-5" aria-hidden /> {t('build.saveRecipe')}
      </Button>
    </Card>
  )
}
