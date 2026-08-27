import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { Mesocycle, ExerciseSwap, Routine, Exercise, RunSession } from '../db/index.ts'
import { mesocycleWeek } from '../lib/split.ts'
import { uid } from '../lib/utils.ts'
import { nextRunSession, totalDurationSec, C25K_PLAN } from '../lib/runPlan.ts'
import ExercisePickerSheet from '../components/ExercisePickerSheet.tsx'

const SPLIT_DAY_LABELS: Record<string, string> = {
  'upper-a': 'Upper A — Mon',
  'lower-a': 'Lower A — Tue',
  'upper-b': 'Upper B — Thu',
  'lower-b': 'Lower B — Fri',
}

export default function PlanPage() {
  const activeMeso = useLiveQuery<Mesocycle | undefined>(
    () => db.mesocycles.filter(m => m.endedAt === null).first()
  )
  const allMesos = useLiveQuery<Mesocycle[]>(
    () => db.mesocycles.orderBy('startedAt').reverse().toArray()
  ) ?? []
  const routines = useLiveQuery<Routine[]>(() => db.routines.toArray()) ?? []
  const swaps = useLiveQuery<ExerciseSwap[]>(
    () => activeMeso
      ? db.exerciseSwaps.where('mesocycleId').equals(activeMeso.id).toArray()
      : Promise.resolve([]),
    [activeMeso?.id]
  ) ?? []
  const sessions = useLiveQuery(
    () => db.sessions.filter(s => s.completedAt !== null).toArray()
  ) ?? []
  const allSets = useLiveQuery(() => db.sets.toArray()) ?? []
  const exercises = useLiveQuery<Exercise[]>(() => db.exercises.toArray())
  const runSessions = useLiveQuery<RunSession[]>(
    () => db.runSessions.filter(s => s.completedAt !== null).toArray()
  ) ?? []
  const exMap = useMemo(() => new Map((exercises ?? []).map(e => [e.id, e])), [exercises])

  const [showNewMesoSheet, setShowNewMesoSheet] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [newMesoName, setNewMesoName] = useState('')
  const [newMesoWeeks, setNewMesoWeeks] = useState<4 | 5 | 6>(5)

  // Swap state
  const [swapRoutineId, setSwapRoutineId] = useState<string | null>(null)
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const week = activeMeso ? mesocycleWeek(activeMeso) : 1

  async function toggleDeload() {
    if (!activeMeso) return
    await db.mesocycles.update(activeMeso.id, { isDeloadWeek: !activeMeso.isDeloadWeek })
  }

  async function endMesocycle() {
    if (!activeMeso) return
    await db.mesocycles.update(activeMeso.id, { endedAt: Date.now() })
    setShowEndConfirm(false)
    const next = allMesos.length + 1
    setNewMesoName(`Mesocycle ${next}`)
    setShowNewMesoSheet(true)
  }

  async function startNewMesocycle() {
    const next = (allMesos[0]?.number ?? 0) + 1
    const name = newMesoName.trim() || `Mesocycle ${next}`
    const now = Date.now()
    await db.mesocycles.add({
      id: uid(),
      number: next,
      name,
      targetWeeks: newMesoWeeks,
      startedAt: now,
      endedAt: null,
      isDeloadWeek: false,
      updatedAt: now,
    })
    setShowNewMesoSheet(false)
    setNewMesoName('')
    setNewMesoWeeks(5)
  }

  function openSwap(routineId: string, exerciseId: string) {
    setSwapRoutineId(routineId)
    setSwapExerciseId(exerciseId)
    setPickerOpen(true)
  }

  async function handleSwapSelect(newExercise: Exercise) {
    if (!swapRoutineId || !swapExerciseId || !activeMeso) return
    const routine = routines.find(r => r.id === swapRoutineId)
    if (!routine) return

    await db.routines.update(swapRoutineId, {
      exercises: routine.exercises.map(e =>
        e.exerciseId === swapExerciseId
          ? { ...e, exerciseId: newExercise.id }
          : e
      ),
    })

    await db.exerciseSwaps.add({
      id: uid(),
      mesocycleId: activeMeso.id,
      routineId: swapRoutineId,
      removedExerciseId: swapExerciseId,
      addedExerciseId: newExercise.id,
      swappedAt: Date.now(),
    })

    setSwapRoutineId(null)
    setSwapExerciseId(null)
  }

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>

      {/* ── Header ──────────────────────────────── */}
      <div className="px-4 pt-12 pb-5">
        <p className="text-xs tracking-widest mb-1 uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, color: 'oklch(44% 0.008 293)' }}>
          Training Block
        </p>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          PLAN
        </h1>
      </div>

      {/* ── Active Mesocycle Card ──────────────── */}
      {activeMeso ? (
        <div className="mx-4 mb-5 rounded-2xl overflow-hidden" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: activeMeso.isDeloadWeek ? 'oklch(72% 0.18 55)' : 'oklch(62% 0.24 293)', textTransform: 'uppercase' }}>
                  {activeMeso.isDeloadWeek ? 'DELOAD WEEK' : `Mesocycle ${activeMeso.number}`}
                </p>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '26px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.1 }}>
                  {activeMeso.name.toUpperCase()}
                </h2>
                <p style={{ fontSize: '13px', color: 'oklch(50% 0.010 293)', marginTop: 2 }}>
                  Week {Math.min(week, activeMeso.targetWeeks)} of {activeMeso.targetWeeks}
                </p>
              </div>
              <span
                className="mt-1 px-2.5 py-1.5 rounded-lg num"
                style={{
                  background: 'oklch(18% 0.012 293)',
                  color: 'oklch(62% 0.24 293)',
                  fontSize: '22px',
                  fontWeight: 800,
                }}
              >
                W{Math.min(week, activeMeso.targetWeeks)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full mt-3 mb-4 overflow-hidden" style={{ background: 'oklch(20% 0.010 293)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min((Math.min(week, activeMeso.targetWeeks) / activeMeso.targetWeeks) * 100, 100)}%`,
                  background: activeMeso.isDeloadWeek ? 'oklch(72% 0.18 55)' : 'oklch(62% 0.24 293)',
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={toggleDeload}
                className="flex-1 h-10 rounded-xl transition-all active:scale-[0.97]"
                style={{
                  background: activeMeso.isDeloadWeek ? 'oklch(24% 0.12 55)' : 'oklch(18% 0.012 293)',
                  border: '1px solid ' + (activeMeso.isDeloadWeek ? 'oklch(40% 0.18 55)' : 'oklch(24% 0.010 293)'),
                  color: activeMeso.isDeloadWeek ? 'oklch(72% 0.18 55)' : 'oklch(62% 0.010 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                }}
              >
                {activeMeso.isDeloadWeek ? 'DELOAD ON' : 'DELOAD WEEK'}
              </button>
              <button
                onClick={() => setShowEndConfirm(true)}
                className="flex-1 h-10 rounded-xl transition-all active:scale-[0.97]"
                style={{
                  background: 'oklch(18% 0.012 293)',
                  border: '1px solid oklch(24% 0.010 293)',
                  color: 'oklch(55% 0.010 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                }}
              >
                END CYCLE
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-4 mb-5">
          <button
            onClick={() => {
              const next = (allMesos[0]?.number ?? 0) + 1
              setNewMesoName(`Mesocycle ${next}`)
              setShowNewMesoSheet(true)
            }}
            className="w-full h-14 rounded-2xl font-bold transition-all active:scale-[0.98]"
            style={{
              background: 'oklch(62% 0.24 293)',
              color: 'oklch(7% 0.008 293)',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: '18px',
              letterSpacing: '0.06em',
            }}
          >
            START NEW MESOCYCLE
          </button>
        </div>
      )}

      {/* ── Routine Editor ────────────────────── */}
      <div className="px-4 mb-5">
        <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
          Routines
        </p>
        <div className="flex flex-col gap-3">
          {routines.sort((a, b) => a.id.localeCompare(b.id)).map(routine => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              exMap={exMap}
              swaps={swaps.filter(s => s.routineId === routine.id)}
              onSwap={(exerciseId) => openSwap(routine.id, exerciseId)}
              mesoActive={!!activeMeso}
            />
          ))}
        </div>
      </div>

      {/* ── Mesocycle History ─────────────────── */}
      {allMesos.filter(m => m.endedAt !== null).length > 0 && (
        <div className="px-4 mb-5">
          <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
            History
          </p>
          <div className="flex flex-col gap-2">
            {allMesos.filter(m => m.endedAt !== null).map(meso => {
              const mesoSessions = sessions.filter(s => s.mesocycleId === meso.id)
              const mesoSets = allSets.filter(s => mesoSessions.some(ms => ms.id === s.sessionId))
              const totalVol = mesoSets.reduce((acc, s) => acc + s.volume, 0)
              const mesoSwaps = swaps.filter(s => s.mesocycleId === meso.id)
              return (
                <div
                  key={meso.id}
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', color: 'oklch(97% 0.005 293)' }}>
                        {meso.name.toUpperCase()}
                      </p>
                      <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 2 }}>
                        {new Date(meso.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' → '}
                        {meso.endedAt ? new Date(meso.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'ongoing'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num" style={{ fontSize: '16px', color: 'oklch(62% 0.24 293)' }}>
                        {mesoSessions.length} <span style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>sessions</span>
                      </p>
                      <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>
                        {Math.round(totalVol / 1000)}k kg vol
                      </p>
                    </div>
                  </div>
                  {mesoSwaps.length > 0 && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid oklch(19% 0.008 293)' }}>
                      <p style={{ fontSize: '10px', color: 'oklch(44% 0.008 293)', marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em' }}>
                        SWAPS ({mesoSwaps.length})
                      </p>
                      {mesoSwaps.map(sw => (
                        <p key={sw.id} style={{ fontSize: '11px', color: 'oklch(50% 0.010 293)' }}>
                          {exMap.get(sw.removedExerciseId)?.name ?? sw.removedExerciseId}
                          {' → '}
                          {exMap.get(sw.addedExerciseId)?.name ?? sw.addedExerciseId}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── C25K Run Plan ────────────────────── */}
      <C25KBlock runSessions={runSessions} />

      {/* ── End Cycle Confirm Sheet ───────────── */}
      {showEndConfirm && (
        <>
          <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={() => setShowEndConfirm(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up pb-10 px-5 pt-5"
            style={{ background: 'oklch(12% 0.010 293)', borderTop: '1px solid oklch(28% 0.016 293)', borderRadius: '20px 20px 0 0' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'oklch(30% 0.010 293)' }} />
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '26px', color: 'oklch(97% 0.005 293)', textAlign: 'center', margin: '0 0 6px' }}>
              END MESOCYCLE?
            </h2>
            <p className="text-sm text-center mb-6" style={{ color: 'oklch(50% 0.010 293)' }}>
              This will close the current cycle and let you start a new one.
            </p>
            <button
              onClick={endMesocycle}
              className="w-full h-14 rounded-xl mb-3 font-bold transition-all active:scale-[0.98]"
              style={{ background: 'oklch(55% 0.22 25)', color: 'oklch(97% 0.005 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.06em' }}
            >
              YES, END CYCLE
            </button>
            <button
              onClick={() => setShowEndConfirm(false)}
              className="w-full h-12 rounded-xl font-medium transition-all active:scale-[0.98]"
              style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
            >
              CANCEL
            </button>
          </div>
        </>
      )}

      {/* ── New Mesocycle Sheet ───────────────── */}
      {showNewMesoSheet && (
        <>
          <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={() => setShowNewMesoSheet(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up pb-10 px-5 pt-5"
            style={{ background: 'oklch(12% 0.010 293)', borderTop: '1px solid oklch(28% 0.016 293)', borderRadius: '20px 20px 0 0' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'oklch(30% 0.010 293)' }} />
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '26px', color: 'oklch(97% 0.005 293)', margin: '0 0 16px' }}>
              NEW MESOCYCLE
            </h2>

            <label style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', color: 'oklch(50% 0.010 293)', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Name
            </label>
            <input
              type="text"
              value={newMesoName}
              onChange={e => setNewMesoName(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm outline-none mb-5"
              style={{
                background: 'oklch(18% 0.012 293)',
                border: '1px solid oklch(24% 0.010 293)',
                color: 'oklch(97% 0.005 293)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '16px',
              }}
            />

            <label style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', color: 'oklch(50% 0.010 293)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Target Weeks
            </label>
            <div className="flex gap-3 mb-6">
              {([4, 5, 6] as const).map(w => (
                <button
                  key={w}
                  onClick={() => setNewMesoWeeks(w)}
                  className="flex-1 h-12 rounded-xl transition-all active:scale-[0.97]"
                  style={{
                    background: newMesoWeeks === w ? 'oklch(62% 0.24 293)' : 'oklch(18% 0.012 293)',
                    border: '1px solid ' + (newMesoWeeks === w ? 'transparent' : 'oklch(24% 0.010 293)'),
                    color: newMesoWeeks === w ? 'oklch(8% 0.008 293)' : 'oklch(62% 0.010 293)',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 800,
                    fontSize: '18px',
                  }}
                >
                  {w}
                </button>
              ))}
            </div>

            <button
              onClick={startNewMesocycle}
              className="w-full h-14 rounded-xl font-bold transition-all active:scale-[0.98]"
              style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(7% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.06em' }}
            >
              START
            </button>
          </div>
        </>
      )}

      {/* ── Exercise Picker Sheet ─────────────── */}
      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); setSwapRoutineId(null); setSwapExerciseId(null) }}
        onSelect={handleSwapSelect}
        title="SWAP EXERCISE"
      />
    </div>
  )
}

// ── RoutineCard ────────────────────────────────────────────────────────────────

interface RoutineCardProps {
  routine: Routine
  exMap: Map<string, Exercise>
  swaps: ExerciseSwap[]
  onSwap: (exerciseId: string) => void
  mesoActive: boolean
}

function RoutineCard({ routine, exMap, onSwap, mesoActive }: RoutineCardProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid oklch(16% 0.008 293)' }}>
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', color: 'oklch(97% 0.005 293)', letterSpacing: '0.02em' }}>
          {routine.name.toUpperCase()}
        </p>
        <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 1 }}>
          {SPLIT_DAY_LABELS[routine.id] ?? routine.id}
        </p>
      </div>

      <div className="divide-y" style={{ borderColor: 'oklch(16% 0.008 293)' }}>
        {routine.exercises
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(re => {
            const ex = exMap.get(re.exerciseId)
            return (
              <div key={re.exerciseId} className="flex items-center px-4 py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', color: 'oklch(92% 0.005 293)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ex?.name ?? re.exerciseId}
                  </p>
                  <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 1 }}>
                    {re.defaultSets}×{re.defaultReps}
                    {ex?.primaryMuscleGroup ? ` · ${ex.primaryMuscleGroup}` : ''}
                  </p>
                </div>
                {mesoActive && (
                  <button
                    onClick={() => onSwap(re.exerciseId)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg transition-colors active:scale-[0.97]"
                    style={{
                      background: 'oklch(18% 0.012 293)',
                      border: '1px solid oklch(24% 0.010 293)',
                      color: 'oklch(62% 0.24 293)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: '11px',
                      letterSpacing: '0.06em',
                    }}
                  >
                    SWAP
                  </button>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ── C25KBlock ──────────────────────────────────────────────────────────────────

function C25KBlock({ runSessions }: { runSessions: RunSession[] }) {
  const completedCount = runSessions.length
  const next = nextRunSession(completedCount)
  const TOTAL = C25K_PLAN.length // 27

  return (
    <div className="px-4 mb-5">
      <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
        Run Plan
      </p>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
      >
        {/* Header row */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div>
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(62% 0.18 150)', textTransform: 'uppercase' }}>
              C25K PLAN
            </p>
            <p className="num" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '26px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em', lineHeight: 1, marginTop: 2 }}>
              {completedCount} / {TOTAL}
            </p>
            <p style={{ fontSize: '12px', color: 'oklch(50% 0.010 293)', marginTop: 2 }}>
              Completed sessions
            </p>
          </div>
          <div
            className="px-3 py-2 rounded-xl text-right"
            style={{ background: 'oklch(18% 0.012 293)' }}
          >
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 2 }}>
              Completion
            </p>
            <p className="num" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', color: 'oklch(62% 0.18 150)', lineHeight: 1 }}>
              {Math.round((completedCount / TOTAL) * 100)}%
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mx-4 mb-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(20% 0.010 293)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min((completedCount / TOTAL) * 100, 100)}%`, background: 'oklch(62% 0.18 150)' }}
          />
        </div>

        {/* Week grid — 9 weeks × 3 sessions */}
        <div
          className="mx-4 mb-4 grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}
        >
          {Array.from({ length: 9 }, (_, wi) => {
            const weekNum = wi + 1
            const weekSessions = C25K_PLAN.filter(s => s.week === weekNum)
            return (
              <div key={weekNum} className="flex flex-col items-center gap-1">
                <p style={{ fontSize: '8px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', color: 'oklch(34% 0.008 293)' }}>
                  W{weekNum}
                </p>
                {weekSessions.map(planSess => {
                  const idx = C25K_PLAN.indexOf(planSess)
                  const done = idx < completedCount
                  const isCurrent = idx === completedCount
                  return (
                    <div
                      key={planSess.day}
                      className="w-full aspect-square rounded-full"
                      style={{
                        background: done
                          ? 'oklch(62% 0.18 150)'
                          : isCurrent
                            ? 'oklch(40% 0.12 150)'
                            : 'oklch(20% 0.010 293)',
                        border: isCurrent ? '1px solid oklch(62% 0.18 150)' : '1px solid transparent',
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Next up callout */}
        {next && (
          <div
            className="mx-4 mb-4 px-4 py-3 rounded-xl"
            style={{ background: 'oklch(16% 0.010 293)', border: '1px solid oklch(22% 0.010 293)' }}
          >
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 4 }}>
              Next Up
            </p>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              Week {next.week} · Day {next.day}
            </p>
            <p style={{ fontSize: '12px', color: 'oklch(50% 0.010 293)', marginTop: 3 }}>
              ~{Math.round(totalDurationSec(next) / 60)} min
            </p>
          </div>
        )}

        {completedCount >= TOTAL && (
          <div className="mx-4 mb-4 px-4 py-3 rounded-xl text-center" style={{ background: 'oklch(16% 0.010 293)' }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em', color: 'oklch(62% 0.18 150)' }}>
              C25K COMPLETE
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
