import { Check, Copy, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Button, Input } from '../components/ui'
import { useApp } from '../lib/auth'
import { iosBrowser } from '../lib/deviceKey'
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
  const [copied, setCopied] = useState(false)
  const [here, setHere] = useState(false)
  const [copyBox, setCopyBox] = useState(false)
  const code = given ?? parseConnect(`#${location.pathname}${location.search}`)
  const cancel = onCancel ?? (() => navigate('/', { replace: true }))
  // On iPhone the home-screen app does not share Safari's sign-in, and a link always opens in Safari: the code is
  // copied here and pasted in the app, so it is not used up in Safari (each code works once).
  const copyFirst = iosBrowser() && !here

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      // copying not allowed: the link is shown, to copy by hand
      setCopyBox(true)
    }
  }

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
          <p className="text-lg">{code.token || code.device ? t('welcome.text') : t('welcome.textServer')}</p>
          <p className="flex items-start gap-2 rounded-2xl bg-card-2 p-3 text-sm text-ink-2">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-leaf" aria-hidden />
            <span>
              {t('welcome.server')} <b className="break-all text-ink">{new URL(code.url).host}</b>
            </span>
          </p>
          {copyFirst ? (
            <>
              <div className="rounded-2xl bg-sky-soft p-3 text-sm">
                <p>{t('welcome.iosWhy')}</p>
                <ol className="mt-2 grid list-decimal gap-1 pl-5">
                  <li>{t('welcome.ios1')}</li>
                  <li>{t('welcome.ios2')}</li>
                  <li>{t('welcome.ios3')}</li>
                </ol>
              </div>
              <Button size="lg" block variant={copied ? 'leaf' : 'primary'} onClick={() => void copy()}>
                {copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />} {copied ? t('welcome.copied') : t('welcome.copy')}
              </Button>
              {copyBox ? (
                <Input readOnly aria-label={t('welcome.copy')} value={window.location.href} onFocus={(e) => e.target.select()} autoFocus />
              ) : null}
              <Button variant="ghost" block onClick={() => setHere(true)}>
                {t('welcome.inSafari')}
              </Button>
            </>
          ) : (
            <>
              {session && (code.token || code.device) ? <p className="text-sm text-ink-2">{t('welcome.switch', { email: session.user.email ?? '' })}</p> : null}
              {error ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p> : null}
              <Button size="lg" block loading={busy} onClick={go} disabled={Boolean(error)}>
                {code.token || code.device ? t('welcome.go') : sameServer(code) ? t('common.next') : t('welcome.connect')}
              </Button>
            </>
          )}
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
