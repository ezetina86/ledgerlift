import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { RunSession } from '../db/index.ts'
import {
  durationTrend,
  distanceTrend,
  longestCompletedRunIntervalSec,
  rpeTrend,
  runSummary,
  totalLoggedDistanceKm,
  totalRunDurationSec,
} from '../lib/runProgress.ts'

function fmtDurationCompact(totalSec: number): string {
  if (totalSec <= 0) return '0 min'

  const totalMin = Math.round(totalSec / 60)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${totalMin} min`
}

function fmtMinutes(totalSec: number): string {
  if (totalSec <= 0) return '0 min'
  return `${Math.round(totalSec / 60)} min`
}

function fmtDistanceKm(distanceKm: number): string {
  return `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km`
}

function fmtRpe(rpe: number): string {
  const rounded = Math.round(rpe * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function Label({ children }: { children: string }) {
  return (
    <p
      style={{
        fontSize: '10px',
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: 'oklch(44% 0.008 293)',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{
        background: 'oklch(12% 0.010 293)',
        border: '1px solid oklch(19% 0.008 293)',
      }}
    >
      <p
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: '18px',
          color: 'oklch(97% 0.005 293)',
          letterSpacing: '0.02em',
          margin: '0 0 6px',
        }}
      >
        COMPLETE A RUN TO SEE C25K PROGRESS
      </p>
      <p
        style={{
          fontSize: '13px',
          color: 'oklch(44% 0.008 293)',
          margin: 0,
        }}
      >
        Start with Week 1 · Day 1 and this panel will begin tracking your plan, duration, distance, and effort trends.
      </p>
    </div>
  )
}

function Sparkline({
  points,
  color = 'oklch(55% 0.22 155)',
  gradientId,
  height = 68,
}: {
  points: number[]
  color?: string
  gradientId: string
  height?: number
}) {
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

function StatCard({
  label,
  value,
  subcopy,
  accent = 'oklch(62% 0.24 293)',
}: {
  label: string
  value: string
  subcopy?: string
  accent?: string
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'oklch(12% 0.010 293)',
        border: '1px solid oklch(19% 0.008 293)',
      }}
    >
      <p
        style={{
          fontSize: '10px',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: accent,
          textTransform: 'uppercase',
          margin: '0 0 8px',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 800,
          fontSize: '24px',
          color: 'oklch(97% 0.005 293)',
          letterSpacing: '-0.01em',
          lineHeight: 1,
          margin: '0 0 6px',
        }}
      >
        {value}
      </p>
      {subcopy && (
        <p style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', margin: 0 }}>
          {subcopy}
        </p>
      )}
    </div>
  )
}

function TrendCard({
  label,
  title,
  subtitle,
  points,
  color,
  gradientId,
  footer,
}: {
  label: string
  title: string
  subtitle: string
  points: number[]
  color: string
  gradientId: string
  footer?: string
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'oklch(12% 0.010 293)',
        border: '1px solid oklch(19% 0.008 293)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p
            style={{
              fontSize: '10px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              letterSpacing: '0.15em',
              color,
              textTransform: 'uppercase',
              margin: '0 0 6px',
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: '24px',
              color: 'oklch(97% 0.005 293)',
              letterSpacing: '-0.01em',
              lineHeight: 1,
              margin: '0 0 4px',
            }}
          >
            {title}
          </p>
          <p style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', margin: 0 }}>{subtitle}</p>
        </div>
        <div
          className="shrink-0 rounded-full px-2.5 py-1"
          style={{
            background: `color-mix(in oklch, ${color} 16%, oklch(12% 0.010 293))`,
            border: `1px solid color-mix(in oklch, ${color} 35%, transparent)`,
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              letterSpacing: '0.12em',
              color,
              textTransform: 'uppercase',
            }}
          >
            {points.length} pts
          </span>
        </div>
      </div>

      <Sparkline points={points} color={color} gradientId={gradientId} />

      {footer && (
        <p style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', margin: '10px 0 0' }}>{footer}</p>
      )}
    </div>
  )
}

export default function RunProgressPanel() {
  const rawRunSessions = useLiveQuery<RunSession[]>(() => db.runSessions.toArray(), [])
  const runSessions = useMemo(() => rawRunSessions ?? [], [rawRunSessions])

  const model = useMemo(() => {
    const summary = runSummary(runSessions)
    const durationPoints = durationTrend(runSessions)
    const distancePoints = distanceTrend(runSessions)
    const rpePoints = rpeTrend(runSessions)

    return {
      summary,
      durationPoints,
      distancePoints,
      rpePoints,
      longestRunSec: longestCompletedRunIntervalSec(runSessions),
      totalDurationSec: totalRunDurationSec(runSessions),
      totalDistanceKm: totalLoggedDistanceKm(runSessions),
    }
  }, [runSessions])

  const {
    summary,
    durationPoints,
    distancePoints,
    rpePoints,
    longestRunSec,
    totalDurationSec: aggregateDurationSec,
    totalDistanceKm,
  } = model

  const latestDuration = durationPoints[durationPoints.length - 1]
  const latestDistance = distancePoints[distancePoints.length - 1]
  const latestRpe = rpePoints[rpePoints.length - 1]
  const distanceLogged = distancePoints.length > 0

  return (
    <div className="px-4 pb-20">
      <section className="mb-6">
        <div
          className="rounded-3xl p-5"
          style={{
            background: 'linear-gradient(180deg, oklch(16% 0.016 293) 0%, oklch(12% 0.010 293) 100%)',
            border: '1px solid oklch(22% 0.014 293)',
          }}
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p
                style={{
                  fontSize: '10px',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  color: 'oklch(55% 0.18 150)',
                  textTransform: 'uppercase',
                  margin: '0 0 8px',
                }}
              >
                Couch to 5K
              </p>
              <h2
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '36px',
                  color: 'oklch(97% 0.005 293)',
                  letterSpacing: '-0.02em',
                  lineHeight: 0.95,
                  margin: '0 0 4px',
                }}
              >
                {summary.completedCount} / {summary.totalPlanned}
              </h2>
              <p style={{ fontSize: '13px', color: 'oklch(72% 0.012 293)', margin: 0 }}>
                Completed run sessions
              </p>
            </div>

            <div
              className="rounded-2xl px-3 py-2 text-right"
              style={{
                background: 'oklch(10% 0.010 293)',
                border: '1px solid oklch(22% 0.012 293)',
              }}
            >
              <p
                style={{
                  fontSize: '10px',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'oklch(44% 0.008 293)',
                  textTransform: 'uppercase',
                  margin: '0 0 4px',
                }}
              >
                Completion
              </p>
              <p
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '26px',
                  color: 'oklch(55% 0.18 150)',
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {summary.completionPct}%
              </p>
            </div>
          </div>

          <div className="mb-4">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'oklch(18% 0.012 293)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${summary.completionPct}%`,
                  background: 'linear-gradient(90deg, oklch(55% 0.18 150) 0%, oklch(62% 0.24 293) 100%)',
                }}
              />
            </div>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{
              background: 'oklch(10% 0.010 293)',
              border: '1px solid oklch(18% 0.012 293)',
            }}
          >
            <p
              style={{
                fontSize: '10px',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                letterSpacing: '0.15em',
                color: 'oklch(44% 0.008 293)',
                textTransform: 'uppercase',
                margin: '0 0 6px',
              }}
            >
              Next up
            </p>
            <p
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: '22px',
                color: summary.nextSessionLabel ? 'oklch(97% 0.005 293)' : 'oklch(55% 0.18 150)',
                letterSpacing: '-0.01em',
                lineHeight: 1,
                margin: '0 0 4px',
              }}
            >
              {summary.nextSessionLabel ?? 'PLAN COMPLETE'}
            </p>
            <p style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', margin: 0 }}>
              {summary.nextSessionLabel
                ? 'Stay on the plan and chip away one session at a time.'
                : 'All 27 sessions logged. You finished the full C25K block.'}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <Label>Run Stats</Label>
        <div className="grid grid-cols-1 gap-3">
          <StatCard
            label="Longest Run"
            value={fmtMinutes(longestRunSec)}
            subcopy={summary.completedCount > 0 ? 'Longest continuous run interval completed' : 'Complete sessions to unlock this stat'}
            accent="oklch(62% 0.24 293)"
          />
          <StatCard
            label="Total Time"
            value={fmtDurationCompact(aggregateDurationSec)}
            subcopy={summary.completedCount > 0 ? 'Logged across completed run sessions' : 'Timer total will build here'}
            accent="oklch(55% 0.18 150)"
          />
          <StatCard
            label="Distance Logged"
            value={distanceLogged ? fmtDistanceKm(totalDistanceKm) : '—'}
            subcopy={distanceLogged ? 'Only includes runs where distance was entered' : 'Add distance after runs to track this'}
            accent="oklch(72% 0.18 55)"
          />
        </div>
      </section>

      {summary.completedCount === 0 ? (
        <section>
          <Label>Trends</Label>
          <EmptyState />
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <Label>Duration Trend</Label>
            <TrendCard
              label="Session Duration"
              title={latestDuration ? fmtMinutes(latestDuration.value) : '—'}
              subtitle={latestDuration ? `Latest completed ${latestDuration.label}` : 'Duration will appear after completed runs'}
              points={durationPoints.map(point => point.value)}
              color="oklch(55% 0.18 150)"
              gradientId="run-progress-duration"
              footer={`Total run time: ${fmtDurationCompact(aggregateDurationSec)}`}
            />
          </section>

          {distancePoints.length >= 2 && (
            <section>
              <Label>Distance Trend</Label>
              <TrendCard
                label="Distance"
                title={latestDistance ? fmtDistanceKm(latestDistance.value) : '—'}
                subtitle={latestDistance ? `Latest logged ${latestDistance.label}` : 'Distance trend unavailable'}
                points={distancePoints.map(point => point.value)}
                color="oklch(72% 0.18 55)"
                gradientId="run-progress-distance"
                footer={`Logged distance total: ${fmtDistanceKm(totalDistanceKm)}`}
              />
            </section>
          )}

          {rpePoints.length >= 2 && (
            <section>
              <Label>Effort Trend</Label>
              <TrendCard
                label="RPE"
                title={latestRpe ? fmtRpe(latestRpe.value) : '—'}
                subtitle={latestRpe ? `Latest effort ${latestRpe.label}` : 'Effort trend unavailable'}
                points={rpePoints.map(point => point.value)}
                color="oklch(62% 0.24 293)"
                gradientId="run-progress-rpe"
                footer="RPE uses the 1–10 scale saved at the end of each run."
              />
            </section>
          )}
        </div>
      )}
    </div>
  )
}
