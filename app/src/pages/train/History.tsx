import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, Empty, Loading, PageHeader } from '../../components/ui'
import { getSessions, useAsync } from '../../lib/data'
import { sessionMinutes } from '../../lib/energy'
import { useI18n } from '../../lib/i18n'

export function History() {
  const { t, num, date } = useI18n()
  const { data, loading } = useAsync(() => getSessions(3650), [])
  if (loading && !data) return <Loading />
  const sessions = data ?? []

  // Group by month for easier scrolling.
  const groups = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const key = date(s.started_at, { month: 'long', year: 'numeric' })
    groups.set(key, [...(groups.get(key) ?? []), s])
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('train.history')} subtitle={t('history.total', { n: sessions.length })} back="/train" />
      {sessions.length === 0 ? <Empty icon="📅" title={t('history.empty')} /> : null}
      {[...groups].map(([month, list]) => (
        <Card key={month} title={month[0].toUpperCase() + month.slice(1)}>
          <ul className="grid gap-1">
            {list.map((s) => {
              const volume = s.sets.reduce((v, x) => v + Number(x.weight_kg ?? 0) * Number(x.reps ?? 0), 0)
              const minutes = Math.round(sessionMinutes(s))
              return (
                <li key={s.id}>
                  <Link to={`/train/session/${s.id}`} className="flex items-center gap-3 rounded-2xl p-2 active:bg-card-2">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-center leading-none">
                      <span className="text-lg font-extrabold text-brand-ink">{new Date(s.started_at).getDate()}</span>
                      <span className="text-[10px] font-semibold uppercase text-brand-ink">{date(s.started_at, { weekday: 'short' })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{s.name}</p>
                      <p className="text-sm text-ink-2">
                        {minutes ? `${minutes} min · ` : ''}
                        {t('history.sets', { n: s.sets.length })}
                        {volume ? ` · ${num(volume)} kg` : ''}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-ink-3" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
