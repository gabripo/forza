import { BookOpen, ChevronRight, History as HistoryIcon, Pencil, Play, Plus, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import { ExercisePicker } from '../../components/ExercisePicker'
import { Button, Card, Empty, Loading, PageHeader } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { getLastSets, getSessions, getTemplates, useAsync } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { nextTemplate } from '../../lib/plan'
import type { WorkoutTemplate } from '../../lib/types'
import { loadActive, saveActive, startFromTemplate } from '../../lib/workout'

export function TrainHome() {
  const { t, l, date } = useI18n()
  const { exercises } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [starting, setStarting] = useState<string | null>(null)
  const [browse, setBrowse] = useState(false)
  const { data, loading } = useAsync(() => Promise.all([getTemplates(), getSessions(120)]), [])

  async function start(tpl: WorkoutTemplate | null) {
    if (loadActive() && !window.confirm(t('train.replaceActive'))) return
    setStarting(tpl?.id ?? 'empty')
    try {
      const last = tpl ? await getLastSets(tpl.exercises.map((e) => e.exercise_id)) : new Map()
      saveActive(startFromTemplate(tpl, exercises, last, tpl ? undefined : t('train.freeWorkout')))
      navigate('/train/active')
    } finally {
      setStarting(null)
    }
  }

  // Started from the dashboard ("Next up" button).
  const startId = params.get('start')
  useEffect(() => {
    if (!startId || !data) return
    setParams({}, { replace: true })
    const tpl = data[0].find((x) => x.id === startId)
    if (tpl) void start(tpl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId, data])

  if (loading && !data) return <Loading />
  const [templates, sessions] = data ?? [[], []]
  const next = nextTemplate(templates, sessions)
  const lastDone = (id: string) => sessions.find((s) => s.template_id === id)?.started_at

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t('train.title')}
        action={
          <Link to="/train/history" className="inline-flex h-11 items-center gap-1 rounded-2xl bg-card-2 px-3 font-semibold">
            <HistoryIcon className="size-5" aria-hidden /> {t('train.history')}
          </Link>
        }
      />

      {next ? (
        <Card tone="brand">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-ink">{t('dash.nextUp')}</p>
          <p className="text-2xl font-extrabold">{next.name}</p>
          <p className="mb-3 text-ink-2">
            {next.exercises
              .slice(0, 4)
              .map((e) => l(exercises.get(e.exercise_id)?.name) || e.exercise_id)
              .join(' · ')}
            {next.exercises.length > 4 ? ' …' : ''}
          </p>
          <Button size="lg" block onClick={() => start(next)} loading={starting === next.id}>
            <Play className="size-5" aria-hidden /> {t('train.start')}
          </Button>
        </Card>
      ) : null}

      <Card
        title={t('train.myWorkouts')}
        action={
          <Button size="sm" variant="secondary" onClick={() => navigate('/train/new')}>
            <Plus className="size-4" aria-hidden /> {t('train.create')}
          </Button>
        }
      >
        {templates.length === 0 ? (
          <Empty icon="🏋️" title={t('train.noWorkouts')} text={t('train.noWorkoutsText')} />
        ) : (
          <ul className="grid gap-2">
            {templates.map((tpl) => {
              const done = lastDone(tpl.id)
              return (
                <li key={tpl.id} className="flex items-center gap-2 rounded-2xl border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 font-bold">
                      {tpl.name}
                      {tpl.managed_by_admin ? <ShieldCheck className="size-4 text-leaf" aria-label={t('train.byCoach')} /> : null}
                    </p>
                    <p className="text-sm text-ink-2">
                      {t('train.nExercises', { n: tpl.exercises.length })}
                      {done ? ` · ${t('train.lastDone', { date: date(done) })}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/train/edit/${tpl.id}`)}
                    className="grid size-11 place-items-center rounded-full active:bg-card-2"
                    aria-label={t('common.edit')}
                  >
                    <Pencil className="size-5 text-ink-2" />
                  </button>
                  <Button size="md" onClick={() => start(tpl)} loading={starting === tpl.id} aria-label={`${t('train.start')} ${tpl.name}`}>
                    <Play className="size-5" aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <Button variant="ghost" block className="mt-2" onClick={() => start(null)} loading={starting === 'empty'}>
          {t('train.startEmpty')}
        </Button>
      </Card>

      <Card title={t('train.library')} action={<BookOpen className="size-5 text-ink-3" aria-hidden />}>
        <p className="mb-3 text-ink-2">{t('train.libraryText')}</p>
        <div className="grid grid-cols-3 gap-2">
          {['goblet_squat', 'lat_pulldown', 'machine_chest_press'].map((id) => (
            <Link key={id} to={`/exercise/${id}`} className="text-center text-sm font-semibold">
              <ExerciseMedia exercise={exercises.get(id)} still />
              <span className="mt-1 block leading-tight">{l(exercises.get(id)?.name)}</span>
            </Link>
          ))}
        </div>
        <Button variant="secondary" block className="mt-3" onClick={() => setBrowse(true)}>
          {t('train.browse')} <ChevronRight className="size-5" aria-hidden />
        </Button>
      </Card>

      <ExercisePicker
        open={browse}
        onClose={() => setBrowse(false)}
        onPick={(id) => {
          setBrowse(false)
          navigate(`/exercise/${id}`)
        }}
      />
    </div>
  )
}
