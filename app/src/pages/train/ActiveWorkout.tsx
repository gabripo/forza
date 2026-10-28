import { Check, CircleHelp, Minus, Plus, Timer, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ExerciseMedia, VideoButton } from '../../components/ExerciseMedia'
import { ExercisePicker } from '../../components/ExercisePicker'
import { Button, NumberInput, Sheet, cx } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { getLastSets } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { Exercise } from '../../lib/types'
import {
  buildExercise,
  loadActive,
  saveActive,
  submitWorkout,
  toPayload,
  type ActiveExercise,
  type ActiveSet,
  type ActiveWorkout as Workout,
} from '../../lib/workout'

/** How hard was the set? Stored as "reps in reserve". */
const EFFORT = [
  { rir: 4, key: 'easy', emoji: '😌' },
  { rir: 2, key: 'good', emoji: '🙂' },
  { rir: 1, key: 'hard', emoji: '😤' },
  { rir: 0, key: 'max', emoji: '🥵' },
] as const

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.3].forEach((delay) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.26)
    })
    navigator.vibrate?.([250, 120, 250])
  } catch {
    // sound not available
  }
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/** Keeps the screen on during the workout (where supported). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null
      } catch {
        lock = null
      }
    }
    void request()
    const onVisible = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}

export function ActiveWorkout() {
  const { t, l, num } = useI18n()
  const { exercises } = useApp()
  const navigate = useNavigate()
  const [w, setWState] = useState<Workout | null>(() => loadActive())
  const [howTo, setHowTo] = useState<Exercise | null>(null)
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const now = useNow()
  useWakeLock()

  const setW = useCallback((updater: (w: Workout) => Workout) => {
    setWState((prev) => {
      if (!prev) return prev
      const next = updater(prev)
      saveActive(next)
      return next
    })
  }, [])

  // Rest timer end: beep once.
  const beeped = useRef<number | null>(null)
  useEffect(() => {
    if (w?.rest && now >= w.rest.endsAt && beeped.current !== w.rest.endsAt) {
      beeped.current = w.rest.endsAt
      beep()
      const endsAt = w.rest.endsAt
      window.setTimeout(() => setW((x) => (x.rest?.endsAt === endsAt ? { ...x, rest: null } : x)), 4000)
    }
  }, [now, w?.rest, setW])

  if (!w) return <Navigate to="/train" replace />

  const updateSet = (ei: number, si: number, patch: Partial<ActiveSet>) =>
    setW((x) => ({
      ...x,
      exercises: x.exercises.map((e, i) => (i === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e)),
    }))

  const toggleDone = (ei: number, si: number) => {
    const ex = w.exercises[ei]
    const s = ex.sets[si]
    const kind = exercises.get(ex.exercise_id)?.kind
    const timed = kind === 'time' || kind === 'cardio'
    if (s.done) return updateSet(ei, si, { done: false, doneAt: null })
    const target = ex.suggestion?.reps ?? ex.rep_min
    setW((x) => ({
      ...x,
      rest: ex.rest_s > 0 ? { endsAt: Date.now() + ex.rest_s * 1000, total: ex.rest_s } : x.rest,
      exercises: x.exercises.map((e, i) =>
        i === ei
          ? {
              ...e,
              sets: e.sets.map((set, j) => {
                if (j === si) {
                  return {
                    ...set,
                    done: true,
                    doneAt: new Date().toISOString(),
                    reps: timed ? set.reps : (set.reps ?? target),
                    duration: timed ? (set.duration ?? (kind === 'cardio' ? target * 60 : target)) : set.duration,
                  }
                }
                // carry the weight forward to the next sets if they are still empty
                if (j > si && !set.done && set.weight === null) return { ...set, weight: s.weight }
                return set
              }),
            }
          : e,
      ),
    }))
  }

  const addSet = (ei: number) =>
    setW((x) => ({
      ...x,
      exercises: x.exercises.map((e, i) => {
        if (i !== ei) return e
        const prev = e.sets[e.sets.length - 1]
        return { ...e, sets: [...e.sets, { weight: prev?.weight ?? null, reps: null, duration: prev?.duration ?? null, rir: null, done: false, doneAt: null }] }
      }),
    }))

  const removeSet = (ei: number) =>
    setW((x) => ({
      ...x,
      exercises: x.exercises.map((e, i) => (i === ei && e.sets.length > 1 ? { ...e, sets: e.sets.slice(0, -1) } : e)),
    }))

  const removeExercise = (ei: number) => {
    if (!window.confirm(t('active.removeExercise'))) return
    setW((x) => ({ ...x, exercises: x.exercises.filter((_, i) => i !== ei) }))
  }

  async function addExercise(id: string) {
    setPicking(false)
    const last = await getLastSets([id]).catch(() => new Map())
    const kind = exercises.get(id)?.kind ?? 'reps'
    const te = { exercise_id: id, sets: 3, rep_min: kind === 'time' ? 20 : 8, rep_max: kind === 'time' ? 45 : 12, rest_s: 90 }
    setW((x) => ({ ...x, exercises: [...x.exercises, buildExercise(te, exercises.get(id), last.get(id) ?? [])] }))
  }

  const elapsed = (now - new Date(w.started_at).getTime()) / 1000
  const doneSets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const restLeft = w.rest ? (w.rest.endsAt - now) / 1000 : 0

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-48">
      <header className="pt-safe sticky top-0 z-20 -mx-4 bg-bg/95 px-4 backdrop-blur">
        <div className="flex min-h-16 items-center gap-3 py-2">
          <button onClick={() => navigate('/train')} className="grid size-11 place-items-center rounded-full active:bg-card-2" aria-label={t('active.minimise')}>
            <X className="size-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold">{w.name}</h1>
            <p className="tabular text-sm text-ink-2">
              <Timer className="mr-1 inline size-4" aria-hidden />
              {fmtClock(elapsed)} · {t('active.setsDone', { n: doneSets })}
            </p>
          </div>
          <Button variant="leaf" onClick={() => setFinishing(true)} disabled={doneSets === 0}>
            {t('active.finish')}
          </Button>
        </div>
      </header>

      <div className="grid gap-4">
        {w.exercises.map((ex, ei) => (
          <ExerciseBlock
            key={`${ex.exercise_id}-${ei}`}
            ex={ex}
            exercise={exercises.get(ex.exercise_id)}
            onHowTo={() => setHowTo(exercises.get(ex.exercise_id) ?? null)}
            onChange={(si, patch) => updateSet(ei, si, patch)}
            onToggle={(si) => toggleDone(ei, si)}
            onAddSet={() => addSet(ei)}
            onRemoveSet={() => removeSet(ei)}
            onRemove={() => removeExercise(ei)}
          />
        ))}
        <Button variant="secondary" size="lg" onClick={() => setPicking(true)}>
          <Plus className="size-5" aria-hidden /> {t('editor.addExercise')}
        </Button>
      </div>

      {w.rest ? (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-4">
          <div className={cx('mb-2 rounded-3xl p-4 text-white shadow-xl', restLeft > 0 ? 'bg-ink dark:bg-card-2 dark:text-ink' : 'bg-leaf dark:text-black')}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold opacity-80">{restLeft > 0 ? t('active.rest') : t('active.go')}</p>
                <p className="tabular text-3xl font-extrabold" aria-live="polite">
                  {restLeft > 0 ? fmtClock(restLeft) : '💪'}
                </p>
              </div>
              {restLeft > 0 ? (
                <>
                  <button
                    onClick={() => setW((x) => (x.rest ? { ...x, rest: { ...x.rest, endsAt: x.rest.endsAt - 15000 } } : x))}
                    className="h-12 shrink-0 rounded-2xl bg-white/15 px-2.5 text-sm font-bold"
                  >
                    −15s
                  </button>
                  <button
                    onClick={() => setW((x) => (x.rest ? { ...x, rest: { endsAt: x.rest.endsAt + 15000, total: x.rest.total + 15 } } : x))}
                    className="h-12 shrink-0 rounded-2xl bg-white/15 px-2.5 text-sm font-bold"
                  >
                    +15s
                  </button>
                </>
              ) : null}
              <button onClick={() => setW((x) => ({ ...x, rest: null }))} className="h-12 shrink-0 rounded-2xl bg-white/25 px-3 text-sm font-bold">
                {t('active.skip')}
              </button>
            </div>
            {restLeft > 0 ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white" style={{ width: `${(restLeft / w.rest.total) * 100}%` }} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <Sheet open={Boolean(howTo)} onClose={() => setHowTo(null)} title={l(howTo?.name)}>
        {howTo ? <HowTo exercise={howTo} /> : null}
      </Sheet>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={addExercise} />
      <FinishSheet
        open={finishing}
        onClose={() => setFinishing(false)}
        workout={w}
        elapsed={elapsed}
        onDiscard={() => {
          if (!window.confirm(t('active.discardConfirm'))) return
          saveActive(null)
          navigate('/train')
        }}
        onSaved={(online) => {
          saveActive(null)
          navigate(`/train/session/${w.id}?new=1${online ? '' : '&offline=1'}`)
        }}
        volumeLabel={(kg) => `${num(kg)} kg`}
      />
    </div>
  )
}

export function HowTo({ exercise }: { exercise: Exercise }) {
  const { t, l, locale } = useI18n()
  const steps = exercise.steps[locale]?.length ? exercise.steps[locale] : exercise.steps.en
  return (
    <div className="grid gap-4">
      <ExerciseMedia exercise={exercise} />
      <ol className="grid gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-ink">{i + 1}</span>
            <span className="pt-1">{s}</span>
          </li>
        ))}
      </ol>
      {exercise.tip ? <p className="rounded-2xl bg-sun-soft p-3">💡 {l(exercise.tip)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <VideoButton exercise={exercise} />
      </div>
      <p className="text-sm text-ink-3">{t('exercise.safety')}</p>
    </div>
  )
}

function ExerciseBlock({
  ex,
  exercise,
  onHowTo,
  onChange,
  onToggle,
  onAddSet,
  onRemoveSet,
  onRemove,
}: {
  ex: ActiveExercise
  exercise: Exercise | undefined
  onHowTo: () => void
  onChange: (si: number, patch: Partial<ActiveSet>) => void
  onToggle: (si: number) => void
  onAddSet: () => void
  onRemoveSet: () => void
  onRemove: () => void
}) {
  const { t, l, num } = useI18n()
  const kind = exercise?.kind ?? 'reps'
  const timed = kind === 'time' || kind === 'cardio'
  const s = ex.suggestion
  const target = s?.reps ?? ex.rep_min

  const hint = (() => {
    if (!s) return null
    const w = s.weight !== null ? `${num(s.weight, 2)} kg` : ''
    switch (s.kind) {
      case 'first':
        return timed ? t('hint.firstTimed') : t('hint.first', { min: ex.rep_min, max: ex.rep_max })
      case 'increase':
        return t('hint.increase', { w, reps: ex.rep_min })
      case 'lighter':
        return t('hint.lighter', { w })
      case 'more_reps':
        return timed ? t('hint.longer', { n: s.reps }) : w ? t('hint.moreReps', { w, reps: s.reps }) : t('hint.moreRepsBw', { reps: s.reps })
      default:
        return t('hint.repeat', { w, min: ex.rep_min })
    }
  })()

  return (
    <section className="rounded-3xl border border-line bg-card p-3">
      <div className="mb-2 flex items-center gap-3">
        <button onClick={onHowTo} className="w-24 shrink-0" aria-label={t('exercise.howTo')}>
          <ExerciseMedia exercise={exercise} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">{l(exercise?.name) || ex.exercise_id}</h2>
          <p className="text-sm text-ink-2">
            {timed ? t('active.targetSec', { min: ex.rep_min, max: ex.rep_max }) : t('active.targetReps', { min: ex.rep_min, max: ex.rep_max })}
            {ex.rest_s ? ` · ${t('active.restShort', { s: ex.rest_s })}` : ''}
          </p>
          <button onClick={onHowTo} className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
            <CircleHelp className="size-4" aria-hidden /> {t('exercise.howTo')}
          </button>
        </div>
        <button onClick={onRemove} className="grid size-10 place-items-center rounded-full text-ink-3 active:bg-card-2" aria-label={t('common.delete')}>
          <Trash2 className="size-5" />
        </button>
      </div>
      {ex.note ? <p className="mb-2 rounded-2xl bg-card-2 p-2 text-sm">📝 {ex.note}</p> : null}
      {hint ? <p className="mb-2 rounded-2xl bg-sky-soft p-2 text-sm text-sky">💡 {hint}</p> : null}

      <div className="grid grid-cols-[2rem_1fr_1fr_3.25rem] items-center gap-2 px-1 text-xs font-semibold text-ink-3">
        <span>#</span>
        <span className="text-center">{kind === 'bodyweight' ? t('active.extraKg') : 'kg'}</span>
        <span className="text-center">{kind === 'cardio' ? t('active.minutes') : timed ? t('active.seconds') : t('active.reps')}</span>
        <span />
      </div>
      <div className="grid gap-2">
        {ex.sets.map((set, si) => {
          const last = ex.last[si]
          return (
            <div key={si}>
              <div className={cx('grid grid-cols-[2rem_1fr_1fr_3.25rem] items-center gap-2 rounded-2xl p-1', set.done && 'bg-leaf-soft')}>
                <span className="text-center font-bold text-ink-2">{si + 1}</span>
                <NumberInput
                  value={set.weight}
                  onChange={(v) => onChange(si, { weight: v })}
                  placeholder={last?.weight != null ? String(last.weight) : kind === 'bodyweight' || timed ? '0' : '—'}
                  aria-label={t('active.weightOfSet', { n: si + 1 })}
                />
                {timed ? (
                  <NumberInput
                    decimals={false}
                    value={set.duration === null ? null : kind === 'cardio' ? Math.round(set.duration / 60) : set.duration}
                    onChange={(v) => onChange(si, { duration: v === null ? null : kind === 'cardio' ? v * 60 : v })}
                    placeholder={String(kind === 'cardio' ? ex.rep_min : target)}
                    aria-label={t('active.repsOfSet', { n: si + 1 })}
                  />
                ) : (
                  <NumberInput
                    decimals={false}
                    value={set.reps}
                    onChange={(v) => onChange(si, { reps: v })}
                    placeholder={String(target)}
                    aria-label={t('active.repsOfSet', { n: si + 1 })}
                  />
                )}
                <button
                  onClick={() => onToggle(si)}
                  aria-pressed={set.done}
                  aria-label={t('active.markDone', { n: si + 1 })}
                  className={cx(
                    'grid h-12 place-items-center rounded-2xl border-2 transition',
                    set.done ? 'border-leaf bg-leaf text-white dark:text-black' : 'border-line bg-card text-ink-3',
                  )}
                >
                  <Check className="size-7" strokeWidth={3} />
                </button>
              </div>
              {last && !set.done ? (
                <p className="pl-10 text-xs text-ink-3">
                  {t('active.lastTime')}: {last.weight != null ? `${num(last.weight, 2)} kg × ` : ''}
                  {timed ? `${last.duration ?? 0}s` : (last.reps ?? '—')}
                </p>
              ) : null}
              {set.done && !timed ? (
                <div className="mt-1 grid grid-cols-4 gap-1 pl-9" role="group" aria-label={t('effort.question')}>
                  {EFFORT.map((e) => (
                    <button
                      key={e.key}
                      onClick={() => onChange(si, { rir: set.rir === e.rir ? null : e.rir })}
                      aria-pressed={set.rir === e.rir}
                      className={cx(
                        'rounded-xl border px-1 py-1 text-xs font-semibold',
                        set.rir === e.rir ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line text-ink-2',
                      )}
                    >
                      <span aria-hidden>{e.emoji}</span> {t(`effort.${e.key}`)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="ghost" size="sm" onClick={onAddSet}>
          <Plus className="size-4" aria-hidden /> {t('active.addSet')}
        </Button>
        {ex.sets.length > 1 ? (
          <Button variant="ghost" size="sm" onClick={onRemoveSet}>
            <Minus className="size-4" aria-hidden /> {t('active.removeSet')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function FinishSheet({
  open,
  onClose,
  workout,
  elapsed,
  onDiscard,
  onSaved,
  volumeLabel,
}: {
  open: boolean
  onClose: () => void
  workout: Workout
  elapsed: number
  onDiscard: () => void
  onSaved: (online: boolean) => void
  volumeLabel: (kg: number) => string
}) {
  const { t } = useI18n()
  const [effort, setEffort] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const sets = workout.exercises.flatMap((e) => e.sets.filter((s) => s.done))
  const volume = sets.reduce((v, s) => v + (s.weight ?? 0) * (s.reps ?? 0), 0)

  async function save() {
    setBusy(true)
    const online = await submitWorkout(toPayload(workout, effort, notes))
    setBusy(false)
    onSaved(online)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('finish.title')}>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-card-2 p-3">
            <div className="text-sm text-ink-2">{t('finish.time')}</div>
            <div className="tabular text-xl font-extrabold">{fmtClock(elapsed)}</div>
          </div>
          <div className="rounded-2xl bg-card-2 p-3">
            <div className="text-sm text-ink-2">{t('finish.sets')}</div>
            <div className="text-xl font-extrabold">{sets.length}</div>
          </div>
          <div className="rounded-2xl bg-card-2 p-3">
            <div className="text-sm text-ink-2">{t('finish.volume')}</div>
            <div className="text-xl font-extrabold">{volumeLabel(volume)}</div>
          </div>
        </div>
        <div>
          <p className="mb-2 font-semibold">{t('finish.howHard')}</p>
          <div className="grid grid-cols-5 gap-2">
            {['😌', '🙂', '😐', '😤', '🥵'].map((emoji, i) => {
              const v = (i + 1) * 2
              return (
                <button
                  key={v}
                  onClick={() => setEffort(v)}
                  aria-pressed={effort === v}
                  aria-label={t(`finish.effort${i + 1}`)}
                  className={cx('rounded-2xl border-2 py-2 text-3xl', effort === v ? 'border-brand bg-brand-soft' : 'border-line bg-card')}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
          {effort ? <p className="mt-1 text-center text-sm text-ink-2">{t(`finish.effort${effort / 2}`)}</p> : null}
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold">{t('finish.notes')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-2xl border border-line bg-card p-3 outline-none focus:border-sky"
            placeholder={t('finish.notesPlaceholder')}
          />
        </label>
        <Button size="lg" variant="leaf" block onClick={save} loading={busy}>
          {t('finish.save')}
        </Button>
        <Button variant="danger" block onClick={onDiscard}>
          {t('finish.discard')}
        </Button>
      </div>
    </Sheet>
  )
}
