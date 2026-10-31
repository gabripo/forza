import { ChevronRight, Lightbulb } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui'
import { translate } from '../../lib/i18n'
import type { L10n, Locale } from '../../lib/types'
import type { Topic } from './content'
import { LessonArticle } from './Infographic'
import type { Question } from './more'

interface Preview {
  type: 'forza-preview'
  lesson?: Partial<Topic> & { quiz?: Question[] }
  tip?: { text: L10n; lesson?: { emoji: string; title: L10n } | null }
}

const empty: L10n = { en: '', it: '' }

/**
 * A lesson or a tip of the day as it is drawn in the app, for Forza! Coach's preview: Coach shows this page in a
 * frame and sends what it is writing. Lessons are general information, so the page works without signing in.
 */
export function LessonPreview() {
  const [params] = useSearchParams()
  const [lang, setLang] = useState<Locale>(params.get('lang') === 'it' ? 'it' : 'en')
  const [shown, setShown] = useState<Preview | null>(null)
  const t = (key: string) => translate(lang, key)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'forza-preview') setShown(e.data as Preview)
    }
    window.addEventListener('message', onMessage)
    // Coach waits for this before sending the first version.
    window.parent?.postMessage({ type: 'forza-preview-ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const c = shown?.lesson
  const topic: Topic | null = c
    ? {
        id: c.id || 'preview',
        emoji: c.emoji || '📘',
        tone: c.tone ?? 'blue',
        title: c.title ?? empty,
        subtitle: c.subtitle ?? empty,
        blocks: Array.isArray(c.blocks) ? c.blocks : [],
        sources: Array.isArray(c.sources) ? c.sources : undefined,
      }
    : null
  const l = (v: L10n | undefined) => v?.[lang] || v?.en || ''

  return (
    <div className="mx-auto grid max-w-xl gap-4 p-4">
      <Segmented<Locale>
        value={lang}
        onChange={setLang}
        options={[
          { value: 'it', label: '🇮🇹 Italiano' },
          { value: 'en', label: '🇬🇧 English' },
        ]}
      />
      {!shown ? <p className="text-center text-ink-3">…</p> : null}

      {shown?.tip ? (
        // The tip of the day as on the Home page.
        <section className="rounded-3xl bg-linear-to-br from-sun-soft to-brand-soft p-5 shadow-sm ring-1 ring-sun/30">
          <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-sun uppercase">
            <Lightbulb className="size-5" aria-hidden /> {t('dash.tip')}
          </p>
          <p className="mt-2 text-xl leading-snug font-bold">{l(shown.tip.text)}</p>
          {shown.tip.lesson ? (
            <span className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-card px-3 py-2 font-semibold text-brand-ink shadow-sm">
              <span aria-hidden>{shown.tip.lesson.emoji}</span> {t('dash.learnWhy')} <ChevronRight className="size-4" aria-hidden />
            </span>
          ) : null}
        </section>
      ) : null}

      {topic ? <LessonArticle topic={topic} lang={lang} /> : null}

      {c?.quiz?.length ? (
        // The quiz as the person sees it, with the right answers marked for the coach.
        <section className="rounded-3xl border border-line bg-card p-4">
          <p className="mb-2 font-bold">{t('quiz.title')}</p>
          <ol className="grid gap-3">
            {c.quiz.map((q, i) => (
              <li key={i}>
                <p className="font-semibold">{l(q.q)}</p>
                <ul className="mt-1 grid gap-1">
                  {q.options.map((o, k) => (
                    <li key={k} className={k === q.answer ? 'rounded-xl bg-leaf-soft px-2 py-1 font-semibold' : 'rounded-xl bg-card-2 px-2 py-1'}>
                      {k === q.answer ? '✓ ' : ''}
                      {l(o)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-sm text-ink-2">{l(q.why)}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
