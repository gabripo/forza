import { Camera, ImagePlus, Lock, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Empty, Loading, PageHeader } from '../components/ui'
import { useApp } from '../lib/auth'
import { dailyWeights, weightTrend } from '../lib/calc'
import { addPhoto, deletePhoto, getPhotos, getWeights, photoUrls, useAsync } from '../lib/data'
import { useI18n } from '../lib/i18n'
import type { ProgressPhoto } from '../lib/types'

/** Resize to max 1280 px JPEG before upload. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85))
}

export function Photos() {
  const { t, kg, date } = useI18n()
  const { session } = useApp()
  const { data, loading, reload } = useAsync(() => Promise.all([getPhotos(), getWeights(30)]), [])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const photos = data?.[0] ?? []

  useEffect(() => {
    if (photos.length) void photoUrls(photos.map((p) => p.path)).then(setUrls)
  }, [photos])

  async function onFile(file: File | undefined) {
    if (!file || !session) return
    setBusy(true)
    try {
      const trend = weightTrend(dailyWeights(data?.[1] ?? []))
      await addPhoto(session.user.id, await shrink(file), trend.at(-1)?.trend ?? null, null)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: ProgressPhoto) {
    if (!window.confirm(t('photos.confirmDelete'))) return
    await deletePhoto(p)
    void reload()
  }

  if (loading && !data) return <Loading />
  const first = photos[photos.length - 1]
  const latest = photos[0]

  return (
    <div className="grid gap-4">
      <PageHeader title={t('photos.title')} back="/check" />
      <p className="flex items-start gap-2 text-ink-2">
        <Lock className="mt-1 size-4 shrink-0" aria-hidden /> {t('photos.private')}
      </p>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" loading={busy} onClick={() => camera.current?.click()}>
          <Camera className="size-5" aria-hidden /> {t('photos.take')}
        </Button>
        <Button size="lg" variant="secondary" disabled={busy} onClick={() => gallery.current?.click()}>
          <ImagePlus className="size-5" aria-hidden /> {t('snap.gallery')}
        </Button>
      </div>
      <p className="text-sm text-ink-3">{t('photos.tips')}</p>

      {photos.length >= 2 && first && latest ? (
        <Card title={t('photos.compare')}>
          <div className="grid grid-cols-2 gap-2">
            {[first, latest].map((p) => (
              <figure key={p.id}>
                {urls.get(p.path) ? <img src={urls.get(p.path)} alt="" className="aspect-[3/4] w-full rounded-2xl object-cover" /> : <div className="aspect-[3/4] rounded-2xl bg-card-2" />}
                <figcaption className="mt-1 text-center text-sm">
                  <b>{date(p.taken_at, { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                  {p.weight_kg ? <span className="block text-ink-2">{kg(Number(p.weight_kg))} kg</span> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title={t('photos.all')}>
        {photos.length === 0 ? (
          <Empty icon="📸" title={t('photos.empty')} text={t('photos.emptyText')} />
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <li key={p.id} className="relative">
                {urls.get(p.path) ? <img src={urls.get(p.path)} alt="" className="aspect-[3/4] w-full rounded-xl object-cover" /> : <div className="aspect-[3/4] rounded-xl bg-card-2" />}
                <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 text-xs font-semibold text-white">{date(p.taken_at)}</span>
                <button
                  onClick={() => remove(p)}
                  className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/50 text-white"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
