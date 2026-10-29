import { Apple, Check, Copy, Dumbbell, FileUp, KeyRound, RefreshCw, Scale, Smartphone } from 'lucide-react'
import { useRef, useState } from 'react'
import { importHistory, type ImportResult } from '../../../shared/history-import.mjs'
import { Link } from 'react-router-dom'
import { Button, Card, PageHeader } from '../components/ui'
import { useApp } from '../lib/auth'
import { createSyncKey, hasSyncKey, savedSyncKey, useAsync } from '../lib/data'
import { useI18n } from '../lib/i18n'
import { functionsUrl, supabase } from '../lib/supabase'

const SHORTCUT_URL = import.meta.env.VITE_IOS_SHORTCUT_URL as string | undefined
const ANDROID_APK_URL = (import.meta.env.VITE_ANDROID_HELPER_URL as string | undefined) ?? 'https://github.com/gabripo/forza/releases/latest/download/forza-health.apk'
const INGEST_URL = `${functionsUrl}/health-ingest`

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        window.setTimeout(() => setDone(false), 2000)
      }}
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {done ? t('health.copied') : t('health.copy')}
    </Button>
  )
}

export function HealthSync() {
  const { t, date } = useI18n()
  const status = useAsync(() => hasSyncKey(), [])
  const [key, setKey] = useState<string | null>(savedSyncKey())
  const [busy, setBusy] = useState(false)

  async function newKey() {
    if (status.data?.exists && !window.confirm(t('health.replaceKey'))) return
    setBusy(true)
    try {
      setKey(await createSyncKey())
      void status.reload()
    } finally {
      setBusy(false)
    }
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isAndroid = /android/i.test(navigator.userAgent)
  const androidSetup = key ? `forzahealth://setup?url=${encodeURIComponent(INGEST_URL)}&key=${encodeURIComponent(key)}` : null

  return (
    <div className="grid gap-4">
      <PageHeader title={t('health.title')} back="/settings" />
      <p className="text-ink-2">{t('health.intro')}</p>

      <Card title={t('health.step1')} action={<KeyRound className="size-5 text-ink-3" aria-hidden />}>
        <p className="mb-3 text-ink-2">{t('health.keyText')}</p>
        {key ? (
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-card-2 p-3">
            <code className="min-w-0 flex-1 truncate text-sm">{key}</code>
            <CopyButton text={key} />
          </div>
        ) : null}
        <Button onClick={newKey} loading={busy} variant={key ? 'secondary' : 'primary'}>
          <RefreshCw className="size-4" aria-hidden /> {status.data?.exists ? t('health.newKey') : t('health.createKey')}
        </Button>
        {status.data?.lastUsed ? (
          <p className="mt-2 text-sm text-leaf">{t('health.lastSync', { date: date(status.data.lastUsed, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
        ) : status.data?.exists ? (
          <p className="mt-2 text-sm text-ink-3">{t('health.neverUsed')}</p>
        ) : null}
      </Card>

      <Card title={t('health.iphone')} action={<Apple className="size-5 text-ink-3" aria-hidden />} className={isAndroid ? 'opacity-80' : ''}>
        <ol className="mb-3 grid list-decimal gap-2 pl-5">
          <li>{SHORTCUT_URL ? t('health.ios1link') : t('health.ios1manual')}</li>
          <li>{t('health.ios2')}</li>
          <li>{t('health.ios3')}</li>
          <li>{t('health.ios4')}</li>
        </ol>
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-card-2 p-3">
          <code className="min-w-0 flex-1 truncate text-sm">{INGEST_URL}</code>
          <CopyButton text={INGEST_URL} />
        </div>
        <div className="flex flex-wrap gap-2">
          {SHORTCUT_URL ? (
            <a href={SHORTCUT_URL} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-brand px-4 font-semibold text-white">
              {t('health.getShortcut')}
            </a>
          ) : (
            <a
              href="https://github.com/gabripo/forza/blob/main/docs/apple-shortcut.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-card-2 px-4 font-semibold"
            >
              {t('health.guide')}
            </a>
          )}
          {isIos ? (
            <a href="shortcuts://run-shortcut?name=Forza%20Sync" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-leaf px-4 font-semibold text-white">
              <RefreshCw className="size-4" aria-hidden /> {t('health.syncNow')}
            </a>
          ) : null}
        </div>
      </Card>

      <Card title={t('health.android')} action={<Smartphone className="size-5 text-ink-3" aria-hidden />} className={isIos ? 'opacity-80' : ''}>
        <ol className="mb-3 grid list-decimal gap-2 pl-5">
          <li>
            {t('health.and1')}{' '}
            <a href={ANDROID_APK_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink">
              {t('health.download')}
            </a>
          </li>
          <li>{t('health.and2')}</li>
          <li>{t('health.and3')}</li>
        </ol>
        {androidSetup ? (
          <a href={androidSetup} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-brand px-4 font-semibold text-white">
            {t('health.connectHelper')}
          </a>
        ) : (
          <p className="text-sm text-ink-3">{t('health.needKey')}</p>
        )}
      </Card>

      <Card title={t('health.eufy')} action={<Scale className="size-5 text-ink-3" aria-hidden />}>
        <p className="mb-2 text-ink-2">{t('health.eufyText')}</p>
        <ul className="mb-3 grid list-disc gap-1 pl-5 text-ink-2">
          <li>{t('health.eufyIos')}</li>
          <li>{t('health.eufyAndroid')}</li>
        </ul>
        <Link to="/weights" className="font-semibold text-brand-ink">
          {t('health.eufyCsv')}
        </Link>
      </Card>

      <ImportCard />
    </div>
  )
}

/**
 * Coming from Build With Science (or another app)? Forza! Coach reads the history from the phone
 * with a USB cable and imports it; it can also save it as a file that the person imports here.
 */
function ImportCard() {
  const { t, num } = useI18n()
  const { session, refreshExercises } = useApp()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(f: File | undefined) {
    if (!f || !session) return
    setError(null)
    setDone(null)
    setBusy(t('import.reading'))
    try {
      const data = JSON.parse(await f.text())
      const result = await importHistory(supabase, session.user.id, data, { onProgress: (text) => setBusy(text) })
      await refreshExercises()
      setDone(result)
    } catch (e) {
      setError(e instanceof SyntaxError ? t('import.notJson') : t('import.failed', { error: (e as Error).message }))
    } finally {
      setBusy(null)
      if (file.current) file.current.value = ''
    }
  }

  return (
    <Card title={t('import.title')} action={<Dumbbell className="size-5 text-ink-3" aria-hidden />}>
      <p className="mb-2 text-ink-2">{t('import.text')}</p>
      <ul className="mb-3 grid list-disc gap-1 pl-5 text-ink-2">
        <li>{t('import.what')}</li>
        <li>{t('import.weights')}</li>
        <li>{t('import.auto')}</li>
        <li>{t('import.how')}</li>
      </ul>
      <a
        href="https://github.com/gabripo/forza/blob/main/docs/coach-guide.md#import-from-build-with-science"
        target="_blank"
        rel="noreferrer"
        className="mb-3 inline-block font-semibold text-brand-ink"
      >
        {t('import.guide')}
      </a>
      <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button variant="secondary" block onClick={() => file.current?.click()} loading={Boolean(busy)}>
        <FileUp className="size-5" aria-hidden /> {t('import.file')}
      </Button>
      {busy ? <p className="mt-2 text-sm text-ink-2">{busy}</p> : null}
      {error ? <p className="mt-2 rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p> : null}
      {done ? (
        <p className="mt-2 rounded-2xl bg-leaf-soft p-3 font-semibold text-leaf">
          {t('import.done', { sessions: num(done.sessions), sets: num(done.sets), templates: done.templates, food: num(done.food), weights: num(done.weights) })}
        </p>
      ) : null}
    </Card>
  )
}
