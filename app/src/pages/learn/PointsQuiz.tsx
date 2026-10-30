import { BookOpen, CheckCircle2, Lock, Trophy, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Confetti } from '../../components/Confetti'
import { Button, Card, Loading, PageHeader, cx } from '../../components/ui'
import { useApp } from '../../lib/auth'
import { localDay } from '../../lib/calc'
import { answerPointsQuiz, getLessonProgress, getQuizAnswers, useAsync } from '../../lib/data'
import { useI18n } from '../../lib/i18n'
import { useKnowledge } from '../../lib/knowledge'
import { DAILY_QUESTIONS, questionBank, shuffled, todaysQuestions, type QuizAnswer } from '../../lib/pointsQuiz'
import { POINTS } from '../../lib/rewards'

/**
 * "Gain Family Points": two questions a day from the lessons already read, 5 points for each right answer.
 * Each answer is saved the moment it is chosen, so today's questions cannot be tried again.
 */
export function PointsQuiz() {
  const { t, l } = useI18n()
  const { profile } = useApp()
  const knowledge = useKnowledge()
  const { data, loading } = useAsync(() => Promise.all([getLessonProgress(), getQuizAnswers()]), [])
  const [today] = useState(() => localDay(new Date()))
  // Answers given on this screen, on top of the ones read when it opened.
  const [mine, setMine] = useState<QuizAnswer[]>([])
  // The question just answered, shown with its explanation until "Next".
  const [showing, setShowing] = useState<{ id: string; chosen: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const view = useMemo(() => {
    if (!data || !profile) return null
    const [lessons, answers] = data
    const bank = questionBank(knowledge.all, new Set(lessons.map((r) => r.lesson_id)))
    const all = [...answers, ...mine]
    const questions = todaysQuestions(bank, all, today, profile.id)
    const answered = new Map(all.filter((a) => a.day === today).map((a) => [a.question_id, a.correct]))
    return { bank, questions, answered }
  }, [data, profile, knowledge, mine, today])

  if (loading || !view || !profile) return <Loading />
  const { bank, questions, answered } = view
  const current = questions.find((q) => q.id === showing?.id) ?? questions.find((q) => !answered.has(q.id))
  const right = [...answered.values()].filter(Boolean).length

  async function choose(id: string, k: number, correct: boolean) {
    if (showing) return
    setShowing({ id, chosen: k })
    setMine((m) => [...m, { day: today, question_id: id, correct, answered_at: new Date().toISOString() }])
    try {
      await answerPointsQuiz(today, id, correct)
    } catch (e) {
      setError(e instanceof Error && e.message.includes('daily_quiz_done') ? t('pointsQuiz.limit') : t('pointsQuiz.saveError'))
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('pointsQuiz.title')} subtitle={t('pointsQuiz.subtitle', { n: DAILY_QUESTIONS, pts: POINTS.dailyQuiz })} back="/learn" />

      {bank.length < DAILY_QUESTIONS ? (
        <Card className="text-center">
          <Lock className="mx-auto size-10 text-ink-3" aria-hidden />
          <p className="mt-2 text-lg font-bold">{t('pointsQuiz.lockedTitle')}</p>
          <p className="mt-1 text-ink-2">{t('pointsQuiz.locked')}</p>
          <Link to="/learn" className="mt-3 inline-flex items-center gap-2 font-semibold text-brand-ink">
            <BookOpen className="size-5" aria-hidden /> {t('pointsQuiz.toLessons')}
          </Link>
        </Card>
      ) : current ? (
        <QuestionCard
          key={current.id}
          index={questions.indexOf(current)}
          total={questions.length}
          question={current}
          shuffleKey={`${profile.id}:${today}:${current.id}`}
          chosen={showing?.id === current.id ? showing.chosen : null}
          onChoose={(k, correct) => void choose(current.id, k, correct)}
          onNext={() => setShowing(null)}
          last={questions.filter((q) => !answered.has(q.id)).length === 0}
        />
      ) : (
        <Card tone={right === questions.length ? 'leaf' : 'sun'} className="relative">
          {mine.length && right === questions.length ? <Confetti /> : null}
          <p className="text-center text-4xl" aria-hidden>
            {right === questions.length ? '🏆' : right ? '👍' : '💪'}
          </p>
          <p className="mt-1 text-center text-xl font-extrabold">
            {right === questions.length ? t('pointsQuiz.perfect') : t('pointsQuiz.result', { n: right, total: questions.length })}
          </p>
          <p className="mt-1 text-center text-ink-2">{right ? t('pointsQuiz.earned', { pts: right * POINTS.dailyQuiz }) : t('pointsQuiz.noPoints')}</p>
          <ul className="mt-3 grid gap-2">
            {questions.map((q) => (
              <li key={q.id} className="flex items-start gap-2 rounded-2xl bg-card p-3">
                {answered.get(q.id) ? <CheckCircle2 className="size-5 shrink-0 text-leaf" aria-label={t('quiz.right')} /> : <XCircle className="size-5 shrink-0 text-danger" aria-label={t('quiz.wrong')} />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l(q.q)}</span>
                  <span className="block text-sm text-ink-2">{l(q.options[q.answer])}</span>
                  {answered.get(q.id) ? null : (
                    <Link to={`/learn/${q.lesson.id}`} className="text-sm font-semibold text-brand-ink">
                      {t('pointsQuiz.readAgain', { title: l(q.lesson.title) })} →
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center font-semibold">{t('pointsQuiz.tomorrow')}</p>
          <Link to="/challenge" className="mt-2 flex items-center justify-center gap-2 font-semibold text-brand-ink">
            <Trophy className="size-5" aria-hidden /> {t('rewards.challenge')} →
          </Link>
        </Card>
      )}

      {error ? <p className="rounded-2xl bg-danger-soft p-3 text-danger">{error}</p> : null}
      <p className="text-sm text-ink-2">{t('pointsQuiz.how')}</p>
    </div>
  )
}

function QuestionCard({
  index,
  total,
  question,
  shuffleKey,
  chosen,
  onChoose,
  onNext,
  last,
}: {
  index: number
  total: number
  question: ReturnType<typeof todaysQuestions>[number]
  shuffleKey: string
  chosen: number | null
  onChoose: (k: number, correct: boolean) => void
  onNext: () => void
  last: boolean
}) {
  const { t, l } = useI18n()
  const { options, answer } = shuffled(question, shuffleKey)
  const correct = chosen === answer
  return (
    <Card title={t('pointsQuiz.question', { n: index + 1, total })} action={<span className="text-sm font-bold text-sun">+{POINTS.dailyQuiz}</span>}>
      <p className="mb-1 text-sm text-ink-2">
        {question.lesson.emoji} {t('pointsQuiz.from', { title: l(question.lesson.title) })}
      </p>
      <p className="mb-3 text-lg font-bold">{l(question.q)}</p>
      <div className="grid gap-2">
        {options.map((o, k) => {
          const state = chosen === null ? 'idle' : k === answer ? 'right' : k === chosen ? 'wrong' : 'idle'
          return (
            <button
              key={k}
              onClick={() => onChoose(k, k === answer)}
              disabled={chosen !== null}
              className={cx(
                'flex min-h-12 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left font-semibold',
                state === 'right' ? 'border-leaf bg-leaf-soft' : state === 'wrong' ? 'border-danger bg-danger-soft' : 'border-line bg-card active:bg-card-2',
              )}
            >
              <span className="flex-1">{l(o)}</span>
              {state === 'right' ? <CheckCircle2 className="size-5 text-leaf" aria-label={t('status.good')} /> : null}
              {state === 'wrong' ? <XCircle className="size-5 text-danger" aria-label={t('status.warn')} /> : null}
            </button>
          )
        })}
      </div>
      {chosen !== null ? (
        <>
          <p className={cx('mt-3 rounded-2xl p-3', correct ? 'bg-leaf-soft' : 'bg-card-2')}>
            <b>{correct ? `${t('quiz.right')} ${t('pointsQuiz.plus', { pts: POINTS.dailyQuiz })}` : t('quiz.wrong')}</b> {l(question.why)}
          </p>
          {correct ? null : <p className="mt-2 text-sm text-ink-2">{t('pointsQuiz.comesBack')}</p>}
          <Button block className="mt-3" onClick={onNext}>
            {last ? t('quiz.finish') : t('common.next')}
          </Button>
        </>
      ) : null}
    </Card>
  )
}
