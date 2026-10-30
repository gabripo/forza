import { Barcode, CalendarCheck, Camera, ChevronLeft, ChevronRight, Info, Mic, PenLine, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MacroBar, Ring } from '../../components/charts'
import { EnergyExplainer } from '../../components/EnergyExplainer'
import { NextMealCard } from '../../components/NextMealCard'
import { TargetSheet } from '../../components/TargetSheet'
import { Button, Card, Empty, Loading, PageHeader, Sheet } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { calorieCheckin, daysAgo, localDay, scoreBand, scorePlate } from '../../lib/calc'
import { deleteFood } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { Meal } from '../../lib/types'
import { balancedDays } from '../../lib/rewards'
import { useEnergy } from '../../lib/useEnergy'

const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

export function FoodHome() {
  const { t, num, date } = useI18n()
  const { profile, saveProfile } = useApp()
  const navigate = useNavigate()
  const justLogged = Boolean((useLocation().state as { logged?: boolean } | null)?.logged)
  const { energy, food, weights, loading, reload } = useEnergy()
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [offset, setOffset] = useState(0)
  const [explain, setExplain] = useState(false)
  const [adjusting, setAdjusting] = useState(false)

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
  const balanced = balancedDays(food, tg)
  const last7 = Array.from({ length: 7 }, (_, i) => localDay(daysAgo(6 - i)))

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

      {/* Right after logging: what the next meal could be, before anything else. */}
      {justLogged ? <NextMealCard food={food} targets={tg} justLogged /> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" className="h-auto flex-col px-2 py-3 leading-tight" onClick={() => navigate('/food/snap')}>
          <Camera className="size-6" aria-hidden /> {t('food.snap')}
        </Button>
        <Button size="lg" variant="secondary" className="h-auto flex-col px-2 py-3 leading-tight" onClick={() => navigate('/food/voice')}>
          <Mic className="size-6 text-brand" aria-hidden /> {t('food.dictate')}
        </Button>
        <Button size="lg" variant="secondary" className="h-auto flex-col px-2 py-3 leading-tight" onClick={() => navigate('/food/add?scan=1')}>
          <Barcode className="size-6 text-brand" aria-hidden /> {t('food.barcode')}
        </Button>
        <Button size="lg" variant="secondary" className="h-auto flex-col px-2 py-3 leading-tight" onClick={() => navigate('/food/add')}>
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

      {!justLogged && offset === 0 && entries.length ? <NextMealCard food={food} targets={tg} /> : null}

      {/* Balanced days: the reward for eating by the guidelines (small, reachable, visible). */}
      <div className="flex items-center gap-3 rounded-3xl border border-line bg-card p-3">
        <ul className="flex gap-1" aria-label={t('food.balancedWeek')}>
          {last7.map((d) => (
            <li key={d} title={date(d, { weekday: 'short', day: 'numeric' })} className={`grid size-7 place-items-center rounded-full text-xs ${balanced.get(d) ? 'bg-leaf text-white dark:text-black' : 'bg-card-2 text-ink-3'}`}>
              {balanced.get(d) ? '✓' : date(d, { weekday: 'narrow' })}
            </li>
          ))}
        </ul>
        <p className="flex-1 text-sm">
          <b>{t('food.balancedCount', { n: last7.filter((d) => balanced.get(d)).length })}</b>
          <span className="block text-ink-2">{balanced.get(day) ? t('food.balancedToday') : t('food.balancedHow')}</span>
        </p>
      </div>

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
                  // Synced meals arrive without a score: work it out here, against today's target.
                  const scores =
                    e.score_fat_loss === null
                      ? scorePlate({ kcal: Number(e.kcal), protein_g: Number(e.protein_g), carbs_g: Number(e.carbs_g), fat_g: Number(e.fat_g), fiber_g: Number(e.fiber_g), sugar_g: Number(e.sugar_g) }, e.meal, tg.kcal, false, new Date(e.eaten_at))
                      : { fatLoss: e.score_fat_loss, muscleGain: e.score_muscle_gain ?? e.score_fat_loss }
                  const score = goal === 'muscle_gain' ? scores.muscleGain : scores.fatLoss
                  // From another app (Health Connect, or Build With Science read on the phone): changed there.
                  const synced = e.source === 'health_connect' || (e.source === 'import' && Boolean(e.origin))
                  const band = score !== null ? scoreBand(score) : null
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="text-sm text-ink-2">
                          {num(Number(e.kcal))} kcal · {t('macro.protein')} {num(Number(e.protein_g))} g
                        </p>
                        {synced ? <p className="text-xs text-ink-3">{t('food.syncedFrom', { app: e.origin || 'Health Connect' })}</p> : null}
                      </div>
                      {band ? (
                        <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${band === 'rethink' ? 'bg-danger-soft text-danger' : band === 'okay' ? 'bg-sun-soft text-sun' : 'bg-leaf-soft text-leaf'}`}>
                          {score}
                        </span>
                      ) : null}
                      {/* Synced meals are changed in the app that logged them: a delete here would come back. */}
                      {synced ? null : (
                        <button onClick={() => remove(e.id)} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2" aria-label={t('common.delete')}>
                          <Trash2 className="size-5" />
                        </button>
                      )}
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
          <span className="flex gap-3">
            <button onClick={() => setAdjusting(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
              <SlidersHorizontal className="size-4" aria-hidden /> {t('target.adjust')}
            </button>
            <button onClick={() => setExplain(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
              <Info className="size-4" aria-hidden /> {t('food.how')}
            </button>
          </span>
        }
      >
        <p className="text-ink-2">
          {t('food.tdeeLine', { tdee: num(energy.tdee.tdee), target: num(tg.kcal) })}
        </p>
        <p className="mt-1 text-sm text-ink-3">{t(`food.method.${energy.tdee.method}`)}</p>
      </Card>

      <TargetSheet open={adjusting} onClose={() => setAdjusting(false)} onChanged={() => void reload()} />
      <Sheet open={explain} onClose={() => setExplain(false)} title={t('food.how')}>
        <EnergyExplainer energy={energy} profile={profile} />
      </Sheet>
    </div>
  )
}
