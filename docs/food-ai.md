# Food photo AI: test results and alternatives

Forza! estimates meals from a photo, and reads nutrition labels of products that are not in the
barcode database, with a vision AI called by the `food-estimate` Edge Function. This page records how the
default set-up performed on well-known foods and which free or low-cost services can replace it.

## Test with well-known foods (29 October 2026)

Set-up: Forza!'s deployed `food-estimate` function, `gemini-3.6-flash` with `gemini-3.5-flash-lite` as
fallback, called from Forza! Coach (*Setup → Food photo AI → Test*) with 1024-pixel photos from
Wikimedia Commons. References: USDA FoodData Central typical portions, or typical ranges where a dish
varies.

| Photo | Forza! estimate | Reference | Verdict |
|---|---|---|---|
| [A banana](https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_A_Single_Banana.jpg) | 118 g · **105 kcal** · P 1.3 · C 27 · F 0.3 | medium banana 118 g: 105 kcal, P 1.3, C 27, F 0.4 | exact |
| [A red apple](https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Red_Apple_(Whole_Fruit).jpg) | 180 g · **94 kcal** · C 25.1 | medium apple 182 g: 95 kcal, C 25 | exact |
| [Pizza margherita](https://commons.wikimedia.org/wiki/File:Margherita_pizza_on_plate.jpg) | dough, mozzarella, tomato, oil, basil: 242 g · **595 kcal** · P 25 · C 74 · F 21 | whole margherita: about 650–900 kcal | plausible, on the low side |
| [Spaghetti carbonara](https://commons.wikimedia.org/wiki/File:Spaghetti_alla_Carbonara_2.jpg) | spaghetti 200 g, pancetta, egg and cheese, parmesan: 300 g · **673 kcal** | restaurant portion: about 600–800 kcal | plausible |
| [Fried egg and fries](https://commons.wikimedia.org/wiki/File:Fried_egg_surrounded_by_French_fries_on_a_white_plate.jpg) | fries 150 g 468 kcal + egg 60 g 110 kcal = **578 kcal** | fries 312 kcal/100 g → 468; large fried egg ≈ 90–117 | exact |
| [Chicken Caesar salad](https://commons.wikimedia.org/wiki/File:Caesar-salad.jpg) | chicken 140 g, greens, dressing, croutons, olives: 320 g · **557 kcal** · P 47 | restaurant chicken Caesar: about 400–700 kcal | plausible |
| [US nutrition label](https://commons.wikimedia.org/wiki/File:FDA_Nutrition_Facts_Label_2016.png) (label mode) | per 100 g: **418 kcal** · P 5.5 · C 67.3 · F 14.6 · fibre 7.3 · sugars 21.8 · serving 55 g | label: 230 kcal per 55 g serving → 418 per 100 g | exact (converted per serving → per 100 g) |
| [Chinese nutrition label](https://commons.wikimedia.org/wiki/File:China_nutrition_facts_label.png) (label mode) | per 100 g: **68 kcal** · P 3.1 · C 4.8 · F 3.7 | label in kJ per 100 ml | converted from kJ correctly |

What we learned:

- **Single foods and labels are accurate**; mixed dishes are within the range a nutritionist would give,
  with hidden fats (oil, sauces) the main uncertainty. That is why the app lets people correct the grams,
  and asks for a short description ("1 spoon of oil") when something is hidden.
- **Speed**: 4–14 seconds per photo.
- **Availability**: during the test `gemini-3.6-flash` answered *503: the model is experiencing high
  demand* to five requests in a row. The function now retries once and then falls back to
  `gemini-3.5-flash-lite` (configurable with `GEMINI_FALLBACK_MODELS`); with that change all photos
  succeeded, one of them through the fallback model.

## Free tier limits to keep in mind

Google no longer publishes one table of free limits: they depend on the model and the project, and are
shown in [AI Studio → Rate limit](https://aistudio.google.com/rate-limit). Community reports in 2026 put
the newest Flash models at a few dozen requests per day on the free tier, and Flash-Lite at several
hundred. For a family logging a few meals a day that is usually enough, especially with Flash-Lite as
fallback; Forza! also caps each person at `FOOD_AI_DAILY_LIMIT` photos a day (default 25).

On Google's free tier, submitted content may be used to improve Google's products. Food photos are not
very sensitive, but a family that prefers otherwise can enable billing on the Google project (a meal photo
costs a fraction of a cent) or use another provider.

## Alternatives

The function speaks two dialects: Gemini's, and the OpenAI chat-completions format that most providers
accept. Switching needs only function secrets (`FOOD_AI_PROVIDER=openai`, `FOOD_AI_BASE_URL`,
`FOOD_AI_API_KEY`, `FOOD_AI_MODEL`); the app does not change.

| Service | Free allowance (Oct 2026) | How to use it with Forza! | Notes |
|---|---|---|---|
| **Google Gemini** (default) | free tier, per-model daily limits ([AI Studio](https://aistudio.google.com/rate-limit)) | `GEMINI_API_KEY` | best balance of quality, speed and structured output; free-tier data may be used by Google |
| **OpenRouter** free models (`…:free`, pick one with image input) | 20 requests/min, **50/day**; 1,000/day after buying 10 credits once ([limits](https://openrouter.ai/docs/api-reference/limits)) | `FOOD_AI_BASE_URL=https://openrouter.ai/api/v1` | one key, many models; free models change often |
| **Cloudflare Workers AI** | **10,000 neurons/day** free, then $0.011 per 1,000 ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)); vision model `@cf/meta/llama-3.2-11b-vision-instruct` | OpenAI-compatible endpoint `https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1` | generous, but a smaller model: expect rougher portions |
| **Groq** | free plan with per-model limits (shown in the Groq console) | `FOOD_AI_BASE_URL=https://api.groq.com/openai/v1` | very fast; check which vision models are currently offered |
| **Mistral** | free "Experiment" plan with rate limits | `FOOD_AI_BASE_URL=https://api.mistral.ai/v1`, a vision model | free-plan data may be used for training |
| **OpenAI**, **Anthropic Claude** | no free tier; small models cost well under 1 cent per photo | OpenAI: `https://api.openai.com/v1`; Claude through Anthropic's OpenAI-compatible endpoint | paid, predictable, data not used for training by default |
| **Self-hosted** (Ollama with a vision model) | free, private | needs a public HTTPS address the Edge Function can reach | only for technically minded families with an always-on computer |
| **GitHub Models** | retired on 30 July 2026 | – | no longer an option |
| Specialised food APIs (LogMeal, Passio, Calorie Mama, …) | trials or small freemium quotas; prices on request or from about $49/month | would need a dedicated adapter | built for apps at scale; not worth it for a family |

Only Gemini was measured above; the other rows come from the providers' documentation and should be
checked before switching. Coach's **Test** button works with any provider, so a new set-up can be tried with
the same photos in a minute.

**Recommendation**: keep Gemini with the Flash-Lite fallback (free, accurate enough, already set up). If the
free quota runs out, the cheapest robust step is enabling billing on the same Google project; OpenRouter is
the easiest free second option.
