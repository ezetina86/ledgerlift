import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { SetLog, WorkoutSession } from '../db/index.ts'
import { exerciseProgression, rpeHistory } from '../lib/overload.ts'
import { formatWeight, kgToLbs, KG_TO_LBS } from '../lib/utils.ts'
import type { WeightUnit } from '../lib/prefs.ts'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Props {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  unit: WeightUnit
  onClose: () => void
}

function rpeHex(rpe: number): string {
  if (rpe <= 6) return '#34d399'
  if (rpe <= 7) return '#4ade80'
  if (rpe === 8) return '#facc15'
  if (rpe === 9) return '#fb923c'
  return '#f87171'
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const AXIS_STYLE = { fontSize: 10, fill: 'oklch(44% 0.008 293)' }
const GRID_COLOR = 'oklch(22% 0.010 293)'
const TOOLTIP_STYLE = {
  background: 'oklch(15% 0.010 293)',
  border: '1px solid oklch(25% 0.012 293)',
  borderRadius: 8,
  color: 'oklch(90% 0.008 293)',
  fontSize: 12,
}

function ChartLabel({ children }: { children: string }) {
  return (
    <p style={{
      fontSize: '11px',
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700,
      letterSpacing: '0.15em',
      color: 'oklch(44% 0.008 293)',
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {children}
    </p>
  )
}

export default function ExerciseDashboardSheet({ exerciseId, exerciseName, muscleGroup, unit, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const exerciseSets = useLiveQuery<SetLog[]>(
    () => db.sets.where('exerciseId').equals(exerciseId).toArray(),
    [exerciseId],
  ) ?? []

  const allSessions = useLiveQuery<WorkoutSession[]>(() => db.sessions.toArray(), []) ?? []

  const progression = exerciseProgression(exerciseSets, exerciseId)
  const rpeData = rpeHistory(exerciseSets, allSessions, exerciseId)

  const sessionCount = new Set(exerciseSets.map(s => s.sessionId)).size
  const bestSet = exerciseSets.length > 0
    ? exerciseSets.reduce((b, s) => (s.weightKg > b.weightKg ? s : b))
    : null
  const bestReps = exerciseSets.length > 0 ? Math.max(...exerciseSets.map(s => s.reps)) : 0

  function dw(kg: number): number {
    return unit === 'lb' ? Math.round(kgToLbs(kg) * 10) / 10 : kg
  }

  const weightData = progression.map(p => ({
    date: shortDate(p.sessionDate),
    weight: dw(p.maxWeightKg),
  }))

  const volData = progression.map(p => ({
    date: shortDate(p.sessionDate),
    volume: Math.round(unit === 'lb' ? p.totalVolume * KG_TO_LBS : p.totalVolume),
  }))

  const rpeChartData = rpeData.map(r => ({
    date: shortDate(r.date),
    rpe: r.maxRpe,
  }))

  // Build last 3 sessions
  const sessMap = new Map<string, { date: number; sets: SetLog[] }>()
  for (const s of exerciseSets) {
    const sess = allSessions.find(x => x.id === s.sessionId)
    const date = sess?.startedAt ?? s.timestamp
    const entry = sessMap.get(s.sessionId)
    if (!entry) sessMap.set(s.sessionId, { date, sets: [s] })
    else entry.sets.push(s)
  }
  const recentSessions = [...sessMap.entries()]
    .sort(([, a], [, b]) => b.date - a.date)
    .slice(0, 3)

  const statChips = [
    { value: bestSet ? `${formatWeight(dw(bestSet.weightKg))} ${unit}` : '—', label: 'ALL-TIME' },
    { value: String(sessionCount), label: 'SESSIONS' },
    { value: String(bestReps), label: 'BEST REPS' },
  ]

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{ background: 'oklch(0% 0 0 / 0.75)', opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col"
        style={{
          height: '92svh',
          background: 'oklch(10% 0.010 293)',
          border: '1px solid oklch(22% 0.012 293)',
          borderBottom: 'none',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease-out',
        }}
      >
        {/* Sticky header */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid oklch(19% 0.008 293)' }}
        >
          <span
            className="rounded px-2 py-0.5 font-bold uppercase tracking-widest shrink-0"
            style={{
              fontSize: '9px',
              fontFamily: "'Barlow Condensed', sans-serif",
              background: 'oklch(20% 0.020 293)',
              color: 'oklch(62% 0.24 293)',
            }}
          >
            {muscleGroup}
          </span>
          <p
            className="flex-1 truncate"
            style={{
              fontSize: '18px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              letterSpacing: '0.02em',
              color: 'oklch(97% 0.005 293)',
            }}
          >
            {exerciseName.toUpperCase()}
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(60% 0.008 293)', fontSize: '14px' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto px-5 py-5"
          style={{ overscrollBehavior: 'contain' }}
        >
          {exerciseSets.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p style={{ color: 'oklch(44% 0.008 293)', fontSize: '14px' }}>No data logged yet</p>
            </div>
          ) : (
            <>
              {/* Stat chips */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                {statChips.map(chip => (
                  <div
                    key={chip.label}
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'oklch(14% 0.012 293)', border: '1px solid oklch(20% 0.010 293)' }}
                  >
                    <p
                      className="leading-none mb-1"
                      style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 800,
                        fontSize: chip.label === 'ALL-TIME' ? '16px' : '24px',
                        color: 'oklch(97% 0.005 293)',
                      }}
                    >
                      {chip.value}
                    </p>
                    <p style={{
                      fontSize: '9px',
                      letterSpacing: '0.12em',
                      color: 'oklch(44% 0.008 293)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                    }}>
                      {chip.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Weight Over Time */}
              {weightData.length >= 2 && (
                <section className="mb-6">
                  <ChartLabel>WEIGHT OVER TIME</ChartLabel>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={weightData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(62% 0.24 293)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="oklch(62% 0.24 293)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                      <YAxis domain={['auto', 'auto']} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={40} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRID_COLOR }} />
                      <Area
                        type="monotone"
                        dataKey="weight"
                        stroke="oklch(62% 0.24 293)"
                        fill="url(#wGrad)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'oklch(62% 0.24 293)', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </section>
              )}

              {/* Volume Per Session */}
              {volData.length >= 2 && (
                <section className="mb-6">
                  <ChartLabel>VOLUME PER SESSION</ChartLabel>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={volData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={45} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'oklch(18% 0.010 293)' }} />
                      <Bar dataKey="volume" fill="oklch(52% 0.20 293)" radius={[4, 4, 0, 0] as [number, number, number, number]} />
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              )}

              {/* RPE Trend — only when >= 3 data points */}
              {rpeChartData.length >= 3 && (
                <section className="mb-6">
                  <ChartLabel>RPE TREND</ChartLabel>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={rpeChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                      <YAxis domain={[5, 10]} ticks={[5, 6, 7, 8, 9, 10]} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={25} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRID_COLOR }} />
                      <Line
                        type="monotone"
                        dataKey="rpe"
                        stroke="oklch(35% 0.008 293)"
                        strokeWidth={1.5}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        dot={(props: any) => {
                          const { cx, cy, payload } = props as { cx: number; cy: number; payload: { rpe: number } }
                          return (
                            <circle
                              key={`rpe-${cx}`}
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill={rpeHex(payload.rpe)}
                              stroke="oklch(10% 0.010 293)"
                              strokeWidth={1.5}
                            />
                          )
                        }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </section>
              )}

              {/* Last 3 sessions */}
              {recentSessions.length > 0 && (
                <section className="mb-6">
                  <ChartLabel>{`LAST ${recentSessions.length} SESSIONS`}</ChartLabel>
                  <div className="flex flex-col gap-2">
                    {recentSessions.map(([sessId, sd]) => (
                      <div
                        key={sessId}
                        className="rounded-xl p-3"
                        style={{ background: 'oklch(14% 0.012 293)', border: '1px solid oklch(20% 0.010 293)' }}
                      >
                        <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginBottom: 6 }}>
                          {shortDate(sd.date)}
                        </p>
                        <div className="flex flex-col gap-1">
                          {sd.sets.sort((a, b) => a.setNumber - b.setNumber).map(s => (
                            <div key={s.id} className="flex items-center justify-between">
                              <span style={{
                                fontSize: '13px',
                                fontFamily: "'Barlow Condensed', sans-serif",
                                color: 'oklch(72% 0.012 293)',
                              }}>
                                Set {s.setNumber} · {s.reps} × {formatWeight(dw(s.weightKg))} {unit}
                              </span>
                              {s.rpe != null && (
                                <span
                                  className="rounded px-1.5 py-0.5 font-bold"
                                  style={{
                                    fontSize: '11px',
                                    fontFamily: "'Barlow Condensed', sans-serif",
                                    background: `${rpeHex(s.rpe)}22`,
                                    color: rpeHex(s.rpe),
                                  }}
                                >
                                  RPE {s.rpe}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
