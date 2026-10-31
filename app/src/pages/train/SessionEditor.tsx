import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ExercisePicker } from '../../components/ExercisePicker'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, cx } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { localDay } from '../../lib/calc'
import { deleteSession, getLastSets, getSession, getTemplates, saveSession } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { Exercise, WorkoutTemplate } from '../../lib/types'
import { suggest } from '../../lib/workout'

interface DraftSet {
  weight: number | null
  reps: number | null
  duration: number | null
  /** Warm-up sets stay warm-ups (lighter, not counted in progress). */
  warmup?: boolean
}

interface Draft {
  id: string
  isNew: boolean
  source: string | null
  template_id: string | null
  name: string
  day: string
  time: string
  minutes: number | null
  effort: number | null
  notes: string
  exercises: { exercise_id: string; sets: DraftSet[] }[]
}

const timed = (ex: Exercise | undefined) => ex?.kind === 'time' || ex?.kind === 'cardio'
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** A plan's workout as it would be today: the sets and weights the double-progression rule suggests from last time. */
async function fromTemplate(t: WorkoutTemplate, exercises: Map<string, Exercise>): Promise<Draft['exercises']> {
  const last = await getLastSets(t.exercises.map((e) => e.exercise_id)).catch(() => new Map())
  return t.exercises.map((te) => {
    const ex = exercises.get(te.exercise_id)
    const s = suggest(ex, te, last.get(te.exercise_id) ?? [])
    return {
      exercise_id: te.exercise_id,
      sets: Array.from({ length: Math.max(1, te.sets) }, () =>
        timed(ex) ? { weight: s.weight, reps: null, duration: s.reps } : { weight: s.weight, reps: s.reps, duration: null },
      ),
    }
  })
}

/**
 * A workout logged afterwards, or changed later, on any day: when, which workout, every set, how hard and notes.
 * New: /train/log (?template=…&day=yyyy-MM-dd from the week plan); existing: /train/session/:id/edit.
 */
export function SessionEditor() {
  const { t, l } = useI18n()
  const { exercises } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  // Read once: a later refresh of the exercise list must not undo what was typed.
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void (async () => {
      const list = await getTemplates().catch(() => [])
      setTemplates(list)
      if (id) {
        const s = await getSession(id)
        if (!s) return
        const start = new Date(s.started_at)
        const byOrder = new Map<number, Draft['exercises'][number]>()
        for (const x of s.sets) {
          const e = byOrder.get(x.exercise_order) ?? { exercise_id: x.exercise_id, sets: [] }
          e.sets.push({ weight: x.weight_kg === null ? null : Number(x.weight_kg), reps: x.reps, duration: x.duration_s, warmup: x.is_warmup })
          byOrder.set(x.exercise_order, e)
        }
        setDraft({
          id: s.id,
          isNew: false,
          source: s.source ?? null,
          template_id: s.template_id,
          name: s.name,
          day: localDay(start),
          time: hhmm(start),
          minutes: s.finished_at ? Math.max(1, Math.round((new Date(s.finished_at).getTime() - start.getTime()) / 60000)) : 45,
          effort: s.effort,
          notes: s.notes ?? '',
          exercises: [...byOrder.entries()].sort((a, b) => a[0] - b[0]).map(([, e]) => e),
        })
        return
      }
      const tpl = list.find((x) => x.id === params.get('template')) ?? null
      setDraft({
        id: crypto.randomUUID(),
        isNew: true,
        source: null,
        template_id: tpl?.id ?? null,
        name: tpl?.name ?? t('train.freeWorkout'),
        day: params.get('day') ?? localDay(new Date()),
        time: '18:00',
        minutes: 45,
        effort: null,
        notes: '',
        exercises: tpl ? await fromTemplate(tpl, exercises) : [],
      })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!draft) return <Loading />
  const d = draft
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch })
  const setSets = (ei: number, sets: DraftSet[]) => set({ exercises: d.exercises.map((e, i) => (i === ei ? { ...e, sets } : e)) })

  async function pickTemplate(tpl: WorkoutTemplate) {
    setDraft({ ...d, template_id: tpl.id, name: tpl.name, exercises: await fromTemplate(tpl, exercises) })
  }

  async function save() {
    setBusy(true)
    try {
      const start = new Date(`${d.day}T${d.time || '18:00'}:00`)
      const minutes = d.minutes ?? 45
      const kept = d.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps || s.duration || s.weight) })).filter((e) => e.sets.length)
      const count = kept.reduce((n, e) => n + e.sets.length, 0)
      let k = 0
      const sets = kept.flatMap((e, order) =>
        e.sets.map((s, i) => ({
          exercise_id: e.exercise_id,
          exercise_order: order,
          set_index: i,
          weight_kg: s.weight,
          reps: s.reps,
          duration_s: s.duration,
          rir: null,
          is_warmup: Boolean(s.warmup),
          // Spread over the workout, so the history reads in order.
          performed_at: new Date(start.getTime() + (++k / (count + 1)) * minutes * 60000).toISOString(),
        })),
      )
      await saveSession(
        { id: d.id, template_id: d.template_id, name: d.name.trim() || t('train.freeWorkout'), started_at: start.toISOString(), finished_at: new Date(start.getTime() + minutes * 60000).toISOString(), effort: d.effort, notes: d.notes.trim() || null },
        sets,
      )
      navigate(`/train/session/${d.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(t('session.confirmDelete'))) return
    await deleteSession(d.id)
    navigate('/train/history', { replace: true })
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={d.isNew ? t('sessionEditor.logTitle') : t('sessionEditor.editTitle')} back />
      {d.source && d.source !== 'app' ? <p className="rounded-2xl bg-sun-soft p-3 text-sm">{t('sessionEditor.imported')}</p> : null}

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('sessionEditor.day')}>
            <Input type="date" value={d.day} max={localDay(new Date())} onChange={(e) => set({ day: e.target.value })} />
          </Field>
          <Field label={t('sessionEditor.time')}>
            <Input type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} />
          </Field>
          <Field label={t('sessionEditor.name')}>
            <Input value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={t('sessionEditor.minutes')}>
            <NumberInput decimals={false} value={d.minutes} onChange={(v) => set({ minutes: v })} />
          </Field>
        </div>
        {d.isNew && templates.length ? (
          <div className="mt-3">
            <p className="mb-1 text-sm font-semibold text-ink-2">{t('sessionEditor.fromPlan')}</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <Button key={tpl.id} size="sm" variant={d.template_id === tpl.id ? 'primary' : 'secondary'} onClick={() => void pickTemplate(tpl)}>
                  {tpl.name}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {d.exercises.map((e, ei) => {
        const ex = exercises.get(e.exercise_id)
        const kind = ex?.kind ?? 'reps'
        return (
          <Card
            key={`${e.exercise_id}-${ei}`}
            title={l(ex?.name) || e.exercise_id}
            action={
              <button onClick={() => set({ exercises: d.exercises.filter((_, i) => i !== ei) })} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2" aria-label={t('common.delete')}>
                <Trash2 className="size-5" />
              </button>
            }
          >
            <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 px-1 text-xs font-semibold text-ink-3">
              <span>#</span>
              <span className="text-center">{kind === 'bodyweight' ? t('active.extraKg') : 'kg'}</span>
              <span className="text-center">{kind === 'cardio' ? t('active.minutes') : timed(ex) ? t('active.seconds') : t('active.reps')}</span>
              <span />
            </div>
            <div className="grid gap-2">
              {e.sets.map((s, si) => (
                <div key={si} className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2">
                  <span className={cx('text-center font-bold', s.warmup ? 'text-sun' : 'text-ink-2')} title={s.warmup ? t('active.warmup') : undefined}>
                    {s.warmup ? 'W' : si + 1 - e.sets.slice(0, si).filter((x) => x.warmup).length}
                  </span>
                  <NumberInput value={s.weight} onChange={(v) => setSets(ei, e.sets.map((x, j) => (j === si ? { ...x, weight: v } : x)))} aria-label={t('active.weightOfSet', { n: si + 1 })} />
                  {timed(ex) ? (
                    <NumberInput
                      decimals={false}
                      value={s.duration === null ? null : kind === 'cardio' ? Math.round(s.duration / 60) : s.duration}
                      onChange={(v) => setSets(ei, e.sets.map((x, j) => (j === si ? { ...x, duration: v === null ? null : kind === 'cardio' ? v * 60 : v } : x)))}
                    />
                  ) : (
                    <NumberInput decimals={false} value={s.reps} onChange={(v) => setSets(ei, e.sets.map((x, j) => (j === si ? { ...x, reps: v } : x)))} />
                  )}
                  <button onClick={() => setSets(ei, e.sets.filter((_, j) => j !== si))} disabled={e.sets.length === 1} className="grid size-10 place-items-center text-ink-3 disabled:opacity-30" aria-label={t('active.removeSet')}>
                    <X className="size-5" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSets(ei, [...e.sets, { ...(e.sets.at(-1) ?? { weight: null, reps: null, duration: null }), warmup: false }])}>
              <Plus className="size-4" aria-hidden /> {t('active.addSet')}
            </Button>
          </Card>
        )
      })}

      <Button variant="secondary" block onClick={() => setPicking(true)}>
        <Plus className="size-5" aria-hidden /> {t('editor.addExercise')}
      </Button>

      <Card>
        <p className="mb-2 font-semibold">{t('finish.howHard')}</p>
        <div className="grid grid-cols-5 gap-2">
          {['😌', '🙂', '😐', '😤', '🥵'].map((emoji, i) => {
            const v = (i + 1) * 2
            return (
              <button
                key={v}
                onClick={() => set({ effort: d.effort === v ? null : v })}
                aria-pressed={d.effort === v}
                aria-label={t(`finish.effort${i + 1}`)}
                className={cx('rounded-2xl border-2 py-2 text-3xl', d.effort === v ? 'border-brand bg-brand-soft' : 'border-line bg-card')}
              >
                {emoji}
              </button>
            )
          })}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block font-semibold">{t('finish.notes')}</span>
          <textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className="w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-sky" />
        </label>
      </Card>

      <Button size="lg" variant="leaf" block onClick={() => void save()} loading={busy} disabled={!d.exercises.some((e) => e.sets.some((s) => s.reps || s.duration || s.weight))}>
        {t('sessionEditor.save')}
      </Button>
      {!d.isNew ? (
        <Button variant="danger" onClick={() => void remove()}>
          <Trash2 className="size-5" aria-hidden /> {t('session.delete')}
        </Button>
      ) : null}

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => {
          setPicking(false)
          set({ exercises: [...d.exercises, { exercise_id: exerciseId, sets: [{ weight: null, reps: null, duration: null }] }] })
        }}
      />
    </div>
  )
}
