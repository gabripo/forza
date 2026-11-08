import { CalendarDays } from 'lucide-react'
import { daysAgo, localDay } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import { dayDate, firstLogDay, loggableDay, type LogWhen } from '../lib/logDay'
import type { Meal } from '../lib/types'
import { Input, Segmented } from './ui'

const MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

/**
 * At the top of every way of adding food: the day (today, yesterday or another of the last four weeks) and the meal.
 * `dayFixed`: a meal being changed stays on its day; only its meal can change.
 */
export function LogWhenPicker({ when, dayFixed = false }: { when: LogWhen; dayFixed?: boolean }) {
  const { t, date } = useI18n()
  const yesterday = localDay(daysAgo(1))
  const mode = when.day === when.today ? 'today' : when.day === yesterday ? 'yesterday' : 'other'
  return (
    <div className="grid gap-2">
      {dayFixed ? null : (
        <div role="group" aria-label={t('when.day')}>
          <Segmented<'today' | 'yesterday' | 'other'>
            value={mode}
            onChange={(m) => when.setDay(m === 'today' ? when.today : m === 'yesterday' ? yesterday : mode === 'other' ? when.day : localDay(daysAgo(2)))}
            options={[
              { value: 'today', label: t('food.today') },
              { value: 'yesterday', label: t('when.yesterday') },
              {
                value: 'other',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-4 shrink-0" aria-hidden />
                    {mode === 'other' ? date(dayDate(when.day), { day: 'numeric', month: 'short' }) : t('when.other')}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
      {/* Another day: any of the last four weeks, from the phone's calendar. */}
      {mode === 'other' && !dayFixed ? (
        <Input
          type="date"
          min={firstLogDay()}
          max={when.today}
          value={when.day}
          onChange={(e) => {
            const d = loggableDay(e.target.value)
            if (d) when.setDay(d)
          }}
          aria-label={t('when.pick')}
        />
      ) : null}
      <div role="group" aria-label={t('when.meal')}>
        <Segmented<Meal> value={when.meal} onChange={when.setMeal} options={MEALS.map((m) => ({ value: m, label: t(`meal.${m}`) }))} />
      </div>
      {when.isToday || dayFixed ? null : <p className="text-sm text-ink-2">{t('when.past', { day: date(dayDate(when.day), { weekday: 'long', day: 'numeric', month: 'long' }) })}</p>}
    </div>
  )
}
