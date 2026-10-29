// Packaged foods by barcode, from Open Food Facts (https://world.openfoodfacts.org):
// a free, open database (ODbL licence) with millions of products, very good for Italy and Europe.
// It is the same source Build With Science falls back to for barcodes. No key is needed.
import type { FoodItem, Locale } from './types'

export interface Product {
  code: string
  name: string
  brand: string | null
  image: string | null
  /** Nutrients per 100 g (or 100 ml). */
  per100: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number }
  /** One serving in grams, when the label states it. */
  servingG: number | null
  /** NOVA group 4 = ultra-processed. */
  ultraProcessed: boolean
  source: 'openfoodfacts' | 'label'
}

const FIELDS = 'code,product_name,product_name_it,product_name_en,generic_name,brands,nutriments,serving_quantity,nova_group,image_front_small_url'
const RECENT_KEY = 'forza.products'

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 ? x : 0
}

/** Converts an Open Food Facts product into our shape (null when it has no calorie data). */
export function fromOpenFoodFacts(p: Record<string, unknown>, locale: Locale): Product | null {
  const nt = (p.nutriments ?? {}) as Record<string, unknown>
  const kcal = nt['energy-kcal_100g'] != null ? n(nt['energy-kcal_100g']) : n(nt['energy_100g']) / 4.184
  if (!kcal) return null
  const name = String((locale === 'it' ? p.product_name_it : p.product_name_en) || p.product_name || p.generic_name || '').trim()
  const brand = String(p.brands ?? '').split(',')[0].trim() || null
  const serving = n(p.serving_quantity)
  const nova = Number(p.nova_group ?? nt['nova-group_100g'])
  return {
    code: String(p.code),
    name: name || brand || String(p.code),
    brand,
    image: typeof p.image_front_small_url === 'string' ? p.image_front_small_url : null,
    per100: {
      kcal: Math.round(kcal),
      protein_g: n(nt.proteins_100g),
      carbs_g: n(nt.carbohydrates_100g),
      fat_g: n(nt.fat_100g),
      fiber_g: n(nt.fiber_100g),
      sugar_g: n(nt.sugars_100g),
    },
    servingG: serving > 0 && serving < 2000 ? serving : null,
    ultraProcessed: nova === 4,
    source: 'openfoodfacts',
  }
}

/** Looks a barcode up. Returns null when the product is unknown or has no nutrition facts. */
export async function lookupBarcode(code: string, locale: Locale): Promise<Product | null> {
  const cached = recentProducts().find((p) => p.code === code)
  if (cached) return cached
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('lookup_failed')
  const data = (await res.json()) as { status?: number; product?: Record<string, unknown> }
  return data.status === 1 && data.product ? fromOpenFoodFacts({ code, ...data.product }, locale) : null
}

const r1 = (x: number) => Math.round(x * 10) / 10

/** Nutrients for an amount of a product. */
export function productAt(p: Product, grams: number): FoodItem {
  const k = grams / 100
  return {
    name: p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name} (${p.brand})` : p.name,
    grams,
    kcal: Math.round(p.per100.kcal * k),
    protein_g: r1(p.per100.protein_g * k),
    carbs_g: r1(p.per100.carbs_g * k),
    fat_g: r1(p.per100.fat_g * k),
    fiber_g: r1(p.per100.fiber_g * k),
    sugar_g: r1(p.per100.sugar_g * k),
  }
}

/** Products scanned on this phone, newest first: one tap to log them again. */
export function recentProducts(): Product[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Product[]
  } catch {
    return []
  }
}

export function rememberProduct(p: Product): void {
  try {
    const list = [p, ...recentProducts().filter((x) => x.code !== p.code)].slice(0, 20)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // storage full or unavailable: nothing to remember
  }
}
