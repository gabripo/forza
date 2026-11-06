// A recipe's preparation, step by step. Each step says what to do and, for the kinds that have them, its settings:
// baking brings a time, a temperature and the oven's mode; the hob its heat; the Thermomix its time, temperature
// and speed. Steps written as words (by the food AI, or on a recipe page) are read into the same shape.

export type StepKind = 'mix' | 'bake' | 'hob' | 'boil' | 'fry' | 'thermomix' | 'rest' | 'fridge' | 'other'
export type OvenMode = 'static' | 'fan' | 'grill' | 'fan_grill'
export type Heat = 'low' | 'medium' | 'high'

export interface RecipeStep {
  kind: StepKind
  /** What to do, in the person's words ("mix the eggs with the sugar"). */
  text: string
  minutes?: number | null
  /** Thermomix times are often seconds ("10 sec / speed 5"). */
  seconds?: number | null
  temp_c?: number | null
  oven?: OvenMode | null
  preheat?: boolean
  heat?: Heat | null
  /** Thermomix speed: "1"…"10", "spoon" (the slowest) or "turbo". */
  speed?: string | null
  /** Thermomix: the blades turning backwards, to stir without chopping. */
  reverse?: boolean
}

export const STEP_KINDS: StepKind[] = ['mix', 'bake', 'hob', 'boil', 'fry', 'thermomix', 'rest', 'fridge', 'other']
export const OVEN_MODES: OvenMode[] = ['static', 'fan', 'grill', 'fan_grill']
export const HEATS: Heat[] = ['low', 'medium', 'high']
export const SPEEDS = ['spoon', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'turbo']

export const STEP_EMOJI: Record<StepKind, string> = { mix: '🥣', bake: '🔥', hob: '🍳', boil: '🍲', fry: '🥘', thermomix: '🌀', rest: '⏳', fridge: '❄️', other: '✏️' }

/** A new step of a kind, with the settings it usually has: baking at 180 °C, conventional oven, 30 minutes. */
export function newStep(kind: StepKind, text = ''): RecipeStep {
  switch (kind) {
    case 'bake':
      return { kind, text, minutes: 30, temp_c: 180, oven: 'static', preheat: true }
    case 'hob':
      return { kind, text, minutes: 10, heat: 'medium' }
    case 'boil':
      return { kind, text, minutes: 10 }
    case 'fry':
      return { kind, text, minutes: 5, temp_c: 170 }
    case 'thermomix':
      return { kind, text, minutes: 1, seconds: null, temp_c: null, speed: '1', reverse: false }
    case 'rest':
      return { kind, text, minutes: 30 }
    case 'fridge':
      return { kind, text, minutes: 60 }
    default:
      return { kind, text }
  }
}

/** Another kind for a step: its words stay, the settings become the new kind's. */
export const withKind = (s: RecipeStep, kind: StepKind): RecipeStep => (s.kind === kind ? s : newStep(kind, s.text))

/** "1 h 30 min", "45 min", "10 sec", "1 min 30 sec". */
export function duration(minutes?: number | null, seconds?: number | null): string | null {
  const total = Math.round((minutes ?? 0) * 60 + (seconds ?? 0))
  if (total <= 0) return null
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h ? `${h} h` : '', m ? `${m} min` : '', s ? `${s} sec` : ''].filter(Boolean).join(' ')
}

type Words = (key: string, vars?: Record<string, string | number>) => string

/** The step's settings in a line: "180 °C · Fan · 30 min · Oven preheated". */
export function stepSettings(s: RecipeStep, t: Words): string[] {
  const time = duration(s.minutes, s.seconds)
  const temp = s.temp_c ? `${Math.round(s.temp_c)} °C` : null
  switch (s.kind) {
    case 'bake':
      return [temp, s.oven ? t(`steps.oven.${s.oven}`) : null, time, s.preheat ? t('steps.preheated') : null].filter((x): x is string => Boolean(x))
    case 'hob':
      return [s.heat ? t(`steps.heat.${s.heat}`) : null, time].filter((x): x is string => Boolean(x))
    case 'fry':
      return [temp, time].filter((x): x is string => Boolean(x))
    case 'thermomix':
      return [time, temp, s.speed ? t('steps.speedIs', { speed: s.speed === 'spoon' ? t('steps.spoon') : s.speed === 'turbo' ? 'Turbo' : s.speed }) : null, s.reverse ? t('steps.reverse') : null].filter(
        (x): x is string => Boolean(x),
      )
    default:
      return time ? [time] : []
  }
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * A step written in words, read into its kind and settings: "Inforna a 180° ventilato per 30 minuti" is baking at
 * 180 °C, fan oven, 30 minutes; "10 sec/vel. 5" is the Thermomix. The words stay as written.
 */
export function stepFromText(text: string): RecipeStep {
  const n = plain(text)
  const num = (re: RegExp) => {
    const m = n.match(re)
    return m ? Number(m[1].replace(',', '.')) : null
  }
  const minutes = num(/(\d+(?:[.,]\d+)?)\s*(?:mins?\b|minut[oi]|minutes?)/)
  const hours = num(/(\d+(?:[.,]\d+)?)\s*(?:h\b|or[ae]\b|hours?)/)
  const seconds = num(/(\d+)\s*(?:sec\b|second[oi]|seconds?)/)
  const temp = num(/(\d{2,3})\s*(?:°|gradi|degrees)/)
  const time = (minutes ?? 0) + (hours ?? 0) * 60 || null
  const speed = n.match(/\bvel(?:ocita|\.)?\s*(\d{1,2}(?:[.,]5)?|cucchiaio|turbo)|\bspeed\s*(\d{1,2}|spoon|turbo)/)
  if (speed || /\bvaroma\b|\bboccale\b|\bantiorari|\bthermomix\b|\bbimby\b/.test(n)) {
    const v = (speed?.[1] ?? speed?.[2] ?? '').replace('cucchiaio', 'spoon')
    return { kind: 'thermomix', text, minutes: time, seconds, temp_c: temp, speed: v || null, reverse: /antiorari|reverse/.test(n) }
  }
  if (/\binforn|\bforno\b|\bbake\b|\boven\b|\bcuoci(?:a|ete)? in forno|\bgratin/.test(n)) {
    const oven: OvenMode | null = /ventilat|\bfan\b|convection/.test(n) ? (/grill/.test(n) ? 'fan_grill' : 'fan') : /grill/.test(n) ? 'grill' : /statico|conventional/.test(n) ? 'static' : null
    return { kind: 'bake', text, minutes: time, temp_c: temp, oven, preheat: /preriscald|caldo|preheat/.test(n) }
  }
  if (/\bfriggi|\bfritt|\bdeep[- ]fr|\bfry\b/.test(n)) return { kind: 'fry', text, minutes: time, temp_c: temp }
  if (/\bless[ao]\b|\blessa\b|\bboll|\bboil|\bcuoci(?:a)? (?:in|nell)['a ]+acqua|\bscola|\bpasta\b.*\bcuoc/.test(n)) return { kind: 'boil', text, minutes: time }
  if (/\bfrigo|\bfrigorifero|\bfreezer|\bfridge|\brefrigerat/.test(n)) return { kind: 'fridge', text, minutes: time }
  if (/\bripos|\blievit|\brest\b|\bprove\b|\blet (?:it )?rise/.test(n)) return { kind: 'rest', text, minutes: time }
  if (/\bpadella|\bpentola|\bfuoco|\bfiamma|\bsoffrigg|\brosol|\bsalt[ai]\b|\bsaute|\bsauté|\bpan\b|\bhob\b|\bsimmer|\bstufa/.test(n)) {
    const heat: Heat | null = /fuoco (?:basso|dolce)|fiamma bassa|low heat|gently/.test(n) ? 'low' : /fuoco (?:alto|vivace)|fiamma alta|high heat/.test(n) ? 'high' : /fuoco medio|medium/.test(n) ? 'medium' : null
    return { kind: 'hob', text, minutes: time, heat }
  }
  if (/\bmescol|\bamalgam|\bimpast|\bsbatt|\bmont[ai]|\bunisc|\bmix\b|\bstir\b|\bwhisk|\bknead|\bcombine|\bfrulla|\bblend/.test(n)) return { kind: 'mix', text, minutes: time }
  return { kind: 'other', text }
}

/** Steps kept as they should be: known kinds, numbers in range, words not too long. */
export function cleanSteps(steps: unknown): RecipeStep[] {
  if (!Array.isArray(steps)) return []
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, v) : null)
  return steps
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map((s): RecipeStep => {
      const kind = STEP_KINDS.includes(s.kind as StepKind) ? (s.kind as StepKind) : 'other'
      const out: RecipeStep = {
        kind,
        text: typeof s.text === 'string' ? s.text.slice(0, 500) : '',
        minutes: n(s.minutes, 7 * 24 * 60),
        seconds: n(s.seconds, 59),
        temp_c: n(s.temp_c, 300),
        oven: OVEN_MODES.includes(s.oven as OvenMode) ? (s.oven as OvenMode) : null,
        preheat: s.preheat === true,
        heat: HEATS.includes(s.heat as Heat) ? (s.heat as Heat) : null,
        speed: SPEEDS.includes(String(s.speed)) ? String(s.speed) : null,
        reverse: s.reverse === true,
      }
      // Only what the step has: no empty settings stored.
      return Object.fromEntries(Object.entries(out).filter(([k, v]) => k === 'kind' || k === 'text' || (v !== null && v !== false))) as unknown as RecipeStep
    })
    .filter((s) => s.text.trim() || s.kind !== 'other')
    .slice(0, 40)
}
