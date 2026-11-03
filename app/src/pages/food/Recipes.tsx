import { BookOpen, Link2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { mealForNow } from '../../components/PlateResult'
import { Button, Card, Empty, Field, Input, Loading, NumberInput, PageHeader, Segmented, Sheet } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { sumItems } from '../../lib/calc'
import { deleteRecipe, estimateText, getRecipes, importRecipe, saveRecipe, useAsync } from '../../lib/data'
import { loadFoodDb, plainItem, withUsual, type LoggedItem } from '../../lib/foodDb'
import { useI18n } from '../../lib/i18n'
import type { FoodItem, Recipe } from '../../lib/types'
import { parseMeal } from '../../lib/voice'

const round1 = (n: number) => Math.round(n * 10) / 10

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
  const { t, num } = useI18n()
  const { session } = useApp()
  const navigate = useNavigate()
  const { data, loading } = useAsync(getRecipes, [])
  const [url, setUrl] = useState('')
  const [reading, setReading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [logging, setLogging] = useState<Recipe | null>(null)

  async function read() {
    setReading(true)
    setImportError(null)
    try {
      const r = await importRecipe(url.trim())
      navigate('/food/recipes/new', { state: { draft: { name: r.name, servings: r.servings, text: r.ingredients.join('\n'), source: 'link', source_url: url.trim(), nutrition: r.nutrition } } })
    } catch (e) {
      const code = (e as Error).message
      setImportError(t(code === 'no_recipe' ? 'recipes.noRecipe' : code === 'bad_url' ? 'recipes.badUrl' : 'recipes.importFailed'))
    } finally {
      setReading(false)
    }
  }

  if (loading && !data) return <Loading />
  const recipes = data ?? []

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

      <Card title={t('recipes.importTitle')}>
        <p className="mb-3 text-sm text-ink-2">{t('recipes.importText')}</p>
        <div className="flex gap-2">
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cookidoo.it/recipes/recipe/it-IT/r…" />
          <Button onClick={() => void read()} loading={reading} disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())}>
            <Link2 className="size-5" aria-hidden /> {t('recipes.importButton')}
          </Button>
        </div>
        {importError ? <p className="mt-2 rounded-2xl bg-sun-soft p-3 text-sm">{importError}</p> : null}
      </Card>

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

      <LogPortionSheet recipe={logging} onClose={() => setLogging(null)} />
    </div>
  )
}

/** How much of the dish was eaten: portions, or grams. Opens the meal pre-filled, to save (or add more to). */
function LogPortionSheet({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
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
  const [totalG, setTotalG] = useState<number | null>(null)
  const [text, setText] = useState(draft?.text ?? '')
  const [items, setItems] = useState<LoggedItem[] | null>(null)
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
      setText(r.items.map((i) => `${num(i.grams)} g ${i.name}`).join('\n'))
      setMine(r.created_by === session?.user.id)
    })
  }, [id, num, session])

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

  async function save() {
    if (!items?.length || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await saveRecipe({
        ...(id ? { id } : {}),
        name: name.trim(),
        servings: Math.max(1, Math.min(50, servings ?? 1)),
        total_g: weight,
        items: items.map(plainItem),
        source: draft?.source ?? 'manual',
        source_url: draft?.source_url ?? null,
      })
      void loadFoodDb(true)
      navigate('/food/recipes')
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

  // Without the weight when ready: the ingredients' weight, as written (water and salt included).
  const stated = statedWeight(text)
  const counted = (items ?? []).reduce((s, i) => s + i.grams, 0)
  const weight = totalG || (stated > counted ? stated : null)
  const d = items?.length ? dish(items, servings ?? 1, weight) : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t(id ? 'recipes.editTitle' : 'recipes.new')} back="/food/recipes">
        {d && name.trim() && mine ? (
          <Button variant="leaf" block onClick={() => void save()} loading={saving}>
            {t('recipes.save')}
          </Button>
        ) : null}
      </PageHeader>
      {!mine ? <p className="rounded-2xl bg-card-2 p-3 text-sm">{t('recipes.notMine')}</p> : null}

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
          {!items ? (
            <Button size="lg" block onClick={() => void workOut()} loading={busy} disabled={!text.trim()}>
              <Sparkles className="size-5" aria-hidden /> {t('recipes.workOut')}
            </Button>
          ) : null}
        </div>
      </Card>

      {draft?.nutrition?.kcal ? (
        <p className="rounded-2xl bg-card-2 p-3 text-sm">{t('recipes.pageSays', { kcal: num(draft.nutrition.kcal), p: num(draft.nutrition.protein_g ?? 0) })}</p>
      ) : null}

      {items ? (
        <Card title={t('recipes.ingredientsFound')}>
          <ul className="grid gap-2">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{it.name}</p>
                  <p className="text-sm text-ink-2">
                    {num(it.kcal)} kcal · P {num(it.protein_g)} · C {num(it.carbs_g)} · F {num(it.fat_g)}
                  </p>
                </div>
                <div className="w-20">
                  <NumberInput decimals={false} value={it.grams} onChange={(g) => g && setItems((xs) => (xs ?? []).map((x, j) => (j === i ? { ...x, ...scaled(x, g) } : x)))} aria-label={t('snap.grams', { name: it.name })} />
                </div>
                <span className="text-sm text-ink-2">g</span>
                <button onClick={() => setItems((xs) => (xs ?? []).filter((_, j) => j !== i))} className="grid size-10 place-items-center text-ink-3" aria-label={t('common.delete')}>
                  <Trash2 className="size-5" />
                </button>
              </li>
            ))}
          </ul>
          {missing.length ? <p className="mt-3 rounded-2xl bg-sun-soft p-3 text-sm">{t('voice.missing', { words: missing.join(', ') })}</p> : null}
          {d ? <p className="mt-3 font-semibold">{t('recipes.summary', { g: num(d.weight), kcal: num(d.kcal), pg: num(d.portionG), pkcal: num(d.portionKcal), pp: num(d.portionProtein) })}</p> : null}
        </Card>
      ) : null}

      {error ? <p className="rounded-2xl bg-danger-soft p-3">{error}</p> : null}
      {id && mine ? (
        <Button variant="danger" onClick={() => void remove()}>
          <Trash2 className="size-5" aria-hidden /> {t('recipes.delete')}
        </Button>
      ) : null}
    </div>
  )
}
