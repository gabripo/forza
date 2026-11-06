import { Barcode, BookOpen, BookPlus, CalendarCheck, Camera, ChefHat, ChevronLeft, ChevronRight, Copy, History, Info, ListTree, Mic, Pencil, PenLine, ScrollText, Share2, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MacroBar, Ring } from '../../components/charts'
import { ConsistencyLink } from '../../components/Consistency'
import { BwsFoodSync } from '../../components/BwsFoodSync'
import { CatchUpCard } from '../../components/CatchUp'
import { CopiedNotice } from '../../components/CopyMeal'
import { EatenShare } from '../../components/EatenShare'
import { DayEvaluationCard, DayQuestionCard } from '../../components/DayCards'
import { EnergyExplainer } from '../../components/EnergyExplainer'
import { LoggedForCard, type LoggedFor } from '../../components/LogFor'
import { MealAnomalyCards } from '../../components/MealAnomalies'
import { MealBreakdown } from '../../components/MealBreakdown'
import { MealSheet, ShareMealSheet } from '../../components/MealSheets'
import { SharedCopies } from '../../components/SharedCopies'
import { NextMealCard } from '../../components/NextMealCard'
import { ProcessedCard } from '../../components/Processed'
import { TargetHistory } from '../../components/TargetHistory'
import { TargetSheet } from '../../components/TargetSheet'
import { Button, Card, Empty, Loading, PageHeader, Segmented, Sheet } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { calorieCheckin, daysAgo, localDay, scoreBand, scorePlate, sodiumMg } from '../../lib/calc'
import { copySuggestion, useMealCopy } from '../../lib/copyMeal'
import { deleteFood, deleteSharedCopies, getSharedCopies, setFoodDay, updateFood } from '../../lib/data'
import { INCOMPLETE_SHARE } from '../../lib/energy'
import { isSynced } from '../../lib/mealAnomaly'
import { stillSkipped, totalsOf } from '../../lib/dayCheck'
import { useFoodDb } from '../../lib/foodDb'
import { recipeDraftFromLogs } from '../../lib/recipeFromLogs'
import { useI18n } from '../../lib/i18n'
import type { FoodLog, Meal, SharedCopy } from '../../lib/types'
import { balancedDays } from '../../lib/rewards'
import { useEnergy } from '../../lib/useEnergy'

const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

export function FoodHome() {
  const { t, num, date, locale } = useI18n()
  const { profile, saveProfile } = useApp()
  const navigate = useNavigate()
  const navState = useLocation().state as { logged?: boolean; loggedIds?: string[]; offset?: number; loggedFor?: LoggedFor } | null
  const justLogged = Boolean(navState?.logged)
  const { energy, food, weights, notes, loading, reload } = useEnergy()
  const [savingCheckin, setSavingCheckin] = useState(false)
  // Home's "Copy a meal" opens yesterday, where every meal can be copied to today.
  const [offset, setOffset] = useState(navState?.offset ?? 0)
  const copying = useMealCopy(() => void reload())
  const db = useFoodDb()
  /** Logged meals as the start of a family recipe: their foods, one portion. */
  const toRecipe = (logs: FoodLog[]) => navigate('/food/recipes/new', { state: { draft: recipeDraftFromLogs(logs, db) } })

  // Meals that arrive without a score (synced from another app, or changed in Forza! Coach) get theirs here,
  // and keep it: the family challenge counts good meals.
  const scored = useRef(new Set<string>())
  useEffect(() => {
    if (!energy) return
    const unscored = food.filter((f) => f.score_fat_loss === null && !scored.current.has(f.id))
    if (!unscored.length) return
    for (const f of unscored) {
      scored.current.add(f.id)
      const s = scorePlate({ kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g), fiber_g: Number(f.fiber_g), sugar_g: Number(f.sugar_g) }, f.meal, energy.targets.kcal, false, new Date(f.eaten_at))
      void updateFood(f.id, { score_fat_loss: s.fatLoss, score_muscle_gain: s.muscleGain }).catch(() => {})
    }
  }, [food, energy])
  // A meal that is always skipped (intermittent fasting) is asked about again once the person eats it again.
  useEffect(() => {
    if (!profile?.skip_meals?.length || !food.length) return
    const still = stillSkipped(profile.skip_meals, food)
    if (still.length !== profile.skip_meals.length) void saveProfile({ skip_meals: still })
  }, [food, profile, saveProfile])
  const [explain, setExplain] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [history, setHistory] = useState(false)
  // A meal opened to see what it brings; meals being shared with whoever ate the same.
  const [openMeal, setOpenMeal] = useState<Meal | null>(null)
  const [sharing, setSharing] = useState<string[] | null>(null)
  // The meal being moved to another part of the day (breakfast, lunch, snack, dinner).
  const [moving, setMoving] = useState<FoodLog | null>(null)
  // A shared meal being deleted: from this person's log only, or from everyone's.
  const [deleting, setDeleting] = useState<{ log: FoodLog; copies: SharedCopy[] } | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

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
      salt: a.salt + Number(f.salt_g ?? 0),
      satfat: a.satfat + Number(f.satfat_g ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, salt: 0, satfat: 0 },
  )
  const tg = energy.targets
  const goal = profile.goal ?? 'maintain'
  const checkin = calorieCheckin(profile, weights)
  const balanced = balancedDays(food, tg)
  const last7 = Array.from({ length: 7 }, (_, i) => localDay(daysAgo(6 - i)))
  const suggestion = offset === 0 ? copySuggestion(food) : null

  async function copyToToday(entries: typeof food) {
    await copying.copy(entries)
    setOffset(0)
  }

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

  async function remove(log: FoodLog) {
    // Shared with someone: ask whether it goes from their food logs too.
    const copies = await getSharedCopies(log.id).catch(() => [])
    if (copies.length) return setDeleting({ log, copies })
    if (!window.confirm(t('food.confirmDelete'))) return
    await deleteFood(log.id)
    void reload()
  }

  async function removeShared(everywhere: boolean) {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      // The copies first: once the meal is gone they no longer point to it.
      if (everywhere) await deleteSharedCopies(deleting.copies.map((c) => c.id))
      await deleteFood(deleting.log.id)
      setDeleting(null)
      void reload()
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('food.title')} subtitle={t(`goal.${goal}`)} />

      {/* The family coach logged a meal for someone: where it went, and a way back. */}
      {navState?.loggedFor ? <LoggedForCard logged={navState.loggedFor} /> : null}
      {/* Right after logging: what the next meal could be, before anything else. */}
      {justLogged ? <NextMealCard food={food} targets={tg} justLogged /> : null}
      {justLogged && navState?.loggedIds?.length ? (
        <Button variant="secondary" onClick={() => setSharing(navState.loggedIds ?? null)}>
          <Share2 className="size-5" aria-hidden /> {t('share.ask')}
        </Button>
      ) : null}
      {/* Meals that look logged by mistake: right after logging, and once each meal is over. */}
      <MealAnomalyCards food={food} onChanged={() => void reload()} />
      {!justLogged && offset === 0 ? <DayQuestionCard food={food} notes={notes} targets={tg} onAnswered={() => void reload()} /> : null}
      {/* After days short of protein (or of calories, when not losing fat): foods that bring it back today. */}
      {offset === 0 ? <CatchUpCard food={food} notes={notes} targets={tg} /> : null}
      {/* Processed foods logged often (ice cream, biscuits, snacks…): alternatives that fill up more. */}
      {offset === 0 ? <ProcessedCard food={food} /> : null}

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
        <Button variant="secondary" className="leading-tight" onClick={() => navigate('/food/recipes')}>
          <BookOpen className="size-5 text-brand" aria-hidden /> {t('food.recipes')}
        </Button>
        <Button variant="secondary" className="leading-tight" onClick={() => navigate('/food/menu')}>
          <ScrollText className="size-5 text-brand" aria-hidden /> {t('food.menu')}
        </Button>
      </div>
      {/* Nothing in mind: the foods at home become a recipe that fits what is left of the day. */}
      <button onClick={() => navigate('/food/build')} className="flex items-center gap-3 rounded-3xl border-2 border-dashed border-brand bg-card p-3 text-left active:bg-card-2">
        <ChefHat className="size-8 shrink-0 text-brand" aria-hidden />
        <span>
          <span className="block font-bold">{t('food.buildAsk')}</span>
          <span className="block text-brand-ink">{t('food.buildCta')}</span>
        </span>
      </button>

      {/* Meals from Build With Science: brought now, instead of at the next hourly sync. */}
      <BwsFoodSync food={food} onSynced={() => void reload()} />

      {copying.copied ? (
        <CopiedNotice kcal={copying.copied.kcal} onUndo={() => void copying.undo()} busy={copying.busy} />
      ) : suggestion ? (
        <div className="flex items-center gap-3 rounded-3xl border-2 border-leaf bg-card p-3">
          <Copy className="size-6 shrink-0 text-leaf" aria-hidden />
          <p className="min-w-0 flex-1">
            <b>{t(`copyMeal.same.${suggestion.meal}`)}</b>
            <span className="block truncate text-sm text-ink-2">
              {suggestion.entries.map((e) => e.title).join(', ')} · {num(suggestion.kcal)} kcal
            </span>
          </p>
          <Button onClick={() => void copying.copy(suggestion.entries)} loading={copying.busy}>
            {t('copyMeal.copy')}
          </Button>
        </div>
      ) : null}

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
            {/* Saturated fat is a limit, not a goal: the bar turns red past it. */}
            <MacroBar label={t('macro.satfat')} digits={1} value={sum.satfat} target={tg.satfat_g} color={sum.satfat > tg.satfat_g ? 'var(--danger)' : 'var(--ink-3)'} />
            <MacroBar label={t('macro.fiber')} value={sum.fiber} target={tg.fiber_g} color="var(--macro-fiber)" />
            {/* Salt, for people who track it: a limit, not a goal, so the bar turns red past it. */}
            {profile.track_salt ? (
              <div>
                <MacroBar label={t('macro.salt')} digits={1} value={sum.salt} target={tg.salt_g} color={sum.salt > tg.salt_g ? 'var(--danger)' : 'var(--ink-3)'} />
                <p className="mt-0.5 text-xs text-ink-3">{t('food.sodium', { mg: num(sodiumMg(sum.salt)), max: num(sodiumMg(tg.salt_g)) })}</p>
              </div>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-2">
          {sum.kcal < tg.kcal ? t('food.left', { kcal: num(tg.kcal - sum.kcal) }) : t('food.over', { kcal: num(sum.kcal - tg.kcal) })}
        </p>
        {/* A past day can be marked as not all logged (left out of every average), or as all logged, at any time. */}
        {offset > 0 && entries.length
          ? (() => {
              const note = notes.find((n) => n.day === day)
              const said = note?.status === 'incomplete'
              const leftOut = said || (sum.kcal < tg.kcal * INCOMPLETE_SHARE && note?.status !== 'complete')
              return (
                <div className="mt-3 grid gap-2 rounded-2xl bg-card-2 p-3 text-sm">
                  <span>{t(leftOut ? (said ? 'food.leftOut' : 'food.leftOutAuto') : 'food.countedIn')}</span>
                  <Button size="sm" variant="secondary" className="justify-self-start bg-card" onClick={() => void setFoodDay(day, { status: leftOut ? 'complete' : 'incomplete' }).then(() => reload())}>
                    {t(leftOut ? 'food.markComplete' : 'food.markIncomplete')}
                  </Button>
                </div>
              )
            })()
          : null}
        <ConsistencyLink className="-ml-3 mt-1" />
        {sum.satfat > tg.satfat_g ? (
          <p className="mt-2 rounded-2xl bg-danger-soft p-3 text-sm" role="alert">
            <b>⚠️ {t('food.satfatOver', { g: num(sum.satfat, 1), max: num(tg.satfat_g) })}</b> {t('food.satfatTip')}
          </p>
        ) : null}
      </Card>

      {/* What each meal brings to the day's target. */}
      {entries.length ? <MealBreakdown entries={entries} targets={tg} /> : null}

      {!justLogged && offset === 0 && entries.length ? <NextMealCard food={food} targets={tg} /> : null}

      {/* Balanced days: the reward for eating by the guidelines (small, reachable, visible). */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-card p-3">
        <ul className="flex gap-1" aria-label={t('food.balancedWeek')}>
          {last7.map((d) => (
            <li key={d} title={date(d, { weekday: 'short', day: 'numeric' })} className={`grid size-7 place-items-center rounded-full text-xs ${balanced.get(d) ? 'bg-leaf text-white dark:text-black' : 'bg-card-2 text-ink-3'}`}>
              {balanced.get(d) ? '✓' : date(d, { weekday: 'narrow' })}
            </li>
          ))}
        </ul>
        <p className="min-w-48 flex-1 text-sm">
          <b>{t('food.balancedCount', { n: last7.filter((d) => balanced.get(d)).length })}</b>
          <span className="block text-ink-2">{balanced.get(day) ? t('food.balancedToday') : t('food.balancedHow')}</span>
        </p>
      </div>

      {entries.length ? <DayEvaluationCard totals={totalsOf(entries)} targets={tg} day={day} /> : null}

      {entries.length === 0 ? (
        <Card>
          <Empty icon="🍽️" title={t('food.empty')} text={t('food.emptyText')} />
        </Card>
      ) : (
        MEALS.filter((m) => entries.some((e) => e.meal === m)).map((m) => {
          const mt = totalsOf(entries.filter((e) => e.meal === m))
          return (
          <Card
            key={m}
            title={t(`meal.${m}`)}
            action={
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setOpenMeal(m)} aria-label={t('mealSheet.open', { meal: t(`meal.${m}`) })}>
                  <ListTree className="size-4" aria-hidden /> {t('mealSheet.details')}
                </Button>
                {offset > 0 ? (
                  <Button size="sm" variant="secondary" loading={copying.busy} onClick={() => void copyToToday(entries.filter((e) => e.meal === m))}>
                    <Copy className="size-4" aria-hidden /> {t('copyMeal.toToday')}
                  </Button>
                ) : null}
              </span>
            }
          >
            {/* The meal's own totals, then each food logged in it. */}
            <button onClick={() => setOpenMeal(m)} className="-mt-1 mb-2 block w-full rounded-xl text-left text-sm text-ink-2 active:bg-card-2">
              <b className="text-ink">{num(mt.kcal)} kcal</b> · {t('macro.protein')} {num(mt.protein_g)} g · {t('macro.carbs')} {num(mt.carbs_g)} g · {t('macro.fat')} {num(mt.fat_g)} g
            </button>
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
                  const synced = isSynced(e)
                  const band = score !== null ? scoreBand(score) : null
                  return (
                    <li key={e.id} className="flex items-center gap-3">
                      <button onClick={() => setMoving(e)} className="min-w-0 flex-1 rounded-xl text-left active:bg-card-2">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="text-sm text-ink-2">
                          {num(Number(e.kcal))} kcal · {t('macro.protein')} {num(Number(e.protein_g))} g
                        </p>
                        {/* The rest on a second, smaller line; values a synced meal did not bring are left out, not shown as 0. */}
                        <p className="text-xs text-ink-3">
                          {[
                            `${t('macro.carbs')} ${num(Number(e.carbs_g))} g`,
                            `${t('macro.fat')} ${num(Number(e.fat_g))} g`,
                            e.satfat_g != null ? `${t('macro.satfat')} ${num(Number(e.satfat_g), 1)} g` : null,
                            `${t('macro.fiber')} ${num(Number(e.fiber_g))} g`,
                            profile.track_salt && e.salt_g != null ? `${t('macro.salt')} ${num(Number(e.salt_g), 1)} g` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {synced ? <p className="text-xs text-ink-3">{t('food.syncedFrom', { app: e.origin || 'Health Connect' })}</p> : null}
                        {e.source === 'shared' ? <p className="text-xs text-ink-3">{t('food.sharedBy', { name: e.origin || '' })}</p> : null}
                        {e.logged_by ? <p className="text-xs text-ink-3">{t('food.loggedBy', { name: e.origin || '' })}</p> : null}
                        {Number(e.eaten_share ?? 1) !== 1 ? <p className="text-xs text-ink-3">{t('eaten.badge', { pct: Math.round(Number(e.eaten_share) * 100) })}</p> : null}
                      </button>
                      {band ? (
                        <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${band === 'rethink' ? 'bg-danger-soft text-danger' : band === 'okay' ? 'bg-sun-soft text-sun' : 'bg-leaf-soft text-leaf'}`}>
                          {score}
                        </span>
                      ) : null}
                      {/* Synced meals are changed in the app that logged them: a change or delete here would come back. */}
                      {synced ? null : (
                        <>
                          <button onClick={() => navigate(`/food/edit/${e.id}`)} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2" aria-label={t('food.change', { name: e.title })}>
                            <Pencil className="size-5" />
                          </button>
                          <button onClick={() => void remove(e)} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2" aria-label={t('common.delete')}>
                            <Trash2 className="size-5" />
                          </button>
                        </>
                      )}
                    </li>
                  )
                })}
            </ul>
          </Card>
          )
        })
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
        <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => setHistory(true)}>
          <History className="size-4" aria-hidden /> {t('targetHistory.open')}
        </Button>
      </Card>

      <Sheet open={Boolean(moving)} onClose={() => setMoving(null)} title={moving?.title ?? ''}>
        {moving ? (
          <div className="grid gap-3">
            {/* A meal from another app is changed there; sharing it with the family works all the same. */}
            {isSynced(moving) ? (
              <p className="text-ink-2">{t('food.syncedFrom', { app: moving.origin || 'Health Connect' })}</p>
            ) : (
              <>
                {/* Its foods and their amounts, as when it was logged. */}
                <Button variant="secondary" onClick={() => navigate(`/food/edit/${moving.id}`)}>
                  <Pencil className="size-5" aria-hidden /> {t('food.changeFoods')}
                </Button>
                {/* Eaten only in part (a portion of a Cookidoo recipe, a plate not finished): the meal follows. */}
                <EatenShare
                  key={`${moving.id}:${moving.eaten_share ?? 1}`}
                  meal={moving}
                  onChanged={(m) => {
                    scored.current.delete(m.id)
                    setMoving(m)
                    void reload()
                  }}
                />
                <p className="font-semibold">{t('food.moveTo')}</p>
                <Segmented<Meal>
                  value={moving.meal}
                  onChange={(meal) => {
                    const id = moving.id
                    setMoving(null)
                    void updateFood(id, { meal }).then(() => reload())
                  }}
                  options={MEALS.map((m) => ({ value: m, label: t(`meal.${m}`) }))}
                />
                <p className="text-sm text-ink-3">{t('food.moveHint')}</p>
              </>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                const id = moving.id
                setMoving(null)
                setSharing([id])
              }}
            >
              <Share2 className="size-5" aria-hidden /> {t('share.this')}
            </Button>
            {/* A meal (from Build With Science too) kept as a family recipe, to log again in one tap. */}
            <Button variant="secondary" onClick={() => toRecipe([moving])}>
              <BookPlus className="size-5" aria-hidden /> {t('food.makeRecipe')}
            </Button>
            {/* Shared before: the copies in the others' logs, which this person can change. */}
            <SharedCopies key={moving.id} meal={moving} />
          </div>
        ) : null}
      </Sheet>
      <Sheet open={Boolean(deleting)} onClose={() => setDeleting(null)} title={deleting?.log.title ?? ''}>
        {deleting ? (
          <div className="grid gap-3">
            <p>
              {t(deleting.copies.length === 1 ? 'food.deleteSharedOne' : 'food.deleteSharedMany', {
                names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(deleting.copies.map((c) => c.person)),
              })}
            </p>
            <Button variant="danger" size="lg" onClick={() => void removeShared(true)} loading={deletingBusy}>
              <Trash2 className="size-5" aria-hidden /> {t('food.deleteEverywhere')}
            </Button>
            <Button variant="secondary" onClick={() => void removeShared(false)} disabled={deletingBusy}>
              {t('food.deleteMineOnly')}
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deletingBusy}>
              {t('common.cancel')}
            </Button>
          </div>
        ) : null}
      </Sheet>
      <MealSheet
        meal={openMeal}
        entries={openMeal ? entries.filter((e) => e.meal === openMeal) : []}
        targets={tg}
        onClose={() => setOpenMeal(null)}
        onShare={(ids) => {
          setOpenMeal(null)
          setSharing(ids)
        }}
        onRecipe={(logs) => toRecipe(logs)}
      />
      <ShareMealSheet key={sharing?.join(',') ?? 'none'} meals={sharing ? food.filter((f) => sharing.includes(f.id)) : null} onClose={() => setSharing(null)} />
      <Sheet open={history} onClose={() => setHistory(false)} title={t('targetHistory.title')}>
        {history ? <TargetHistory /> : null}
      </Sheet>
      <TargetSheet open={adjusting} onClose={() => setAdjusting(false)} onChanged={() => void reload()} current={tg.kcal} />
      <Sheet open={explain} onClose={() => setExplain(false)} title={t('food.how')}>
        <EnergyExplainer energy={energy} profile={profile} />
      </Sheet>
    </div>
  )
}
