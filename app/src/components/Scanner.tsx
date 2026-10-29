import { Flashlight, Keyboard, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { createDetector, type ScanFormat } from '../lib/scan'
import { Button, Input } from './ui'

/**
 * Full-screen camera viewfinder that reads barcodes or QR codes.
 * Works on Android (built-in detector) and iPhone (WebAssembly decoder). Food barcodes can
 * also be typed by hand, for when the camera cannot focus or permission is refused.
 */
export function Scanner({
  formats,
  title,
  hint,
  onResult,
  onClose,
  allowTyping = false,
}: {
  formats: ScanFormat[]
  title: string
  hint: string
  onResult: (value: string) => void
  onClose: () => void
  allowTyping?: boolean
}) {
  const { t } = useI18n()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [torch, setTorch] = useState<boolean | null>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const done = useRef(false)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    void (async () => {
      try {
        const detector = await createDetector(formats)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        track.current = stream.getVideoTracks()[0] ?? null
        const caps = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean }
        setTorch(caps.torch ? false : null)
        const tick = async () => {
          if (stopped || done.current) return
          try {
            if (v.readyState >= 2) {
              const codes = await detector.detect(v)
              const hit = codes.find((c) => c.rawValue)
              if (hit && !done.current) {
                done.current = true
                navigator.vibrate?.(60)
                resultRef.current(hit.rawValue.trim())
                return
              }
            }
          } catch {
            // a frame that could not be read: try the next one
          }
          timer = window.setTimeout(tick, 180)
        }
        void tick()
      } catch (e) {
        const name = (e as Error).name
        setError(name === 'NotAllowedError' ? t('scan.denied') : t('scan.noCamera'))
        if (allowTyping) setTyping(true)
      }
    })()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
    // Formats are fixed for the lifetime of the scanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleTorch() {
    if (!track.current || torch === null) return
    try {
      await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pt-safe flex items-center gap-2 px-4 py-3">
        <h2 className="flex-1 text-lg font-bold">{title}</h2>
        {torch !== null ? (
          <button onClick={toggleTorch} className={`grid size-12 place-items-center rounded-full ${torch ? 'bg-white text-black' : 'bg-white/15'}`} aria-label={t('scan.torch')}>
            <Flashlight className="size-6" aria-hidden />
          </button>
        ) : null}
        <button onClick={onClose} className="grid size-12 place-items-center rounded-full bg-white/15" aria-label={t('common.close')}>
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className={`rounded-3xl border-4 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)] ${formats.includes('qr_code') ? 'size-64' : 'h-40 w-72'}`} />
        </div>
      </div>
      <div className="pb-safe grid gap-3 px-4 py-4">
        {error ? <p className="rounded-2xl bg-white/10 p-3 font-semibold">{error}</p> : <p className="text-center text-white/85">{hint}</p>}
        {allowTyping ? (
          typing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) onResult(typed.replace(/\D/g, ''))
              }}
            >
              <Input inputMode="numeric" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="8001234567890" className="flex-1 text-black" />
              <Button type="submit" disabled={typed.replace(/\D/g, '').length < 8}>
                {t('scan.find')}
              </Button>
            </form>
          ) : (
            <Button variant="secondary" onClick={() => setTyping(true)}>
              <Keyboard className="size-5" aria-hidden /> {t('scan.type')}
            </Button>
          )
        ) : null}
      </div>
    </div>
  )
}
