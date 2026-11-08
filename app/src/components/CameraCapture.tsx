import { Camera, Flashlight, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

/**
 * A photo taken inside the app: a full-screen viewfinder and a shutter button. The phone's camera app is not used
 * because, while it is open, Android may close the browser to free memory (Samsung phones do it often): back from the
 * camera, the page starts again and the photo is lost. If the camera cannot be opened here (refused, or none), the
 * camera app and the gallery are still offered.
 */
export function CameraCapture({ title, hint, onPhoto, onClose }: { title: string; hint?: string; onPhoto: (file: File) => void; onClose: () => void }) {
  const { t } = useI18n()
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const appInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [torch, setTorch] = useState<boolean | null>(null)
  const [taking, setTaking] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no_camera')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (stopped) return
        const v = video.current!
        v.srcObject = stream
        await v.play()
        track.current = stream.getVideoTracks()[0] ?? null
        const caps = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean }
        setTorch(caps.torch ? false : null)
        setReady(true)
      } catch (e) {
        if (stopped) return
        setError((e as Error).name === 'NotAllowedError' ? t('camera.denied') : t('camera.none'))
      }
    })()
    return () => {
      stopped = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
    // The camera opens once, for as long as the viewfinder is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape closes the camera only, not a sheet it was opened from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function toggleTorch() {
    if (!track.current || torch === null) return
    try {
      await track.current.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  /** The frame as it is now, at the camera's full size: the page makes it smaller for the AI. */
  async function take() {
    const v = video.current
    if (!v || !v.videoWidth) return
    setTaking(true)
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')?.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    setTaking(false)
    if (!blob) return setError(t('camera.unreadable'))
    navigator.vibrate?.(30)
    onPhoto(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }

  const picked = (file: File | undefined) => {
    if (file) onPhoto(file)
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="pt-safe flex items-center gap-2 px-4 py-3">
        <h2 className="flex-1 text-lg font-bold">{title}</h2>
        {torch !== null ? (
          <button onClick={() => void toggleTorch()} className={`grid size-12 place-items-center rounded-full ${torch ? 'bg-white text-black' : 'bg-white/15'}`} aria-label={t('scan.torch')}>
            <Flashlight className="size-6" aria-hidden />
          </button>
        ) : null}
        <button onClick={onClose} className="grid size-12 place-items-center rounded-full bg-white/15" aria-label={t('common.close')}>
          <X className="size-6" aria-hidden />
        </button>
      </div>
      {/* What is seen is what is taken: the whole frame, not cropped to the screen. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 size-full object-contain" />
      </div>
      <div className="pb-safe grid gap-3 px-4 py-4">
        {error ? (
          <>
            <p className="rounded-2xl bg-white/10 p-3 font-semibold" role="alert">
              {error}
            </p>
            <input ref={appInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => picked(e.target.files?.[0])} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => picked(e.target.files?.[0])} />
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" onClick={() => appInput.current?.click()}>
                <Camera className="size-5" aria-hidden /> {t('camera.app')}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => galleryInput.current?.click()}>
                <ImagePlus className="size-5" aria-hidden /> {t('snap.gallery')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {hint ? <p className="text-center text-white/85">{hint}</p> : null}
            <button
              onClick={() => void take()}
              disabled={!ready || taking}
              className="mx-auto grid size-20 place-items-center rounded-full border-4 border-white bg-white/25 transition active:scale-95 disabled:opacity-40"
              aria-label={t('camera.take')}
            >
              <span className="size-14 rounded-full bg-white" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
