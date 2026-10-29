import { QrCode } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Logo'
import { Scanner } from '../components/Scanner'
import { Button, Field, Input, Segmented } from '../components/ui'
import { useApp } from '../lib/auth'
import { parseConnect, type ConnectCode } from '../lib/connect'
import { useI18n } from '../lib/i18n'
import { isConfigured, supabase } from '../lib/supabase'
import type { Locale } from '../lib/types'
import { Welcome } from './Welcome'

export function Login() {
  const { t, locale, setLocale } = useI18n()
  const { connectError } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(connectError ? t('welcome.expired') : null)
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState<ConnectCode | null>(null)
  // Without a server the email form cannot work: the setup code is the way in.
  const [showForm, setShowForm] = useState(isConfigured)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message.toLowerCase().includes('invalid') ? t('login.wrong') : t('login.offline'))
  }

  if (code) return <Welcome code={code} onCancel={() => setCode(null)} />

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={88} />
        <h1 className="text-4xl font-extrabold tracking-tight">Forza!</h1>
        <p className="max-w-xs text-lg text-ink-2">{t('login.tagline')}</p>
      </div>
      <Segmented<Locale>
        value={locale}
        onChange={setLocale}
        options={[
          { value: 'it', label: '🇮🇹 Italiano' },
          { value: 'en', label: '🇬🇧 English' },
        ]}
      />
      <div className="grid gap-3 rounded-3xl border border-line bg-card p-5">
        <p className="text-ink-2">{t('login.scanText')}</p>
        <Button size="lg" block variant={showForm ? 'secondary' : 'primary'} onClick={() => setScanning(true)}>
          <QrCode className="size-5" aria-hidden /> {t('login.scan')}
        </Button>
        {error && !showForm ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p> : null}
      </div>
      {showForm ? (
        <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-line bg-card p-5">
          <Field label={t('login.email')}>
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('login.password')}>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error ? <p className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p> : null}
          <Button size="lg" block loading={busy}>
            {t('login.submit')}
          </Button>
          <p className="text-center text-sm text-ink-2">{t('login.remember')}</p>
        </form>
      ) : (
        <Button variant="ghost" onClick={() => setShowForm(true)} disabled={!isConfigured}>
          {isConfigured ? t('login.usePassword') : t('login.noServer')}
        </Button>
      )}
      <p className="text-center text-ink-2">{t('login.noAccount')}</p>
      {scanning ? (
        <Scanner
          formats={['qr_code']}
          title={t('login.scan')}
          hint={t('login.scanHint')}
          onClose={() => setScanning(false)}
          onResult={(value) => {
            setScanning(false)
            const c = parseConnect(value)
            if (c) setCode(c)
            else setError(t('welcome.invalid'))
          }}
        />
      ) : null}
    </div>
  )
}
