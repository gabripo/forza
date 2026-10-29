import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui'
import { useApp } from '../lib/auth'
import { applyConnectCode, parseConnect, sameServer, type ConnectCode } from '../lib/connect'
import { useI18n } from '../lib/i18n'

/** Opened from a setup QR code or link made by Forza! Coach. */
export function Welcome({ code: given, onCancel }: { code?: ConnectCode; onCancel?: () => void }) {
  const { t } = useI18n()
  const { session } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = given ?? parseConnect(`#${location.pathname}${location.search}`)
  const cancel = onCancel ?? (() => navigate('/', { replace: true }))
  // On iPhone the home-screen app does not share Safari's sign-in: install it first, then scan there.
  const iosBrowser = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone

  async function go() {
    if (!code) return
    setBusy(true)
    const err = await applyConnectCode(code)
    if (err) {
      setError(t('welcome.expired'))
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={88} />
        <h1 className="text-3xl font-extrabold tracking-tight">{code?.name ? t('welcome.titleName', { name: code.name }) : t('welcome.title')}</h1>
      </div>
      {code ? (
        <div className="grid gap-4 rounded-3xl border border-line bg-card p-5">
          <p className="text-lg">{code.token ? t('welcome.text') : t('welcome.textServer')}</p>
          <p className="flex items-start gap-2 rounded-2xl bg-card-2 p-3 text-sm text-ink-2">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-leaf" aria-hidden />
            <span>
              {t('welcome.server')} <b className="break-all text-ink">{new URL(code.url).host}</b>
            </span>
          </p>
          {iosBrowser ? <p className="rounded-2xl bg-sky-soft p-3 text-sm">{t('welcome.iosFirst')}</p> : null}
          {session && code.token ? <p className="text-sm text-ink-2">{t('welcome.switch', { email: session.user.email ?? '' })}</p> : null}
          {error ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p> : null}
          <Button size="lg" block loading={busy} onClick={go} disabled={Boolean(error)}>
            {code.token ? t('welcome.go') : sameServer(code) ? t('common.next') : t('welcome.connect')}
          </Button>
          <Button variant="ghost" block onClick={cancel}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 rounded-3xl border border-line bg-card p-5">
          <p className="text-lg">{t('welcome.invalid')}</p>
          <Button variant="secondary" block onClick={cancel}>
            {t('common.back')}
          </Button>
        </div>
      )}
    </div>
  )
}
