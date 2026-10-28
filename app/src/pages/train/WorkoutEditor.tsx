import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExerciseMedia } from '../../components/ExerciseMedia'
import { ExercisePicker } from '../../components/ExercisePicker'
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { archiveTemplate, getTemplate, getTemplates, saveTemplate } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import type { TemplateExercise } from '../../lib/types'

const DEFAULTS: Record<string, Omit<TemplateExercise, 'exercise_id'>> = {
  reps: { sets: 3, rep_min: 8, rep_max: 12, rest_s: 90 },
  bodyweight: { sets: 3, rep_min: 8, rep_max: 15, rest_s: 60 },
  time: { sets: 3, rep_min: 20, rep_max: 45, rest_s: 60 },
  cardio: { sets: 1, rep_min: 10, rep_max: 20, rest_s: 0 },
}

export function WorkoutEditor() {
  const { id } = useParams()
  const { t, l } = useI18n()
  const { exercises } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [list, setList] = useState<TemplateExercise[]>([])
  const [position, setPosition] = useState(0)
  const [managed, setManaged] = useState(false)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) {
      void getTemplates().then((all) => setPosition(all.length))
      return
    }
    void getTemplate(id).then((tpl) => {
      if (tpl) {
        setName(tpl.name)
        setNotes(tpl.notes ?? '')
        setList(tpl.exercises)
        setPosition(tpl.position)
        setManaged(tpl.managed_by_admin)
      }
      setLoading(false)
    })
  }, [id])

  const update = (i: number, patch: Partial<TemplateExercise>) => setList((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, dir: -1 | 1) =>
    setList((xs) => {
      const j = i + dir
      if (j < 0 || j >= xs.length) return xs
      const copy = [...xs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  async function save() {
    setBusy(true)
    try {
      await saveTemplate({ id, name: name.trim(), notes: notes.trim() || null, exercises: list, position })
      navigate('/train')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !window.confirm(t('editor.confirmDelete'))) return
    await archiveTemplate(id)
    navigate('/train')
  }

  if (loading) return <Loading />

  return (
    <div className="grid gap-4">
      <PageHeader title={id ? t('editor.edit') : t('editor.new')} back="/train" />
      {managed ? <p className="rounded-2xl bg-leaf-soft p-3 text-sm text-leaf">{t('editor.managed')}</p> : null}
      <Field label={t('editor.name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('editor.namePlaceholder')} />
      </Field>
      <Field label={t('editor.notes')} hint={t('onb.optional')}>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {list.map((te, i) => {
        const ex = exercises.get(te.exercise_id)
        const timed = ex?.kind === 'time' || ex?.kind === 'cardio'
        return (
          <Card key={`${te.exercise_id}-${i}`}>
            <div className="mb-3 flex items-center gap-3">
              <ExerciseMedia exercise={ex} still className="w-20 shrink-0" />
              <p className="min-w-0 flex-1 font-bold leading-tight">{l(ex?.name) || te.exercise_id}</p>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-full active:bg-card-2" aria-label={t('editor.up')}>
                  <ArrowUp className="size-5" />
                </button>
                <button onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-full active:bg-card-2" aria-label={t('editor.down')}>
                  <ArrowDown className="size-5" />
                </button>
              </div>
              <button
                onClick={() => setList((xs) => xs.filter((_, j) => j !== i))}
                className="grid size-11 place-items-center rounded-full text-danger active:bg-danger-soft"
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <label>
                <span className="mb-1 block text-ink-2">{t('editor.sets')}</span>
                <NumberInput decimals={false} value={te.sets} onChange={(v) => update(i, { sets: v ?? 1 })} />
              </label>
              <label>
                <span className="mb-1 block text-ink-2">{timed ? t('editor.secMin') : t('editor.repsMin')}</span>
                <NumberInput decimals={false} value={te.rep_min} onChange={(v) => update(i, { rep_min: v ?? 1 })} />
              </label>
              <label>
                <span className="mb-1 block text-ink-2">{timed ? t('editor.secMax') : t('editor.repsMax')}</span>
                <NumberInput decimals={false} value={te.rep_max} onChange={(v) => update(i, { rep_max: v ?? 1 })} />
              </label>
              <label>
                <span className="mb-1 block text-ink-2">{t('editor.rest')}</span>
                <NumberInput decimals={false} value={te.rest_s} onChange={(v) => update(i, { rest_s: v ?? 0 })} />
              </label>
            </div>
          </Card>
        )
      })}

      <Button variant="secondary" size="lg" onClick={() => setPicking(true)}>
        <Plus className="size-5" aria-hidden /> {t('editor.addExercise')}
      </Button>
      <p className="text-sm text-ink-3">{t('editor.repRangeHelp')}</p>

      <div className="grid gap-2">
        <Button size="lg" block onClick={save} loading={busy} disabled={!name.trim() || !list.length}>
          {t('common.save')}
        </Button>
        {id ? (
          <Button variant="danger" block onClick={remove}>
            <Trash2 className="size-5" aria-hidden /> {t('editor.delete')}
          </Button>
        ) : null}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(exId) => {
          const kind = exercises.get(exId)?.kind ?? 'reps'
          setList((xs) => [...xs, { exercise_id: exId, ...DEFAULTS[kind] }])
          setPicking(false)
        }}
      />
    </div>
  )
}
