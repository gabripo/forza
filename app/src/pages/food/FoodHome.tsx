import { CalendarCheck, Camera, ChevronLeft, ChevronRight, Info, PenLine, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MacroBar, Ring } from '../../components/charts'
import { Button, Card, Empty, Loading, PageHeader, Sheet } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { calorieCheckin, daysAgo, localDay, scoreBand } from '../../lib/calc'
import { deleteFood } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { Meal } from '../../lib/types'
import { useEnergy } from '../../lib/useEnergy'

const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

export function FoodHome() {
  const { t, num, date } = useI18n()
  const { profile, saveProfile } = useApp()
  const navigate = useNavigate()
  const { energy, food, weights, loading, reload } = useEnergy()
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [offset, setOffset] = useState(0)
  const [explain, setExplain] = useState(false)

  if ((loading && !energy) || !profile) return <Loading />
  if (!energy) return null

  const day = localDay(daysAgo(offset))
  const entries = food.filter((f) => localDay(new Date(f.eaten_at)) === day)
  const sum = entries.reduce(
    (a, f) => ({
      kcal: a.kcal + Number(f.kcal),
      protein: a.protein + Number(f.protein_g),
      carbs: a.carbs + Number(f.carbs_g),
      fat: a.fat + Number(f.fat_g),
      fiber: a.fiber + Number(f.fiber_g),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )
  const tg = energy.targets
  const goal = profile.goal ?? 'maintain'
  const checkin = calorieCheckin(profile, weights)

  async function closeCheckin(apply: boolean) {
    if (!profile) return
    setSavingCheckin(true)
    try {
      await saveProfile({
        kcal_adjust: (profile.kcal_adjust ?? 0) + (apply ? checkin.change : 0),
        kcal_checkin_at: new Date().toISOString(),
      })
      void reload()
    } finally {
      setSavingCheckin(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('food.confirmDelete'))) return
    await deleteFood(id)
    void reload()
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('food.title')} subtitle={t(`goal.${goal}`)} />

      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" className="h-auto flex-col py-3 leading-tight" onClick={() => navigate('/food/snap')}>
          <Camera className="size-6" aria-hidden /> {t('food.snap')}
        </Button>
        <Button size="lg" variant="secondary" className="h-auto flex-col py-3 leading-tight" onClick={() => navigate('/food/add')}>
          <PenLine className="size-6 text-brand" aria-hidden /> {t('food.manual')}
        </Button>
      </div>

      {checkin.due ? (
        <Card tone="sky">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-sky">
            <CalendarCheck className="size-5" aria-hidden /> {t('kcalCheckin.title')}
          </p>
          {checkin.verdict === 'not_enough_data' ? (
            <p className="mt-1">{t('kcalCheckin.notEnough')}</p>
          ) : (
            <>
              <p className="mt-1 text-lg">
                {t('kcalCheckin.pace', {
                  actual: `${(checkin.actualKgPerWeek ?? 0) > 0 ? '+' : '−'}${num(Math.abs(checkin.actualKgPerWeek ?? 0), 2)}`,
                  goal: `${checkin.goalKgPerWeek > 0 ? '+' : checkin.goalKgPerWeek < 0 ? '−' : ''}${num(Math.abs(checkin.goalKgPerWeek), 2)}`,
                })}
              </p>
              <p className="mt-1 text-ink-2">{t(`kcalCheckin.${checkin.verdict}`)}</p>
              {checkin.change ? (
                <p className="mt-2 font-bold">
                  {t('kcalCheckin.proposal', { change: `${checkin.change > 0 ? '+' : '−'}${Math.abs(checkin.change)}`, target: num(tg.kcal + checkin.change) })}
                </p>
              ) : null}
            </>
          )}
          <p className="mt-1 text-sm text-ink-3">{t('kcalCheckin.confidence', { level: t(`kcalCheckin.conf_${checkin.confidence}`) })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {checkin.change ? (
              <>
                <Button onClick={() => closeCheckin(true)} loading={savingCheckin}>
                  {t('kcalCheckin.apply')}
                </Button>
                <Button variant="secondary" onClick={() => closeCheckin(false)} disabled={savingCheckin}>
                  {t('kcalCheckin.keep')}
                </Button>
              </>
            ) : (
              <Button onClick={() => closeCheckin(false)} loading={savingCheckin}>
                {t('kcalCheckin.ok')}
              </Button>
            )}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setOffset(offset + 1)} className="grid size-11 place-items-center rounded-full active:bg-card-2" aria-label={t('food.prevDay')}>
            <ChevronLeft className="size-6" />
          </button>
          <p className="font-bold">{offset === 0 ? t('food.today') : date(daysAgo(offset), { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          <button
            onClick={() => setOffset(Math.max(0, offset - 1))}
            disabled={offset === 0}
            className="grid size-11 place-items-center rounded-full active:bg-card-2 disabled:opacity-30"
            aria-label={t('food.nextDay')}
          >
            <ChevronRight className="size-6" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Ring value={sum.kcal} max={tg.kcal}>
            <div>
              <div className="text-2xl font-extrabold tabular">{num(sum.kcal)}</div>
              <div className="text-xs text-ink-2">/ {num(tg.kcal)} kcal</div>
            </div>
          </Ring>
          <div className="grid w-full flex-1 gap-2">
            <MacroBar label={t('macro.protein')} value={sum.protein} target={tg.protein_g} color="var(--macro-protein)" />
            <MacroBar label={t('macro.carbs')} value={sum.carbs} target={tg.carbs_g} color="var(--macro-carbs)" />
            <MacroBar label={t('macro.fat')} value={sum.fat} target={tg.fat_g} color="var(--macro-fat)" />
            <MacroBar label={t('macro.fiber')} value={sum.fiber} target={tg.fiber_g} color="var(--macro-fiber)" />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-2">
          {sum.kcal < tg.kcal ? t('food.left', { kcal: num(tg.kcal - sum.kcal) }) : t('food.over', { kcal: num(sum.kcal - tg.kcal) })}
        </p>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <Empty icon="🍽️" title={t('food.empty')} text={t('food.emptyText')} />
        </Card>
      ) : (
        MEALS.filter((m) => entries.some((e) => e.meal === m)).map((m) => (
          <Card key={m} title={t(`meal.${m}`)}>
            <ul className="grid gap-2">
              {entries
                .filter((e) => e.meal === m)
                .map((e) => {
                  const score = goal === 'muscle_gain' ? e.score_muscle_gain : e.score_fat_loss
                  const band = score !== null ? scoreBand(score) : null
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="text-sm text-ink-2">
                          {num(Number(e.kcal))} kcal · {t('macro.protein')} {num(Number(e.protein_g))} g
                        </p>
                      </div>
                      {band ? (
                        <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${band === 'rethink' ? 'bg-danger-soft text-danger' : band === 'okay' ? 'bg-sun-soft text-sun' : 'bg-leaf-soft text-leaf'}`}>
                          {score}
                        </span>
                      ) : null}
                      <button onClick={() => remove(e.id)} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2" aria-label={t('common.delete')}>
                        <Trash2 className="size-5" />
                      </button>
                    </li>
                  )
                })}
            </ul>
          </Card>
        ))
      )}

      <Card
        title={t('food.energyTitle')}
        action={
          <button onClick={() => setExplain(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
            <Info className="size-4" aria-hidden /> {t('food.how')}
          </button>
        }
      >
        <p className="text-ink-2">
          {t('food.tdeeLine', { tdee: num(energy.tdee.tdee), target: num(tg.kcal) })}
        </p>
        <p className="mt-1 text-sm text-ink-3">{t(`food.method.${energy.tdee.method}`)}</p>
      </Card>

      <Sheet open={explain} onClose={() => setExplain(false)} title={t('food.how')}>
        <div className="grid gap-3">
          <p>{t('food.explain.intro')}</p>
          <ul className="grid gap-2 rounded-2xl bg-card-2 p-3 tabular">
            <li className="flex justify-between">
              <span>{t('food.explain.bmr')}</span>
              <b>{num(energy.tdee.bmr)} kcal</b>
            </li>
            {energy.tdee.method !== 'activity_level' ? (
              <>
                <li className="flex justify-between">
                  <span>{t('food.explain.daily')}</span>
                  <b>+{num(Math.round(energy.tdee.bmr * 0.2))} kcal</b>
                </li>
                <li className="flex justify-between">
                  <span>{t('food.explain.steps', { n: num(energy.avgSteps ?? 0) })}</span>
                  <b>+{num(energy.tdee.stepsKcal)} kcal</b>
                </li>
                <li className="flex justify-between">
                  <span>{t('food.explain.training', { n: num(energy.workoutsPerWeek, 1) })}</span>
                  <b>+{num(energy.tdee.trainingKcal)} kcal</b>
                </li>
              </>
            ) : (
              <li className="flex justify-between">
                <span>{t('food.explain.activity', { level: t(`activity.${profile.activity_level ?? 'light'}`) })}</span>
                <b>= {num(energy.tdee.formula)} kcal</b>
              </li>
            )}
            {energy.tdee.adaptive ? (
              <li className="flex justify-between">
                <span>{t('food.explain.adaptive', { days: energy.loggedFoodDays })}</span>
                <b>{num(energy.tdee.adaptive)} kcal</b>
              </li>
            ) : null}
            {profile.kcal_adjust ? (
              <li className="flex justify-between">
                <span>{t('food.explain.checkins')}</span>
                <b>
                  {profile.kcal_adjust > 0 ? '+' : '−'}
                  {num(Math.abs(profile.kcal_adjust))} kcal
                </b>
              </li>
            ) : null}
            <li className="flex justify-between border-t border-line pt-2">
              <span className="font-bold">{t('food.explain.tdee')}</span>
              <b>{num(energy.tdee.tdee)} kcal</b>
            </li>
            <li className="flex justify-between">
              <span className="font-bold">{t('food.explain.target', { goal: t(`goal.${goal}`) })}</span>
              <b>{num(tg.kcal)} kcal</b>
            </li>
          </ul>
          <p className="text-sm text-ink-2">{t('food.explain.protein', { g: tg.protein_g })}</p>
          {!energy.tdee.adaptive ? <p className="text-sm text-ink-2">{t('food.explain.moreData')}</p> : null}
          <p className="text-sm text-ink-3">{t('onb.disclaimer')}</p>
        </div>
      </Sheet>
    </div>
  )
}
