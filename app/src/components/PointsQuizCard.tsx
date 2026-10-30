import { ChevronRight, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { DAILY_QUESTIONS, type QuizToday } from '../lib/pointsQuiz'
import { POINTS } from '../lib/rewards'
import { cx } from './ui'

/** The way into "Gain Family Points"; with `teaser`, today's next question to make it curious. */
export function PointsQuizCard({ quiz, teaser = false }: { quiz: QuizToday; teaser?: boolean }) {
  const { t, l } = useI18n()
  const open = quiz.unlocked && !quiz.done
  return (
    <Link to="/learn/points-quiz" className={cx('grid gap-2 rounded-3xl border-2 bg-card p-4', open ? 'border-sun' : 'border-line')}>
      <span className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sun-soft text-sun">
          <Target className="size-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block leading-tight font-bold">{t('pointsQuiz.title')}</span>
          <span className="block text-sm text-ink-2">
            {!quiz.unlocked
              ? t('pointsQuiz.lockedTitle')
              : quiz.done
                ? t('pointsQuiz.cardDone', { pts: quiz.pointsToday })
                : t('pointsQuiz.card', { n: DAILY_QUESTIONS, pts: DAILY_QUESTIONS * POINTS.dailyQuiz })}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
      </span>
      {teaser && open && quiz.next ? (
        <span className="rounded-2xl bg-sun-soft px-3 py-2 text-sm">
          🤔 <b>{t('pointsQuiz.remember')}</b> {l(quiz.next.q)}
        </span>
      ) : null}
    </Link>
  )
}
