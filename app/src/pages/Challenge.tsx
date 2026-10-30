import { Footprints, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Loading, PageHeader, Segmented, cx } from '../components/ui'
import { useApp } from '../lib/auth'
import { familyBoard, useAsync } from '../lib/data'
import { useI18n } from '../lib/i18n'
import { GOOD_MEAL_SCORE, GOOD_MEALS_A_DAY, POINTS } from '../lib/rewards'

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * The family challenge: points for doing healthy things this week (moving, learning, logging),
 * never for weight or calories, so a beginner can win against an athlete. Opt-in: only people who
 * join see the board, and the board shows only names and points.
 */
export function Challenge() {
  const { t, num } = useI18n()
  const { profile, saveProfile } = useApp()
  const [days, setDays] = useState<7 | 30>(7)
  const [joining, setJoining] = useState(false)
  const joined = Boolean(profile?.challenge_opt_in)
  const board = useAsync(() => (joined ? familyBoard(days) : Promise.resolve([])), [joined, days])

  async function setJoined(value: boolean) {
    setJoining(true)
    try {
      await saveProfile({ challenge_opt_in: value })
    } finally {
      setJoining(false)
    }
  }

  const rows = board.data ?? []
  const me = rows.find((r) => r.is_me)
  const myIndex = rows.findIndex((r) => r.is_me)
  const ahead = myIndex > 0 ? rows[myIndex - 1] : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t('challenge.title')} subtitle={t('challenge.subtitle')} back="/check" />

      {!joined ? (
        <Card tone="sun">
          <p className="text-center text-5xl" aria-hidden>
            🏆
          </p>
          <p className="mt-2 text-center text-lg font-bold">{t('challenge.invite')}</p>
          <p className="mt-1 text-center text-ink-2">{t('challenge.inviteText')}</p>
          <p className="mt-3 rounded-2xl bg-card p-3 text-sm text-ink-2">🔒 {t('challenge.privacy')}</p>
          <Button size="lg" block className="mt-3" loading={joining} onClick={() => setJoined(true)}>
            <Users className="size-5" aria-hidden /> {t('challenge.join')}
          </Button>
        </Card>
      ) : (
        <>
          <Segmented<7 | 30>
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: t('challenge.week') },
              { value: 30, label: t('challenge.month') },
            ]}
          />
          {board.loading && !board.data ? (
            <Loading />
          ) : (
            <Card>
              {me ? (
                <p className="mb-3 text-lg">
                  {myIndex === 0 ? t('challenge.first') : ahead ? t('challenge.behind', { n: num(ahead.points - me.points + 1), name: ahead.display_name }) : null}
                </p>
              ) : null}
              <ol className="grid gap-2">
                {rows.map((r, i) => (
                  <li key={r.user_id} className={cx('flex items-center gap-3 rounded-2xl p-3', r.is_me ? 'bg-brand-soft ring-2 ring-brand' : 'bg-card-2')}>
                    <span className="w-8 text-center text-2xl" aria-label={`${i + 1}`}>
                      {MEDALS[i] ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {r.display_name || '—'}
                        {r.is_me ? ` (${t('challenge.you')})` : ''}
                      </span>
                      <span className="block text-sm text-ink-2">
                        {t('challenge.activeDays', { n: r.active_days })} · {t('challenge.workouts', { n: r.workouts })} · {t('challenge.lessons', { n: r.lessons })}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xl font-extrabold tabular">{num(r.points)}</span>
                      <span className="block text-xs text-ink-3">{t('rewards.pts')}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {rows.length === 1 ? <p className="mt-3 text-sm text-ink-2">{t('challenge.alone')}</p> : null}
            </Card>
          )}
        </>
      )}

      <Card title={t('challenge.howTitle')} action={<Trophy className="size-5 text-sun" aria-hidden />}>
        <ul className="grid gap-1.5">
          {[
            ['🏋️', t('challenge.how.workout'), POINTS.workout],
            ['📚', t('challenge.how.lesson'), POINTS.lesson],
            ['🧠', t('challenge.how.quiz'), POINTS.quiz],
            ['🎯', t('challenge.how.dailyQuiz'), POINTS.dailyQuiz],
            ['🍽️', t('challenge.how.meals'), POINTS.mealsDay],
            ['🥗', t('challenge.how.goodMeal', { score: GOOD_MEAL_SCORE, n: GOOD_MEALS_A_DAY }), POINTS.goodMeal],
            ['👣', t('challenge.how.steps'), POINTS.stepsDay],
            ['⚖️', t('challenge.how.weigh'), POINTS.weighIn],
          ].map(([emoji, label, pts]) => (
            <li key={String(label)} className="flex items-center gap-2">
              <span aria-hidden>{emoji}</span>
              <span className="flex-1">{label}</span>
              <b className="tabular">+{pts}</b>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1 text-sm text-ink-3">
          <Footprints className="size-4" aria-hidden /> {t('challenge.fair')}
        </p>
      </Card>

      {joined ? (
        <Button variant="ghost" onClick={() => setJoined(false)} loading={joining}>
          {t('challenge.leave')}
        </Button>
      ) : null}
    </div>
  )
}
