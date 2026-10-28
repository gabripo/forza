import { Download, MoreVertical, PlusSquare, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, PageHeader } from '../components/ui'
import { useI18n } from '../lib/i18n'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function Install() {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  return (
    <div className="grid gap-4">
      <PageHeader title={t('install.title')} back="/settings" />
      {standalone ? <Card tone="leaf">{t('install.already')}</Card> : null}
      <p className="text-ink-2">{t('install.intro')}</p>
      {prompt ? (
        <Button size="lg" onClick={() => void prompt.prompt()}>
          <Download className="size-5" aria-hidden /> {t('install.button')}
        </Button>
      ) : null}
      <Card title="iPhone / iPad">
        <ol className="grid list-decimal gap-2 pl-5">
          <li>{t('install.ios1')}</li>
          <li>
            {t('install.ios2')} <Share className="inline size-5 align-text-bottom" aria-label="Share" />
          </li>
          <li>
            {t('install.ios3')} <PlusSquare className="inline size-5 align-text-bottom" aria-hidden />
          </li>
          <li>{t('install.ios4')}</li>
        </ol>
      </Card>
      <Card title="Android">
        <ol className="grid list-decimal gap-2 pl-5">
          <li>{t('install.and1')}</li>
          <li>
            {t('install.and2')} <MoreVertical className="inline size-5 align-text-bottom" aria-label="Menu" />
          </li>
          <li>{t('install.and3')}</li>
          <li>{t('install.and4')}</li>
        </ol>
      </Card>
      <p className="text-sm text-ink-3">{t('install.loginOnce')}</p>
    </div>
  )
}
