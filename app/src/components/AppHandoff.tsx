import { Check, Copy, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { appCodeLink, iosBrowser } from '../lib/deviceKey'
import { useI18n } from '../lib/i18n'
import { Button, Card, Input } from './ui'

const HIDDEN = 'forza.appHandoffHidden'

function hidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN) === '1'
  } catch {
    return false
  }
}

/**
 * Signed in in Safari on an iPhone: the Forza! icon on the Home Screen keeps a sign-in of its own and may still ask
 * for a code. This copies one for it, so no new code is needed from the family coach.
 */
export function AppHandoffCard({ name }: { name: string }) {
  const { t } = useI18n()
  const [show, setShow] = useState(() => iosBrowser() && !hidden())
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed' | 'offline'>('idle')
  const [link, setLink] = useState<string | null>(null)
  if (!show) return null

  async function copy() {
    setState('busy')
    const made = appCodeLink(name).then((l) => {
      setLink(l)
      if (!l) throw new Error('offline')
      return l
    })
    try {
      // Safari lets a page write to the clipboard only during the tap: the link, made on the server meanwhile, goes
      // in as a promise.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': made.then((l) => new Blob([l], { type: 'text/plain' })) })])
      } else {
        await navigator.clipboard.writeText(await made)
      }
      setState('copied')
    } catch {
      // copying not allowed: the link is shown, to copy by hand (or the server could not be reached)
      const l = await made.catch(() => null)
      setState(l ? 'failed' : 'offline')
    }
  }

  function hide() {
    try {
      localStorage.setItem(HIDDEN, '1')
    } catch {
      // shown again next time
    }
    setShow(false)
  }

  return (
    <Card tone="sky" title={t('handoff.title')}>
      <div className="grid gap-3">
        <p className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{t('handoff.text')}</span>
        </p>
        <Button block variant={state === 'copied' ? 'leaf' : 'primary'} loading={state === 'busy'} onClick={() => void copy()}>
          {state === 'copied' ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}{' '}
          {state === 'copied' ? t('handoff.copied') : t('handoff.copy')}
        </Button>
        {state === 'copied' ? <p className="text-sm">{t('handoff.then')}</p> : null}
        {state === 'offline' ? <p className="text-sm font-semibold text-danger">{t('login.offline')}</p> : null}
        {state === 'failed' && link ? (
          <Input readOnly aria-label={t('handoff.copy')} value={link} onFocus={(e) => e.target.select()} autoFocus />
        ) : null}
        <Button variant="ghost" size="sm" onClick={hide}>
          {t('handoff.hide')}
        </Button>
      </div>
    </Card>
  )
}
