import { Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LineChart } from '../../components/charts'
import { Card, Empty, PageHeader, Segmented } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { strengthHistory } from '../../lib/calc'
import { getSessions, useAsync } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { HowTo } from './ActiveWorkout'

const EFFORT_DOT: Record<number, string> = { 0: 'var(--danger)', 1: 'var(--brand)', 2: 'var(--sun)', 3: 'var(--leaf)', 4: 'var(--leaf)' }

export function ExerciseDetail() {
  const { id = '' } = useParams()
  const { t, l, num, date } = useI18n()
  const { exercises } = useApp()
  const [tab, setTab] = useState<'how' | 'history'>('how')
  const exercise = exercises.get(id)
  const { data } = useAsync(() => getSessions(3650), [])

  const view = useMemo(() => {
    const sessions = (data ?? [])
      .map((s) => ({ ...s, sets: s.sets.filter((x) => x.exercise_id === id) }))
      .filter((s) => s.sets.length)
    const points = strengthHistory(sessions.flatMap((s) => s.sets)).get(id) ?? []
    // Personal records: heaviest weight (with its reps) and best single-set volume.
    let heaviest: { kg: number; reps: number; at: string } | null = null
    let volume: { kg: number; reps: number; at: string } | null = null
    for (const s of sessions) {
      for (const x of s.sets) {
        if (x.is_warmup) continue
        const kg = Number(x.weight_kg ?? 0)
        const reps = Number(x.reps ?? 0)
        if (kg > 0 && (!heaviest || kg > heaviest.kg || (kg === heaviest.kg && reps > heaviest.reps))) heaviest = { kg, reps, at: s.started_at }
        if (kg * reps > 0 && (!volume || kg * reps > volume.kg * volume.reps)) volume = { kg, reps, at: s.started_at }
      }
    }
    return { sessions, points, heaviest, volume }
  }, [data, id])

  if (!exercise) return <Navigate to="/train" replace />
  const timed = exercise.kind === 'time' || exercise.kind === 'cardio'
  const usesWeight = view.points.some((p) => p.best > 0)

  return (
    <div className="grid gap-4">
      <PageHeader title={l(exercise.name)} subtitle={exercise.muscles.map((m) => t(`muscle.${m}`)).join(' · ')} back />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'how', label: t('exercise.howTo') },
          { value: 'history', label: t('exercise.history') },
        ]}
      />

      {tab === 'how' ? (
        <>
          <Card>
            <HowTo exercise={exercise} />
          </Card>
          {view.points.length > 1 ? (
            <Card title={t('exercise.yourProgress')}>
              <LineChart
                formatY={(v) => num(v, 0)}
                formatX={(ms) => date(new Date(ms))}
                series={[
                  {
                    id,
                    label: usesWeight ? t('strength.estimatedMax') : t('active.reps'),
                    color: 'var(--series-1)',
                    style: 'both',
                    points: view.points.map((p) => ({ t: new Date(`${p.day}T12:00:00`).getTime(), v: usesWeight ? Math.round(p.best * 10) / 10 : p.bestReps })),
                  },
                ]}
              />
            </Card>
          ) : null}
        </>
      ) : (
        <>
          {view.heaviest || view.volume ? (
            <div className="grid grid-cols-2 gap-3">
              {view.heaviest ? (
                <Card tone="sun">
                  <p className="flex items-center gap-1 text-sm font-semibold text-sun">
                    <Trophy className="size-4" aria-hidden /> {t('exercise.heaviest')}
                  </p>
                  <p className="text-2xl font-extrabold">{num(view.heaviest.kg, 2)} kg</p>
                  <p className="text-sm text-ink-2">
                    × {view.heaviest.reps} · {date(view.heaviest.at)}
                  </p>
                </Card>
              ) : null}
              {view.volume ? (
                <Card tone="sun">
                  <p className="flex items-center gap-1 text-sm font-semibold text-sun">
                    <Trophy className="size-4" aria-hidden /> {t('exercise.bestSet')}
                  </p>
                  <p className="text-2xl font-extrabold">{num(view.volume.kg * view.volume.reps)} kg</p>
                  <p className="text-sm text-ink-2">
                    {num(view.volume.kg, 2)} × {view.volume.reps} · {date(view.volume.at)}
                  </p>
                </Card>
              ) : null}
            </div>
          ) : null}
          {view.sessions.length === 0 ? (
            <Card>
              <Empty icon="📒" title={t('exercise.noHistory')} />
            </Card>
          ) : (
            view.sessions.map((s) => (
              <Card key={s.id} title={date(s.started_at, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} action={<span className="text-sm text-ink-2">{s.name}</span>}>
                <ol className="grid gap-1">
                  {s.sets.map((x, i) => {
                    const warm = x.is_warmup
                    const n = s.sets.slice(0, i + 1).filter((y) => !y.is_warmup).length
                    return (
                      <li key={`${x.exercise_order}-${x.set_index}`} className="flex items-center gap-3 tabular">
                        <span className={warm ? 'w-6 font-bold text-sun' : 'w-6 font-bold text-ink-2'}>{warm ? 'W' : n}</span>
                        <span className="flex-1 font-semibold">
                          {x.weight_kg ? `${num(Number(x.weight_kg), 2)} kg × ` : ''}
                          {timed ? `${x.duration_s ?? 0} s` : x.reps}
                        </span>
                        {x.rir !== null && !warm ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                            <span className="size-2.5 rounded-full" style={{ background: EFFORT_DOT[Math.min(4, x.rir)] }} aria-hidden />
                            {t(`effort.rir${Math.min(x.rir, 4)}`)}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  )
}
