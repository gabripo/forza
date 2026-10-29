// Estimates calories and macronutrients from a photo: a plate of food, or a nutrition facts label.
// The AI key never leaves the server. Each person has a daily limit (FOOD_AI_DAILY_LIMIT, default 25)
// so a shared key cannot be drained.
//
// Providers (see docs/food-ai.md):
//   Google Gemini (default)        GEMINI_API_KEY, optional GEMINI_MODEL and GEMINI_FALLBACK_MODELS
//   any OpenAI-compatible API      FOOD_AI_PROVIDER=openai, FOOD_AI_BASE_URL, FOOD_AI_API_KEY, FOOD_AI_MODEL
//                                  (OpenAI, Groq, Mistral, OpenRouter, GitHub Models, a local Ollama…)
//
// Forza! Coach can call it with the project's secret key to test the set-up: no person, no limit.
import { adminClient, corsHeaders, isServiceKey, json, userIdFromRequest } from '../_shared/util.ts'

const PROVIDER = Deno.env.get('FOOD_AI_PROVIDER') ?? 'gemini'
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
// Tried in turn when the main model is overloaded (503) or out of free quota (429): each model has
// its own free quota, and Flash-Lite's is much larger.
const GEMINI_FALLBACKS = (Deno.env.get('GEMINI_FALLBACK_MODELS') ?? 'gemini-3.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean)
const DAILY_LIMIT = Number(Deno.env.get('FOOD_AI_DAILY_LIMIT') ?? 25)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

type Mode = 'plate' | 'label'
type Schema = Record<string, unknown>

const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const

const itemSchema: Schema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    grams: { type: 'NUMBER' },
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, { type: 'NUMBER' }])),
  },
  required: ['name', 'grams', ...NUTRIENTS],
}

const SCHEMAS: Record<Mode, Schema> = {
  plate: {
    type: 'OBJECT',
    properties: {
      is_food: { type: 'BOOLEAN' },
      title: { type: 'STRING' },
      items: { type: 'ARRAY', items: itemSchema },
      ultra_processed: { type: 'BOOLEAN' },
      confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
      tip: { type: 'STRING' },
    },
    required: ['is_food', 'title', 'items', 'ultra_processed', 'confidence', 'tip'],
  },
  label: {
    type: 'OBJECT',
    properties: {
      is_label: { type: 'BOOLEAN' },
      name: { type: 'STRING' },
      brand: { type: 'STRING' },
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, { type: 'NUMBER' }])),
      serving_g: { type: 'NUMBER' },
    },
    required: ['is_label', 'name', 'brand', ...NUTRIENTS, 'serving_g'],
  },
}

const GOAL_TEXT: Record<string, string> = {
  fat_loss: 'lose fat while keeping muscle',
  muscle_gain: 'build muscle',
  maintain: 'stay healthy and keep their weight',
}

function platePrompt(language: string, goal: string, meal: string, note: string): string {
  return [
    'You are a careful nutritionist estimating a meal from a photo for a beginner who wants to ' +
      (GOAL_TEXT[goal] ?? GOAL_TEXT.maintain) + '.',
    `The meal is: ${meal}.`,
    note ? `The person adds this description (trust it over the photo when they conflict): "${note}".` : '',
    'List every visible food item with a realistic portion in grams and its nutrients for that portion.',
    'Include cooking oil, sauces and dressings you can reasonably infer. Use standard nutrition tables.',
    'Mark ultra_processed true if most of the calories come from ultra-processed products.',
    'If the photo does not show food, set is_food false and return an empty items list.',
    `Write "title", item names and "tip" in ${language}.`,
    '"tip" is one short, friendly, practical suggestion (max 25 words) to make this plate better for the goal.',
  ].filter(Boolean).join('\n')
}

function labelPrompt(language: string): string {
  return [
    'The photo shows the nutrition facts table of a packaged food (any language, any country).',
    'Copy the values PER 100 g (or per 100 ml for drinks): energy in kcal (convert from kJ by dividing by 4.184 if only kJ is given),',
    'protein, carbohydrates, fat, fibre and sugars in grams. Use 0 for a value that is not printed.',
    'If the table only gives values per serving, convert them to per 100 g using the serving size.',
    'serving_g is the serving size in grams if printed, otherwise 0.',
    `name: the product name if visible, in ${language}, otherwise an empty string. brand: the brand if visible, otherwise an empty string.`,
    'If the photo does not show a nutrition table, set is_label false and use 0 and empty strings.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

interface Ask {
  prompt: string
  schema: Schema
  image: string
  mime: string
}

function configured(): boolean {
  return PROVIDER === 'openai'
    ? Boolean(Deno.env.get('FOOD_AI_BASE_URL') && Deno.env.get('FOOD_AI_MODEL'))
    : Boolean(Deno.env.get('GEMINI_API_KEY'))
}

function modelName(): string {
  return PROVIDER === 'openai' ? `${Deno.env.get('FOOD_AI_MODEL')} @ ${new URL(Deno.env.get('FOOD_AI_BASE_URL')!).host}` : GEMINI_MODEL
}

class Busy extends Error {}

async function askGeminiModel(model: string, { prompt, schema, image, mime }: Ask): Promise<unknown> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')! },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    }),
  })
  if (res.status === 503 || res.status === 429) throw new Busy(`${model} ${res.status}`)
  if (!res.ok) throw new Error(`gemini ${model} ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  return JSON.parse(text ?? '')
}

/** The main model, one retry if it is busy, then the fallback models. Returns the answer and the model used. */
async function askGemini(ask: Ask): Promise<{ answer: unknown; model: string }> {
  const attempts = [GEMINI_MODEL, GEMINI_MODEL, ...GEMINI_FALLBACKS]
  let last: Error | null = null
  for (const [i, model] of attempts.entries()) {
    try {
      return { answer: await askGeminiModel(model, ask), model }
    } catch (e) {
      if (!(e instanceof Busy)) throw e
      last = e
      if (i === 0) await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw new Error(`all Gemini models busy (${last?.message})`)
}

/** Gemini's schema dialect (upper-case types) → standard JSON Schema, for the prompt of other providers. */
function jsonSchema(s: Schema): Schema {
  const out: Schema = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type') out.type = String(v).toLowerCase()
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v as Schema).map(([p, sub]) => [p, jsonSchema(sub as Schema)]))
    else if (k === 'items') out.items = jsonSchema(v as Schema)
    else out[k] = v
  }
  return out
}

async function askOpenAiCompatible({ prompt, schema, image, mime }: Ask): Promise<{ answer: unknown; model: string }> {
  const base = Deno.env.get('FOOD_AI_BASE_URL')!.replace(/\/$/, '')
  const key = Deno.env.get('FOOD_AI_API_KEY')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model: Deno.env.get('FOOD_AI_MODEL'),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${prompt}\nAnswer with one JSON object only, matching this JSON Schema:\n${JSON.stringify(jsonSchema(schema))}` },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } }] },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai-compatible ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const data = await res.json()
  const text: string = data?.choices?.[0]?.message?.content ?? ''
  // Some models wrap JSON in a code fence even in JSON mode.
  return { answer: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')), model: modelName() }
}

// ---------------------------------------------------------------------------
// Answers are checked before they reach the app: numbers are numbers, never negative.
// ---------------------------------------------------------------------------

const num = (v: unknown, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0
}
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function cleanPlate(a: Record<string, unknown>) {
  const items = Array.isArray(a.items) ? a.items : []
  return {
    is_food: a.is_food !== false && items.length > 0,
    title: str(a.title),
    items: items.slice(0, 20).map((i: Record<string, unknown>) => ({
      name: str(i.name),
      grams: num(i.grams, 3000),
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, num(i[k], k === 'kcal' ? 5000 : 500)])),
    })),
    ultra_processed: a.ultra_processed === true,
    confidence: ['low', 'medium', 'high'].includes(String(a.confidence)) ? a.confidence : 'low',
    tip: str(a.tip, 240),
  }
}

function cleanLabel(a: Record<string, unknown>) {
  return {
    is_label: a.is_label === true,
    name: str(a.name),
    brand: str(a.brand, 60),
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, num(a[k], k === 'kcal' ? 950 : 100)])),
    serving_g: num(a.serving_g, 2000),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!configured()) return json({ error: 'not_configured' }, 503)

  const admin = adminClient()
  const coachTest = isServiceKey((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''))
  const userId = coachTest ? null : await userIdFromRequest(req, admin)
  if (!coachTest && !userId) return json({ error: 'unauthorized' }, 401)

  let body: { image?: string; mime?: string; note?: string; locale?: string; goal?: string; meal?: string; mode?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const image = body.image ?? ''
  const mime = body.mime ?? 'image/jpeg'
  if (!image || image.length * 0.75 > MAX_IMAGE_BYTES || !/^image\/(jpeg|png|webp)$/.test(mime)) {
    return json({ error: 'bad_image' }, 400)
  }
  const mode: Mode = body.mode === 'label' ? 'label' : 'plate'

  if (userId) {
    const { error: limitError } = await admin.rpc('bump_ai_usage', { p_user: userId, p_limit: DAILY_LIMIT })
    if (limitError) {
      const reached = limitError.message.includes('daily_limit_reached')
      return json({ error: reached ? 'daily_limit_reached' : 'usage_error' }, reached ? 429 : 500)
    }
  }

  const language = body.locale === 'it' ? 'Italian' : 'English'
  const prompt = mode === 'label'
    ? labelPrompt(language)
    : platePrompt(language, body.goal ?? 'maintain', body.meal ?? 'a meal', (body.note ?? '').slice(0, 300))
  const started = Date.now()
  try {
    const ask = { prompt, schema: SCHEMAS[mode], image, mime }
    const { answer, model } = PROVIDER === 'openai' ? await askOpenAiCompatible(ask) : await askGemini(ask)
    const result = mode === 'label' ? cleanLabel(answer as Record<string, unknown>) : cleanPlate(answer as Record<string, unknown>)
    return json(coachTest ? { ...result, model, ms: Date.now() - started } : result)
  } catch (e) {
    console.error('food ai failed', (e as Error).message)
    return json(coachTest ? { error: 'ai_failed', detail: (e as Error).message } : { error: 'ai_failed' }, 502)
  }
})
