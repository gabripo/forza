import { Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Progress } from '../../components/ui'
import { getReadLessons, useAsync } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { TOPICS } from './content'
import { TONES } from './Infographic'

export function LearnHome() {
  const { t, l } = useI18n()
  const { data: read } = useAsync(() => getReadLessons(), [])
  const done = read?.size ?? 0
  const nextId = TOPICS.find((x) => !read?.has(x.id))?.id
  return (
    <div className="grid gap-4">
      <PageHeader title={t('learn.title')} subtitle={t('learn.subtitle')} />
      <div className="rounded-3xl border border-line bg-card p-4">
        <div className="mb-2 flex justify-between font-bold">
          <span>{t('learn.course')}</span>
          <span className="text-ink-2">{t('learn.progress', { n: done, total: TOPICS.length })}</span>
        </div>
        <Progress value={done} max={TOPICS.length} color="var(--sky)" />
      </div>
      <ol className="grid gap-3">
        {TOPICS.map((topic, i) => {
          const tone = TONES[topic.tone]
          const isRead = read?.has(topic.id)
          const isNext = topic.id === nextId
          return (
            <li key={topic.id}>
              <Link
                to={`/learn/${topic.id}`}
                className={`flex items-center gap-3 rounded-3xl border bg-card p-3 active:bg-card-2 ${isNext ? 'border-sky ring-2 ring-sky' : 'border-line'}`}
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl text-4xl" style={{ background: tone.bg }} aria-hidden>
                  {topic.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-ink-3">
                    {t('learn.lesson', { n: i + 1 })}
                    {isNext ? ` · ${t('learn.nextLesson')}` : ''}
                  </span>
                  <span className="block leading-tight font-bold">{l(topic.title)}</span>
                  <span className="block text-sm text-ink-2">{l(topic.subtitle)}</span>
                </span>
                {isRead ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-leaf text-white dark:text-black" aria-label={t('learn.read')}>
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                ) : (
                  <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                )}
              </Link>
            </li>
          )
        })}
      </ol>
      <p className="text-center text-sm text-ink-3">{t('learn.printHint')}</p>
    </div>
  )
}
