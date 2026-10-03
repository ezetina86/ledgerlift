interface SparklineProps {
  points: number[]
  color?: string
  gradientId: string
  height?: number
}

export default function Sparkline({ points, color = 'oklch(62% 0.24 293)', gradientId, height = 60 }: SparklineProps) {
  if (points.length < 2) return null

  const width = 320
  const pad = Math.max(4, Math.round(height * 0.1))
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (width - pad * 2))
  const ys = points.map(v => height - pad - ((v - min) / range) * (height - pad * 2))
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const area = `${line} L${xs[xs.length - 1].toFixed(1)} ${height} L${xs[0].toFixed(1)} ${height}Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={`${gradientId}-${i}`} cx={x} cy={ys[i]} r="2.5" fill={color} />
      ))}
    </svg>
  )
}
