import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { HEATS, newStep, OVEN_MODES, SPEEDS, STEP_EMOJI, STEP_KINDS, stepSettings, withKind, type RecipeStep, type StepKind } from '../lib/recipeSteps'
import { cx, NumberInput } from './ui'

/** A step being written: `id` keeps each one in its place while steps are added, moved and taken out. */
export type EditorStep = RecipeStep & { id: string }

/**
 * The preparation, step by step: each step's kind (mix, bake, hob, Thermomix…), what to do, and the settings its
 * kind has (baking: temperature, the oven's mode, time, preheated); steps added by kind, moved up and down, removed.
 */
export function StepsEditor({ steps, onChange }: { steps: EditorStep[]; onChange: (steps: EditorStep[]) => void }) {
  const { t } = useI18n()
  const set = (i: number, s: RecipeStep) => onChange(steps.map((x, j) => (j === i ? { ...s, id: x.id } : x)))
  const move = (i: number, by: number) => {
    const next = [...steps]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
  }
  return (
    <div className="grid gap-3">
      {steps.length ? null : <p className="text-sm text-ink-2">{t('steps.none')}</p>}
      {steps.map((s, i) => (
        <section key={s.id} className="grid gap-2 rounded-2xl border border-line bg-card-2 p-3" aria-label={t('steps.n', { n: i + 1 })}>
          <div className="flex items-center gap-1">
            <span className="flex-1 font-bold">{t('steps.n', { n: i + 1 })}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="grid size-9 place-items-center rounded-full text-ink-3 disabled:opacity-30" aria-label={t('steps.up', { n: i + 1 })}>
              <ChevronUp className="size-5" />
            </button>
            <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="grid size-9 place-items-center rounded-full text-ink-3 disabled:opacity-30" aria-label={t('steps.down', { n: i + 1 })}>
              <ChevronDown className="size-5" />
            </button>
            <button onClick={() => onChange(steps.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-full text-ink-3" aria-label={t('steps.remove', { n: i + 1 })}>
              <Trash2 className="size-5" />
            </button>
          </div>
          <select
            value={s.kind}
            onChange={(e) => set(i, withKind(s, e.target.value as StepKind))}
            aria-label={t('steps.kindOf', { n: i + 1 })}
            className="w-full rounded-xl border border-line bg-card px-2 py-2 font-semibold"
          >
            {STEP_KINDS.map((k) => (
              <option key={k} value={k}>
                {STEP_EMOJI[k]} {t(`steps.kind.${k}`)}
              </option>
            ))}
          </select>
          <textarea
            value={s.text}
            rows={2}
            maxLength={500}
            onChange={(e) => set(i, { ...s, text: e.target.value })}
            placeholder={t(`steps.placeholder.${s.kind}`)}
            aria-label={t('steps.what', { n: i + 1 })}
            className="w-full rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-sky"
          />
          <StepFields step={s} n={i + 1} onChange={(x) => set(i, x)} />
        </section>
      ))}
      <div>
        <p className="mb-1 text-sm font-semibold text-ink-2">{t('steps.add')}</p>
        <div className="flex flex-wrap gap-2">
          {STEP_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => onChange([...steps, { ...newStep(k), id: crypto.randomUUID() }])}
              className="rounded-full border-2 border-line bg-card px-3 py-1 text-sm font-semibold active:bg-card-2"
            >
              + {STEP_EMOJI[k]} {t(`steps.kind.${k}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The settings a step's kind has, each one changeable. */
function StepFields({ step: s, n, onChange }: { step: RecipeStep; n: number; onChange: (s: RecipeStep) => void }) {
  const { t } = useI18n()
  const num = (key: 'minutes' | 'seconds' | 'temp_c', label: string) => (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <NumberInput decimals={false} value={s[key] ?? null} onChange={(v) => onChange({ ...s, [key]: v })} aria-label={`${label} (${t('steps.n', { n })})`} className="h-11 bg-card" />
    </label>
  )
  const chips = <T extends string>(options: readonly T[], value: T | null | undefined, label: (v: T) => string, pick: (v: T) => void, name: string) => (
    <div className="flex flex-wrap gap-1" role="group" aria-label={name}>
      {options.map((o) => (
        <button key={o} onClick={() => pick(o)} aria-pressed={value === o} className={cx('rounded-full border-2 px-3 py-1 text-sm font-semibold', value === o ? 'border-brand bg-card' : 'border-line bg-card text-ink-2')}>
          {label(o)}
        </button>
      ))}
    </div>
  )
  const check = (key: 'preheat' | 'reverse', label: string) => (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={Boolean(s[key])} onChange={(e) => onChange({ ...s, [key]: e.target.checked })} className="size-5 accent-[var(--brand)]" />
      {label}
    </label>
  )
  switch (s.kind) {
    case 'bake':
      return (
        <>
          <div className="grid grid-cols-2 items-end gap-2">
            {num('temp_c', t('steps.temp'))}
            {num('minutes', t('steps.minutes'))}
          </div>
          {chips(OVEN_MODES, s.oven, (o) => t(`steps.oven.${o}`), (o) => onChange({ ...s, oven: o }), t('steps.mode'))}
          {check('preheat', t('steps.preheated'))}
        </>
      )
    case 'hob':
      return (
        <>
          {chips(HEATS, s.heat, (h) => t(`steps.heat.${h}`), (h) => onChange({ ...s, heat: h }), t('steps.heatLabel'))}
          <div className="grid grid-cols-2 items-end gap-2">{num('minutes', t('steps.minutes'))}</div>
        </>
      )
    case 'fry':
      return (
        <div className="grid grid-cols-2 items-end gap-2">
          {num('temp_c', t('steps.temp'))}
          {num('minutes', t('steps.minutes'))}
        </div>
      )
    case 'thermomix':
      return (
        <>
          <div className="grid grid-cols-3 items-end gap-2">
            {num('minutes', t('steps.minutes'))}
            {num('seconds', t('steps.seconds'))}
            {num('temp_c', '°C')}
          </div>
          <label className="grid gap-1 text-sm font-semibold">
            {t('steps.speed')}
            <select value={s.speed ?? ''} onChange={(e) => onChange({ ...s, speed: e.target.value || null })} className="rounded-xl border border-line bg-card px-2 py-2">
              <option value="">—</option>
              {SPEEDS.map((v) => (
                <option key={v} value={v}>
                  {v === 'spoon' ? t('steps.spoon') : v === 'turbo' ? 'Turbo' : v}
                </option>
              ))}
            </select>
          </label>
          {check('reverse', t('steps.reverse'))}
        </>
      )
    case 'other':
      return null
    default:
      return <div className="grid grid-cols-2 items-end gap-2">{num('minutes', t('steps.minutes'))}</div>
  }
}

/** The preparation to follow: numbered steps, each with its settings in a line and what to do. */
export function StepsView({ steps }: { steps: RecipeStep[] }) {
  const { t } = useI18n()
  return (
    <ol className="grid gap-3">
      {steps.map((s, i) => {
        const settings = stepSettings(s, t)
        return (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white dark:text-black">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {s.kind !== 'other' ? (
                <p className="text-sm font-semibold text-ink-2">
                  {STEP_EMOJI[s.kind]} {[t(`steps.kind.${s.kind}`), ...settings].join(' · ')}
                </p>
              ) : null}
              {s.text ? <p>{s.text}</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
