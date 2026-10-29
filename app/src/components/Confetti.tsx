import { useMemo } from 'react'

/** A short celebration burst: a reward the moment something good happens. */
export function Confetti({ pieces = ['🎉', '⭐', '💪', '✨', '🥇'] }: { pieces?: string[] }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        char: pieces[i % pieces.length],
        dx: `${Math.round(Math.cos((i / 18) * Math.PI * 2) * (90 + (i % 4) * 30))}px`,
        dy: `${Math.round(Math.sin((i / 18) * Math.PI * 2) * (70 + (i % 3) * 30)) - 40}px`,
        rot: `${(i % 2 ? 1 : -1) * (90 + i * 20)}deg`,
        delay: `${(i % 5) * 40}ms`,
      })),
    [pieces],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} className="confetti-piece" style={{ ['--dx' as string]: b.dx, ['--dy' as string]: b.dy, ['--rot' as string]: b.rot, animationDelay: b.delay }}>
          {b.char}
        </span>
      ))}
    </div>
  )
}
