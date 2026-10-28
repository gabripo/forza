import { ChevronRight, HeartPulse, LogOut, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, Input, NumberInput, PageHeader, Segmented } from '../components/ui'
import { useApp } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { ActivityLevel, Goal, Locale, Profile, Sex } from '../lib/types'

export function Settings() {
  const { t } = useI18n()
  const { profile, saveProfile, signOut, session } = useApp()
  const [draft, setDraft] = useState<Profile | null>(profile)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  if (!draft) return null
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setSaved(false)
    setDraft({ ...draft, [k]: v })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    try {
      const { display_name, locale, sex, birth_year, height_cm, goal, activity_level, target_weight_kg, workouts_per_week, steps_goal, experience } = draft
      await saveProfile({ display_name, locale, sex, birth_year, height_cm, goal, activity_level, target_weight_kg, workouts_per_week, steps_goal, experience })
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('settings.title')} subtitle={session?.user.email} back="/" />

      <div className="grid gap-2">
        <Link to="/settings/health" className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4">
          <HeartPulse className="size-6 text-brand" aria-hidden />
          <span className="flex-1">
            <span className="block font-bold">{t('health.title')}</span>
            <span className="block text-sm text-ink-2">{t('settings.healthSub')}</span>
          </span>
          <ChevronRight className="size-5 text-ink-3" aria-hidden />
        </Link>
        <Link to="/settings/install" className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4">
          <Smartphone className="size-6 text-brand" aria-hidden />
          <span className="flex-1">
            <span className="block font-bold">{t('install.title')}</span>
            <span className="block text-sm text-ink-2">{t('settings.installSub')}</span>
          </span>
          <ChevronRight className="size-5 text-ink-3" aria-hidden />
        </Link>
      </div>

      <Card title={t('settings.profile')}>
        <div className="grid gap-4">
          <Field label={t('onb.name')}>
            <Input value={draft.display_name} onChange={(e) => set('display_name', e.target.value)} />
          </Field>
          <Field label={t('settings.language')}>
            <Segmented<Locale>
              value={draft.locale}
              onChange={(v) => set('locale', v)}
              options={[
                { value: 'it', label: '🇮🇹 Italiano' },
                { value: 'en', label: '🇬🇧 English' },
              ]}
            />
          </Field>
          <Field label={t('settings.goal')}>
            <Segmented<Goal>
              value={draft.goal}
              onChange={(v) => set('goal', v)}
              options={(['fat_loss', 'muscle_gain', 'maintain'] as const).map((g) => ({ value: g, label: t(`goal.${g}`) }))}
            />
          </Field>
          <Field label={t('onb.activityTitle')}>
            <select
              value={draft.activity_level ?? 'light'}
              onChange={(e) => set('activity_level', e.target.value as ActivityLevel)}
              className="h-12 w-full rounded-2xl border border-line bg-card px-3"
            >
              {(['sedentary', 'light', 'moderate', 'active', 'very_active'] as const).map((a) => (
                <option key={a} value={a}>
                  {t(`activity.${a}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('onb.sex')}>
            <Segmented<Sex>
              value={draft.sex}
              onChange={(v) => set('sex', v)}
              options={[
                { value: 'female', label: t('onb.female') },
                { value: 'male', label: t('onb.male') },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('onb.birthYear')}>
              <NumberInput decimals={false} value={draft.birth_year} onChange={(v) => set('birth_year', v)} />
            </Field>
            <Field label={t('onb.height')}>
              <NumberInput decimals={false} value={draft.height_cm} onChange={(v) => set('height_cm', v)} />
            </Field>
            <Field label={t('onb.weightTarget')}>
              <NumberInput value={draft.target_weight_kg} onChange={(v) => set('target_weight_kg', v)} />
            </Field>
            <Field label={t('settings.stepsGoal')}>
              <NumberInput decimals={false} value={draft.steps_goal} onChange={(v) => set('steps_goal', v ?? 7000)} />
            </Field>
          </div>
          <Field label={t('onb.perWeek')}>
            <Segmented<number>
              value={draft.workouts_per_week}
              onChange={(v) => set('workouts_per_week', v)}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>
          <Button size="lg" block onClick={save} loading={busy}>
            {saved ? t('settings.saved') : t('common.save')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.about')}>
        <p className="text-ink-2">{t('settings.aboutText')}</p>
        <a href="https://github.com/gabripo/forza" target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-brand-ink">
          github.com/gabripo/forza
        </a>
      </Card>

      <Button variant="danger" size="lg" onClick={() => window.confirm(t('settings.signOutConfirm')) && signOut()}>
        <LogOut className="size-5" aria-hidden /> {t('settings.signOut')}
      </Button>
    </div>
  )
}
