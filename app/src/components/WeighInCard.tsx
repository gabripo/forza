import { RefreshCw, Scale } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { localDay } from '../lib/calc'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

const SKIPPED = 'forza.weighInSkipped'
// The Apple Shortcut that sends Apple Health's steps and weight (docs/apple-shortcut.md).
const RUN_SHORTCUT = 'shortcuts://run-shortcut?name=Forza%20Sync'
// From 4:00 to 10:30: the weigh-in of the day, on waking up.
const MORNING = { from: 4 * 60, to: 10 * 60 + 30 }

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

function skippedToday(today: string): boolean {
  try {
    return localStorage.getItem(SKIPPED) === today
  } catch {
    return false
  }
}

/**
 * The weigh-in of the day, on Home. In the morning (before 10:30), for anyone not weighed yet: the right moment,
 * and the way to log it. On an iPhone with the "Forza Sync" shortcut, at any time of a day with no weight yet: the
 * scale writes to Apple Health, and the shortcut brings it here, so one tap runs it. "Not today" hides it until
 * tomorrow.
 */
export function WeighInCard({
  weighedToday,
  iphoneSync,
  scaleSynced,
  onLog,
}: {
  weighedToday: boolean
  /** Apple Health data arrived through the shortcut before: it is set up on this phone. */
  iphoneSync: boolean
  /** Weigh-ins arrive from a scale (Health Connect or Apple Health). */
  scaleSynced: boolean
  onLog: () => void
}) {
  const { t } = useI18n()
  const now = new Date()
  const today = localDay(now)
  const [skipped, setSkipped] = useState(() => skippedToday(today))
  const minutes = now.getHours() * 60 + now.getMinutes()
  const morning = minutes >= MORNING.from && minutes < MORNING.to
  const shortcut = isIos() && iphoneSync
  if (weighedToday || skipped || !(morning || shortcut)) return null

  function skip() {
    try {
      localStorage.setItem(SKIPPED, today)
    } catch {
      // shown again on the next visit: no harm
    }
    setSkipped(true)
  }

  return (
    <section className="rounded-3xl border-2 border-sky bg-card p-4" aria-label={t('weighIn.title')}>
      <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-sky uppercase">
        <Scale className="size-5" aria-hidden /> {t(morning ? 'weighIn.title' : 'weighIn.noneYet')}
      </p>
      {morning ? <p className="mt-2 leading-snug">{t('weight.conditions')}</p> : null}
      {shortcut ? (
        <p className="mt-2 leading-snug font-semibold">{t('weighIn.shortcut')}</p>
      ) : scaleSynced ? (
        <p className="mt-2 leading-snug text-ink-2">{t('weighIn.synced')}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {shortcut ? (
          <a href={RUN_SHORTCUT} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-leaf px-4 font-semibold text-white dark:text-black">
            <RefreshCw className="size-5" aria-hidden /> {t('weighIn.runShortcut')}
          </a>
        ) : scaleSynced ? (
          <Link to="/settings/health" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-leaf px-4 font-semibold text-white dark:text-black">
            <RefreshCw className="size-5" aria-hidden /> {t('health.syncNow')}
          </Link>
        ) : null}
        <Button variant={shortcut || scaleSynced ? 'secondary' : 'primary'} onClick={onLog}>
          {t(shortcut || scaleSynced ? 'weighIn.byHand' : 'weight.log')}
        </Button>
        <Button variant="ghost" onClick={skip}>
          {t('weighIn.notToday')}
        </Button>
      </div>
    </section>
  )
}
