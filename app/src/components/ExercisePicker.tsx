import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../lib/auth'
import { createCustomExercise } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { ExerciseKind } from '../lib/types'
import { ExerciseMedia } from './ExerciseMedia'
import { Button, Field, Input, Segmented, Sheet, cx } from './ui'

export const MUSCLE_GROUPS: Record<string, string[]> = {
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  chest: ['chest'],
  back: ['back', 'lats', 'lower_back', 'traps'],
  shoulders: ['shoulders', 'rear_delts'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['abs', 'obliques'],
  cardio: ['cardio'],
}

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { t, l } = useI18n()
  const { exercises, refreshExercises } = useApp()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...exercises.values()]
      .filter((e) => !group || e.muscles.some((m) => MUSCLE_GROUPS[group].includes(m)))
      .filter((e) => !needle || e.name.en.toLowerCase().includes(needle) || e.name.it.toLowerCase().includes(needle))
      .sort((a, b) => a.level - b.level || l(a.name).localeCompare(l(b.name)))
  }, [exercises, q, group, l])

  return (
    <Sheet open={open} onClose={onClose} title={t('picker.title')}>
      <div className="grid gap-3">
        <div className="relative">
          <Search className="absolute top-3.5 left-3 size-5 text-ink-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.search')} className="pl-10" />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...Object.keys(MUSCLE_GROUPS)].map((g) => (
            <button
              key={g ?? 'all'}
              onClick={() => setGroup(g)}
              className={cx(
                'shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold',
                group === g ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-card text-ink-2',
              )}
            >
              {g ? t(`group.${g}`) : t('common.all')}
            </button>
          ))}
        </div>
        <ul className="grid gap-2">
          {list.map((e) => (
            <li key={e.id}>
              <button onClick={() => onPick(e.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-2 text-left active:bg-card-2">
                <ExerciseMedia exercise={e} still className="w-24 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-tight">{l(e.name)}</span>
                  <span className="block text-sm text-ink-2">
                    {e.muscles.slice(0, 3).map((m) => t(`muscle.${m}`)).join(' · ')}
                  </span>
                  {e.level === 1 ? <span className="mt-0.5 inline-block rounded-full bg-leaf-soft px-2 text-xs font-bold text-leaf">{t('picker.beginner')}</span> : null}
                </span>
                <Plus className="size-6 shrink-0 text-brand" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <Plus className="size-5" aria-hidden /> {t('picker.custom')}
        </Button>
      </div>
      <CustomExerciseSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (id) => {
          await refreshExercises()
          setCreating(false)
          onPick(id)
        }}
      />
    </Sheet>
  )
}

function CustomExerciseSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [group, setGroup] = useState('legs')
  const [kind, setKind] = useState<ExerciseKind>('reps')
  const [video, setVideo] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const id = await createCustomExercise({
        name: name.trim(),
        muscles: [MUSCLE_GROUPS[group][0]],
        equipment: kind === 'bodyweight' ? 'bodyweight' : 'other',
        kind,
        video_url: video.trim(),
      })
      setName('')
      setVideo('')
      onCreated(id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('picker.custom')}>
      <div className="grid gap-4">
        <Field label={t('picker.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('picker.muscle')}>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-12 w-full rounded-2xl border border-line bg-card px-3">
            {Object.keys(MUSCLE_GROUPS).map((g) => (
              <option key={g} value={g}>
                {t(`group.${g}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('picker.kind')}>
          <Segmented<ExerciseKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'reps', label: t('kind.reps') },
              { value: 'bodyweight', label: t('kind.bodyweight') },
              { value: 'time', label: t('kind.time') },
            ]}
          />
        </Field>
        <Field label={t('picker.video')} hint={t('onb.optional')}>
          <Input type="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtube.com/..." />
        </Field>
        <Button size="lg" block onClick={save} loading={busy} disabled={!name.trim()}>
          {t('common.save')}
        </Button>
      </div>
    </Sheet>
  )
}
