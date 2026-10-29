// Estimates calories and macronutrients from a photo: a plate of food, or a nutrition facts label.
// The AI key never leaves the server. Each person has a daily limit (FOOD_AI_DAILY_LIMIT, default 25)
// so a shared key cannot be drained.
//
// Providers and their order ("model use order") are set in Forza! Coach → Setup → Food photo AI:
//   FOOD_AI_ORDER   JSON list of "provider:model", tried top to bottom, e.g.
//                   ["gemini:gemini-3.6-flash", "gemini:gemini-3.5-flash-lite", "openrouter:google/gemma-3-27b-it:free"]
//   one key per provider: GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENAI_API_KEY,
//   and for any other OpenAI-compatible service FOOD_AI_BASE_URL + FOOD_AI_API_KEY ("custom").
// When one is busy, out of quota or fails, the next one answers. Entries without a key are skipped.
// Without FOOD_AI_ORDER: Gemini (GEMINI_MODEL, then GEMINI_FALLBACK_MODELS), or the older
// FOOD_AI_PROVIDER=openai + FOOD_AI_MODEL set-up.
//
// Forza! Coach can call it with the project's secret key to test the set-up: no person, no limit.
import { adminClient, corsHeaders, isServiceKey, json, userIdFromRequest } from '../_shared/util.ts'

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
const GEMINI_FALLBACKS = (Deno.env.get('GEMINI_FALLBACK_MODELS') ?? 'gemini-3.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean)

/** Where each provider lives and which secret holds its key. */
const PROVIDERS: Record<string, { key: string; base?: string; baseEnv?: string }> = {
  gemini: { key: 'GEMINI_API_KEY' },
  openrouter: { key: 'OPENROUTER_API_KEY', base: 'https://openrouter.ai/api/v1' },
  groq: { key: 'GROQ_API_KEY', base: 'https://api.groq.com/openai/v1' },
  mistral: { key: 'MISTRAL_API_KEY', base: 'https://api.mistral.ai/v1' },
  openai: { key: 'OPENAI_API_KEY', base: 'https://api.openai.com/v1' },
  custom: { key: 'FOOD_AI_API_KEY', baseEnv: 'FOOD_AI_BASE_URL' },
}

interface Step {
  provider: string
  model: string
}

/** The model use order, keeping only entries whose provider has a key. */
function chain(): Step[] {
  let steps: Step[] = []
  try {
    const order = JSON.parse(Deno.env.get('FOOD_AI_ORDER') ?? '[]') as string[]
    steps = order.map((s) => {
      const i = String(s).indexOf(':')
      return { provider: String(s).slice(0, i), model: String(s).slice(i + 1) }
    })
  } catch {
    steps = []
  }
  if (!steps.length) {
    steps = Deno.env.get('FOOD_AI_PROVIDER') === 'openai'
      ? [{ provider: 'custom', model: Deno.env.get('FOOD_AI_MODEL') ?? '' }]
      : [GEMINI_MODEL, ...GEMINI_FALLBACKS].map((model) => ({ provider: 'gemini', model }))
  }
  return steps.filter((s) => {
    const p = PROVIDERS[s.provider]
    // Gemini has its own endpoint; the others need an address (built in, or FOOD_AI_BASE_URL for "custom").
    return p && s.model && Deno.env.get(p.key) && (s.provider === 'gemini' || p.base || (p.baseEnv && Deno.env.get(p.baseEnv)))
  })
}

const DAILY_LIMIT = Number(Deno.env.get('FOOD_AI_DAILY_LIMIT') ?? 25)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
// A model that does not answer in time counts as busy: the next one in the order gets the photo.
const STEP_TIMEOUT_MS = Number(Deno.env.get('FOOD_AI_STEP_TIMEOUT_MS') ?? 30_000)

type Mode = 'plate' | 'label' | 'text'
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

const plateSchema: Schema = {
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
}

const SCHEMAS: Record<Mode, Schema> = {
  text: plateSchema,
  plate: plateSchema,
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

/** A meal described in words (usually dictated, so it may contain transcription mistakes). */
function textPrompt(language: string, goal: string, meal: string, text: string): string {
  return [
    'You are a careful nutritionist. A beginner who wants to ' + (GOAL_TEXT[goal] ?? GOAL_TEXT.maintain) +
      ' describes in words what they ate. The words come from speech recognition and may contain small mistakes.',
    `The meal is: ${meal}.`,
    `Their words: "${text}".`,
    'List every food they mention with its nutrients. Use the quantity they say (grams, pieces, spoons, plates);',
    'when they give none, use a typical Italian home portion. Use standard nutrition tables.',
    'Mark ultra_processed true if most of the calories come from ultra-processed products.',
    'If the words do not describe food, set is_food false and return an empty items list.',
    `Write "title", item names and "tip" in ${language}.`,
    '"tip" is one short, friendly, practical suggestion (max 25 words) to make this meal better for the goal.',
  ].join('\n')
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
  /** Empty for a meal described in words. */
  image: string
  mime: string
}

/** Busy, rate-limited or out of quota: worth trying the next model. */
class Busy extends Error {}

async function askGemini(model: string, { prompt, schema, image, mime }: Ask): Promise<unknown> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')! },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: image ? [{ text: prompt }, { inlineData: { mimeType: mime, data: image } }] : [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    }),
  })
  if (res.status === 503 || res.status === 429) throw new Busy(`gemini ${model} ${res.status}`)
  if (!res.ok) throw new Error(`gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  return JSON.parse(text ?? '')
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

async function askOpenAiCompatible(step: Step, { prompt, schema, image, mime }: Ask): Promise<unknown> {
  const p = PROVIDERS[step.provider]
  const base = (p.base ?? Deno.env.get(p.baseEnv!)!).replace(/\/$/, '')
  const messages = [
    { role: 'system', content: `${prompt}\nAnswer with one JSON object only, matching this JSON Schema:\n${JSON.stringify(jsonSchema(schema))}` },
    { role: 'user', content: image ? [{ type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } }] : 'Estimate the meal described above.' },
  ]
  const post = (jsonMode: boolean) =>
    fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get(p.key)}`,
        // OpenRouter shows these in its dashboard; other providers ignore them.
        'HTTP-Referer': 'https://github.com/gabripo/forza',
        'X-Title': 'Forza!',
      },
      body: JSON.stringify({ model: step.model, temperature: 0.2, messages, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }),
    })
  let res = await post(true)
  // Some models refuse JSON mode: ask again without it (the prompt still asks for JSON).
  if (res.status === 400) res = await post(false)
  if (res.status === 503 || res.status === 429 || res.status === 402) throw new Busy(`${step.provider} ${step.model} ${res.status}`)
  if (!res.ok) throw new Error(`${step.provider} ${step.model} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const text: string = data?.choices?.[0]?.message?.content ?? ''
  // Some models wrap JSON in a code fence even in JSON mode.
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
}

/**
 * Tries the model use order top to bottom. A busy model gets one more try before moving on; any other
 * failure (wrong model name, unreadable answer) moves on at once.
 */
async function ask(ask: Ask, steps: Step[]): Promise<{ answer: unknown; model: string; tried: string[] }> {
  const tried: string[] = []
  for (const [i, step] of steps.entries()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const answer = step.provider === 'gemini' ? await askGemini(step.model, ask) : await askOpenAiCompatible(step, ask)
        return { answer, model: `${step.provider}:${step.model}`, tried }
      } catch (err) {
        const e = (err as Error).name === 'TimeoutError' ? new Busy(`no answer in ${STEP_TIMEOUT_MS / 1000} s`) : (err as Error)
        tried.push(`${step.provider}:${step.model} → ${e.message.slice(0, 160)}`)
        console.error('food ai step failed', e.message)
        // Retry a busy model once, only when nothing else is left to try soon.
        if (!(e instanceof Busy) || attempt === 1 || i < steps.length - 1) break
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  }
  throw Object.assign(new Error('all models failed'), { tried })
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
  const steps = chain()
  if (!steps.length) return json({ error: 'not_configured' }, 503)

  const admin = adminClient()
  const coachTest = isServiceKey((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''))
  const userId = coachTest ? null : await userIdFromRequest(req, admin)
  if (!coachTest && !userId) return json({ error: 'unauthorized' }, 401)

  let body: { image?: string; mime?: string; note?: string; text?: string; locale?: string; goal?: string; meal?: string; mode?: string; only?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const mode: Mode = body.mode === 'label' ? 'label' : body.mode === 'text' ? 'text' : 'plate'
  const text = (body.text ?? '').trim().slice(0, 500)
  const image = mode === 'text' ? '' : body.image ?? ''
  const mime = body.mime ?? 'image/jpeg'
  if (mode === 'text' ? !text : !image || image.length * 0.75 > MAX_IMAGE_BYTES || !/^image\/(jpeg|png|webp)$/.test(mime)) {
    return json({ error: mode === 'text' ? 'bad_request' : 'bad_image' }, 400)
  }

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
    : mode === 'text'
      ? textPrompt(language, body.goal ?? 'maintain', body.meal ?? 'a meal', text)
      : platePrompt(language, body.goal ?? 'maintain', body.meal ?? 'a meal', (body.note ?? '').slice(0, 300))
  const started = Date.now()
  // Coach can test one entry of the order on its own.
  const use = coachTest && Number.isInteger(body.only) ? steps.slice(Number(body.only), Number(body.only) + 1) : steps
  try {
    const { answer, model, tried } = await ask({ prompt, schema: SCHEMAS[mode], image, mime }, use)
    const result = mode === 'label' ? cleanLabel(answer as Record<string, unknown>) : cleanPlate(answer as Record<string, unknown>)
    return json(coachTest ? { ...result, model, ms: Date.now() - started, tried } : result)
  } catch (e) {
    const tried = (e as { tried?: string[] }).tried ?? []
    return json(coachTest ? { error: 'ai_failed', detail: tried.join('\n') || (e as Error).message } : { error: 'ai_failed' }, 502)
  }
})
