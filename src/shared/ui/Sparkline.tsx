import { useId } from 'react'
import { cn } from './cn'

export type SparkPoint = { t: string; v: number }

/**
 * A small trend line. Deliberately small.
 *
 * The console shows four of these so an operator can see a shape — traffic
 * climbing, failures spiking, latency drifting — and then go to Grafana for
 * anything more. No chart library, because none of these needs axes, a legend,
 * a tooltip or a zoom: adding one would be the first step toward a worse
 * Grafana inside a CMS that already has a real one next door.
 *
 * Two things it will not do. It never zero-fills a gap — the API omits missing
 * points, and drawing a dip where there was no measurement invents an incident.
 * And it renders no line at all below two points, because one point is not a
 * trend and a flat stub reads like one.
 */
export function Sparkline({
  points,
  tone = 'coral',
  label,
  className,
}: {
  points: SparkPoint[]
  tone?: 'coral' | 'lavender' | 'mint' | 'amber'
  /** Screen-reader summary; the shape carries no meaning without it. */
  label: string
  className?: string
}) {
  const gradientId = useId()
  const W = 320
  const H = 56
  const PAD = 3

  if (points.length < 2) {
    return (
      <div
        className={cn(
          'flex h-14 items-center justify-center rounded-compact border border-dashed border-line text-[11px] text-text-subtle',
          className,
        )}
      >
        {label}
      </div>
    )
  }

  const values = points.map((p) => p.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A perfectly flat series would divide by zero and collapse to the top edge;
  // centre it instead, which is what "unchanging" should look like.
  const span = max - min || 1
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)
  const area = `${line.join(' ')} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const last = points[points.length - 1]!

  const stroke = {
    coral: 'stroke-coral',
    lavender: 'stroke-lavender',
    mint: 'stroke-mint',
    amber: 'stroke-amber',
  }[tone]
  const fill = {
    coral: 'text-coral',
    lavender: 'text-lavender',
    mint: 'text-mint',
    amber: 'text-amber',
  }[tone]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn('h-14 w-full', fill, className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line.join(' ')}
        fill="none"
        className={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The latest value is the one an operator is looking for. */}
      <circle cx={x(points.length - 1)} cy={y(last.v)} r="2.5" fill="currentColor" />
    </svg>
  )
}
