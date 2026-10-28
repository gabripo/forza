import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LineChart } from '../../components/charts'
import { Card, PageHeader } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { strengthHistory } from '../../lib/calc'
import { getSessions, useAsync } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { HowTo } from './ActiveWorkout'

export function ExerciseDetail() {
  const { id = '' } = useParams()
  const { t, l, num, date } = useI18n()
  const { exercises } = useApp()
  const exercise = exercises.get(id)
  const { data } = useAsync(() => getSessions(730), [])
  const points = useMemo(() => {
    const sets = (data ?? []).flatMap((s) => s.sets).filter((s) => s.exercise_id === id)
    return strengthHistory(sets).get(id) ?? []
  }, [data, id])

  if (!exercise) return <Navigate to="/train" replace />
  const timed = exercise.kind === 'time' || exercise.kind === 'cardio'
  const usesWeight = points.some((p) => p.best > 0)
  const best = points.reduce((m, p) => Math.max(m, usesWeight ? p.best : p.bestReps), 0)

  return (
    <div className="grid gap-4">
      <PageHeader title={l(exercise.name)} subtitle={exercise.muscles.map((m) => t(`muscle.${m}`)).join(' · ')} back />
      <Card>
        <HowTo exercise={exercise} />
      </Card>
      <Card title={t('exercise.yourProgress')}>
        {points.length ? (
          <>
            <p className="mb-2 text-ink-2">
              {usesWeight ? t('exercise.bestMax') : timed ? t('exercise.bestTime') : t('exercise.bestReps')}:{' '}
              <b className="text-ink">
                {num(best, 1)}
                {usesWeight ? ' kg' : timed ? ' s' : ''}
              </b>{' '}
              · {t('exercise.sessions', { n: points.length })}
            </p>
            <LineChart
              formatY={(v) => num(v, 0)}
              formatX={(ms) => date(new Date(ms))}
              series={[
                {
                  id,
                  label: usesWeight ? t('strength.estimatedMax') : t('active.reps'),
                  color: 'var(--series-1)',
                  style: 'both',
                  points: points.map((p) => ({ t: new Date(`${p.day}T12:00:00`).getTime(), v: usesWeight ? Math.round(p.best * 10) / 10 : p.bestReps })),
                },
              ]}
            />
          </>
        ) : (
          <p className="text-ink-2">{t('exercise.noHistory')}</p>
        )}
      </Card>
    </div>
  )
}
