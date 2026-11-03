// Searches foods by name in Open Food Facts (https://world.openfoodfacts.org, ODbL licence): millions of
// products, very good for Italy and Europe. The app cannot ask its search service directly (it does not allow
// requests from web pages), so this function asks for it and answers with values per 100 g.
// With mode 'recipe' it reads a recipe page instead (Cookidoo, the Thermomix/Bimby recipe site; the Bimby
// community site ricettario-bimby.it; most recipe sites): its name, portions, ingredients as written and, when
// the page says, the nutrition of one portion.
// Signed-in people only; nothing is stored here (the app saves the foods people log).
import { adminClient, corsHeaders, json, userIdFromRequest } from '../_shared/util.ts'

const FIELDS = 'code,product_name,product_name_it,product_name_en,generic_name,brands,nutriments,serving_quantity,nova_group,image_front_small_url'

const n = (v: unknown, max: number) => {
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 ? Math.min(max, Math.round(x * 10) / 10) : 0
}

// ---------------------------------------------------------------------------
// Recipe pages
// ---------------------------------------------------------------------------

/** Only public sites by name, on the usual ports: never an address, a local name or another port. */
function publicUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.port || u.username || u.password || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)) return null
    return u
  } catch {
    return null
  }
}

/** The page, following up to three redirects, each checked like the first address. */
async function fetchPage(start: URL): Promise<string | null> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Forza! family fitness app; github.com/gabripo/forza)', 'Accept-Language': 'it,en;q=0.8', Accept: 'text/html' },
      signal: AbortSignal.timeout(12_000),
    })
    if (res.status >= 300 && res.status < 400) {
      const next = publicUrl(new URL(res.headers.get('location') ?? '', url).toString())
      await res.body?.cancel()
      if (!next) return null
      url = next
      continue
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
    const text = await res.text()
    return text.slice(0, 3_000_000)
  }
  return null
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&agrave;/g, 'à')
    .replace(/&egrave;/g, 'è')
    .replace(/&eacute;/g, 'é')
    .replace(/&igrave;/g, 'ì')
    .replace(/&ograve;/g, 'ò')
    .replace(/&ugrave;/g, 'ù')
    .replace(/\s+/g, ' ')
    .trim()

/** A number from "413.7 kcal", "8,9 g" or 12. */
const amount = (v: unknown) => {
  const m = String(v ?? '').replace(',', '.').match(/\d+(\.\d+)?/)
  return m ? Math.round(Number(m[0]) * 10) / 10 : undefined
}

/** The schema.org Recipe of the page, wherever it is in its JSON-LD (a list, a @graph, nested). */
function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findRecipe(x)
      if (r) return r
    }
    return null
  }
  const o = node as Record<string, unknown>
  const type = o['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return o
  return findRecipe(o['@graph']) ?? findRecipe(o.mainEntity)
}

/** Ingredients as people write them: "200 grammo acqua" reads "200 g acqua". */
const ingredientLine = (s: string) =>
  plainText(s)
    .replace(/\bgramm[oi]\b/gi, 'g')
    .replace(/\bchilogramm[oi]\b/gi, 'kg')
    .replace(/\bmillilitr[oi]\b/gi, 'ml')
    .slice(0, 160)

async function readRecipe(raw: string) {
  const url = publicUrl(raw)
  if (!url) return json({ error: 'bad_url' }, 400)
  let html: string | null
  try {
    html = await fetchPage(url)
  } catch {
    return json({ error: 'recipe_failed' }, 502)
  }
  if (!html) return json({ error: 'recipe_failed' }, 502)
  const meta = (p: string) => html!.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ?? null

  let recipe: Record<string, unknown> | null = null
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      recipe = findRecipe(JSON.parse(m[1]))
    } catch {
      // a broken block: try the next
    }
    if (recipe) break
  }
  let name = ''
  let ingredients: string[] = []
  let servings: number | null = null
  let nutrition: Record<string, number | undefined> | null = null
  let image: string | null = meta('image')
  if (recipe) {
    name = plainText(String(recipe.name ?? ''))
    ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []).map((x) => ingredientLine(String(x)))
    const y = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield
    servings = amount(y) ?? null
    const n = recipe.nutrition as Record<string, unknown> | undefined
    if (n && (n.calories || n.proteinContent)) {
      nutrition = { kcal: amount(n.calories), protein_g: amount(n.proteinContent), carbs_g: amount(n.carbohydrateContent), fat_g: amount(n.fatContent) }
    }
    const img = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image
    image = (typeof img === 'string' ? img : (img as { url?: string } | undefined)?.url) ?? image
  } else {
    // Microdata (the Bimby community site): each ingredient marked itemprop="recipeIngredient".
    ingredients = [...html.matchAll(/<(li|span|div|p)[^>]*itemprop=["']recipeIngredient["'][^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ingredientLine(m[2]))
    name = plainText(meta('title') ?? html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    servings = amount(html.match(/itemprop=["']recipeYield["'][^>]*>([^<]*)</i)?.[1]) ?? null
  }
  ingredients = ingredients.filter(Boolean).slice(0, 60)
  if (!ingredients.length) return json({ error: 'no_recipe' }, 422)
  return json({ name: name.slice(0, 120), servings: servings && servings >= 1 && servings <= 50 ? Math.round(servings) : null, ingredients, nutrition, image: image && /^https:\/\//.test(image) ? image : null })
}

// ---------------------------------------------------------------------------
// Searching Thermomix (Bimby) recipes
// ---------------------------------------------------------------------------

/**
 * Italian: the official Bimby recipe community (ricettario-bimby.it, Vorwerk), whose search page lists the
 * recipes found. Cookidoo's own search loads its results through a private search service, so the app only
 * opens it (cookidooUrl) and the person pastes the link of the recipe chosen. In English there is Cookidoo's
 * search only: the English recipe community does not answer requests from servers.
 */
async function searchRecipes(q: string, locale: string) {
  const cookidooUrl = locale === 'it'
    ? `https://cookidoo.it/search/it-IT?query=${encodeURIComponent(q)}`
    : `https://cookidoo.international/search/en?query=${encodeURIComponent(q)}`
  if (locale !== 'it') return json({ results: [], cookidooUrl })
  try {
    const res = await fetch(`https://www.ricettario-bimby.it/cerca?search=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Forza! family fitness app; github.com/gabripo/forza)', 'Accept-Language': 'it' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return json({ results: [], cookidooUrl, error: 'search_failed' })
    const html = (await res.text()).slice(0, 3_000_000)
    const seen = new Set<string>()
    const results = []
    // Each result: <div … data-id="…"> … <a href="/…-ricette/…" title="…" class="recipe-link"><img src="…"> … data-average="4.56"
    for (const m of html.matchAll(/data-id="([\w-]+)"[^>]*>[\s\S]{0,400}?<a href="(\/[^"]+)" title="([^"]*)" class="recipe-link">\s*<img src="([^"]*)"[\s\S]{0,1200}?data-average="([\d.]*)"/g)) {
      if (seen.has(m[2])) continue
      seen.add(m[2])
      results.push({ title: plainText(m[3]).slice(0, 120), url: `https://www.ricettario-bimby.it${m[2]}`, image: /^https:\/\//.test(m[4]) ? m[4] : null, rating: Number(m[5]) || null })
      if (results.length >= 20) break
    }
    return json({ results, cookidooUrl })
  } catch {
    return json({ results: [], cookidooUrl, error: 'search_failed' })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!(await userIdFromRequest(req, adminClient()))) return json({ error: 'unauthorized' }, 401)
  let body: { q?: string; locale?: string; mode?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (body.mode === 'recipe') return readRecipe(String(body.url ?? '').trim().slice(0, 500))
  if (body.mode === 'recipe_search') {
    const q = String(body.q ?? '').trim().slice(0, 80)
    if (q.length < 2) return json({ results: [] })
    return searchRecipes(q, body.locale === 'it' ? 'it' : 'en')
  }
  const q = String(body.q ?? '').trim().slice(0, 80)
  if (q.length < 2) return json({ products: [] })
  const lang = body.locale === 'it' ? 'it' : 'en'
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&langs=${lang}&fields=${FIELDS}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Forza! family fitness app (github.com/gabripo/forza)' }, signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return json({ error: 'search_failed' }, 502)
    const data = (await res.json()) as { hits?: Record<string, unknown>[] }
    const products = (data.hits ?? [])
      .map((p) => {
        const nt = (p.nutriments ?? {}) as Record<string, unknown>
        const kcal = nt['energy-kcal_100g'] != null ? n(nt['energy-kcal_100g'], 950) : n(Number(nt['energy_100g'] ?? 0) / 4.184, 950)
        const name = String((lang === 'it' ? p.product_name_it : p.product_name_en) || p.product_name || p.generic_name || '').trim()
        const brands = Array.isArray(p.brands) ? p.brands : String(p.brands ?? '').split(',')
        const brand = String(brands[0] ?? '').trim()
        if (!kcal || !name) return null
        const salt = nt.salt_100g != null ? n(nt.salt_100g, 100) : nt.sodium_100g != null ? n(Number(nt.sodium_100g) * 2.5, 100) : null
        const serving = Number(p.serving_quantity)
        return {
          code: String(p.code ?? ''),
          name: name.slice(0, 120),
          brand: brand && brand.toLowerCase() !== name.toLowerCase() ? brand.slice(0, 60) : null,
          image: typeof p.image_front_small_url === 'string' ? p.image_front_small_url : null,
          per100: {
            kcal,
            protein_g: n(nt.proteins_100g, 100),
            carbs_g: n(nt.carbohydrates_100g, 100),
            fat_g: n(nt.fat_100g, 100),
            fiber_g: n(nt.fiber_100g, 100),
            sugar_g: n(nt.sugars_100g, 100),
            ...(salt !== null ? { salt_g: salt } : {}),
            ...(nt['saturated-fat_100g'] != null ? { satfat_g: n(nt['saturated-fat_100g'], 100) } : {}),
          },
          servingG: serving > 0 && serving < 2000 ? serving : null,
          ultraProcessed: Number(p.nova_group) === 4,
        }
      })
      .filter(Boolean)
      .slice(0, 20)
    return json({ products })
  } catch {
    return json({ error: 'search_failed' }, 502)
  }
})
