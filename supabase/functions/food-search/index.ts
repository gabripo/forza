// Searches foods by name in Open Food Facts (https://world.openfoodfacts.org, ODbL licence): millions of
// products, very good for Italy and Europe. The app cannot ask its search service directly (it does not allow
// requests from web pages), so this function asks for it and answers with values per 100 g.
// Signed-in people only; nothing is stored here (the app saves the foods people log).
import { adminClient, corsHeaders, json, userIdFromRequest } from '../_shared/util.ts'

const FIELDS = 'code,product_name,product_name_it,product_name_en,generic_name,brands,nutriments,serving_quantity,nova_group,image_front_small_url'

const n = (v: unknown, max: number) => {
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 ? Math.min(max, Math.round(x * 10) / 10) : 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!(await userIdFromRequest(req, adminClient()))) return json({ error: 'unauthorized' }, 401)
  let body: { q?: string; locale?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
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
