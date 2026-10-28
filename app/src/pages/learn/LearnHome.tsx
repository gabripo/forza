import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import { TOPICS } from './content'
import { TONES } from './Infographic'

export function LearnHome() {
  const { t, l } = useI18n()
  return (
    <div className="grid gap-4">
      <PageHeader title={t('learn.title')} subtitle={t('learn.subtitle')} />
      <ul className="grid gap-3">
        {TOPICS.map((topic) => {
          const tone = TONES[topic.tone]
          return (
            <li key={topic.id}>
              <Link to={`/learn/${topic.id}`} className="flex items-center gap-3 rounded-3xl border border-line bg-card p-3 active:bg-card-2">
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl text-4xl" style={{ background: tone.bg }} aria-hidden>
                  {topic.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight font-bold">{l(topic.title)}</span>
                  <span className="block text-sm text-ink-2">{l(topic.subtitle)}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="text-center text-sm text-ink-3">{t('learn.printHint')}</p>
    </div>
  )
}
