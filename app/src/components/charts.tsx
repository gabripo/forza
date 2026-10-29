// Small, dependency-free SVG charts.
// Follows the data-viz rules: 2px lines, >=8px dots with a surface ring, hairline grid,
// recessive axes, text in ink colours (never the series colour), crosshair tooltip,
// selective direct labels, and a data table for screen readers.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

export interface LineSeries {
  id: string
  label: string
  color: string
  points: { t: number; v: number }[]
  /** 'line' (trend), 'dots' (raw measurements) or both. */
  style: 'line' | 'dots' | 'both'
}

export function LineChart({
  series,
  height = 210,
  formatY,
  formatValue = formatY,
  formatX,
  emptyText,
  goal,
}: {
  series: LineSeries[]
  height?: number
  /** Axis labels. */
  formatY: (v: number) => string
  /** Tooltip, table and screen-reader values (default: formatY). */
  formatValue?: (v: number) => string
  formatX: (t: number) => string
  emptyText?: ReactNode
  goal?: { v: number; label: string }
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.points)
  const pad = { l: 44, r: 16, t: 14, b: 26 }

  const geo = useMemo(() => {
    if (!all.length) return null
    const ts = all.map((p) => p.t)
    const vs = all.map((p) => p.v).concat(goal ? [goal.v] : [])
    let t0 = Math.min(...ts)
    let t1 = Math.max(...ts)
    if (t0 === t1) {
      t0 -= 86_400_000
      t1 += 86_400_000
    }
    const vMin = Math.min(...vs)
    const vMax = Math.max(...vs)
    const spread = Math.max(vMax - vMin, Math.abs(vMax) * 0.02, 1)
    const ticks = niceTicks(vMin - spread * 0.1, vMax + spread * 0.1)
    const y0 = ticks[0]
    const y1 = ticks[ticks.length - 1]
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (width - pad.l - pad.r)
    const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (height - pad.t - pad.b)
    const xTicks = [t0, t0 + (t1 - t0) / 2, t1]
    return { x, y, ticks, xTicks, t0, t1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width, height, goal])

  if (!geo) {
    return (
      <div ref={ref} className="grid place-items-center rounded-2xl bg-card-2 text-center text-ink-2" style={{ height }}>
        {emptyText}
      </div>
    )
  }
  const { x, y, ticks, xTicks } = geo

  // Crosshair snaps to the nearest measured time.
  const allTimes = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b)
  const onMove = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left
    let best = allTimes[0]
    for (const t of allTimes) if (Math.abs(x(t) - px) < Math.abs(x(best) - px)) best = t
    setHover(best)
  }

  const primary = series.find((s) => s.style !== 'dots') ?? series[0]
  const last = primary.points[primary.points.length - 1]

  return (
    <div className="w-full">
    <div ref={ref} className="relative w-full overflow-hidden select-none" style={{ height }}>
      {width > 0 ? (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${primary.label}: ${formatValue(last.v)}`}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--axis)" className="tabular">
              {formatY(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={height - 6}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={12}
            fill="var(--axis)"
          >
            {formatX(t)}
          </text>
        ))}
        {goal ? (
          <g>
            <line x1={pad.l} x2={width - pad.r} y1={y(goal.v)} y2={y(goal.v)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="0" opacity={0.6} />
            <text x={width - pad.r} y={y(goal.v) - 6} textAnchor="end" fontSize={12} fill="var(--ink-2)">
              {goal.label}
            </text>
          </g>
        ) : null}
        {series.map((s) =>
          s.style !== 'dots' && s.points.length > 1 ? (
            <path
              key={s.id + 'line'}
              d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {series.map((s) =>
          s.style !== 'line' || s.points.length === 1
            ? s.points.map((p) => (
                <circle key={s.id + p.t} cx={x(p.t)} cy={y(p.v)} r={s.style === 'dots' ? 3.5 : 4} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} />
              ))
            : null,
        )}
        {/* direct label at the end of the main line */}
        <circle cx={x(last.t)} cy={y(last.v)} r={5} fill={primary.color} stroke="var(--chart-surface)" strokeWidth={2} />
        {hover !== null ? (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--ink-3)" strokeWidth={1} />
        ) : null}
        {hover !== null
          ? series.map((s) => {
              const p = s.points.find((q) => q.t === hover)
              return p ? <circle key={s.id + 'h'} cx={x(p.t)} cy={y(p.v)} r={6} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} /> : null
            })
          : null}
      </svg>
      ) : null}
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-xl border border-line bg-card px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 150), minWidth: 140 }}
        >
          <div className="font-semibold">{formatX(hover)}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.t === hover)
            return p ? (
              <div key={s.id} className="flex items-center gap-2">
                <span className="inline-block h-2 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="text-ink-2">{s.label}</span>
                <span className="ml-auto font-semibold tabular">{formatValue(p.v)}</span>
              </div>
            ) : null
          })}
        </div>
      ) : null}
    </div>
      {series.length > 1 ? (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
      <table className="sr-only">
        <tbody>
          {primary.points.map((p) => (
            <tr key={p.t}>
              <td>{formatX(p.t)}</td>
              <td>{formatValue(p.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BarChart({
  bars,
  height = 150,
  goal,
  formatValue = (v) => String(v),
}: {
  bars: { key: string; label: string; value: number; highlight?: boolean }[]
  height?: number
  goal?: { v: number; label: string }
  formatValue?: (v: number) => string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { l: 8, r: 8, t: 22, b: 24 }
  const max = Math.max(1, goal?.v ?? 0, ...bars.map((b) => b.value)) * 1.1
  const band = (width - pad.l - pad.r) / Math.max(1, bars.length)
  const barW = Math.min(24, band * 0.6)
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const base = y(0)

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      {width > 0 ? (
      <svg width={width} height={height} role="img" aria-label={bars.map((b) => `${b.label}: ${formatValue(b.value)}`).join(', ')}>
        <line x1={pad.l} x2={width - pad.r} y1={base} y2={base} stroke="var(--grid)" strokeWidth={1} />
        {goal ? (
          <g>
            <line x1={pad.l} x2={width - pad.r} y1={y(goal.v)} y2={y(goal.v)} stroke="var(--ink-3)" strokeWidth={1} opacity={0.6} />
            <text x={width - pad.r} y={y(goal.v) - 5} textAnchor="end" fontSize={12} fill="var(--ink-2)">
              {goal.label}
            </text>
          </g>
        ) : null}
        {bars.map((b, i) => {
          const cx = pad.l + band * i + band / 2
          const top = y(b.value)
          const h = Math.max(0, base - top)
          const r = Math.min(4, h)
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onPointerDown={() => setHover(i)}>
              <rect x={cx - band / 2} y={pad.t} width={band} height={height - pad.t} fill="transparent" />
              {h > 0 ? (
                <path
                  d={`M${cx - barW / 2},${base} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${base} Z`}
                  fill={b.highlight ? 'var(--series-1)' : 'var(--series-muted)'}
                />
              ) : null}
              {(b.highlight || hover === i) && (
                <text x={cx} y={top - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink)">
                  {formatValue(b.value)}
                </text>
              )}
              <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--axis)">
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
      ) : null}
    </div>
  )
}

/** Progress ring for a single headline number (e.g. calories eaten vs target). */
export function Ring({ value, max, size = 132, children }: { value: number; max: number; size?: number; children?: ReactNode }) {
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const over = value > max * 1.05
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--danger)' : 'var(--brand)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function MacroBar({ label, value, target, color, unit = 'g' }: { label: string; value: number; target: number; color: string; unit?: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <span className="inline-block size-2.5 rounded-full" style={{ background: color }} aria-hidden />
          {label}
        </span>
        <span className="tabular text-ink-2">
          <b className="text-ink">{Math.round(value)}</b> / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-card-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
