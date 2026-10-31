import { CheckCircle2, AlertTriangle, CircleDot, Loader2, X, ChevronLeft } from 'lucide-react'
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'leaf'

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-brand text-white active:brightness-95 shadow-sm',
    leaf: 'bg-leaf text-white active:brightness-95 shadow-sm dark:text-black',
    secondary: 'bg-card-2 text-ink active:brightness-95',
    ghost: 'bg-transparent text-brand-ink active:bg-card-2',
    danger: 'bg-danger-soft text-danger active:brightness-95',
  }
  const sizes = { sm: 'h-9 px-3 text-sm rounded-xl', md: 'h-12 px-4 rounded-2xl', lg: 'h-14 px-5 text-lg rounded-2xl' }
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50 select-none',
        styles[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Card({
  title,
  action,
  children,
  className,
  tone,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  tone?: 'brand' | 'leaf' | 'sky' | 'sun'
}) {
  const tones = { brand: 'bg-brand-soft', leaf: 'bg-leaf-soft', sky: 'bg-sky-soft', sun: 'bg-sun-soft' }
  return (
    <section className={cx('rounded-3xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]', tone ? tones[tone] : 'bg-card border border-line', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="text-lg font-bold leading-tight">{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** The page title, kept at the top while scrolling; `children` (e.g. the button that saves the page) stays with it. */
export function PageHeader({ title, subtitle, back, action, children }: { title: string; subtitle?: string; back?: boolean | string; action?: ReactNode; children?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-20 -mx-4 mb-3 bg-bg/90 px-4 backdrop-blur">
      <div className="flex min-h-14 items-center gap-2 py-2">
        {back ? (
          <button
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="-ml-2 grid size-11 place-items-center rounded-full active:bg-card-2"
            aria-label="Back"
          >
            <ChevronLeft className="size-7" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-ink-2">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children ? <div className="pb-3">{children}</div> : null}
    </header>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-sm text-ink-3">{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'h-12 w-full rounded-2xl border border-line bg-card px-4 text-lg outline-none focus:border-sky',
        className,
      )}
    />
  )
}

/** Parses "72,5" and "72.5" alike. */
export function parseNum(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

/** Keeps digits and one decimal separator, with at most `maxDecimals` digits after it. */
export function cleanNumberText(v: string, maxDecimals: number): string {
  let out = ''
  let sep = false
  let after = 0
  for (const ch of v) {
    if (ch >= '0' && ch <= '9') {
      if (sep && after >= maxDecimals) continue
      if (sep) after++
      out += ch
    } else if ((ch === ',' || ch === '.') && !sep && maxDecimals > 0) {
      sep = true
      out += ch
    }
  }
  return out
}

/**
 * A number field that accepts "76,55" and "76.55". It keeps what the person types (so the
 * comma does not vanish half-way) and reports the parsed number.
 */
export function NumberInput({
  value,
  onChange,
  decimals = true,
  maxDecimals = 2,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null
  onChange: (v: number | null) => void
  decimals?: boolean
  maxDecimals?: number
}) {
  const { locale } = useI18n()
  const places = decimals ? maxDecimals : 0
  const show = (v: number | null) => (v === null ? '' : locale === 'it' ? String(v).replace('.', ',') : String(v))
  const [text, setText] = useState(() => show(value))
  // Follow changes made from outside (a preset button, a reset), not our own echo.
  useEffect(() => {
    setText((current) => (parseNum(current) === value ? current : show(value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      value={text}
      onChange={(e) => {
        const clean = cleanNumberText(e.target.value, places)
        setText(clean)
        onChange(parseNum(clean))
      }}
      onFocus={(e) => e.target.select()}
      className={cx(
        'h-12 w-full rounded-2xl border border-line bg-card px-3 text-center text-lg font-semibold tabular outline-none focus:border-sky',
        className,
      )}
    />
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[]
  value: T | null
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('grid gap-1 rounded-2xl bg-card-2 p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'min-h-11 rounded-xl px-2 py-1 text-sm font-semibold leading-tight transition',
            value === o.value ? 'bg-card text-ink shadow-sm ring-1 ring-line' : 'text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ChoiceList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; description?: string; icon?: ReactNode }[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition',
            value === o.value ? 'border-brand bg-brand-soft' : 'border-line bg-card',
          )}
        >
          {o.icon ? <span className="text-2xl" aria-hidden>{o.icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{o.label}</span>
            {o.description ? <span className="block text-sm text-ink-2">{o.description}</span> : null}
          </span>
        </button>
      ))}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} role="dialog" aria-modal aria-label={title}>
      <div
        className="pb-safe max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-bg p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full active:bg-card-2" aria-label="Close">
            <X className="size-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export type Status = 'good' | 'ok' | 'warn'

export function StatusPill({ status, children }: { status: Status; children: ReactNode }) {
  const map = {
    good: { cls: 'bg-leaf-soft text-leaf', Icon: CheckCircle2 },
    ok: { cls: 'bg-sun-soft text-sun', Icon: CircleDot },
    warn: { cls: 'bg-danger-soft text-danger', Icon: AlertTriangle },
  }[status]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold', map.cls)}>
      <map.Icon className="size-4" aria-hidden />
      {children}
    </span>
  )
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="text-2xl font-extrabold tracking-tight">
        {value}
        {unit ? <span className="ml-1 text-base font-semibold text-ink-2">{unit}</span> : null}
      </div>
      {sub ? <div className="text-sm text-ink-3">{sub}</div> : null}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="font-bold">{title}</p>
      {text ? <p className="max-w-xs text-ink-2">{text}</p> : null}
      {action}
    </div>
  )
}

export function Loading() {
  return (
    <div className="grid place-items-center py-16 text-ink-3">
      <Loader2 className="size-8 animate-spin" aria-label="Loading" />
    </div>
  )
}

export function Progress({ value, max, color = 'var(--brand)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-3 overflow-hidden rounded-full bg-card-2" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={max}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export { cx }
