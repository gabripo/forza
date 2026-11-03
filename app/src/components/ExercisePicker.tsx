import { Library, Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../lib/auth'
import { createCustomExercise, exerciseFromLibrary, findExercises, type LibraryMatch } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { Exercise, ExerciseKind } from '../lib/types'
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
    // Retired exercises stay in plans and history, but are not offered any more.
    return [...exercises.values()].filter((e) => !e.archived)
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

/**
 * Finding an exercise in the free exercise database (870+, with photos) from a description in everyday words:
 * "I raise a knee and touch it with the opposite elbow". The matches are shown with their photos, to check it is
 * the right one before adding it (steps in English and Italian, photos kept in the family's storage).
 */
function LibrarySearch({ onCreated }: { onCreated: (id: string) => void }) {
  const { t, l, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [matches, setMatches] = useState<LibraryMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function search() {
    setBusy(true)
    setError(null)
    try {
      setMatches(await findExercises(query.trim(), locale))
    } catch (e) {
      setError(t((e as Error).message === 'daily_limit_reached' ? 'snap.limit' : 'library.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function add(m: LibraryMatch) {
    setAdding(m.id)
    setError(null)
    try {
      const x = await exerciseFromLibrary(m.id)
      onCreated(await createCustomExercise({ name: x.name_en, name_it: x.name_it, muscles: x.muscles.length ? x.muscles : m.muscles, equipment: x.equipment, kind: x.kind, steps_en: x.steps_en, steps_it: x.steps_it, image_urls: x.image_urls }))
    } catch {
      setError(t('library.failed'))
    } finally {
      setAdding(null)
    }
  }

  // A match drawn like an exercise of the app (photos in turn).
  const asExercise = (m: LibraryMatch): Exercise => ({ id: m.id, name: { en: m.name_en, it: m.name_it }, muscles: m.muscles, equipment: m.equipment, kind: 'reps', level: 1, images: m.images, steps: { en: m.instructions, it: [] } }) as unknown as Exercise

  return (
    <section className="grid gap-3 rounded-2xl bg-sky-soft p-3">
      <p className="flex items-center gap-2 font-bold">
        <Library className="size-5 text-sky" aria-hidden /> {t('library.title')}
      </p>
      <p className="-mt-2 text-sm text-ink-2">{t('library.text')}</p>
      <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={2} placeholder={t('library.placeholder')} className="w-full rounded-2xl border border-line bg-card px-3 py-2 outline-none focus:border-sky" />
      <Button onClick={() => void search()} loading={busy} disabled={query.trim().length < 3}>
        <Sparkles className="size-5" aria-hidden /> {t('library.search')}
      </Button>
      {error ? <p className="rounded-2xl bg-danger-soft p-3 text-sm">{error}</p> : null}
      {matches ? (
        matches.length ? (
          <ul className="grid gap-2">
            {matches.map((m) => (
              <li key={m.id} className="grid gap-2 rounded-2xl border border-line bg-card p-2">
                <div className="flex gap-3">
                  <ExerciseMedia exercise={asExercise(m)} className="w-28 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{l({ en: m.name_en, it: m.name_it })}</p>
                    <p className="text-sm text-ink-2">{m.why}</p>
                    <p className="text-xs text-ink-3">{m.muscles.map((x) => t(`muscle.${x}`)).join(' · ')}</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void add(m)} loading={adding === m.id} disabled={Boolean(adding)}>
                  <Plus className="size-4" aria-hidden /> {t('library.add')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">{t('library.none')}</p>
        )
      ) : null}
    </section>
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
        <LibrarySearch onCreated={onCreated} />
        <p className="font-bold">{t('library.orOwn')}</p>
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
