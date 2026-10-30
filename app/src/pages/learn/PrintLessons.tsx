import { Printer } from 'lucide-react'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Button, PageHeader } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import type { Locale } from '../../lib/types'
import { useKnowledge } from '../../lib/knowledge'
import { LessonArticle } from './Infographic'

/**
 * Lessons laid out for ISO A4 paper (210 × 297 mm): real text, so it prints sharp, each lesson on
 * its own pages. `/learn/print/why_strength`, `/learn/print/course`, `/learn/print/expert` or
 * `/learn/print/all`; `?lang=it|en`. The print dialog opens by itself ("Save as PDF" works too).
 */
export function PrintLessons() {
  const { ids = 'course' } = useParams()
  const [params] = useSearchParams()
  const { t, locale } = useI18n()
  const lang = (params.get('lang') === 'en' || params.get('lang') === 'it' ? params.get('lang') : locale) as Locale
  const k = useKnowledge()
  const topics = ids === 'all' ? k.all : ids === 'course' ? k.course : ids === 'expert' ? k.expert : k.all.filter((x) => ids.split(',').includes(x.id))

  useEffect(() => {
    if (params.has('noprint')) return
    const timer = window.setTimeout(() => window.print(), 600)
    return () => window.clearTimeout(timer)
  }, [ids, lang, params])

  return (
    <div className="grid gap-4">
      <div className="no-print">
        <PageHeader title={t('learn.printTitle')} subtitle={t('learn.printSubtitle', { n: topics.length })} back={topics.length === 1 ? `/learn/${topics[0].id}` : '/learn'} />
        <Button block onClick={() => window.print()}>
          <Printer className="size-5" aria-hidden /> {t('learn.printNow')}
        </Button>
      </div>
      {topics.map((topic) => (
        <div key={topic.id} className="a4-sheet">
          <LessonArticle topic={topic} lang={lang} className="!rounded-none !shadow-none" />
        </div>
      ))}
    </div>
  )
}
