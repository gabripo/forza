import { Dumbbell, PlayCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import type { Exercise } from '../lib/types'
import { cx } from './ui'

/** Start and end photos shown in turn, so the movement reads like a slow animation. */
export function ExerciseMedia({ exercise, className, still }: { exercise: Exercise | undefined; className?: string; still?: boolean }) {
  const [frame, setFrame] = useState(0)
  const images = exercise?.images ?? []
  useEffect(() => {
    if (still || images.length < 2) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % images.length), 1100)
    return () => window.clearInterval(id)
  }, [still, images.length])

  if (!images.length) {
    return (
      <div className={cx('grid aspect-[3/2] place-items-center rounded-2xl bg-card-2 text-ink-3', className)}>
        <Dumbbell className="size-10" aria-hidden />
      </div>
    )
  }
  return (
    <div className={cx('relative aspect-[3/2] overflow-hidden rounded-2xl bg-white', className)}>
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className={cx('absolute inset-0 size-full object-contain transition-opacity duration-300', i === (still ? 0 : frame) ? 'opacity-100' : 'opacity-0')}
        />
      ))}
    </div>
  )
}

export function videoLink(exercise: Exercise, locale: string): string {
  if (exercise.video_url) return exercise.video_url
  const q = `${exercise.name[locale === 'it' ? 'it' : 'en']} ${locale === 'it' ? 'esecuzione corretta' : 'proper form'}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}

export function VideoButton({ exercise }: { exercise: Exercise }) {
  const { t, locale } = useI18n()
  return (
    <a
      href={videoLink(exercise, locale)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 items-center gap-2 rounded-2xl bg-card-2 px-4 font-semibold"
    >
      <PlayCircle className="size-5 text-brand" aria-hidden />
      {exercise.video_url ? t('exercise.video') : t('exercise.findVideo')}
    </a>
  )
}
