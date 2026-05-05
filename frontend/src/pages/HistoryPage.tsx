import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { WorkoutSession, SetLog } from '../db/index.ts'
import { formatDate, formatTime, totalVolume, formatWeight, kgToLbs, KG_TO_LBS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import { SPLIT_LABELS } from '../lib/split.ts'

export default function HistoryPage() {
  const sessions = useLiveQuery<WorkoutSession[]>(
    () => db.sessions
      .orderBy('startedAt')
      .reverse()
      .filter(s => s.completedAt !== null)
      .toArray(),
    []
  ) ?? []

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="px-4 pt-12 pb-5">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          HISTORY
        </h1>
        {sessions.length > 0 && (
          <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.1em', color: 'oklch(44% 0.008 293)', marginTop: 6 }}>
            {sessions.length} WORKOUTS LOGGED
          </p>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-20">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'oklch(30% 0.010 293)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '18px', letterSpacing: '0.04em', color: 'oklch(50% 0.010 293)' }}>
            NO WORKOUTS YET
          </p>
          <p style={{ fontSize: '13px', color: 'oklch(34% 0.008 293)', marginTop: 4 }}>
            Complete your first session to see history
          </p>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-2">
          {sessions.map(s => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
    </div>
  )
}

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
      {/* Header */}
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

        {/* Stats row */}
        <div className="flex gap-5 mt-3">
          <Stat label="VOLUME" value={`${Math.round(displayVol / 100) / 10}k`} unit={unit} />
          <Stat label="SETS" value={String(sets.length)} />
          {duration !== null && <Stat label="TIME" value={String(duration)} unit="min" />}
        </div>
      </div>

      {/* Exercise breakdown */}
      {Object.keys(byExercise).length > 0 && (
        <div
          className="px-4 py-3 flex flex-col gap-1.5"
          style={{ borderTop: '1px solid oklch(16% 0.008 293)' }}
        >
          {Object.entries(byExercise).map(([name, exSets]) => {
            const best = exSets.reduce((a, b) => a.weightKg > b.weightKg ? a : b)
            return (
              <div key={name} className="flex items-center justify-between">
                <p className="truncate flex-1" style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)' }}>
                  {name}
                </p>
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
