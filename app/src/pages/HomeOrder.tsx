import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import { Button, Card, PageHeader } from '../components/ui'
import { useApp } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { HOME_SECTIONS, homeOrder } from '../../../shared/home-sections.mjs'

/**
 * Arrange the Home page: move each section up or down with big arrows (easier than dragging for
 * older hands). Every move is saved at once; the coach can do the same from Forza! Coach.
 */
export function HomeOrder() {
  const { t, locale } = useI18n()
  const { profile, saveProfile } = useApp()
  if (!profile) return null
  const order = homeOrder(profile.home_order)
  // Training sections are not listed for people who hide training: they keep their place, unseen.
  const shown = order.filter((id) => !(profile.hide_training && HOME_SECTIONS.find((s) => s.id === id)?.training))

  function move(id: string, by: -1 | 1) {
    const i = shown.indexOf(id)
    const other = shown[i + by]
    if (!other) return
    const next = [...order]
    const a = next.indexOf(id)
    const b = next.indexOf(other)
    ;[next[a], next[b]] = [next[b], next[a]]
    void saveProfile({ home_order: next })
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={t('home.arrangeTitle')} subtitle={t('home.arrangeText')} back="/settings" />
      <Card>
        <ol className="grid gap-2">
          {shown.map((id, i) => {
            const section = HOME_SECTIONS.find((s) => s.id === id)!
            return (
              <li key={id} className="flex items-center gap-2 rounded-2xl bg-card-2 p-2 pl-3">
                <span className="w-6 text-center font-bold text-ink-3 tabular">{i + 1}</span>
                <span className="flex-1 font-semibold">{section[locale]}</span>
                <button onClick={() => move(id, -1)} disabled={i === 0} className="grid size-12 place-items-center rounded-xl bg-card active:bg-line disabled:opacity-30" aria-label={t('home.up', { name: section[locale] })}>
                  <ArrowUp className="size-5" aria-hidden />
                </button>
                <button onClick={() => move(id, 1)} disabled={i === shown.length - 1} className="grid size-12 place-items-center rounded-xl bg-card active:bg-line disabled:opacity-30" aria-label={t('home.down', { name: section[locale] })}>
                  <ArrowDown className="size-5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      </Card>
      {profile.home_order ? (
        <Button variant="ghost" onClick={() => void saveProfile({ home_order: null })}>
          <RotateCcw className="size-4" aria-hidden /> {t('home.reset')}
        </Button>
      ) : null}
    </div>
  )
}
