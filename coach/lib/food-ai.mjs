// Food photo AI providers, as Forza! Coach shows them in Setup: one key per provider (kept only as
// Supabase function secrets, never on this computer) and a "model use order" tried top to bottom by
// the food-estimate function (FOOD_AI_ORDER).
export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', secret: 'GEMINI_API_KEY', keyUrl: 'https://aistudio.google.com/apikey', note: 'Free tier, no card. Best default.' },
  { id: 'openrouter', name: 'OpenRouter', secret: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/settings/keys', note: 'Free models (…:free): 50 photos a day, 1,000 after buying 10 credits once.' },
  { id: 'groq', name: 'Groq', secret: 'GROQ_API_KEY', keyUrl: 'https://console.groq.com/keys', note: 'Free plan, very fast; check which models accept images.' },
  { id: 'mistral', name: 'Mistral', secret: 'MISTRAL_API_KEY', keyUrl: 'https://console.mistral.ai/api-keys', note: 'Free "Experiment" plan.' },
  { id: 'openai', name: 'OpenAI', secret: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys', note: 'Paid, a fraction of a cent per photo.' },
  { id: 'custom', name: 'Other (OpenAI-compatible)', secret: 'FOOD_AI_API_KEY', base: 'FOOD_AI_BASE_URL', keyUrl: null, note: 'Any service with an OpenAI-style API: give its address too.' },
]

export const DEFAULT_ORDER = [
  { provider: 'gemini', model: 'gemini-3.6-flash' },
  { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
]

const STATIC_MODELS = {
  gemini: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  groq: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
  mistral: ['mistral-small-latest', 'pixtral-12b-2409', 'mistral-medium-latest'],
  openai: ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
  custom: [],
}

/** Model suggestions; for OpenRouter, the live list of models that read images (free ones first). */
export async function modelSuggestions(provider) {
  if (provider !== 'openrouter') return (STATIC_MODELS[provider] ?? []).map((id) => ({ id, free: provider === 'gemini' }))
  const res = await fetch('https://openrouter.ai/api/v1/models')
  if (!res.ok) return []
  const { data } = await res.json()
  return data
    .filter((m) => m.architecture?.input_modalities?.includes('image') && (m.architecture?.output_modalities ?? ['text']).includes('text'))
    .map((m) => ({ id: m.id, name: m.name, free: m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0') }))
    .sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id))
}

export const orderSecret = (order) => JSON.stringify(order.map((s) => `${s.provider}:${s.model}`))
