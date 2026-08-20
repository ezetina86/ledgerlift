import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef } from 'react'
import { db } from '../db/index.ts'
import type { WorkoutSession, Mesocycle, RunSession } from '../db/index.ts'
import { nextSplitDay, SPLIT_LABELS, SPLIT_FOCUS, ROUTINE_ID, mesocycleWeek } from '../lib/split.ts'
import { nextRunSession, totalDurationSec } from '../lib/runPlan.ts'
import { totalVolume, uid, KG_TO_LBS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import { detectFatigue } from '../lib/overload.ts'

interface Props {
  onStartWorkout: (sessionId: string) => void
  onResumeWorkout: (sessionId: string) => void
  onNavigatePlan?: () => void
  onStartRun: (sessionId: string) => void
  onResumeRun: (sessionId: string) => void
}

const MUSCLE_COLORS: Record<string, string> = {
  'Chest':      'oklch(55% 0.18 220)',
  'Back':       'oklch(55% 0.18 265)',
  'Biceps':     'oklch(55% 0.20 293)',
  'Triceps':    'oklch(52% 0.18 305)',
  'Quads':      'oklch(58% 0.18 150)',
  'Hamstrings': 'oklch(56% 0.16 170)',
  'Glutes':     'oklch(55% 0.20 340)',
  'Shoulders':  'oklch(58% 0.18 55)',
  'Calves':     'oklch(56% 0.16 190)',
  'Core':       'oklch(60% 0.18 85)',
}

const DAY_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT']

export default function HomePage({ onStartWorkout, onResumeWorkout, onNavigatePlan, onStartRun, onResumeRun }: Props) {
  const startingRun = useRef(false)
  const sessions = useLiveQuery<WorkoutSession[]>(
    () => db.sessions.orderBy('startedAt').reverse().limit(10).toArray(), []
  ) ?? []
  const activeMeso = useLiveQuery<Mesocycle | undefined>(
    () => db.mesocycles.filter(m => m.endedAt === null).first()
  )
  const allSets = useLiveQuery(() => db.sets.toArray())
  const completedSessions = useLiveQuery(
    () => db.sessions.filter(s => s.completedAt !== null).toArray()
  )
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const exMap = useMemo(() => new Map((exercises ?? []).map(e => [e.id, e])), [exercises])

  const activeRun = useLiveQuery<RunSession | undefined>(
    () => db.runSessions.filter(s => s.completedAt === null).first()
  )
  const completedRunCount = useLiveQuery<number>(
    () => db.runSessions.filter(s => s.completedAt !== null).count()
  ) ?? 0
  const nextPlan = nextRunSession(completedRunCount)

  const fatigueSignals = useMemo(
    () => detectFatigue(allSets ?? [], completedSessions ?? [], exMap),
    [allSets, completedSessions, exMap]
  )

  const activeSession = sessions.find(s => s.completedAt === null)
  const lastCompleted = sessions.find(s => s.completedAt !== null)
  const nextDay = nextSplitDay(lastCompleted)
  const nextRoutineId = ROUTINE_ID[nextDay]

  const today = new Date()
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - today.getDay() + i)
    return d
  })

  async function startWorkout() {
    const routine = await db.routines.get(nextRoutineId)
    if (!routine) return
    const session: WorkoutSession = {
      id: uid(), routineId: routine.id, routineName: routine.name,
      splitDay: routine.splitDay, startedAt: Date.now(),
      completedAt: null, notes: '',
      mesocycleId: activeMeso?.id ?? null,
      isDeload: activeMeso?.isDeloadWeek ?? false,
      updatedAt: 0,
    }
    await db.sessions.add(session)
    onStartWorkout(session.id)
  }

  async function startRun() {
    if (!nextPlan || startingRun.current) return
    startingRun.current = true
    const session: RunSession = {
      id: uid(), week: nextPlan.week, day: nextPlan.day,
      // eslint-disable-next-line react-hooks/purity
      startedAt: Date.now(), completedAt: null,
      durationSec: null, distanceKm: null, rpe: null, updatedAt: 0,
    }
    await db.runSessions.add(session)
    onStartRun(session.id)
    startingRun.current = false
  }

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>

      {/* ── Header ──────────────────────────── */}
      <div className="px-4 pt-12 pb-5">
        <p className="text-xs tracking-widest mb-1 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, color: 'oklch(44% 0.008 293)' }}>
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          LEDGERLIFT
        </h1>
      </div>

      {/* ── Week strip ──────────────────────── */}
      <div className="px-4 mb-6">
        <div className="flex gap-1.5">
          {weekDays.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString()
            const hasSession = sessions.some(s =>
              s.completedAt && new Date(s.completedAt).toDateString() === d.toDateString()
            )
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center rounded-xl py-2"
                style={{
                  background: isToday ? 'oklch(62% 0.24 293)' : 'oklch(12% 0.010 293)',
                  border: '1px solid ' + (isToday ? 'transparent' : 'oklch(19% 0.008 293)'),
                }}
              >
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 600,
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    color: isToday ? 'oklch(20% 0.010 293)' : 'oklch(44% 0.008 293)',
                  }}
                >
                  {DAY_NAMES[d.getDay()]}
                </span>
                <span
                  className="num"
                  style={{
                    fontSize: '20px',
                    lineHeight: 1.1,
                    color: isToday ? 'oklch(8% 0.008 293)' : 'oklch(72% 0.012 293)',
                  }}
                >
                  {d.getDate()}
                </span>
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ background: hasSession ? (isToday ? 'oklch(20% 0.010 293)' : 'oklch(62% 0.24 293)') : 'transparent' }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Mesocycle status chip ────────────── */}
      {activeMeso && (
        <div className="mx-4 mb-4 rounded-xl px-4 py-3 overflow-hidden" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <div className="flex items-center justify-between mb-2">
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: activeMeso.isDeloadWeek ? 'oklch(72% 0.18 55)' : 'oklch(62% 0.24 293)', textTransform: 'uppercase' }}>
              {activeMeso.isDeloadWeek ? 'DELOAD WEEK' : `MESOCYCLE ${activeMeso.number}`}
            </p>
            <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}>
              WEEK {Math.min(mesocycleWeek(activeMeso), activeMeso.targetWeeks)} OF {activeMeso.targetWeeks}
            </p>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'oklch(20% 0.010 293)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((mesocycleWeek(activeMeso) / activeMeso.targetWeeks) * 100, 100)}%`,
                background: activeMeso.isDeloadWeek ? 'oklch(72% 0.18 55)' : 'oklch(62% 0.24 293)',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Fatigue warning banner ────────────── */}
      {fatigueSignals.length > 0 && (
        <div
          className="mx-4 mb-4 rounded-xl px-4 py-3"
          style={{ background: 'oklch(16% 0.10 55)', border: '1px solid oklch(30% 0.16 55)' }}
        >
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '14px', color: 'oklch(80% 0.20 55)', letterSpacing: '0.04em', marginBottom: 3 }}>
            RPE CREEPING HIGH ON: {fatigueSignals.map(s => s.exerciseName).join(', ')}
          </p>
          <p style={{ fontSize: '11px', color: 'oklch(60% 0.12 55)', marginBottom: 8 }}>
            Consider deloading before next cycle
          </p>
          {onNavigatePlan && (
            <button
              onClick={onNavigatePlan}
              className="px-3 py-1.5 rounded-lg transition-colors active:scale-[0.97]"
              style={{
                background: 'oklch(24% 0.14 55)',
                color: 'oklch(80% 0.20 55)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '12px',
                letterSpacing: '0.08em',
              }}
            >
              MANAGE CYCLE
            </button>
          )}
        </div>
      )}

      {/* ── Active session banner ────────────── */}
      {activeSession && (
        <div
          className="mx-4 mb-4 rounded-2xl p-4"
          style={{ background: 'oklch(17% 0.10 293)', border: '1px solid oklch(28% 0.16 293)' }}
        >
          <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(62% 0.24 293)', textTransform: 'uppercase', marginBottom: 4 }}>
            In Progress
          </p>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em' }}>
            {activeSession.routineName}
          </p>
          <button
            onClick={() => onResumeWorkout(activeSession.id)}
            className="mt-3 w-full h-12 rounded-xl font-bold transition-all active:scale-[0.98]"
            style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(8% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em' }}
          >
            RESUME WORKOUT
          </button>
        </div>
      )}

      {/* ── Next workout card ────────────────── */}
      {!activeSession && (
        <div
          className="mx-4 mb-4 rounded-2xl overflow-hidden"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
        >
          {/* Top bar */}
          <div className="px-4 pt-4 pb-3">
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(50% 0.010 293)', textTransform: 'uppercase', marginBottom: 4 }}>
              Up Next
            </p>
            <h2
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: '42px',
                lineHeight: 1,
                letterSpacing: '-0.01em',
                color: 'oklch(97% 0.005 293)',
                margin: 0,
              }}
            >
              {SPLIT_LABELS[nextDay].toUpperCase()}
            </h2>

            {/* Muscle chips */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SPLIT_FOCUS[nextDay].map(m => (
                <span
                  key={m}
                  className="px-2.5 py-1 rounded-lg text-xs"
                  style={{
                    background: 'oklch(18% 0.012 293)',
                    color: MUSCLE_COLORS[m] ?? 'oklch(62% 0.24 293)',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 700,
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4">
            <button
              onClick={startWorkout}
              className="w-full h-14 rounded-xl font-bold transition-all active:scale-[0.98]"
              style={{
                background: 'oklch(62% 0.24 293)',
                color: 'oklch(7% 0.008 293)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: '18px',
                letterSpacing: '0.06em',
              }}
            >
              START WORKOUT
            </button>
          </div>
        </div>
      )}

      {/* ── Run card ────────────────────────────────── */}
      {activeRun ? (
        <div className="mx-4 mb-4 rounded-2xl p-4"
          style={{ background: 'oklch(14% 0.06 150)', border: '1px solid oklch(24% 0.10 150)' }}>
          <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(55% 0.18 150)', textTransform: 'uppercase', marginBottom: 4 }}>
            Run In Progress
          </p>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em' }}>
            WEEK {activeRun.week} · DAY {activeRun.day}
          </p>
          <button onClick={() => onResumeRun(activeRun.id)}
            className="mt-3 w-full h-12 rounded-xl font-bold transition-all active:scale-[0.98]"
            style={{ background: 'oklch(50% 0.18 150)', color: 'oklch(97% 0.005 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em' }}>
            RESUME RUN
          </button>
        </div>
      ) : nextPlan ? (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <div className="px-4 pt-4 pb-3">
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(50% 0.010 293)', textTransform: 'uppercase', marginBottom: 4 }}>
              Up Next — Run
            </p>
            <div className="flex items-baseline gap-3">
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', lineHeight: 1, letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', margin: 0 }}>
                WEEK {nextPlan.week} · DAY {nextPlan.day}
              </h2>
              <span className="px-2.5 py-1 rounded-lg"
                style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(50% 0.18 150)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em' }}>
                ~{Math.round(totalDurationSec(nextPlan) / 60)} MIN
              </span>
            </div>
          </div>
          <div className="px-4 pb-4">
            <button onClick={startRun}
              className="w-full h-12 rounded-xl font-bold transition-all active:scale-[0.98]"
              style={{ background: 'oklch(50% 0.18 150)', color: 'oklch(97% 0.005 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em' }}>
              START RUN
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-4 mb-4 rounded-2xl px-4 py-4"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', color: 'oklch(62% 0.24 293)', letterSpacing: '0.04em' }}>
            C25K COMPLETE
          </p>
          <p style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', marginTop: 2 }}>All 27 sessions finished.</p>
        </div>
      )}

      {/* ── 4-day cycle ──────────────────────── */}
      <div className="px-4 mb-5">
        <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
          This Cycle
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['upperA','lowerA','upperB','lowerB'] as const).map(day => (
            <div
              key={day}
              className="p-3 rounded-xl"
              style={{
                background: day === nextDay ? 'oklch(17% 0.10 293)' : 'oklch(12% 0.010 293)',
                border: '1px solid ' + (day === nextDay ? 'oklch(28% 0.16 293)' : 'oklch(19% 0.008 293)'),
              }}
            >
              <p
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '15px',
                  letterSpacing: '0.04em',
                  color: day === nextDay ? 'oklch(62% 0.24 293)' : 'oklch(72% 0.012 293)',
                  margin: 0,
                }}
              >
                {SPLIT_LABELS[day].toUpperCase()}
              </p>
              <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 2 }}>
                {SPLIT_FOCUS[day].slice(0, 2).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent sessions ──────────────────── */}
      {sessions.filter(s => s.completedAt).length > 0 && (
        <div className="px-4">
          <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
            Recent
          </p>
          <div className="flex flex-col gap-2">
            {sessions.filter(s => s.completedAt).slice(0, 3).map(s => (
              <RecentCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RecentCard({ session }: { session: WorkoutSession }) {
  const sets = useLiveQuery<{ reps: number; weightKg: number }[]>(
    () => db.sets.where('sessionId').equals(session.id).toArray(), [session.id]
  ) ?? []
  const { unit } = useWeightUnit()
  const vol = totalVolume(sets)
  const displayVol = unit === 'lb' ? vol * KG_TO_LBS : vol

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-xl"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      <div>
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', color: 'oklch(97% 0.005 293)' }}>
          {session.routineName.toUpperCase()}
        </p>
        <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 1 }}>
          {new Date(session.completedAt!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      </div>
      <div className="text-right">
        <p className="num" style={{ fontSize: '18px', color: 'oklch(62% 0.24 293)' }}>
          {Math.round(displayVol / 100) / 10}<span style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', fontFamily: "'Barlow', sans-serif" }}>k {unit}</span>
        </p>
        <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>{sets.length} sets</p>
      </div>
    </div>
  )
}
