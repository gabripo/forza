import { Dumbbell, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/auth'
import { hasSyncKey } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { FoodLog } from '../lib/types'

const isAndroid = () => /android/i.test(navigator.userAgent)

/**
 * For people whose meals come from Build With Science, on the Android phone with the Forza! Health helper: the
 * meals now, without waiting for the hourly sync. The helper reads Health Connect, where Build With Science
 * writes every entry, over the last 14 days again: meals changed or deleted there change here too. For days
 * Health Connect does not have, the helper can read Build With Science's own screens (longer: workouts too).
 */
export function BwsFoodSync({ food, onSynced }: { food: FoodLog[]; onSynced: () => void }) {
  const { t, date } = useI18n()
  const { profile } = useApp()
  const [last, setLast] = useState<string | null>(null)
  const [started, setStarted] = useState<number | null>(null)
  const synced = useRef(onSynced)
  useEffect(() => {
    synced.current = onSynced
  }, [onSynced])
  const uses = isAndroid() && (Boolean(profile?.bws_synced_at) || food.some((f) => f.origin === 'Build With Science'))

  useEffect(() => {
    if (!uses) return
    void hasSyncKey().then((s) => setLast(s.lastUsed), () => {})
  }, [uses])

  // Back from the helper: the meals arrive within seconds, so look now and twice more.
  useEffect(() => {
    if (!started) return
    const timers: number[] = []
    const refresh = () => {
      synced.current()
      void hasSyncKey().then((s) => setLast(s.lastUsed), () => {})
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refresh()
      timers.push(window.setTimeout(refresh, 8_000), window.setTimeout(refresh, 20_000))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      timers.forEach((x) => window.clearTimeout(x))
    }
  }, [started])

  if (!uses) return null
  const when = (d: string) => date(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const arrived = started && last && new Date(last).getTime() >= started

  return (
    <div className="grid gap-2 rounded-3xl border border-line bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t('bwsSync.title')}</span>
          <span className="block text-sm text-ink-2">
            {started && !arrived ? t('bwsSync.started') : last ? t(arrived ? 'bwsSync.arrived' : 'bwsSync.last', { date: when(last) }) : t('bwsSync.never')}
          </span>
        </span>
        <a href="forzahealth://sync" onClick={() => setStarted(Date.now())} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-brand px-3 font-semibold text-white">
          <RefreshCw className="size-5" aria-hidden /> {t('bwsSync.now')}
        </a>
      </div>
      {/* The longer way, for a day Health Connect does not have: the helper reads Build With Science itself. */}
      {profile?.bws_synced_at || profile?.bws_auto_sync ? (
        <a href="forzahealth://bws" onClick={() => setStarted(Date.now())} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink">
          <Dumbbell className="size-4" aria-hidden /> {t('bwsSync.screen')}
        </a>
      ) : null}
    </div>
  )
}
