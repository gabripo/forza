import { Barcode, BookOpen, Camera, Check, ChefHat, Copy, ExternalLink, Link2, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { mealForNow } from '../../components/PlateResult'
import { BarcodeAdd } from '../../components/ProductAdd'
import { Button, Card, Empty, Field, Input, Loading, NumberInput, PageHeader, Segmented, Sheet } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { sumItems } from '../../lib/calc'
import { deleteRecipe, estimatePlate, estimateText, getRecipes, importRecipe, saveRecipe, searchBimby, useAsync, type FoundRecipe } from '../../lib/data'
import { loadFoodDb, plainItem, rememberItems, withUsual, type LoggedItem } from '../../lib/foodDb'
import { useI18n } from '../../lib/i18n'
import { compressPhoto } from '../../lib/image'
import type { FoodItem, Recipe } from '../../lib/types'
import { parseMeal } from '../../lib/voice'

const round1 = (n: number) => Math.round(n * 10) / 10

/** Told to the food AI with a photo of a recipe's ingredients: the whole dish, and amounts as written when written. */
const PHOTO_NOTE =
  'These are the ingredients of a recipe, for the whole dish (not one plate). If the photo shows a written recipe or a list of ingredients, ' +
  'read each ingredient with its amount exactly as written, in grams. If it shows the foods themselves, list each one with its likely amount. ' +
  'Add nothing that is not written or shown.'

/** A food for another amount: every value follows the grams. */
function scaled(it: FoodItem, grams: number): FoodItem {
  const k = it.grams > 0 ? grams / it.grams : 0
  return {
    ...it,
    grams,
    kcal: Math.round(it.kcal * k),
    protein_g: round1(it.protein_g * k),
    carbs_g: round1(it.carbs_g * k),
    fat_g: round1(it.fat_g * k),
    fiber_g: round1(it.fiber_g * k),
    sugar_g: round1(it.sugar_g * k),
    ...(it.salt_g != null ? { salt_g: Math.round(it.salt_g * k * 100) / 100 } : {}),
    ...(it.satfat_g != null ? { satfat_g: round1(it.satfat_g * k) } : {}),
  }
}

/**
 * The grams written on the ingredient lines ("650 g acqua", "1 kg farina", "200 ml latte"): water, salt and
 * whatever has no calories count too, as they weigh in the dish.
 */
function statedWeight(text: string): number {
  let g = 0
  for (const line of text.split('\n')) {
    const m = line.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grammi|grammo|ml|l|litri|litro)\b/i)
    if (m) g += Number(m[1]) * (/^(kg|l|litri|litro)$/i.test(m[2]) ? 1000 : 1)
  }
  return Math.round(g)
}

/** The whole dish and one portion of it. */
function dish(items: FoodItem[], servings: number, totalG: number | null) {
  const t = sumItems(items)
  const weight = totalG || items.reduce((s, i) => s + i.grams, 0)
  const n = Math.max(1, servings)
  return { weight, kcal: t.kcal, portionG: Math.round(weight / n), portionKcal: Math.round(t.kcal / n), portionProtein: round1(t.protein_g / n), totals: t }
}

/** The ingredients as lines to change, one per food ("150 g Riso"), without thousands separators to misread. */
const ingredientText = (items: FoodItem[]) => items.map((i) => `${Math.round(i.grams)} g ${i.name}`).join('\n')

/**
 * A recipe of the family (one read from Cookidoo, most often) as the start of a new one: the same foods, amounts
 * and portions under a new name, to change as it was cooked this time. The original stays as it is.
 */
function variantDraft(r: Recipe, name: string): Draft {
  return { name, servings: r.servings, total_g: r.total_g, items: r.items, text: ingredientText(r.items), source: 'manual', source_url: r.source_url ?? undefined, variantOf: r.name }
}

/** The dish as one food of a meal, for an amount: a portion is the dish divided by its servings. */
function recipeItem(r: Recipe, grams: number): LoggedItem {
  const d = dish(r.items, r.servings, r.total_g)
  const k = d.weight > 0 ? grams / d.weight : 0
  const t = d.totals
  return {
    name: r.name,
    grams,
    kcal: Math.round(t.kcal * k),
    protein_g: round1(t.protein_g * k),
    carbs_g: round1(t.carbs_g * k),
    fat_g: round1(t.fat_g * k),
    fiber_g: round1(t.fiber_g * k),
    sugar_g: round1(t.sugar_g * k),
    ...(t.salt_g != null ? { salt_g: Math.round(t.salt_g * k * 100) / 100 } : {}),
    ...(t.satfat_g != null ? { satfat_g: round1(t.satfat_g * k) } : {}),
    dbId: r.food_id ?? undefined,
    origin: 'recipe',
  }
}

/**
 * The family's recipes: dishes written once (or read from a Cookidoo or Bimby page), then a portion is logged in
 * one tap by anyone in the family. Each recipe is also a food of the family database, found by the search.
 */
export function Recipes() {
  const { t, num, locale } = useI18n()
  const { session } = useApp()
  const navigate = useNavigate()
  const { data, loading } = useAsync(getRecipes, [])
  const location = useLocation()
  const back = location.state as { justImported?: string; variant?: boolean } | null
  const justImported = back?.justImported ?? null
  const [url, setUrl] = useState('')
  const [reading, setReading] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [logging, setLogging] = useState<Recipe | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<{ results: FoundRecipe[]; cookidooUrl: string; error?: string } | null>(null)

  /** Reads a recipe page (a link pasted, or a recipe found) and opens it in the editor. */
  async function read(link: string) {
    setReading(link)
    setImportError(null)
    try {
      const r = await importRecipe(link)
      navigate('/food/recipes/new', { state: { draft: { name: r.name, servings: r.servings, text: r.ingredients.join('\n'), source: 'link', source_url: link, nutrition: r.nutrition } } })
    } catch (e) {
      const code = (e as Error).message
      setImportError(t(code === 'no_recipe' ? 'recipes.noRecipe' : code === 'bad_url' ? 'recipes.badUrl' : 'recipes.importFailed'))
    } finally {
      setReading(null)
    }
  }

  async function search() {
    setSearching(true)
    setImportError(null)
    try {
      setFound(await searchBimby(query.trim(), locale))
    } catch {
      setFound({ results: [], cookidooUrl: '', error: 'search_failed' })
    } finally {
      setSearching(false)
    }
  }

  if (loading && !data) return <Loading />
  const recipes = data ?? []
  // Back from saving a recipe imported from a link, or a variant of one: log a portion straight away?
  const imported = justImported ? (recipes.find((r) => r.id === justImported) ?? null) : null

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t('recipes.title')}
        subtitle={t('recipes.subtitle')}
        back="/food"
        action={
          <Button size="sm" onClick={() => navigate('/food/recipes/new')}>
            <Plus className="size-4" aria-hidden /> {t('recipes.new')}
          </Button>
        }
      />

      {/* Thermomix (Bimby) recipes: found by name in the person's language, or pasted as a link. */}
      <section className="grid gap-3 rounded-3xl bg-leaf-soft p-4">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <ChefHat className="size-6 text-leaf" aria-hidden /> {t('recipes.bimbyTitle')}
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (query.trim().length >= 2) void search()
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-3.5 left-3 size-5 text-ink-3" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('recipes.bimbyPlaceholder')} className="pl-10" />
          </div>
          <Button type="submit" loading={searching} disabled={query.trim().length < 2}>
            {t('recipes.bimbySearch')}
          </Button>
        </form>
        {found ? (
          <>
            {found.results.length ? (
              <>
                <p className="text-sm text-ink-2">{t('recipes.bimbyFrom')}</p>
                <ul className="grid gap-2">
                  {found.results.map((r) => (
                    <li key={r.url}>
                      <button onClick={() => void read(r.url)} disabled={Boolean(reading)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-2 text-left shadow-sm active:bg-card-2 disabled:opacity-60">
                        {r.image ? <img src={r.image} alt="" className="size-14 shrink-0 rounded-xl object-cover" loading="lazy" /> : null}
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-tight">{r.title}</span>
                          {r.rating ? (
                            <span className="text-sm text-ink-2">
                              <Star className="mr-0.5 inline size-3.5 fill-sun text-sun" aria-hidden /> {num(r.rating, 1)}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-sm font-semibold text-brand-ink">{reading === r.url ? '…' : t('recipes.bimbyUse')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm">{t(found.error ? 'recipes.bimbyFailed' : locale === 'it' ? 'recipes.bimbyNone' : 'recipes.bimbyEnglish')}</p>
            )}
            {found.cookidooUrl ? (
              <a href={found.cookidooUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start rounded-2xl bg-card px-3 py-2 font-semibold text-brand-ink shadow-sm">
                <ExternalLink className="size-4" aria-hidden /> {t('recipes.cookidooSearch')}
              </a>
            ) : null}
          </>
        ) : null}
        <p className="text-sm text-ink-2">{t('recipes.importText')}</p>
        <div className="flex gap-2">
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cookidoo.it/recipes/recipe/it-IT/r…" />
          <Button variant="secondary" onClick={() => void read(url.trim())} loading={reading === url.trim()} disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())}>
            <Link2 className="size-5" aria-hidden /> {t('recipes.importButton')}
          </Button>
        </div>
        {importError ? <p className="rounded-2xl bg-sun-soft p-3 text-sm">{importError}</p> : null}
      </section>

      {recipes.length === 0 ? (
        <Card>
          <Empty icon="📖" title={t('recipes.empty')} text={t('recipes.emptyText')} />
        </Card>
      ) : (
        <Card>
          <ul className="grid gap-2">
            {recipes.map((r) => {
              const d = dish(r.items, r.servings, r.total_g)
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <button onClick={() => setLogging(r)} className="min-w-0 flex-1 rounded-xl p-1 text-left active:bg-card-2">
                    <p className="truncate font-semibold">
                      <BookOpen className="mr-1 inline size-4 text-brand" aria-hidden />
                      {r.name}
                    </p>
                    <p className="text-sm text-ink-2">{t('recipes.perPortion', { g: num(d.portionG), kcal: num(d.portionKcal), p: num(d.portionProtein) })}</p>
                    <p className="text-xs text-ink-3">{t('recipes.portions', { n: r.servings })}</p>
                  </button>
                  {r.created_by === session?.user.id ? (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/food/recipes/${r.id}`)}>
                      {t('recipes.change')}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <LogPortionSheet
        recipe={logging ?? imported}
        justSaved={!logging && imported ? (back?.variant ? 'variant' : 'imported') : undefined}
        onClose={() => {
          setLogging(null)
          // Asked once: not again when coming back to this page.
          if (justImported) navigate(location.pathname, { replace: true, state: null })
        }}
      />
    </div>
  )
}

/**
 * How much of the dish was eaten: portions, or grams. Opens the meal pre-filled, to save (or add more to). Right
 * after a recipe is imported (or a variant saved) it asks first whether it is being eaten now ("Not now" keeps it
 * saved only). Any recipe of the family can become the start of a variant of one's own.
 */
function LogPortionSheet({ recipe, onClose, justSaved }: { recipe: Recipe | null; onClose: () => void; justSaved?: 'imported' | 'variant' }) {
  const { t, num } = useI18n()
  const navigate = useNavigate()
  const [grams, setGrams] = useState<number | null>(null)
  const d = recipe ? dish(recipe.items, recipe.servings, recipe.total_g) : null
  useEffect(() => {
    if (d) setGrams(d.portionG)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe])
  const item = recipe && grams ? recipeItem(recipe, grams) : null
  return (
    <Sheet open={Boolean(recipe)} onClose={onClose} title={recipe?.name ?? ''}>
      {recipe && d ? (
        <div className="grid gap-4">
          {justSaved ? (
            <p className="rounded-2xl bg-leaf-soft p-3">
              <Check className="mr-1 inline size-5 text-leaf" aria-hidden /> <b>{t(justSaved === 'variant' ? 'recipes.variantSaved' : 'recipes.imported')}</b> {t('recipes.logNow')}
            </p>
          ) : null}
          <Segmented<number>
            value={grams ? Math.round((grams / d.portionG) * 2) / 2 : null}
            onChange={(k) => setGrams(Math.round(d.portionG * k))}
            options={[0.5, 1, 1.5, 2].map((k) => ({ value: k, label: k === 1 ? t('recipes.onePortion') : `×${num(k, 1)}` }))}
          />
          <Field label={t('manual.howMuch')}>
            <NumberInput decimals={false} value={grams} onChange={setGrams} />
          </Field>
          {item ? (
            <p className="text-ink-2">
              {num(item.kcal)} kcal · {t('macro.protein')} {num(item.protein_g)} g · {t('macro.carbs')} {num(item.carbs_g)} g · {t('macro.fat')} {num(item.fat_g)} g
            </p>
          ) : null}
          <Button size="lg" block disabled={!item} onClick={() => item && navigate('/food/add', { state: { items: [item], meal: mealForNow() } })}>
            {t('recipes.log')}
          </Button>
          {justSaved ? (
            <Button variant="ghost" block onClick={onClose}>
              {t('recipes.notNow')}
            </Button>
          ) : (
            <>
              {/* Cooked differently this time (less butter, another vegetable): a copy to change, the original stays. */}
              <Button variant="secondary" block onClick={() => navigate('/food/recipes/new', { state: { draft: variantDraft(recipe, t('recipes.variantName', { name: recipe.name.slice(0, 105) })) } })}>
                <Copy className="size-5" aria-hidden /> {t('recipes.variant')}
              </Button>
              {recipe.source_url ? (
                <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 justify-self-center text-sm font-semibold text-brand-ink">
                  <ExternalLink className="size-4" aria-hidden /> {t('recipes.original')}
                </a>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Sheet>
  )
}

interface Draft {
  name?: string
  servings?: number | null
  text?: string
  source?: Recipe['source']
  source_url?: string
  nutrition?: { kcal?: number; protein_g?: number } | null
  // A variant: the foods worked out already, and the name of the recipe it comes from.
  items?: FoodItem[]
  total_g?: number | null
  variantOf?: string
}

/** Writing a recipe: its name, portions and ingredients (typed, pasted, or read from a recipe page). */
export function RecipeEditor() {
  const { t, num, locale } = useI18n()
  const { profile, session } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const draft = (useLocation().state as { draft?: Draft } | null)?.draft
  const [name, setName] = useState(draft?.name ?? '')
  const [servings, setServings] = useState<number | null>(draft?.servings ?? 4)
  const [totalG, setTotalG] = useState<number | null>(draft?.total_g ?? null)
  const [text, setText] = useState(draft?.text ?? '')
  const [items, setItems] = useState<LoggedItem[] | null>(draft?.items ?? null)
  // Foods scanned or read from a photo: exact values, kept apart from the lines typed (which can be worked out again).
  const [added, setAdded] = useState<LoggedItem[]>([])
  const [scanning, setScanning] = useState(false)
  const [looking, setLooking] = useState<'scan' | 'photo' | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState(true)
  const loaded = useRef(false)

  // Changing a recipe: start from what it has.
  useEffect(() => {
    if (!id || loaded.current) return
    loaded.current = true
    void getRecipes().then((all) => {
      const r = all.find((x) => x.id === id)
      if (!r) return
      setName(r.name)
      setServings(r.servings)
      setTotalG(r.total_g)
      setItems(r.items)
      setText(ingredientText(r.items))
      setMine(r.created_by === session?.user.id)
    })
  }, [id, session])

  async function workOut() {
    if (!profile || !text.trim()) return
    // One ingredient per line, read like a dictated meal: known foods at once, the rest by the AI.
    const parsed = parseMeal(text.replace(/\n+/g, ', '), locale)
    const local = parsed.items.map((it) => withUsual(it, it.said, it.amountSaid))
    setError(null)
    if (!parsed.unknown.length) {
      setItems(local)
      setMissing([])
      return
    }
    setBusy(true)
    try {
      const ai = await estimateText({ text: parsed.unknown.join(', '), locale, goal: profile.goal ?? 'maintain', meal: 'a recipe' })
      const found = (ai.is_food ? ai.items : []).map((i) => withUsual({ ...i, origin: 'ai' as const }, i.name))
      setItems([...local, ...found])
      setMissing(found.length ? [] : parsed.unknown)
    } catch {
      setItems(local)
      setMissing(parsed.unknown)
    } finally {
      setBusy(false)
    }
  }

  /** A photo of the ingredients, or of the recipe written down: the food AI reads each food and its amount. */
  async function onPhoto(file: File | undefined) {
    if (!file || !profile) return
    setLooking('photo')
    setError(null)
    try {
      // Written recipes are small print: a larger photo than for a plate.
      const photo = await compressPhoto(file, 1600)
      const r = await estimatePlate({ image: photo.base64, note: PHOTO_NOTE, locale, goal: profile.goal ?? 'maintain', meal: 'a recipe' })
      const found = (r.is_food ? r.items : []).filter((i) => i.name && i.grams > 0).map((i) => withUsual({ ...i, grams: Math.round(i.grams), origin: 'ai' as const }, i.name))
      if (!found.length) setError(t('recipes.photoNone'))
      else setAdded((xs) => [...xs, ...found])
    } catch (e) {
      const code = (e as Error).message
      setError(t(code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'))
    } finally {
      setLooking(null)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function save() {
    if (!all.length || !name.trim() || !ready) return
    setSaving(true)
    setError(null)
    try {
      const saved = await saveRecipe({
        ...(id ? { id } : {}),
        name: name.trim(),
        servings: Math.max(1, Math.min(50, servings ?? 1)),
        total_g: weight,
        items: all.map(plainItem),
        source: draft?.source ?? 'manual',
        source_url: draft?.source_url ?? null,
      })
      // Products scanned and foods read from a photo join the family's foods (and count as used once).
      if (added.length) rememberItems(added, 'barcode')
      else void loadFoodDb(true)
      // A recipe just read from Cookidoo (or another site), or a variant of one, is often cooked to be eaten now:
      // the list asks.
      const ask = !id && (draft?.source === 'link' || Boolean(draft?.variantOf))
      navigate('/food/recipes', { state: ask ? { justImported: saved, variant: Boolean(draft?.variantOf) } : null })
    } catch {
      setError(t('recipes.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!id || !window.confirm(t('recipes.confirmDelete'))) return
    await deleteRecipe(id)
    void loadFoodDb(true)
    navigate('/food/recipes')
  }

  // The lines typed, worked out (or none), and the foods scanned or photographed.
  const all = [...(items ?? []), ...added]
  const ready = items !== null || !text.trim()
  // Without the weight when ready: the ingredients' weight, as written (water and salt included).
  const stated = statedWeight(text) + added.reduce((s, i) => s + i.grams, 0)
  const counted = all.reduce((s, i) => s + i.grams, 0)
  const weight = totalG || (stated > counted ? stated : null)
  const d = ready && all.length ? dish(all, servings ?? 1, weight) : null
  /** A change to one food of the list, the typed ones first. */
  const change = (i: number, f: (xs: LoggedItem[], j: number) => LoggedItem[]) => {
    const n = items?.length ?? 0
    if (i < n) setItems((xs) => f(xs ?? [], i))
    else setAdded((xs) => f(xs, i - n))
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t(id ? 'recipes.editTitle' : draft?.variantOf ? 'recipes.newVariant' : 'recipes.new')} back="/food/recipes">
        {d && name.trim() && mine ? (
          <Button variant="leaf" block onClick={() => void save()} loading={saving}>
            {t('recipes.save')}
          </Button>
        ) : null}
      </PageHeader>
      {!mine ? <p className="rounded-2xl bg-card-2 p-3 text-sm">{t('recipes.notMine')}</p> : null}
      {!id && draft?.variantOf ? <p className="rounded-2xl bg-leaf-soft p-3 text-sm">{t('recipes.variantOf', { name: draft.variantOf })}</p> : null}

      <Card>
        <div className="grid gap-4">
          <Field label={t('recipes.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('recipes.servings')}>
              <NumberInput decimals={false} value={servings} onChange={setServings} />
            </Field>
            <Field label={t('recipes.totalG')}>
              <NumberInput decimals={false} value={totalG} onChange={setTotalG} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-ink-3">{t('recipes.totalHint')}</p>
          <Field label={t('recipes.ingredients')} hint={t('recipes.ingredientsHint')}>
            <textarea
              value={text}
              rows={6}
              onChange={(e) => {
                setText(e.target.value)
                setItems(null)
              }}
              className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-lg outline-none focus:border-sky"
            />
          </Field>
          {/* Packaged foods by their barcode; a photo of the foods, or of the recipe written down. */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setScanning(true)} loading={looking === 'scan'} disabled={Boolean(looking)}>
              <Barcode className="size-5 text-brand" aria-hidden /> {t('recipes.scan')}
            </Button>
            <Button variant="secondary" onClick={() => photoRef.current?.click()} loading={looking === 'photo'} disabled={Boolean(looking)}>
              <Camera className="size-5 text-brand" aria-hidden /> {t('recipes.photo')}
            </Button>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </div>
          <p className="-mt-2 text-xs text-ink-3">{t('recipes.scanHint')}</p>
          {!items && text.trim() ? (
            <Button size="lg" block onClick={() => void workOut()} loading={busy}>
              <Sparkles className="size-5" aria-hidden /> {t('recipes.workOut')}
            </Button>
          ) : null}
        </div>
      </Card>

      {draft?.nutrition?.kcal ? (
        <p className="rounded-2xl bg-card-2 p-3 text-sm">{t('recipes.pageSays', { kcal: num(draft.nutrition.kcal), p: num(draft.nutrition.protein_g ?? 0) })}</p>
      ) : null}

      {all.length ? (
        <Card title={t('recipes.ingredientsFound')}>
          <ul className="grid gap-2">
            {all.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{it.name}</p>
                  <p className="text-sm text-ink-2">
                    {num(it.kcal)} kcal · P {num(it.protein_g)} · C {num(it.carbs_g)} · F {num(it.fat_g)}
                  </p>
                </div>
                <div className="w-20">
                  <NumberInput decimals={false} value={it.grams} onChange={(g) => g && change(i, (xs, k) => xs.map((x, j) => (j === k ? { ...x, ...scaled(x, g) } : x)))} aria-label={t('snap.grams', { name: it.name })} />
                </div>
                <span className="text-sm text-ink-2">g</span>
                <button onClick={() => change(i, (xs, k) => xs.filter((_, j) => j !== k))} className="grid size-10 place-items-center text-ink-3" aria-label={t('common.delete')}>
                  <Trash2 className="size-5" />
                </button>
              </li>
            ))}
          </ul>
          {missing.length ? <p className="mt-3 rounded-2xl bg-sun-soft p-3 text-sm">{t('voice.missing', { words: missing.join(', ') })}</p> : null}
          {!ready ? <p className="mt-3 rounded-2xl bg-card-2 p-3 text-sm">{t('recipes.textPending')}</p> : null}
          {d ? <p className="mt-3 font-semibold">{t('recipes.summary', { g: num(d.weight), kcal: num(d.kcal), pg: num(d.portionG), pkcal: num(d.portionKcal), pp: num(d.portionProtein) })}</p> : null}
        </Card>
      ) : null}

      {error ? <p className="rounded-2xl bg-danger-soft p-3">{error}</p> : null}
      <BarcodeAdd open={scanning} onOpenChange={setScanning} onBusy={(b) => setLooking(b ? 'scan' : null)} onAdd={(it) => setAdded((xs) => [...xs, it])} addLabel={t('recipes.addToRecipe')} />
      {id && mine ? (
        <Button variant="danger" onClick={() => void remove()}>
          <Trash2 className="size-5" aria-hidden /> {t('recipes.delete')}
        </Button>
      ) : null}
    </div>
  )
}
