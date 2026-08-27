import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { WorkoutSession, SetLog, RunSession } from '../db/index.ts'
import { formatDate, formatTime, totalVolume, formatWeight, kgToLbs, KG_TO_LBS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import { SPLIT_LABELS } from '../lib/split.ts'
import { C25K_PLAN } from '../lib/runPlan.ts'

export default function HistoryPage() {
  const [mode, setMode] = useState<'lift' | 'run'>('lift')

  const sessions = useLiveQuery<WorkoutSession[]>(
    () => db.sessions.orderBy('startedAt').reverse().filter(s => s.completedAt !== null).toArray(),
    []
  ) ?? []

  const runSessions = useLiveQuery<RunSession[]>(
    () => db.runSessions.orderBy('startedAt').reverse().filter(s => s.completedAt !== null).toArray(),
    []
  ) ?? []

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="px-4 pt-12 pb-5">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          HISTORY
        </h1>
        <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.1em', color: 'oklch(44% 0.008 293)', marginTop: 6, minHeight: 16 }}>
          {mode === 'lift' && sessions.length > 0 && `${sessions.length} WORKOUTS LOGGED`}
          {mode === 'run' && runSessions.length > 0 && `${runSessions.length} RUNS LOGGED`}
        </p>

        {/* Tab selector */}
        <div
          className="mt-3 inline-flex rounded-2xl p-1"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
        >
          {(['lift', 'run'] as const).map(tab => {
            const active = mode === tab
            return (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className="min-w-24 rounded-xl px-4 py-2.5 transition-all active:scale-[0.98]"
                style={{
                  background: active ? 'oklch(62% 0.24 293)' : 'transparent',
                  color: active ? 'oklch(7% 0.008 293)' : 'oklch(72% 0.012 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '14px',
                  letterSpacing: '0.08em',
                }}
              >
                {tab.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {mode === 'lift' ? (
        sessions.length === 0 ? (
          <EmptyState icon="clipboard" title="NO WORKOUTS YET" sub="Complete your first session to see history" />
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        )
      ) : (
        runSessions.length === 0 ? (
          <EmptyState icon="run" title="NO RUNS YET" sub="Complete your first C25K session to see history" />
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {runSessions.map(rs => <RunSessionCard key={rs.id} session={rs} />)}
          </div>
        )
      )}
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: 'clipboard' | 'run'; title: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-20">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
      >
        {icon === 'clipboard' ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'oklch(30% 0.010 293)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'oklch(30% 0.010 293)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>
      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '18px', letterSpacing: '0.04em', color: 'oklch(50% 0.010 293)' }}>
        {title}
      </p>
      <p style={{ fontSize: '13px', color: 'oklch(34% 0.008 293)', marginTop: 4 }}>
        {sub}
      </p>
    </div>
  )
}

// ── SessionCard (lift) ─────────────────────────────────────────────────────────

function SessionCard({ session }: { session: WorkoutSession }) {
  const sets = useLiveQuery<SetLog[]>(
    () => db.sets.where('sessionId').equals(session.id).toArray(),
    [session.id]
  ) ?? []

  const { unit } = useWeightUnit()
  const vol = totalVolume(sets)
  const displayVol = unit === 'lb' ? vol * KG_TO_LBS : vol
  const duration = session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 60000)
    : null

  const byExercise = sets.reduce<Record<string, SetLog[]>>((acc, s) => {
    ;(acc[s.exerciseName] ??= []).push(s)
    return acc
  }, {})

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.02em', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              {session.routineName.toUpperCase()}
            </p>
            <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 3 }}>
              {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
            </p>
          </div>
          <span
            className="shrink-0 px-2 py-1 rounded-lg"
            style={{ background: 'oklch(18% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', color: 'oklch(50% 0.010 293)' }}
          >
            {SPLIT_LABELS[session.splitDay]?.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-5 mt-3">
          <Stat label="VOLUME" value={`${Math.round(displayVol / 100) / 10}k`} unit={unit} />
          <Stat label="SETS" value={String(sets.length)} />
          {duration !== null && <Stat label="TIME" value={String(duration)} unit="min" />}
        </div>
      </div>
      {Object.keys(byExercise).length > 0 && (
        <div className="px-4 py-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid oklch(16% 0.008 293)' }}>
          {Object.entries(byExercise).map(([name, exSets]) => {
            const best = exSets.reduce((a, b) => a.weightKg > b.weightKg ? a : b)
            return (
              <div key={name} className="flex items-center justify-between">
                <p className="truncate flex-1" style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)' }}>{name}</p>
                <p className="num ml-4 shrink-0" style={{ fontSize: '13px', color: 'oklch(72% 0.012 293)' }}>
                  {exSets.length}× {formatWeight(unit === 'lb' ? kgToLbs(best.weightKg) : best.weightKg)}{unit}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── RunSessionCard ─────────────────────────────────────────────────────────────

function RunSessionCard({ session }: { session: RunSession }) {
  const plan = C25K_PLAN.find(s => s.week === session.week && s.day === session.day)
  const duration = session.durationSec !== null
    ? Math.round(session.durationSec / 60)
    : null

  const runIntervals = plan?.intervals.filter(i => i.type === 'run') ?? []
  const walkIntervals = plan?.intervals.filter(i => i.type === 'walk') ?? []
  const totalRunSec = runIntervals.reduce((s, i) => s + i.durationSec, 0)
  const totalWalkSec = walkIntervals.reduce((s, i) => s + i.durationSec, 0)
  const intervalCount = runIntervals.length

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.02em', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              WEEK {session.week} · DAY {session.day}
            </p>
            <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 3 }}>
              {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
            </p>
          </div>
          <span
            className="shrink-0 px-2 py-1 rounded-lg"
            style={{ background: 'oklch(18% 0.12 150)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', color: 'oklch(62% 0.18 150)' }}
          >
            C25K
          </span>
        </div>

        <div className="flex gap-5 mt-3">
          {duration !== null && <Stat label="TIME" value={String(duration)} unit="min" />}
          {session.distanceKm !== null && <Stat label="DIST" value={session.distanceKm.toFixed(1)} unit="km" />}
          {session.rpe !== null && <Stat label="RPE" value={String(session.rpe)} />}
        </div>
      </div>

      {plan && intervalCount > 0 && (
        <div className="px-4 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid oklch(16% 0.008 293)' }}>
          <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>
            {intervalCount} interval{intervalCount !== 1 ? 's' : ''} ·{' '}
            {Math.round(totalRunSec / 60)} min run / {Math.round(totalWalkSec / 60)} min walk
          </p>
        </div>
      )}
    </div>
  )
}

// ── Stat ───────────────────────────────────────────────────────────────────────

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p style={{ fontSize: '9px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(34% 0.008 293)', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </p>
      <p className="num" style={{ fontSize: '20px', fontWeight: 800, color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: '11px', fontFamily: "'Barlow', sans-serif", fontWeight: 400, color: 'oklch(44% 0.008 293)', marginLeft: 2 }}>{unit}</span>}
      </p>
    </div>
  )
}
