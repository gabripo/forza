import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { useState } from 'react'
import { saveQuiz } from '../lib/data'
import { useI18n } from '../lib/i18n'
import { POINTS } from '../lib/rewards'
import type { Question } from '../pages/learn/more'
import { Confetti } from './Confetti'
import { Button, Card, cx } from './ui'

/**
 * A two-question quiz at the end of a lesson: a small, quick challenge with an immediate reward.
 * Every answer explains itself, right or wrong, so the quiz teaches as well.
 */
export function Quiz({ lessonId, questions, passedBefore, onPassed }: { lessonId: string; questions: Question[]; passedBefore: boolean; onPassed?: () => void }) {
  const { t, l } = useI18n()
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [right, setRight] = useState(0)
  const [done, setDone] = useState(false)
  // Decided when the quiz ends: the parent learns about the pass right after.
  const [firstPass, setFirstPass] = useState(false)
  const q = questions[i]
  const score = Math.round((right / questions.length) * 100)

  function choose(k: number) {
    if (chosen !== null) return
    setChosen(k)
    if (k === q.answer) setRight((r) => r + 1)
  }

  async function next() {
    if (i < questions.length - 1) {
      setI(i + 1)
      setChosen(null)
      return
    }
    setFirstPass(score === 100 && !passedBefore)
    setDone(true)
    await saveQuiz(lessonId, score).catch(() => {})
    if (score === 100) onPassed?.()
  }

  function retry() {
    setI(0)
    setChosen(null)
    setRight(0)
    setDone(false)
  }

  if (done) {
    const passed = score === 100
    return (
      <Card tone={passed ? 'leaf' : 'sun'} className="relative">
        {passed ? <Confetti /> : null}
        <p className="text-center text-4xl" aria-hidden>
          {passed ? '🏆' : '💪'}
        </p>
        <p className="mt-1 text-center text-xl font-extrabold">{passed ? t('quiz.passed') : t('quiz.almost', { n: right, total: questions.length })}</p>
        <p className="mt-1 text-center text-ink-2">{passed ? (firstPass ? t('quiz.points', { n: POINTS.quiz }) : t('quiz.again')) : t('quiz.retryText')}</p>
        {!passed ? (
          <Button block className="mt-3" onClick={retry}>
            <RotateCcw className="size-5" aria-hidden /> {t('quiz.retry')}
          </Button>
        ) : null}
      </Card>
    )
  }

  return (
    <Card title={t('quiz.title')} action={<span className="text-sm font-bold text-ink-2">{i + 1} / {questions.length}</span>}>
      <p className="mb-3 text-lg font-bold">{l(q.q)}</p>
      <div className="grid gap-2">
        {q.options.map((o, k) => {
          const state = chosen === null ? 'idle' : k === q.answer ? 'right' : k === chosen ? 'wrong' : 'idle'
          return (
            <button
              key={k}
              onClick={() => choose(k)}
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
          <p className={cx('mt-3 rounded-2xl p-3', chosen === q.answer ? 'bg-leaf-soft' : 'bg-card-2')}>
            <b>{chosen === q.answer ? t('quiz.right') : t('quiz.wrong')}</b> {l(q.why)}
          </p>
          <Button block className="mt-3" onClick={next}>
            {i < questions.length - 1 ? t('common.next') : t('quiz.finish')}
          </Button>
        </>
      ) : null}
    </Card>
  )
}
