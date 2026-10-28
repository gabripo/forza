import { useState } from 'react'
import { Logo } from '../components/Logo'
import { Button, ChoiceList, Field, Input, NumberInput, Segmented } from '../components/ui'
import { useApp } from '../lib/auth'
import { dailyTargets, estimateTdee } from '../lib/calc'
import { addWeight } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { ActivityLevel, Goal, Locale, Profile, Sex } from '../lib/types'

type Draft = {
  display_name: string
  locale: Locale
  sex: Sex | null
  birth_year: number | null
  height_cm: number | null
  weight: number | null
  target_weight_kg: number | null
  goal: Goal | null
  activity_level: ActivityLevel | null
  experience: 'beginner' | 'intermediate'
  workouts_per_week: number
}

const STEPS = ['welcome', 'body', 'weight', 'goal', 'activity', 'training', 'summary'] as const

export function Onboarding() {
  const { t, locale, setLocale, num } = useI18n()
  const { profile, saveProfile } = useApp()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [d, setD] = useState<Draft>({
    display_name: profile?.display_name ?? '',
    locale,
    sex: profile?.sex ?? null,
    birth_year: profile?.birth_year ?? null,
    height_cm: profile?.height_cm ?? null,
    weight: profile?.start_weight_kg ?? null,
    target_weight_kg: profile?.target_weight_kg ?? null,
    goal: profile?.goal ?? null,
    activity_level: profile?.activity_level ?? null,
    experience: profile?.experience ?? 'beginner',
    workouts_per_week: profile?.workouts_per_week ?? 3,
  })
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const year = new Date().getFullYear()

  const valid: Record<(typeof STEPS)[number], boolean> = {
    welcome: d.display_name.trim().length > 0,
    body: Boolean(d.sex && d.birth_year && d.birth_year > 1920 && d.birth_year < year - 12 && d.height_cm && d.height_cm > 120 && d.height_cm < 230),
    weight: Boolean(d.weight && d.weight > 30 && d.weight < 300),
    goal: Boolean(d.goal),
    activity: Boolean(d.activity_level),
    training: true,
    summary: true,
  }
  const name = STEPS[step]

  const asProfile = { ...(profile as Profile), ...d, start_weight_kg: d.weight } as Profile
  const tdee = d.weight ? estimateTdee({ profile: asProfile, weightKg: d.weight, avgSteps: null, workoutsPerWeek: d.workouts_per_week, avgWorkoutMinutes: 50 }) : null
  const targets = tdee && d.weight ? dailyTargets(asProfile, d.weight, tdee.tdee) : null

  async function finish() {
    setBusy(true)
    try {
      await addWeight(d.weight!)
      await saveProfile({
        display_name: d.display_name.trim(),
        locale: d.locale,
        sex: d.sex,
        birth_year: d.birth_year,
        height_cm: d.height_cm,
        start_weight_kg: d.weight,
        target_weight_kg: d.target_weight_kg,
        goal: d.goal,
        activity_level: d.activity_level,
        experience: d.experience,
        workouts_per_week: d.workouts_per_week,
        steps_goal: d.activity_level === 'sedentary' ? 5000 : 7000,
        onboarded_at: new Date().toISOString(),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Logo size={40} />
        <div className="flex flex-1 gap-1" aria-label={t('onb.progress', { n: step + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-card-2'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1">
        {name === 'welcome' && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-extrabold">{t('onb.welcomeTitle')}</h1>
            <p className="text-lg text-ink-2">{t('onb.welcomeText')}</p>
            <Segmented<Locale>
              value={d.locale}
              onChange={(l) => {
                set('locale', l)
                setLocale(l)
              }}
              options={[
                { value: 'it', label: '🇮🇹 Italiano' },
                { value: 'en', label: '🇬🇧 English' },
              ]}
            />
            <Field label={t('onb.name')}>
              <Input value={d.display_name} onChange={(e) => set('display_name', e.target.value)} autoComplete="given-name" />
            </Field>
          </div>
        )}

        {name === 'body' && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-extrabold">{t('onb.bodyTitle')}</h1>
            <p className="text-ink-2">{t('onb.bodyWhy')}</p>
            <Field label={t('onb.sex')}>
              <Segmented<Sex>
                value={d.sex}
                onChange={(v) => set('sex', v)}
                options={[
                  { value: 'female', label: t('onb.female') },
                  { value: 'male', label: t('onb.male') },
                ]}
              />
            </Field>
            <Field label={t('onb.birthYear')}>
              <NumberInput decimals={false} value={d.birth_year} onChange={(v) => set('birth_year', v)} placeholder="1960" />
            </Field>
            <Field label={t('onb.height')}>
              <NumberInput decimals={false} value={d.height_cm} onChange={(v) => set('height_cm', v)} placeholder="170" />
            </Field>
          </div>
        )}

        {name === 'weight' && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-extrabold">{t('onb.weightTitle')}</h1>
            <p className="text-ink-2">{t('onb.weightHint')}</p>
            <Field label={t('onb.weightNow')}>
              <NumberInput value={d.weight} onChange={(v) => set('weight', v)} placeholder="72,5" />
            </Field>
            <Field label={t('onb.weightTarget')} hint={t('onb.optional')}>
              <NumberInput value={d.target_weight_kg} onChange={(v) => set('target_weight_kg', v)} />
            </Field>
          </div>
        )}

        {name === 'goal' && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-extrabold">{t('onb.goalTitle')}</h1>
            <ChoiceList<Goal>
              value={d.goal}
              onChange={(v) => set('goal', v)}
              options={[
                { value: 'fat_loss', icon: '🔥', label: t('goal.fat_loss'), description: t('goal.fat_loss_d') },
                { value: 'muscle_gain', icon: '💪', label: t('goal.muscle_gain'), description: t('goal.muscle_gain_d') },
                { value: 'maintain', icon: '🌿', label: t('goal.maintain'), description: t('goal.maintain_d') },
              ]}
            />
          </div>
        )}

        {name === 'activity' && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-extrabold">{t('onb.activityTitle')}</h1>
            <ChoiceList<ActivityLevel>
              value={d.activity_level}
              onChange={(v) => set('activity_level', v)}
              options={(['sedentary', 'light', 'moderate', 'active', 'very_active'] as const).map((a, i) => ({
                value: a,
                icon: ['🛋️', '🚶', '🚴', '🏃', '⛏️'][i],
                label: t(`activity.${a}`),
                description: t(`activity.${a}_d`),
              }))}
            />
          </div>
        )}

        {name === 'training' && (
          <div className="grid gap-5">
            <h1 className="text-3xl font-extrabold">{t('onb.trainingTitle')}</h1>
            <Field label={t('onb.experience')}>
              <ChoiceList<'beginner' | 'intermediate'>
                value={d.experience}
                onChange={(v) => set('experience', v)}
                options={[
                  { value: 'beginner', icon: '🌱', label: t('onb.beginner'), description: t('onb.beginner_d') },
                  { value: 'intermediate', icon: '🌳', label: t('onb.intermediate'), description: t('onb.intermediate_d') },
                ]}
              />
            </Field>
            <Field label={t('onb.perWeek')} hint={t('onb.perWeekHint')}>
              <Segmented<number>
                value={d.workouts_per_week}
                onChange={(v) => set('workouts_per_week', v)}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
              />
            </Field>
          </div>
        )}

        {name === 'summary' && targets && tdee && (
          <div className="grid gap-4">
            <h1 className="text-3xl font-extrabold">{t('onb.summaryTitle', { name: d.display_name })}</h1>
            <p className="text-ink-2">{t('onb.summaryText')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-brand-soft p-4">
                <div className="text-sm text-ink-2">{t('food.kcalTarget')}</div>
                <div className="text-3xl font-extrabold">{num(targets.kcal)}</div>
                <div className="text-sm text-ink-2">kcal</div>
              </div>
              <div className="rounded-3xl bg-sky-soft p-4">
                <div className="text-sm text-ink-2">{t('macro.protein')}</div>
                <div className="text-3xl font-extrabold">{targets.protein_g}</div>
                <div className="text-sm text-ink-2">{t('onb.gramsPerDay')}</div>
              </div>
              <div className="rounded-3xl bg-leaf-soft p-4">
                <div className="text-sm text-ink-2">{t('onb.workouts')}</div>
                <div className="text-3xl font-extrabold">{d.workouts_per_week}</div>
                <div className="text-sm text-ink-2">{t('onb.perWeekShort')}</div>
              </div>
              <div className="rounded-3xl bg-sun-soft p-4">
                <div className="text-sm text-ink-2">{t('onb.steps')}</div>
                <div className="text-3xl font-extrabold">{num(d.activity_level === 'sedentary' ? 5000 : 7000)}</div>
                <div className="text-sm text-ink-2">{t('onb.perDay')}</div>
              </div>
            </div>
            <p className="rounded-2xl bg-card-2 p-3 text-sm text-ink-2">{t('onb.disclaimer')}</p>
          </div>
        )}
      </div>

      <div className="pb-safe mt-6 flex gap-3">
        {step > 0 ? (
          <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
            {t('common.back')}
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button size="lg" block disabled={!valid[name]} onClick={() => setStep(step + 1)}>
            {t('common.next')}
          </Button>
        ) : (
          <Button size="lg" block variant="leaf" loading={busy} onClick={finish}>
            {t('onb.start')}
          </Button>
        )}
      </div>
    </div>
  )
}
