import { Activity, Camera, ChevronRight, Dumbbell, Flame, Footprints, Heart, Scale, Share2, Trophy, Utensils } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { LineChart } from '../components/charts'
import { Button, Card, Field, Loading, NumberInput, PageHeader, Segmented, Sheet, StatusPill, type Status } from '../components/ui'
import { useApp } from '../lib/auth'
import { dailyWeights, daysAgo, localDay, recordEvents, slopePerWeek, strengthChangePct, strengthHistory, weekStreak, weightTrend } from '../lib/calc'
import { addCheckin, getCheckins, getFood, getSessions, getSteps, getWeights, useAsync } from '../lib/data'
import { computeEnergy } from '../lib/energy'
import { useI18n } from '../lib/i18n'
import { saveNodeAsImage } from '../lib/share'

type Period = 28 | 84 | 3650

interface Verdict {
  id: string
  icon: ReactNode
  title: string
  status: Status | null
  headline: string
  text: string
}

export function Check() {
  const { t, l, num, date } = useI18n()
  const { profile, exercises } = useApp()
  const [period, setPeriod] = useState<Period>(28)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)
  const { data, loading, reload } = useAsync(
    () => Promise.all([getWeights(3650), getSessions(3650), getSteps(120), getFood(120), getCheckins()]),
    [],
  )

  const view = useMemo(() => {
    if (!data || !profile) return null
    const [weights, sessions, steps, food, checkins] = data
    const since = localDay(daysAgo(period))
    const energy = computeEnergy(profile, weights, steps, sessions, food)
    const goal = profile.goal ?? 'maintain'
    const verdicts: Verdict[] = []

    // --- Weight: weekly rate as % of body weight, judged against the goal
    const trend = weightTrend(dailyWeights(weights)).filter((p) => p.day >= since)
    const slope = slopePerWeek(trend.map((p) => ({ day: p.day, kg: p.trend })))
    if (slope === null) {
      verdicts.push({ id: 'weight', icon: <Scale />, title: t('check.weight'), status: null, headline: t('check.needMore'), text: t('check.weightNeedMore') })
    } else {
      const pct = (slope / energy.weightKg) * 100
      let status: Status
      let key: string
      if (goal === 'fat_loss') {
        if (pct <= -0.25 && pct >= -1) [status, key] = ['good', 'fl_good']
        else if (pct < -1) [status, key] = ['ok', 'fl_fast']
        else if (pct <= 0.1) [status, key] = ['ok', 'fl_slow']
        else [status, key] = ['warn', 'fl_up']
      } else if (goal === 'muscle_gain') {
        if (pct >= 0.05 && pct <= 0.5) [status, key] = ['good', 'mg_good']
        else if (pct > 0.5) [status, key] = ['ok', 'mg_fast']
        else [status, key] = ['ok', 'mg_slow']
      } else {
        if (Math.abs(pct) <= 0.2) [status, key] = ['good', 'mt_good']
        else [status, key] = ['ok', pct > 0 ? 'mt_up' : 'mt_down']
      }
      verdicts.push({
        id: 'weight',
        icon: <Scale />,
        title: t('check.weight'),
        status,
        headline: t('check.perWeek', { kg: `${slope > 0 ? '+' : '−'}${num(Math.abs(slope), 2)}` }),
        text: t(`check.w.${key}`),
      })
    }

    // --- Strength
    const history = strengthHistory(sessions.flatMap((s) => s.sets))
    const change = strengthChangePct(history, since)
    const improved = [...history]
      .map(([id, pts]) => {
        const usable = pts.filter((p) => p.day >= since && p.best > 0)
        return usable.length >= 2 ? { id, pct: ((usable.at(-1)!.best - usable[0].best) / usable[0].best) * 100 } : null
      })
      .filter((x): x is { id: string; pct: number } => Boolean(x && x.pct > 0))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3)
    verdicts.push(
      change === null
        ? { id: 'strength', icon: <Dumbbell />, title: t('check.strength'), status: null, headline: t('check.needMore'), text: t('check.strengthNeedMore') }
        : {
            id: 'strength',
            icon: <Dumbbell />,
            title: t('check.strength'),
            status: change > 2 ? 'good' : change >= 0 ? 'ok' : 'warn',
            headline: `${change >= 0 ? '+' : '−'}${num(Math.abs(change), 0)}%`,
            text:
              (change > 2 ? t('check.s.good') : change >= 0 ? t('check.s.flat') : t('check.s.down')) +
              (improved.length ? ` ${t('check.s.top')}: ${improved.map((x) => `${l(exercises.get(x.id)?.name) || x.id} (+${num(x.pct, 0)}%)`).join(', ')}.` : ''),
          },
    )

    // --- Consistency
    const firstDay = sessions.length ? sessions[sessions.length - 1].started_at.slice(0, 10) : localDay(new Date())
    const spanDays = Math.max(7, Math.min(period, (Date.now() - new Date(firstDay).getTime()) / 86_400_000))
    const inPeriod = sessions.filter((s) => s.started_at.slice(0, 10) >= since).length
    const perWeek = inPeriod / (spanDays / 7)
    const target = profile.workouts_per_week
    verdicts.push({
      id: 'consistency',
      icon: <Activity />,
      title: t('check.consistency'),
      status: perWeek >= target * 0.9 ? 'good' : perWeek >= target * 0.6 ? 'ok' : 'warn',
      headline: t('check.workoutsPerWeek', { n: num(perWeek, 1), goal: target }),
      text: perWeek >= target * 0.9 ? t('check.c.good') : perWeek >= target * 0.6 ? t('check.c.ok') : t('check.c.low'),
    })

    // --- Steps
    const stepRows = steps.filter((s) => s.day >= since && s.steps > 0)
    if (stepRows.length >= 3) {
      const avg = stepRows.reduce((a, s) => a + s.steps, 0) / stepRows.length
      verdicts.push({
        id: 'steps',
        icon: <Footprints />,
        title: t('check.steps'),
        status: avg >= profile.steps_goal ? 'good' : avg >= profile.steps_goal * 0.7 ? 'ok' : 'warn',
        headline: t('check.stepsAvg', { n: num(avg) }),
        text: avg >= profile.steps_goal ? t('check.st.good') : t('check.st.low', { add: num(Math.max(500, Math.round(Math.min(2000, profile.steps_goal - avg) / 100) * 100)) }),
      })
    }

    // --- Nutrition (only if the person logs food)
    const days = new Map<string, { kcal: number; protein: number }>()
    for (const f of food) {
      const d = localDay(new Date(f.eaten_at))
      if (d < since) continue
      const x = days.get(d) ?? { kcal: 0, protein: 0 }
      x.kcal += Number(f.kcal)
      x.protein += Number(f.protein_g)
      days.set(d, x)
    }
    const logged = [...days.values()].filter((d) => d.kcal >= 900)
    if (logged.length >= 3) {
      const kcal = logged.reduce((a, d) => a + d.kcal, 0) / logged.length
      const protein = logged.reduce((a, d) => a + d.protein, 0) / logged.length
      const pOk = protein >= energy.targets.protein_g * 0.85
      const kOff = (kcal - energy.targets.kcal) / energy.targets.kcal
      verdicts.push({
        id: 'food',
        icon: <Utensils />,
        title: t('check.nutrition'),
        status: pOk && Math.abs(kOff) <= 0.12 ? 'good' : pOk || Math.abs(kOff) <= 0.12 ? 'ok' : 'warn',
        headline: t('check.foodAvg', { kcal: num(kcal), protein: num(protein) }),
        text: [
          pOk ? t('check.f.proteinOk') : t('check.f.proteinLow', { target: energy.targets.protein_g }),
          Math.abs(kOff) <= 0.12 ? t('check.f.kcalOk') : kOff > 0 ? t('check.f.kcalHigh') : t('check.f.kcalLow'),
        ].join(' '),
      })
    }

    const recentCheckins = checkins.slice(0, 12).reverse()
    const allSets = sessions.flatMap((s) => s.sets.filter((x) => !x.is_warmup))
    const streak = weekStreak(sessions.map((s) => s.started_at))
    const records = recordEvents(allSets).slice(0, 5)
    return { streak, records, totalWorkouts: sessions.length, verdicts, recentCheckins, latest: checkins[0] ?? null, trendNow: trend.at(-1)?.trend ?? null, change, inPeriod }
  }, [data, profile, period, t, l, num, exercises])

  if (loading && !data) return <Loading />
  if (!view || !profile) return null

  const good = view.verdicts.filter((v) => v.status === 'good').length

  return (
    <div className="grid gap-4">
      <PageHeader title={t('check.title')} subtitle={t('check.subtitle')} />
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: 28, label: t('check.p4w') },
          { value: 84, label: t('check.p12w') },
          { value: 3650, label: t('check.pAll') },
        ]}
      />

      {/* Shareable summary */}
      <div ref={shareRef} className="rounded-3xl bg-white p-5 text-[#1c1917] shadow-sm ring-1 ring-black/5">
        <div className="mb-3 flex items-center gap-3">
          <Logo size={40} />
          <div>
            <p className="text-lg font-extrabold">{t('check.cardTitle', { name: profile.display_name })}</p>
            <p className="text-sm text-[#57534e]">{period === 3650 ? t('check.pAll') : period === 28 ? t('check.p4w') : t('check.p12w')}</p>
          </div>
        </div>
        <p className="mb-3 text-2xl font-extrabold">{t('check.score', { n: good, total: view.verdicts.filter((v) => v.status).length })}</p>
        <ul className="grid grid-cols-2 gap-2">
          {view.verdicts.map((v) => (
            <li key={v.id} className="rounded-2xl bg-[#faf7f2] p-3">
              <p className="text-sm text-[#57534e]">{v.title}</p>
              <p className="font-extrabold">{v.headline}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-semibold text-[#c2410c]">Forza! 💪</p>
      </div>
      <Button variant="secondary" onClick={() => shareRef.current && saveNodeAsImage(shareRef.current, 'forza-progress.png')}>
        <Share2 className="size-5" aria-hidden /> {t('check.share')}
      </Button>

      <Card title={t('check.training')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-brand-soft p-3">
            <p className="flex items-center gap-1 text-sm font-semibold text-brand-ink">
              <Flame className="size-4" aria-hidden /> {t('check.streak')}
            </p>
            <p className="text-3xl font-extrabold">{view.streak}</p>
            <p className="text-sm text-ink-2">{t('check.weeksInARow')}</p>
          </div>
          <div className="rounded-2xl bg-sky-soft p-3">
            <p className="flex items-center gap-1 text-sm font-semibold text-sky">
              <Dumbbell className="size-4" aria-hidden /> {t('check.allTime')}
            </p>
            <p className="text-3xl font-extrabold">{view.totalWorkouts}</p>
            <p className="text-sm text-ink-2">{t('check.workoutsTotal')}</p>
          </div>
        </div>
        {view.records.length ? (
          <>
            <p className="mt-4 mb-1 font-bold">{t('check.recentRecords')}</p>
            <ul className="grid gap-1">
              {view.records.map((r) => (
                <li key={`${r.exerciseId}-${r.day}`}>
                  <Link to={`/exercise/${r.exerciseId}`} className="flex items-center gap-2 rounded-xl py-1.5 active:bg-card-2">
                    <Trophy className="size-5 shrink-0 text-sun" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{l(exercises.get(r.exerciseId)?.name) || r.exerciseId}</span>
                    <span className="text-sm text-ink-2">{date(r.day)}</span>
                    <b className="tabular">+{num(((r.value - r.previous) / r.previous) * 100, 0)}%</b>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-ink-3">{t('check.recordsExplain')}</p>
          </>
        ) : null}
      </Card>

      <Link to="/check/photos" className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4">
        <Camera className="size-6 text-brand" aria-hidden />
        <span className="flex-1">
          <span className="block font-bold">{t('photos.title')}</span>
          <span className="block text-sm text-ink-2">{t('photos.subtitle')}</span>
        </span>
        <ChevronRight className="size-5 text-ink-3" aria-hidden />
      </Link>

      {view.verdicts.map((v) => (
        <Card key={v.id}>
          <div className="mb-2 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card-2 text-ink-2 [&>svg]:size-6" aria-hidden>
              {v.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{v.title}</h2>
              <p className="text-xl font-extrabold">{v.headline}</p>
            </div>
            {v.status ? <StatusPill status={v.status}>{t(`status.${v.status}`)}</StatusPill> : null}
          </div>
          <p className="text-ink-2">{v.text}</p>
        </Card>
      ))}

      <Card
        title={t('check.feelings')}
        action={
          <Button size="sm" onClick={() => setCheckinOpen(true)}>
            <Heart className="size-4" aria-hidden /> {t('check.doCheckin')}
          </Button>
        }
      >
        {view.recentCheckins.length >= 2 ? (
          <LineChart
            height={180}
            formatY={(v) => num(v, 0)}
            formatX={(ms) => date(new Date(ms))}
            series={[
              { id: 'energy', label: t('check.energy'), color: 'var(--series-1)', style: 'both', points: view.recentCheckins.filter((c) => c.energy).map((c) => ({ t: new Date(c.created_at).getTime(), v: c.energy! })) },
              { id: 'sleep', label: t('check.sleep'), color: 'var(--series-2)', style: 'both', points: view.recentCheckins.filter((c) => c.sleep).map((c) => ({ t: new Date(c.created_at).getTime(), v: c.sleep! })) },
            ]}
          />
        ) : (
          <p className="text-ink-2">{t('check.checkinIntro')}</p>
        )}
        {view.latest?.waist_cm ? (
          <p className="mt-2 text-ink-2">
            {t('check.waist')}: <b className="text-ink">{num(Number(view.latest.waist_cm), 1)} cm</b> ({date(view.latest.created_at)})
          </p>
        ) : null}
      </Card>

      <CheckinSheet
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        onSaved={() => {
          setCheckinOpen(false)
          void reload()
        }}
        snapshot={{ period, verdicts: view.verdicts.map(({ id, status, headline }) => ({ id, status, headline })) }}
      />
    </div>
  )
}

const FACES = ['😫', '😕', '😐', '🙂', '😄']

function Scale5({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-1 font-semibold">{label}</p>
      <div className="grid grid-cols-5 gap-2">
        {FACES.map((f, i) => (
          <button
            key={f}
            onClick={() => onChange(i + 1)}
            aria-pressed={value === i + 1}
            aria-label={`${label} ${i + 1}/5`}
            className={`rounded-2xl border-2 py-2 text-3xl ${value === i + 1 ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  )
}

function CheckinSheet({ open, onClose, onSaved, snapshot }: { open: boolean; onClose: () => void; onSaved: () => void; snapshot: unknown }) {
  const { t } = useI18n()
  const [energy, setEnergy] = useState<number | null>(null)
  const [sleep, setSleep] = useState<number | null>(null)
  const [mood, setMood] = useState<number | null>(null)
  const [waist, setWaist] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await addCheckin({ energy, sleep, mood, waist_cm: waist, notes: notes.trim() || null, snapshot })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('check.doCheckin')}>
      <div className="grid gap-4">
        <Scale5 label={t('check.energy')} value={energy} onChange={setEnergy} />
        <Scale5 label={t('check.sleep')} value={sleep} onChange={setSleep} />
        <Scale5 label={t('check.mood')} value={mood} onChange={setMood} />
        <Field label={t('check.waistCm')} hint={t('check.waistHow')}>
          <NumberInput value={waist} onChange={setWaist} />
        </Field>
        <label className="block">
          <span className="mb-1 block font-semibold">{t('finish.notes')}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-2xl border border-line bg-card p-3" />
        </label>
        <Button size="lg" block onClick={save} loading={busy} disabled={!energy && !sleep && !mood && !waist}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
