import type { ReactNode } from 'react'
import { ACTIVITY_FACTOR, ageFrom, kcalFloor, paceKcal } from '../lib/calc'
import type { Energy } from '../lib/energy'
import { useI18n } from '../lib/i18n'
import type { Profile } from '../lib/types'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 font-bold">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm text-white">{n}</span>
        {title}
      </h3>
      <div className="grid gap-2 pl-9">{children}</div>
    </section>
  )
}

function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <li className={`flex justify-between gap-3 ${strong ? 'border-t border-line pt-2 font-bold' : ''}`}>
      <span>{label}</span>
      <b className="shrink-0 tabular">{value}</b>
    </li>
  )
}

/**
 * Explains the daily calorie target step by step, with the person's own numbers.
 * Every figure comes from lib/calc.ts, so what is shown here is exactly what the app uses.
 */
export function EnergyExplainer({ energy, profile }: { energy: Energy; profile: Profile }) {
  const { t, num, kg } = useI18n()
  const { tdee, targets } = energy
  const goal = profile.goal ?? 'maintain'
  const age = ageFrom(profile.birth_year)
  const height = profile.height_cm ?? 170
  const female = profile.sex === 'female'
  const level = profile.activity_level ?? 'light'
  const kcal = (n: number) => `${num(n)} kcal`
  const signed = (n: number) => `${n > 0 ? '+' : '−'}${num(Math.abs(n))} kcal`
  const pace = profile.goal_pace ?? 'normal'
  const offset = paceKcal(profile)
  const floor = kcalFloor(profile)
  const floored = tdee.tdee + offset + (profile.kcal_adjust ?? 0) + (profile.kcal_manual ?? 0) < floor
  const bws = profile.kcal_source === 'bws' && profile.bws_targets?.kcal ? profile.bws_targets : null
  const range = (r?: [number, number]) => (r ? `${num(r[0])}–${num(r[1])}` : '')

  return (
    <div className="grid gap-5">
      <p>{t('food.explain.intro')}</p>

      <Step n={1} title={t('food.explain.s1')}>
        <p className="text-ink-2">{t('food.explain.s1text')}</p>
        <p className="rounded-2xl bg-card-2 p-3 text-sm tabular">
          10 × {kg(energy.weightKg)} kg + {num(6.25, 2)} × {num(height)} cm − 5 × {age} {t('food.explain.years')} {female ? '− 161' : '+ 5'} ={' '}
          <b>{kcal(tdee.bmr)}</b>
        </p>
        <p className="text-sm text-ink-3">{t('food.explain.s1note')}</p>
      </Step>

      <Step n={2} title={t('food.explain.s2')}>
        {tdee.method === 'activity_level' ? (
          <>
            <p className="text-ink-2">{t('food.explain.s2level', { level: t(`activity.${level}`) })}</p>
            <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
              <Row label={`${kcal(tdee.bmr)} × ${num(ACTIVITY_FACTOR[level], 3)}`} value={kcal(tdee.formula)} strong />
            </ul>
            <p className="text-sm text-ink-3">{t('food.explain.s2levelNote')}</p>
          </>
        ) : (
          <>
            <p className="text-ink-2">{t('food.explain.s2measured')}</p>
            <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
              <Row label={t('food.explain.bmr')} value={kcal(tdee.bmr)} />
              <Row label={t('food.explain.daily')} value={`+${kcal(Math.round(tdee.bmr * 0.2))}`} />
              <Row label={t('food.explain.steps', { n: num(energy.avgSteps ?? 0) })} value={`+${kcal(tdee.stepsKcal)}`} />
              <Row
                label={t('food.explain.training', { n: num(energy.workoutsPerWeek, 1), min: num(energy.avgWorkoutMinutes) })}
                value={`+${kcal(tdee.trainingKcal)}`}
              />
              <Row label={t('food.explain.formula')} value={kcal(tdee.formula)} strong />
            </ul>
            <p className="text-sm text-ink-3">{t('food.explain.s2note')}</p>
          </>
        )}
      </Step>

      <Step n={3} title={t('food.explain.s3')}>
        {tdee.adaptive ? (
          <>
            <p className="text-ink-2">{t('food.explain.s3done', { days: energy.loggedFoodDays })}</p>
            <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
              <Row label={t('food.explain.formula')} value={kcal(tdee.formula)} />
              <Row label={t('food.explain.adaptive', { days: energy.loggedFoodDays })} value={kcal(tdee.adaptive)} />
              <Row label={t('food.explain.average')} value={kcal(tdee.tdee)} strong />
            </ul>
          </>
        ) : (
          <p className="text-ink-2">{t('food.explain.s3todo', { days: energy.loggedFoodDays })}</p>
        )}
        <p className="text-sm text-ink-3">{t('food.explain.s3note')}</p>
      </Step>

      <Step n={4} title={t('food.explain.s4', { goal: t(`goal.${goal}`) })}>
        <p className="text-ink-2">{t(`food.explain.goal.${goal}`)}</p>
        {profile.kcal_source === 'manual' && profile.kcal_target ? (
          <>
            <p className="rounded-2xl bg-sky-soft p-3 text-sm">{t('food.explain.byHand')}</p>
            <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
              <Row label={t('food.explain.tdee')} value={kcal(tdee.tdee)} />
              <Row label={t('food.explain.byHandRow')} value={kcal(targets.kcal)} strong />
            </ul>
          </>
        ) : bws ? (
          <>
            <p className="rounded-2xl bg-sky-soft p-3 text-sm">{t('food.explain.bws', { range: range(bws.kcal) })}</p>
            <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
              <Row label={t('food.explain.bwsRow', { range: range(bws.kcal) })} value={kcal(targets.kcal)} strong />
            </ul>
          </>
        ) : (
          <>
            <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
              <Row label={t('food.explain.tdee')} value={kcal(tdee.tdee)} />
              {goal !== 'maintain' ? <Row label={t('food.explain.paceRow', { goal: t(`goal.${goal}`), pace: t(`pace.${pace}`) })} value={signed(offset)} /> : null}
              {profile.kcal_adjust ? <Row label={t('food.explain.checkins')} value={signed(profile.kcal_adjust)} /> : null}
              {profile.kcal_manual ? <Row label={t('food.explain.manual')} value={signed(profile.kcal_manual)} /> : null}
              {floored ? <Row label={t('food.explain.floor', { kcal: num(floor) })} value={kcal(floor)} /> : null}
              <Row label={t('food.explain.target', { goal: t(`goal.${goal}`) })} value={kcal(targets.kcal)} strong />
              <Row label={t('food.explain.range')} value={`${range(targets.ranges.kcal)} kcal`} />
            </ul>
            <p className="text-sm text-ink-3">{t('food.explain.s4note')}</p>
          </>
        )}
      </Step>

      <Step n={5} title={t('food.explain.s5')}>
        {/* Every target is a range; the app shows its middle everywhere else. */}
        <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
          <Row label={t('food.explain.rangeOf', { what: t('macro.kcal') })} value={`${range(targets.ranges.kcal)} kcal · ${num(targets.kcal)}`} />
          <Row label={t('food.explain.rangeOf', { what: t('macro.protein') })} value={`${range(targets.ranges.protein_g)} g · ${num(targets.protein_g)} g`} />
          <Row label={t('food.explain.rangeOf', { what: t('macro.fat') })} value={`${range(targets.ranges.fat_g)} g · ${num(targets.fat_g)} g`} />
          <Row label={t('food.explain.rangeOf', { what: t('macro.carbs') })} value={`${range(targets.ranges.carbs_g)} g · ${num(targets.carbs_g)} g`} />
          <Row label={t('food.explain.atLeast', { what: t('macro.fiber') })} value={`${num(targets.fiber_g)} g`} />
          <Row label={t('food.explain.atMost', { what: t('macro.satfat') })} value={`${num(targets.satfat_g)} g`} />
          {profile.track_salt ? <Row label={t('food.explain.atMost', { what: t('macro.salt') })} value={`${num(targets.salt_g)} g`} /> : null}
        </ul>
        <p className="text-sm text-ink-3">{t('food.explain.rangesNote')}</p>
        <p className="text-sm text-ink-3">{t(`food.explain.s5note.${goal}`)}</p>
      </Step>

      <p className="text-sm text-ink-3">{t('onb.disclaimer')}</p>
    </div>
  )
}
