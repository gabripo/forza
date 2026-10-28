// Estimates calories and macronutrients of a plate from a photo, using Google Gemini.
// The Gemini API key never leaves the server. Each person has a daily limit
// (FOOD_AI_DAILY_LIMIT, default 25) so a shared key cannot be drained.
import { adminClient, corsHeaders, json, userIdFromRequest } from '../_shared/util.ts'

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
const DAILY_LIMIT = Number(Deno.env.get('FOOD_AI_DAILY_LIMIT') ?? 25)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const itemSchema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    grams: { type: 'NUMBER' },
    kcal: { type: 'NUMBER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
    fiber_g: { type: 'NUMBER' },
    sugar_g: { type: 'NUMBER' },
  },
  required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'],
}

const responseSchema = {
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

const GOAL_TEXT: Record<string, string> = {
  fat_loss: 'lose fat while keeping muscle',
  muscle_gain: 'build muscle',
  maintain: 'stay healthy and keep their weight',
}

function buildPrompt(locale: string, goal: string, meal: string, note: string): string {
  const language = locale === 'it' ? 'Italian' : 'English'
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'not_configured' }, 503)

  const admin = adminClient()
  const userId = await userIdFromRequest(req, admin)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { image?: string; mime?: string; note?: string; locale?: string; goal?: string; meal?: string }
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

  const { error: limitError } = await admin.rpc('bump_ai_usage', { p_user: userId, p_limit: DAILY_LIMIT })
  if (limitError) {
    const reached = limitError.message.includes('daily_limit_reached')
    return json({ error: reached ? 'daily_limit_reached' : 'usage_error' }, reached ? 429 : 500)
  }

  const prompt = buildPrompt(body.locale ?? 'en', body.goal ?? 'maintain', body.meal ?? 'a meal', (body.note ?? '').slice(0, 300))
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.2 },
    }),
  })
  if (!res.ok) {
    console.error('gemini error', res.status, await res.text())
    return json({ error: 'ai_failed' }, 502)
  }
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  try {
    return json(JSON.parse(text ?? ''))
  } catch {
    console.error('unparseable gemini answer', text)
    return json({ error: 'ai_failed' }, 502)
  }
})
