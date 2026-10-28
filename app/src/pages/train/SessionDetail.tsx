import { CloudOff, Trash2, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Loading, PageHeader } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { e1rm } from '../../lib/calc'
import { deleteSession, getSessions, useAsync } from '../../lib/data'
import { sessionMinutes } from '../../lib/energy'
import { useI18n } from '../../lib/i18n'

export function SessionDetail() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const offline = params.get('offline') === '1'
  const { t, l, num, date } = useI18n()
  const { exercises } = useApp()
  const navigate = useNavigate()
  const { data, loading } = useAsync(() => getSessions(3650), [id])

  const view = useMemo(() => {
    const all = data ?? []
    const session = all.find((s) => s.id === id)
    if (!session) return null
    // Personal records: best estimated max of this session vs every earlier session.
    const records: { exercise: string; value: number }[] = []
    const byExercise = new Map<string, typeof session.sets>()
    for (const s of session.sets) byExercise.set(s.exercise_id, [...(byExercise.get(s.exercise_id) ?? []), s])
    for (const [exId, sets] of byExercise) {
      const best = Math.max(...sets.map((s) => e1rm(Number(s.weight_kg ?? 0), Number(s.reps ?? 0))))
      if (best <= 0) continue
      const earlier = all
        .filter((o) => o.id !== id && o.started_at < session.started_at)
        .flatMap((o) => o.sets.filter((s) => s.exercise_id === exId))
      if (!earlier.length) continue
      const prev = Math.max(...earlier.map((s) => e1rm(Number(s.weight_kg ?? 0), Number(s.reps ?? 0))))
      if (best > prev) records.push({ exercise: exId, value: best })
    }
    return { session, byExercise, records }
  }, [data, id])

  if (loading && !data) return <Loading />
  if (!view) {
    return (
      <div className="grid gap-4">
        <PageHeader title={t('session.title')} back="/train" />
        {offline ? (
          <Card tone="sun">
            <p className="flex items-center gap-2 font-semibold">
              <CloudOff className="size-5" aria-hidden /> {t('session.offline')}
            </p>
          </Card>
        ) : (
          <p>{t('session.notFound')}</p>
        )}
        <Link to="/train" className="font-semibold text-brand-ink">
          {t('common.back')}
        </Link>
      </div>
    )
  }
  const { session, byExercise, records } = view

  async function remove() {
    if (!window.confirm(t('session.confirmDelete'))) return
    await deleteSession(id)
    navigate('/train/history')
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title={session.name}
        subtitle={`${date(session.started_at, { weekday: 'long', day: 'numeric', month: 'long' })} · ${Math.round(sessionMinutes(session))} min`}
        back={isNew ? '/' : true}
      />
      {isNew ? (
        <Card tone="leaf">
          <p className="text-2xl font-extrabold">{t('session.wellDone')} 🎉</p>
          <p className="text-ink-2">{t('session.wellDoneText')}</p>
        </Card>
      ) : null}
      {records.length ? (
        <Card tone="sun" title={t('session.records')}>
          <ul className="grid gap-1">
            {records.map((r) => (
              <li key={r.exercise} className="flex items-center gap-2">
                <Trophy className="size-5 text-sun" aria-hidden />
                <span className="flex-1">{l(exercises.get(r.exercise)?.name) || r.exercise}</span>
                <b>{num(r.value, 1)} kg</b>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-2">{t('session.recordsExplain')}</p>
        </Card>
      ) : null}
      {[...byExercise].map(([exId, sets]) => {
        const ex = exercises.get(exId)
        const timed = ex?.kind === 'time' || ex?.kind === 'cardio'
        return (
          <Card key={exId} title={<Link to={`/exercise/${exId}`}>{l(ex?.name) || exId}</Link>}>
            <ol className="grid gap-1">
              {sets.map((s) => (
                <li key={`${s.exercise_order}-${s.set_index}`} className="flex justify-between tabular">
                  <span className="text-ink-2">
                    {t('session.set')} {s.set_index + 1}
                  </span>
                  <span className="font-semibold">
                    {s.weight_kg ? `${num(Number(s.weight_kg), 2)} kg × ` : ''}
                    {timed ? `${s.duration_s ?? 0} s` : s.reps}
                    {s.rir !== null ? <span className="ml-2 text-sm text-ink-3">{t(`effort.rir${Math.min(s.rir, 4)}`)}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )
      })}
      {session.notes ? <Card title={t('finish.notes')}>{session.notes}</Card> : null}
      <Button variant="danger" onClick={remove}>
        <Trash2 className="size-5" aria-hidden /> {t('session.delete')}
      </Button>
    </div>
  )
}
