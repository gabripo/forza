import { Barcode, Globe, Plus, Search, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LogForPicker, useLogFor } from '../../components/LogFor'
import { LogWhenPicker } from '../../components/LogWhen'
import { useLogWhen } from '../../lib/logDay'
import { MealSoFar } from '../../components/PlateAdvice'
import { ProcessedSwapHint } from '../../components/Processed'
import { PlateResult } from '../../components/PlateResult'
import { MealCheckWarning, SaveMealButton } from '../../components/SaveMeal'
import { FoodValuesSheet } from '../../components/FoodValues'
import { BarcodeAdd, ProductSheet } from '../../components/ProductAdd'
import { useMealCheck } from '../../lib/mealCheck'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Sheet } from '../../components/ui'
import { FOODS, foodAt, PROCESSED_FOODS, type Food } from '../../data/foods'
import { dbProduct, familyFavourites, frequentFoods, plainItem, rememberItems, searchAll, searchOnline, useFoodDb, type LoggedItem, type Pick } from '../../lib/foodDb'
import { useApp } from '../../lib/auth'
import { localDay, scaleItem, scorePlate, sumItems } from '../../lib/calc'
import { addFood, changeFamilyMeal, changeFood, getFamilyMeal, getFoodLog } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { productItem, type Product } from '../../lib/products'
import { daysBefore } from '../../lib/logDay'
import { foodsOfLog } from '../../lib/recipeFromLogs'
import type { FoodItem, FoodLog } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'

/**
 * A food on the plate. `base`: the food as first added, so a new amount scales it without rounding drift; `kept`:
 * already in the meal being changed (it counts as used once, when the meal was logged).
 */
type PlateItem = LoggedItem & { processed?: boolean; base?: FoodItem; kept?: boolean }

/** A meal's foods, already counted as used (one logged with its totals only: its amount is then its calories). */
const foodsOf = (log: FoodLog): PlateItem[] => foodsOfLog(log).map((it) => ({ ...it, kept: true }))

/** How many days back a meal is, for the food page to open on its day. */
const offsetOf = (log: FoodLog) => daysBefore(localDay(new Date(log.eaten_at)))

/**
 * Add a meal by hand, or (at food/edit/:id) change one logged before: its foods, their amounts, the part of the day.
 * The totals and the score follow; the time it was eaten stays.
 */
export function FoodManual() {
  const { t, l, locale, num, date } = useI18n()
  const { profile, session } = useApp()
  const { energy, food } = useEnergy()
  const navigate = useNavigate()
  const logFor = useLogFor()
  const [params] = useSearchParams()
  // Coming from a photo ("adjust by hand"): start from what the AI saw. From the family page: back there.
  const from = useLocation().state as { items?: FoodItem[]; back?: string } | null
  const backTo = from?.back === '/family' ? '/family' : '/food'
  // The day and meal it goes to: today, or the day the Food page showed; the meal of the moment, or the one passed.
  const when = useLogWhen()
  const { meal, setMeal } = when
  const [items, setItems] = useState<PlateItem[]>(from?.items ?? [])
  // A meal logged before, being changed: found among the last weeks' meals, or read on its own.
  const editId = useParams().id
  const [editing, setEditing] = useState<(FoodLog & { person?: string }) | null | undefined>(editId ? undefined : null)
  useEffect(() => {
    if (!editId || editing !== undefined) return
    const found = food.find((f) => f.id === editId)
    const start = (log: (FoodLog & { person?: string }) | null) => {
      setEditing(log)
      if (!log) return
      setItems(foodsOf(log))
      setMeal(log.meal)
    }
    if (found) start(found)
    // Someone else's meal (for the family coach): read through the family's own function.
    else if (energy) void getFoodLog(editId).then((log) => log ?? getFamilyMeal(editId)).then(start, () => start(null))
  }, [editId, editing, food, energy, setMeal])
  const [scanning, setScanning] = useState(params.get('scan') === '1')
  const [looking, setLooking] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
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
  const favourites = useMemo(() => familyFavourites(db, 6), [db])
  const results = useMemo((): Pick[] => (q.trim() ? searchAll(q, db) : FOODS.slice(0, 12).map((food) => ({ kind: 'builtin', food, uses: 0 }))), [q, db])
  const check = useMealCheck(items)

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

  /** A new amount for one food: grams when it has them, otherwise its calories; the rest follows. */
  function setAmount(i: number, v: number | null) {
    if (!v) return
    setItems((xs) =>
      xs.map((it, j) => {
        const base = it.base ?? it
        const from = base.grams > 0 ? base.grams : base.kcal
        return j === i && from > 0 ? { ...it, ...scaleItem(base, v / from), base } : it
      }),
    )
  }

  if (!profile || !energy || editing === undefined) return <Loading />
  if (editId && !editing) {
    return (
      <div className="grid gap-4">
        <PageHeader title={t('manual.editTitle')} back={backTo} />
        <Card>
          <p>{t('manual.editMissing')}</p>
        </Card>
      </div>
    )
  }
  const totals = sumItems(items)
  // A meal of someone else in the family, changed by the family coach: their app works out its score.
  const forOther = Boolean(editing?.user_id && session && editing.user_id !== session.user.id)
  const processed = items.some((i) => i.processed || (i.foodId && PROCESSED_FOODS.has(i.foodId)))

  /** A product chosen in the search (the family's, or found online), for an amount. */
  function addProduct(p: Product, grams: number) {
    setItems((xs) => [...xs, productItem(p, grams)])
    setProduct(null)
    // Back to the plate: the search is done.
    setQ('')
    setOnline(null)
  }

  function addPicked() {
    if (!picked || !grams) return
    setItems((xs) => [...xs, { name: l(picked.name), grams, foodId: picked.id, ...foodAt(picked, grams) }])
    setPicked(null)
    setQ('')
  }

  /** The meal changed: same time and photo, new foods and amounts; a name made of its foods follows them. */
  async function saveChanges(log: FoodLog) {
    if (!energy) return
    setBusy(true)
    try {
      const before = foodsOf(log)
      const named = log.title.trim() && log.title !== before.map((i) => i.name).join(', ').slice(0, 120)
      const title = named ? log.title : items.map((i) => i.name).join(', ').slice(0, 120)
      if (forOther) {
        await changeFamilyMeal(log.id, { items: items.map(plainItem), ...totals, meal, title })
      } else {
        const s = scorePlate(totals, meal, energy.targets.kcal, processed, new Date(log.eaten_at))
        await changeFood(log.id, { items: items.map(plainItem), ...totals, meal, title, score_fat_loss: s.fatLoss, score_muscle_gain: s.muscleGain })
      }
      // Foods added now count as used (by whoever ate them); those already in the meal were counted when it was logged.
      rememberItems(
        items.filter((i) => !i.kept),
        'manual',
        forOther ? log.user_id : undefined,
      )
      navigate(backTo, { state: { offset: offsetOf(log), changed: true } })
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!energy) return
    if (editing) return saveChanges(editing)
    setBusy(true)
    try {
      const at = when.at()
      const s = scorePlate(totals, meal, energy.targets.kcal, processed, at)
      const title = items.map((i) => i.name).join(', ').slice(0, 120)
      const loggedId = await addFood({
        eaten_at: at.toISOString(),
        meal,
        title,
        items: items.map(plainItem),
        ...totals,
        score_fat_loss: s.fatLoss,
        score_muscle_gain: s.muscleGain,
        photo_path: null,
        source: items.some((i) => i.barcode) ? 'barcode' : 'manual',
        ai_notes: null,
        ...logFor.fields(),
      })
      rememberItems(items, 'manual', logFor.person?.id)
      navigate('/food', { state: { ...logFor.saved(loggedId, title, totals.kcal), offset: when.offset() } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t(editing ? 'manual.editTitle' : 'manual.title')} back={backTo} backState={editing ? { offset: offsetOf(editing) } : undefined}>
        {/* At the top as soon as the plate has a food (scanned, searched or typed), not below the search. */}
        {items.length ? <SaveMealButton check={check} onSave={save} loading={busy} /> : null}
      </PageHeader>
      {/* A meal that looks like a mistake: the amounts to check, right under the button. */}
      <MealCheckWarning check={check} />
      {editing ? (
        <p className="text-ink-2">
          {t(forOther ? 'manual.editHintFor' : 'manual.editHint', { name: editing.person ?? '', when: date(editing.eaten_at, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}
        </p>
      ) : (
        <LogForPicker logFor={logFor} />
      )}
      {/* The day and the meal first: where the food goes is chosen before the food. */}
      <LogWhenPicker when={when} dayFixed={Boolean(editing)} />
      {/* The search first: the quickest way to a food. While typing, the results come right under it. */}
      <div className="relative">
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
      {q.trim() && (results.length || q.trim().length >= 3) ? (
        <Card>
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
        </Card>
      ) : null}
      <Card title={t('manual.yourPlate')}>
        {items.length === 0 ? <p className="text-ink-2">{t('manual.emptyPlate')}</p> : null}
        <ul className="grid gap-2">
          {/* Each amount can be changed here: grams (or the calories of a food logged without them). */}
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="leading-tight font-semibold">{it.name}</p>
                <p className="text-sm text-ink-2">
                  {num(it.kcal)} kcal · P {num(it.protein_g)} g
                </p>
              </div>
              <div className="w-20">
                <NumberInput decimals={false} value={it.grams > 0 ? it.grams : it.kcal} onChange={(v) => setAmount(i, v)} aria-label={t('manual.amountOf', { name: it.name })} />
              </div>
              <span className="w-8 text-sm text-ink-2">{it.grams > 0 ? 'g' : 'kcal'}</span>
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
        {/* What the rest of the family logs most: the family's database, shared by everyone. */}
        {!q.trim() && favourites.length ? (
          <>
            <p className="mb-1 text-sm font-semibold text-ink-2">{t('manual.familyFavourites')}</p>
            <ul className="mb-3 grid gap-1">
              {favourites.map((p) => (
                <PickRow key={`fav:${p.kind}:${p.food.id}`} pick={p} onPick={pick} />
              ))}
            </ul>
          </>
        ) : null}
        <Button variant="ghost" block onClick={() => setCustom(true)}>
          {t('manual.custom')}
        </Button>
      </Card>

      {/* What the meal already had that day; a meal being changed is not counted twice. */}
      {/* Someone else's meal: their day and targets are not this phone's, so no "so far" and no score here. */}
      {items.length && !forOther ? (
        <MealSoFar totals={totals} meal={meal} context={{ food: editing ? food.filter((f) => f.id !== editing.id) : food, targets: energy.targets, at: editing ? new Date(editing.eaten_at) : when.at() }} salt={Boolean(profile.track_salt)} />
      ) : null}
      {/* A processed food on the plate: what to have instead next time. */}
      <ProcessedSwapHint items={items} />
      {items.length && !forOther ? (
        <Card>
          <PlateResult totals={totals} meal={meal} goal={profile.goal ?? 'maintain'} dailyKcal={energy.targets.kcal} ultraProcessed={processed} eatenAt={editing ? new Date(editing.eaten_at) : when.at()} />
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
      <ProductSheet product={product} onClose={() => setProduct(null)} onAdd={addProduct} />
      {/* A barcode: the product, or its label read from a photo, or the values typed in. */}
      <BarcodeAdd open={scanning} onOpenChange={setScanning} onBusy={setLooking} onAdd={(it) => setItems((xs) => [...xs, it])} onCustom={() => setCustom(true)} />
      {/* A food that is in no list: its values for the amount eaten (it joins the family's foods once logged). */}
      <FoodValuesSheet
        open={custom}
        title={t('manual.custom')}
        saveLabel={t('manual.add')}
        onClose={() => setCustom(false)}
        onSave={(it) => {
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
            {pick.kind === 'db' ? ` · ${t(pick.food.source === 'recipe' ? 'manual.recipe' : 'manual.family')}` : ''}
          </span>
        </span>
        <Plus className="size-5 text-brand" aria-hidden />
      </button>
    </li>
  )
}

