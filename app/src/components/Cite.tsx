import { BookMarked, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { SOURCES, TRAINING_FACTS } from '../data/sources'
import { useI18n } from '../lib/i18n'
import { Card, Sheet } from './ui'

/** A small "Source" link after a statement: it opens the full references, each with a link to the paper. */
export function Cite({ ids }: { ids: string[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const sources = ids.map((id) => SOURCES[id]).filter(Boolean)
  if (!sources.length) return null
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 align-baseline text-sm font-semibold text-sky underline-offset-2 hover:underline">
        <BookMarked className="size-3.5" aria-hidden /> {sources.length > 1 ? t('sources.many', { n: sources.length }) : t('sources.one')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('sources.title')}>
        <ul className="grid gap-3">
          {sources.map((s) => (
            <li key={s.id} className="rounded-2xl bg-card-2 p-3">
              <p className="font-semibold leading-snug">{s.title}</p>
              <p className="mt-1 text-sm text-ink-2">
                {s.authors} ({s.year}). <i>{s.journal}</i>
              </p>
              <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
                {t('sources.open')} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}

/** Why the Training section works the way it does, in plain words, each point with its studies. */
export function TrainingFacts() {
  const { t, l } = useI18n()
  return (
    <Card title={t('sources.whyTitle')} action={<BookMarked className="size-5 text-ink-3" aria-hidden />}>
      <p className="mb-3 text-ink-2">{t('sources.whyIntro')}</p>
      <ul className="grid gap-3">
        {TRAINING_FACTS.map((f) => (
          <li key={f.id} className="flex gap-3">
            <span className="text-2xl" aria-hidden>
              {f.emoji}
            </span>
            <p className="flex-1">
              {l(f.text)} <Cite ids={f.sources} />
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
