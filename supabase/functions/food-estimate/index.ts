// Estimates calories and macronutrients from a photo: a plate of food, or a nutrition facts label; also a meal
// described in words, a voice note turned into words (Gemini only), and dictated words tidied into a list.
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
  return available(steps)
}

/** The models of an order whose provider has a key (and an address). */
function available(steps: Step[]): Step[] {
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

type Mode = 'plate' | 'label' | 'text' | 'transcribe' | 'tidy' | 'lesson'
type Schema = Record<string, unknown>

const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const

const itemSchema: Schema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    grams: { type: 'NUMBER' },
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, { type: 'NUMBER' }])),
    salt_g: { type: 'NUMBER' },
    satfat_g: { type: 'NUMBER' },
  },
  required: ['name', 'grams', ...NUTRIENTS, 'salt_g', 'satfat_g'],
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

const wordsSchema: Schema = { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] }

const both: Schema = { type: 'OBJECT', properties: { en: { type: 'STRING' }, it: { type: 'STRING' } }, required: ['en', 'it'] }
const list = (items: Schema): Schema => ({ type: 'ARRAY', items })
const titled: Schema = { type: 'OBJECT', properties: { emoji: { type: 'STRING' }, title: both, text: both }, required: ['emoji', 'title', 'text'] }

/** A draft lesson for the family coach (Forza! Coach only), in the shapes the app draws. */
const lessonSchema: Schema = {
  type: 'OBJECT',
  properties: {
    emoji: { type: 'STRING' },
    tone: { type: 'STRING', enum: ['orange', 'green', 'blue', 'yellow', 'pink', 'purple'] },
    title: both,
    subtitle: both,
    intro: both,
    cards: list(titled),
    steps_title: both,
    steps: list({ type: 'OBJECT', properties: { title: both, text: both }, required: ['title', 'text'] }),
    dos: list(both),
    donts: list(both),
    callout: both,
    quiz: list({ type: 'OBJECT', properties: { q: both, options: list(both), answer: { type: 'INTEGER' }, why: both }, required: ['q', 'options', 'answer', 'why'] }),
    sources: list({ type: 'STRING' }),
    tips: list(both),
  },
  required: ['emoji', 'tone', 'title', 'subtitle', 'intro', 'cards', 'steps_title', 'steps', 'dos', 'donts', 'callout', 'quiz', 'sources', 'tips'],
}

const SCHEMAS: Record<Mode, Schema> = {
  lesson: lessonSchema,
  transcribe: wordsSchema,
  tidy: wordsSchema,
  text: plateSchema,
  plate: plateSchema,
  label: {
    type: 'OBJECT',
    properties: {
      is_label: { type: 'BOOLEAN' },
      name: { type: 'STRING' },
      brand: { type: 'STRING' },
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, { type: 'NUMBER' }])),
      salt_g: { type: 'NUMBER' },
      satfat_g: { type: 'NUMBER' },
      serving_g: { type: 'NUMBER' },
    },
    required: ['is_label', 'name', 'brand', ...NUTRIENTS, 'salt_g', 'satfat_g', 'serving_g'],
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
    'salt_g is the salt in grams in that portion (sodium × 2.5), including the salt usually added when cooking it at home.',
    'satfat_g is the saturated fat in grams in that portion (part of fat_g).',
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
    'salt_g is the salt in grams in that portion (sodium × 2.5), including the salt usually added when cooking it at home.',
    'satfat_g is the saturated fat in grams in that portion (part of fat_g).',
    'Mark ultra_processed true if most of the calories come from ultra-processed products.',
    'If the words do not describe food, set is_food false and return an empty items list.',
    `Write "title", item names and "tip" in ${language}.`,
    '"tip" is one short, friendly, practical suggestion (max 25 words) to make this meal better for the goal.',
  ].join('\n')
}

/** A voice note about a meal, written down word for word. */
function transcribePrompt(language: string): string {
  return [
    `Write down exactly what is said in this voice note, in ${language}. It describes food and drinks someone had.`,
    'Write numbers as digits (2 eggs, 80 g). No comments, no translation: only the words said, in "text".',
    'If nothing is said, return an empty "text".',
  ].join('\n')
}

/** Dictated words (with speech recognition mistakes) as a clean list, ready for the food parser. */
function tidyPrompt(language: string, text: string): string {
  return [
    'Someone dictated what they ate; speech recognition may have made mistakes, repeated words or joined foods.',
    `Their words: "${text}".`,
    `Rewrite them in ${language} as a clean list in "text": one food or drink per line, each with the amount they said`,
    '(grams, pieces, spoons, a plate), digits for numbers, everyday food names, and fix obvious recognition mistakes.',
    'Do not add foods or amounts they did not say, and do not add calories or comments. Same language as their words.',
  ].join('\n')
}

/** A short lesson on a topic, for beginners over 50, in English and Italian; references only from the known list. */
function lessonPrompt(topic: string, sources: { id: string; title: string }[]): string {
  return [
    'You write short, friendly, evidence-based lessons for Forza!, a fitness and nutrition app for beginners, many over 50.',
    `Topic chosen by the family coach: "${topic}".`,
    'Write one lesson that a beginner reads in two minutes, in English AND Italian (natural Italian, not a word-for-word translation).',
    'Italian must be gender-neutral when addressing the reader: avoid gendered adjectives and participles about "you" (write "Hai fatto bene" style only when neutral; prefer "conviene", "è utile", infinitives, imperatives).',
    'Give: an emoji and a tone; title (max 6 words); subtitle (max 10 words); intro (2 sentences); 3 or 4 cards (emoji, title of 1–3 words, one sentence);',
    'steps_title and 3–5 practical steps (short title, one sentence); 3 dos and 3 don\'ts (short); one callout sentence to remember;',
    'a quiz of exactly 2 questions with 2 or 3 options each, "answer" the index of the right option (0 = first), and "why" explaining it in one sentence;',
    'and 3 tips of the day on the same topic (one sentence each, concrete).',
    'Stay with what guidelines and good studies support; no medical advice, no supplements unless well established, no numbers you are not sure of.',
    'For "sources", choose up to 4 ids from this list that really support the lesson, or none; never invent one:',
    ...sources.map((x) => `- ${x.id}: ${x.title}`),
  ].join('\n')
}

function labelPrompt(language: string): string {
  return [
    'The photo shows the nutrition facts table of a packaged food (any language, any country).',
    'Copy the values PER 100 g (or per 100 ml for drinks): energy in kcal (convert from kJ by dividing by 4.184 if only kJ is given),',
    'protein, carbohydrates, fat, saturated fat (satfat_g), fibre, sugars and salt in grams (salt = sodium × 2.5 when only sodium is printed). Use 0 for a value that is not printed.',
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
  /** A photo or a voice note, base64; empty for words. */
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
    { role: 'user', content: image ? [{ type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } }] : 'Answer for the words above.' },
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
      salt_g: num(i.salt_g, 50),
      satfat_g: Math.min(num(i.satfat_g, 300), num(i.fat_g, 500)),
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
    salt_g: num(a.salt_g, 100),
    satfat_g: Math.min(num(a.satfat_g, 100), num(a.fat_g, 100)),
    serving_g: num(a.serving_g, 2000),
  }
}

// ---------------------------------------------------------------------------
// "What should I order?" A restaurant menu (a photo, or written or dictated) is read by a quick, low-cost model
// into a list of dishes with rough values; a stronger model then picks the best dish for this person today, from
// what they already ate and their targets, and says why in everyday words.
// ---------------------------------------------------------------------------

const LIGHT = /lite|mini|8b|small|flash-8/i

/** The quick, low-cost models first (for reading and sorting), then the rest of the usual order. */
function quickChain(): Step[] {
  const c = chain()
  return [...c.filter((s) => LIGHT.test(s.model)), ...c.filter((s) => !LIGHT.test(s.model))]
}

/** The stronger models for choosing and explaining (FOOD_AI_REASONING_ORDER, like FOOD_AI_ORDER), then the usual order. */
function reasoningChain(): Step[] {
  let first: Step[] = []
  try {
    first = (JSON.parse(Deno.env.get('FOOD_AI_REASONING_ORDER') ?? '[]') as string[]).map((x) => {
      const i = String(x).indexOf(':')
      return { provider: String(x).slice(0, i), model: String(x).slice(i + 1) }
    })
  } catch {
    first = []
  }
  if (!first.length) first = [{ provider: 'gemini', model: Deno.env.get('GEMINI_REASONING_MODEL') ?? 'gemini-3.6-pro' }]
  const strong = available(first)
  const usual = chain().filter((s) => !LIGHT.test(s.model))
  return [...strong, ...usual.filter((s) => !strong.some((f) => f.provider === s.provider && f.model === s.model)), ...chain().filter((s) => LIGHT.test(s.model))]
}

const dishSchema: Schema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    description: { type: 'STRING' },
    portion_g: { type: 'NUMBER' },
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, { type: 'NUMBER' }])),
    satfat_g: { type: 'NUMBER' },
  },
  required: ['name', 'description', 'portion_g', ...NUTRIENTS, 'satfat_g'],
}
const menuReadSchema: Schema = { type: 'OBJECT', properties: { is_menu: { type: 'BOOLEAN' }, dishes: list(dishSchema) }, required: ['is_menu', 'dishes'] }
const menuPickSchema: Schema = {
  type: 'OBJECT',
  properties: {
    choice: { type: 'INTEGER' },
    why: { type: 'STRING' },
    tweak: { type: 'STRING' },
    also: list({ type: 'OBJECT', properties: { dish: { type: 'INTEGER' }, why: { type: 'STRING' } }, required: ['dish', 'why'] }),
    rather_not: list({ type: 'OBJECT', properties: { dish: { type: 'INTEGER' }, why: { type: 'STRING' } }, required: ['dish', 'why'] }),
  },
  required: ['choice', 'why', 'tweak', 'also', 'rather_not'],
}

function menuReadPrompt(language: string, text: string): string {
  return [
    'Read this restaurant menu' + (text ? ' (written or dictated by a person; it may contain small mistakes)' : ' (a photo)') + '.',
    text ? `The menu: """${text}"""` : '',
    'List every dish or drink someone could order (skip section titles, prices and notes), at most 40.',
    'For each: its name as written, a short description (main ingredients), a typical restaurant portion in grams,',
    'and the nutrients of that portion (standard tables; restaurant cooking uses more oil and salt than home).',
    'satfat_g is the saturated fat in grams (part of fat_g).',
    'If this is not a menu or a list of dishes, set is_menu false and return no dishes.',
    `Write descriptions in ${language}; keep dish names as on the menu.`,
  ].filter(Boolean).join('\n')
}

interface MenuBody {
  goal?: string
  meal?: string
  locale?: string
  hour?: number
  eaten?: string[]
  day?: Record<string, number>
  targets?: Record<string, number>
}

function menuPickPrompt(language: string, b: MenuBody, dishes: Record<string, unknown>[]): string {
  const d = b.day ?? {}
  const tg = b.targets ?? {}
  const r = (k: string) => Math.round(Number(d[k] ?? 0))
  const lines = dishes.map((x, i) => `${i}. ${x.name} — ${x.description} (≈${x.portion_g} g: ${x.kcal} kcal, protein ${x.protein_g} g, carbs ${x.carbs_g} g, fat ${x.fat_g} g of which saturated ${x.satfat_g} g, fibre ${x.fiber_g} g)`)
  return [
    'You help a person choose what to order at a restaurant, so their day ends close to their targets.',
    `Their goal: ${GOAL_TEXT[b.goal ?? 'maintain'] ?? GOAL_TEXT.maintain}. This is their ${b.meal ?? 'meal'}, at about ${Math.round(Number(b.hour ?? 13))}:00.`,
    `Their daily targets: ${tg.kcal} kcal, protein ${tg.protein_g} g, carbs ${tg.carbs_g} g, fat ${tg.fat_g} g, fibre ${tg.fiber_g} g, saturated fat at most ${tg.satfat_g} g.`,
    (b.eaten ?? []).length
      ? `Already eaten today: ${(b.eaten ?? []).slice(0, 12).join('; ')} — together ${r('kcal')} kcal, protein ${r('protein_g')} g, carbs ${r('carbs_g')} g, fat ${r('fat_g')} g, fibre ${r('fiber_g')} g, saturated fat ${r('satfat_g')} g.`
      : 'Nothing else eaten yet today.',
    'The menu (number. dish — description, rough values):',
    ...lines,
    'Pick the ONE dish (by its number) that best fits what is left of their day: enough protein, vegetables or fibre,',
    'calories that fit, not too much saturated fat. Prefer real, filling food; a sensible side may be suggested in "tweak".',
    '"why": 2 or 3 short sentences anyone understands (no nutrition jargon, no grams, at most one number for calories),',
    'linking the choice to what they ate today (e.g. "this morning was light on protein"). Warm and encouraging, never shaming.',
    '"tweak": one small, practical request to make the dish even better (e.g. "ask for the dressing on the side"), or "".',
    '"also": up to 2 other good dishes, each with a short reason. "rather_not": up to 2 dishes that fit worse today, each with a kind, short reason.',
    `Write everything in ${language}.`,
  ].join('\n')
}

async function menuPick(b: MenuBody & { image?: string; mime?: string; text?: string }, coachTest: boolean) {
  const language = b.locale === 'it' ? 'Italian' : 'English'
  const text = String(b.text ?? '').trim().slice(0, 4000)
  const image = text ? '' : String(b.image ?? '')
  const mime = String(b.mime ?? 'image/jpeg').split(';')[0].trim()
  if (!text && (!image || image.length * 0.75 > MAX_IMAGE_BYTES || !/^image\/(jpeg|png|webp)$/.test(mime))) return json({ error: 'bad_request' }, 400)
  const started = Date.now()
  try {
    // 1. Read the menu: the quick model.
    const read = await ask({ prompt: menuReadPrompt(language, text), schema: menuReadSchema, image, mime }, quickChain())
    const r = read.answer as Record<string, unknown>
    const dishes = (Array.isArray(r.dishes) ? r.dishes : []).slice(0, 40).map((x: Record<string, unknown>) => ({
      name: str(x.name),
      description: str(x.description, 160),
      portion_g: num(x.portion_g, 3000),
      ...Object.fromEntries(NUTRIENTS.map((k) => [k, num(x[k], k === 'kcal' ? 5000 : 500)])),
      satfat_g: Math.min(num(x.satfat_g, 300), num(x.fat_g, 500)),
    })).filter((x) => x.name)
    if (r.is_menu === false || !dishes.length) return json({ error: 'not_a_menu' }, 422)
    // 2. Choose and explain: the stronger model, with the person's day.
    const pick = await ask({ prompt: menuPickPrompt(language, b, dishes), schema: menuPickSchema, image: '', mime: 'text/plain' }, reasoningChain())
    const a = pick.answer as Record<string, unknown>
    const at = (i: unknown) => (Number.isInteger(Number(i)) && Number(i) >= 0 && Number(i) < dishes.length ? Number(i) : -1)
    const choice = at(a.choice) >= 0 ? at(a.choice) : 0
    const others = (k: string) =>
      (Array.isArray(a[k]) ? a[k] : [])
        .map((x: Record<string, unknown>) => ({ dish: at(x.dish), why: str(x.why, 240) }))
        .filter((x) => x.dish >= 0 && x.dish !== choice)
        .slice(0, 2)
    const result = { dishes, choice, why: str(a.why, 500), tweak: str(a.tweak, 200), also: others('also'), rather_not: others('rather_not') }
    return json(coachTest ? { ...result, models: [read.model, pick.model], ms: Date.now() - started, tried: [...read.tried, ...pick.tried] } : result)
  } catch (e) {
    const tried = (e as { tried?: string[] }).tried ?? []
    return json(coachTest ? { error: 'ai_failed', detail: tried.join('\n') || (e as Error).message } : { error: 'ai_failed' }, 502)
  }
}

// ---------------------------------------------------------------------------
// Exercises from the free exercise database (github.com/yuhonas/free-exercise-db, public domain: 870+ exercises
// with photos), found from a description in everyday words ("I raise a knee and touch it with the opposite elbow").
// ---------------------------------------------------------------------------

const EXERCISE_DB = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
interface DbExercise {
  id: string
  name: string
  category: string
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  images: string[]
  level: string
}
let exerciseIndex: DbExercise[] | null = null

async function exercises(): Promise<DbExercise[]> {
  if (exerciseIndex) return exerciseIndex
  const res = await fetch(`${EXERCISE_DB}/dist/exercises.json`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`exercise database ${res.status}`)
  exerciseIndex = (await res.json()) as DbExercise[]
  return exerciseIndex
}

// The app's own names for muscles and equipment.
const MUSCLES: Record<string, string> = {
  abdominals: 'abs', abductors: 'abductors', adductors: 'adductors', biceps: 'biceps', calves: 'calves', chest: 'chest', forearms: 'forearms',
  glutes: 'glutes', hamstrings: 'hamstrings', lats: 'lats', 'lower back': 'lower_back', 'middle back': 'back', neck: 'traps', quadriceps: 'quads',
  shoulders: 'shoulders', traps: 'traps', triceps: 'triceps',
}
const equipmentOf = (e: string | null) =>
  !e || e === 'body only' ? 'bodyweight' : e === 'dumbbell' ? 'dumbbell' : e === 'barbell' || e === 'e-z curl bar' ? 'barbell' : e === 'cable' ? 'cable' : e === 'machine' ? 'machine' : 'other'
const photos = (x: DbExercise) => x.images.slice(0, 2).map((p) => `${EXERCISE_DB}/exercises/${p}`)

const exerciseFindSchema: Schema = {
  type: 'OBJECT',
  properties: { matches: list({ type: 'OBJECT', properties: { id: { type: 'STRING' }, name_it: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['id', 'name_it', 'why'] }) },
  required: ['matches'],
}
const exerciseAddSchema: Schema = {
  type: 'OBJECT',
  properties: {
    name_it: { type: 'STRING' },
    kind: { type: 'STRING', enum: ['reps', 'bodyweight', 'time', 'cardio'] },
    steps_en: list({ type: 'STRING' }),
    steps_it: list({ type: 'STRING' }),
  },
  required: ['name_it', 'kind', 'steps_en', 'steps_it'],
}

async function exerciseSearch(b: { query?: string; locale?: string }, coachTest: boolean) {
  const query = String(b.query ?? '').trim().slice(0, 300)
  if (query.length < 3) return json({ error: 'bad_request' }, 400)
  const language = b.locale === 'it' ? 'Italian' : 'English'
  try {
    const all = await exercises()
    const lines = all.map((x) => `${x.id} | ${x.name} | ${x.category} | ${x.equipment ?? 'none'} | ${x.primaryMuscles.join(', ')}`)
    const prompt = [
      'A person describes an exercise in their own words (any language); find it in this list of exercises.',
      `Their words: "${query}".`,
      'Think about the movement they describe (what moves, what touches what, standing or lying, with or without equipment),',
      'not only the words. Return up to 5 ids from the list, best match first; fewer if few fit.',
      `"why": one short sentence in ${language} on how it matches. "name_it": the usual Italian name of the exercise (gym Italian, English terms are fine where Italians use them).`,
      'The list (id | name | category | equipment | main muscles):',
      ...lines,
    ].join('\n')
    const { answer, model, tried } = await ask({ prompt, schema: exerciseFindSchema, image: '', mime: 'text/plain' }, quickChain())
    const found = ((answer as { matches?: { id: string; name_it: string; why: string }[] }).matches ?? [])
      .map((m) => ({ m, x: all.find((x) => x.id === m.id) }))
      .filter((p): p is { m: { id: string; name_it: string; why: string }; x: DbExercise } => Boolean(p.x))
      .slice(0, 5)
      .map(({ m, x }) => ({
        id: x.id,
        name_en: x.name,
        name_it: str(m.name_it) || x.name,
        why: str(m.why, 240),
        equipment: equipmentOf(x.equipment),
        muscles: [...new Set(x.primaryMuscles.map((k) => MUSCLES[k]).filter(Boolean))],
        images: photos(x),
        instructions: x.instructions.slice(0, 6),
      }))
    return json(coachTest ? { matches: found, model, tried } : { matches: found })
  } catch (e) {
    const tried = (e as { tried?: string[] }).tried ?? []
    return json(coachTest ? { error: 'ai_failed', detail: tried.join('\n') || (e as Error).message } : { error: 'ai_failed' }, 502)
  }
}

/**
 * One exercise of the database made ready for the app: short steps in English and Italian, its kind, and its
 * photos copied into the project's own storage (shown as an animation, like the built-in exercises).
 */
async function exerciseAdd(b: { id?: string }, admin: ReturnType<typeof adminClient>, coachTest: boolean) {
  try {
    const x = (await exercises()).find((e) => e.id === String(b.id ?? ''))
    if (!x) return json({ error: 'not_found' }, 404)
    const prompt = [
      `Exercise: ${x.name} (${x.category}, equipment: ${x.equipment ?? 'none'}).`,
      'Its instructions:',
      ...x.instructions.map((s, i) => `${i + 1}. ${s}`),
      'Rewrite them as 3 short, clear steps for a beginner (max 20 words each), in English (steps_en) and in Italian',
      '(steps_it, natural gym Italian, addressing the person informally and in a gender-neutral way).',
      '"name_it": the usual Italian name. "kind": reps (with weights), bodyweight (reps without weights), time (held or timed, like a plank or a stretch) or cardio.',
    ].join('\n')
    const { answer } = await ask({ prompt, schema: exerciseAddSchema, image: '', mime: 'text/plain' }, quickChain())
    const a = answer as { name_it?: string; kind?: string; steps_en?: string[]; steps_it?: string[] }
    const urls: string[] = []
    for (const [i, src] of photos(x).entries()) {
      const img = await fetch(src, { signal: AbortSignal.timeout(15_000) })
      if (!img.ok) continue
      const path = `library/${x.id}/${i}.jpg`
      const { error } = await admin.storage.from('exercise-media').upload(path, await img.arrayBuffer(), { contentType: 'image/jpeg', upsert: true })
      if (!error) urls.push(admin.storage.from('exercise-media').getPublicUrl(path).data.publicUrl)
    }
    const steps = (v: unknown) => (Array.isArray(v) ? v : []).map((s) => str(s, 200)).filter(Boolean).slice(0, 5)
    return json({
      source_id: x.id,
      name_en: x.name,
      name_it: str(a.name_it) || x.name,
      kind: ['reps', 'bodyweight', 'time', 'cardio'].includes(String(a.kind)) ? a.kind : equipmentOf(x.equipment) === 'bodyweight' ? 'bodyweight' : 'reps',
      equipment: equipmentOf(x.equipment),
      muscles: [...new Set(x.primaryMuscles.map((k) => MUSCLES[k]).filter(Boolean))],
      steps_en: steps(a.steps_en).length ? steps(a.steps_en) : x.instructions.slice(0, 4),
      steps_it: steps(a.steps_it),
      image_urls: urls.length ? urls : photos(x),
    })
  } catch (e) {
    const tried = (e as { tried?: string[] }).tried ?? []
    return json(coachTest ? { error: 'ai_failed', detail: tried.join('\n') || (e as Error).message } : { error: 'ai_failed' }, 502)
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

  let body: { image?: string; audio?: string; mime?: string; note?: string; text?: string; locale?: string; goal?: string; meal?: string; mode?: string; only?: number; topic?: string; sources?: { id: string; title: string }[] } & MenuBody & { query?: string; id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  // The menu, the exercise search and adding an exercise: each counts as one use of the day.
  if (body.mode === 'menu' || body.mode === 'exercise' || body.mode === 'exercise_add') {
    if (userId) {
      const { error: limitError } = await admin.rpc('bump_ai_usage', { p_user: userId, p_limit: DAILY_LIMIT })
      if (limitError) {
        const reached = limitError.message.includes('daily_limit_reached')
        return json({ error: reached ? 'daily_limit_reached' : 'usage_error' }, reached ? 429 : 500)
      }
    }
    return body.mode === 'menu' ? menuPick(body, coachTest) : body.mode === 'exercise' ? exerciseSearch(body, coachTest) : exerciseAdd(body, admin, coachTest)
  }
  const mode: Mode = (['label', 'text', 'transcribe', 'tidy', 'lesson'] as const).find((m) => m === body.mode) ?? 'plate'
  // Lessons are drafted for the family coach only (Forza! Coach, with the project's secret key).
  if (mode === 'lesson' && !coachTest) return json({ error: 'unauthorized' }, 401)
  const topic = (body.topic ?? '').trim().slice(0, 120)
  if (mode === 'lesson' && !topic) return json({ error: 'bad_request' }, 400)
  const words = mode === 'text' || mode === 'tidy' || mode === 'lesson'
  // A recipe's ingredients can be long; a meal said in words is short.
  const text = (body.text ?? '').trim().slice(0, mode === 'tidy' ? 1000 : 1500)
  const image = words ? '' : mode === 'transcribe' ? (body.audio ?? '') : (body.image ?? '')
  // "audio/webm;codecs=opus" → "audio/webm"
  const mime = (body.mime ?? 'image/jpeg').split(';')[0].trim()
  if (words ? !text && mode !== 'lesson' : !image || image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: words ? 'bad_request' : 'bad_image' }, 400)
  if (mode === 'transcribe' ? !/^audio\/(webm|ogg|mp4|mpeg|wav|aac|flac|x-m4a)$/.test(mime) : !words && !/^image\/(jpeg|png|webp)$/.test(mime)) {
    return json({ error: 'bad_image' }, 400)
  }
  // Only Gemini listens to audio: the other services in the order are skipped for a voice note.
  const usable = mode === 'transcribe' ? steps.filter((s) => s.provider === 'gemini') : steps
  if (!usable.length) return json({ error: 'not_configured' }, 503)

  if (userId) {
    const { error: limitError } = await admin.rpc('bump_ai_usage', { p_user: userId, p_limit: DAILY_LIMIT })
    if (limitError) {
      const reached = limitError.message.includes('daily_limit_reached')
      return json({ error: reached ? 'daily_limit_reached' : 'usage_error' }, reached ? 429 : 500)
    }
  }

  const language = body.locale === 'it' ? 'Italian' : 'English'
  const known = (Array.isArray(body.sources) ? body.sources : []).slice(0, 80).map((x) => ({ id: String(x.id).slice(0, 40), title: String(x.title).slice(0, 160) }))
  const prompt = mode === 'lesson'
    ? lessonPrompt(topic, known)
    : mode === 'label'
    ? labelPrompt(language)
    : mode === 'transcribe'
      ? transcribePrompt(language)
      : mode === 'tidy'
        ? tidyPrompt(language, text)
        : mode === 'text'
          ? textPrompt(language, body.goal ?? 'maintain', body.meal ?? 'a meal', text)
          : platePrompt(language, body.goal ?? 'maintain', body.meal ?? 'a meal', (body.note ?? '').slice(0, 300))
  const started = Date.now()
  // Coach can test one entry of the order on its own.
  const use = coachTest && Number.isInteger(body.only) ? usable.slice(Number(body.only), Number(body.only) + 1) : usable
  try {
    const { answer, model, tried } = await ask({ prompt, schema: SCHEMAS[mode], image, mime }, use)
    const a = answer as Record<string, unknown>
    const result = mode === 'lesson'
      ? { ...a, sources: (Array.isArray(a.sources) ? a.sources : []).filter((id) => known.some((k) => k.id === id)) }
      : mode === 'label' ? cleanLabel(a) : mode === 'transcribe' || mode === 'tidy' ? { text: str(a.text, 1000) } : cleanPlate(a)
    return json(coachTest ? { ...result, model, ms: Date.now() - started, tried } : result)
  } catch (e) {
    const tried = (e as { tried?: string[] }).tried ?? []
    return json(coachTest ? { error: 'ai_failed', detail: tried.join('\n') || (e as Error).message } : { error: 'ai_failed' }, 502)
  }
})
