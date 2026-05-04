import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { WorkoutSession, Routine } from '../db/index.ts'
import { formatElapsed } from '../lib/utils.ts'
import { syncWithBackend, getServerUrl } from '../lib/sync.ts'
import ExerciseBlock from '../components/ExerciseBlock.tsx'

interface Props {
  sessionId: string
  onComplete: () => void
  onBack: () => void
}

export default function WorkoutPage({ sessionId, onComplete, onBack }: Props) {
  const [, setTick] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const session = useLiveQuery<WorkoutSession | undefined>(() => db.sessions.get(sessionId), [sessionId])
  const routine  = useLiveQuery<Routine | undefined>(() => session ? db.routines.get(session.routineId) : undefined, [session?.routineId])

  // Tick every second to recompute elapsed during render
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = session ? formatElapsed(session.startedAt) : ''

  async function completeWorkout() {
    await db.sessions.update(sessionId, { completedAt: Date.now() })
    onComplete()
    if (getServerUrl()) syncWithBackend().catch(console.warn)
  }

  if (!session || !routine) {
    return <div className="flex items-center justify-center h-full" style={{ color: 'oklch(44% 0.008 293)' }}>Loading…</div>
  }

  return (
    <div className="flex flex-col min-h-full" style={{ background: 'oklch(7% 0.008 293)' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-30 px-4 pt-10 pb-3"
        style={{
          background: 'oklch(7% 0.008 293 / 0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid oklch(19% 0.008 293)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-95"
            style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(72% 0.012 293)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex-1">
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
              {session.routineName.toUpperCase()}
            </h1>
            <p className="num mt-0.5" style={{ fontSize: '13px', color: 'oklch(62% 0.24 293)' }}>
              {elapsed}
            </p>
          </div>

          <button
            onClick={() => setConfirming(true)}
            className="px-4 h-9 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(8% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '13px', letterSpacing: '0.08em' }}
          >
            FINISH
          </button>
        </div>
      </div>

      {/* Exercise list */}
      <div className="px-4 pt-4 pb-6 flex-1">
        {routine.exercises
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(ex => (
            <ExerciseBlock
              key={ex.exerciseId}
              sessionId={sessionId}
              exerciseId={ex.exerciseId}
              order={ex.order}
              defaultSets={ex.defaultSets}
              defaultReps={ex.defaultReps}
            />
          ))}

        <button
          onClick={() => setConfirming(true)}
          className="w-full h-14 rounded-2xl font-semibold mt-2 transition-all active:scale-[0.98]"
          style={{ background: 'oklch(18% 0.012 293)', border: '1px solid oklch(28% 0.016 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '0.06em' }}
        >
          COMPLETE WORKOUT
        </button>
      </div>

      {/* Confirm sheet */}
      {confirming && (
        <>
          <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={() => setConfirming(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up pb-10 px-5 pt-5"
            style={{ background: 'oklch(12% 0.010 293)', borderTop: '1px solid oklch(28% 0.016 293)', borderRadius: '20px 20px 0 0' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'oklch(30% 0.010 293)' }} />
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '28px', color: 'oklch(97% 0.005 293)', textAlign: 'center', margin: '0 0 6px' }}>
              FINISH WORKOUT?
            </h2>
            <p className="text-sm text-center mb-6" style={{ color: 'oklch(50% 0.010 293)' }}>Session will be saved and marked complete.</p>
            <button
              onClick={completeWorkout}
              className="w-full h-14 rounded-xl mb-3 font-bold transition-all active:scale-[0.98]"
              style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(8% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.06em' }}
            >
              YES, COMPLETE
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="w-full h-12 rounded-xl font-medium transition-all active:scale-[0.98]"
              style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
            >
              KEEP GOING
            </button>
          </div>
        </>
      )}
    </div>
  )
}
