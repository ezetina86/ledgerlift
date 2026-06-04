import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getLastSetsForExercise } from '../db/index.ts'
import type { SetLog, Exercise } from '../db/index.ts'
import { suggestNext } from '../lib/overload.ts'
import { formatWeight, uid, kgToLbs } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import SetSheet, { type SetInput } from './SetSheet.tsx'

const RPE_COLORS: Record<number, string> = {
  6:  'oklch(68% 0.18 150)',
  7:  'oklch(76% 0.16 115)',
  8:  'oklch(76% 0.16 85)',
  9:  'oklch(65% 0.20 42)',
  10: 'oklch(60% 0.22 25)',
}

interface Props {
  sessionId: string
  exerciseId: string
  order: number
  defaultSets: number
  defaultReps: string
  isDeload?: boolean
  onSwap?: (muscleGroup: string) => void
  isSwapped?: boolean
  isExtra?: boolean
}

export default function ExerciseBlock({ sessionId, exerciseId, defaultSets, defaultReps, isDeload = false, onSwap, isSwapped = false, isExtra = false }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const { unit } = useWeightUnit()

  const exercise = useLiveQuery<Exercise | undefined>(() => db.exercises.get(exerciseId), [exerciseId])

  const sets = useLiveQuery<SetLog[]>(
    () => db.sets.where('sessionId').equals(sessionId).filter(s => s.exerciseId === exerciseId).sortBy('setNumber'),
    [sessionId, exerciseId]
  ) ?? []

  const lastSets = useLiveQuery<SetLog[]>(
    () => getLastSetsForExercise(exerciseId, sessionId),
    [sessionId, exerciseId],
  ) ?? []

  const suggestion = suggestNext(lastSets)
  const lastSet = sets[sets.length - 1]
  const defaultWeight = lastSet?.weightKg ?? suggestion?.weightKg ?? 20
  const defaultRepsNum = lastSet?.reps ?? (parseInt(defaultReps) || 8)
  const defaultRpe = lastSet?.rpe ?? null

  const editingSet = editingSetId ? sets.find(s => s.id === editingSetId) : null
  const sheetInitial: SetInput = editingSet
    ? { weightKg: editingSet.weightKg, reps: editingSet.reps, rpe: editingSet.rpe }
    : { weightKg: defaultWeight, reps: defaultRepsNum, rpe: defaultRpe }
  const sheetSetNumber = editingSet ? editingSet.setNumber : sets.length + 1

  async function handleConfirm(data: SetInput) {
    if (editingSetId) {
      await db.sets.update(editingSetId, { ...data, volume: data.reps * data.weightKg })
    } else {
      await db.sets.add({
        id: uid(), sessionId, exerciseId,
        exerciseName: exercise?.name ?? exerciseId,
        setNumber: sets.length + 1,
        reps: data.reps, weightKg: data.weightKg, rpe: data.rpe,
        volume: data.reps * data.weightKg,
        timestamp: Date.now(), updatedAt: 0,
      })
    }
    setSheetOpen(false)
    setEditingSetId(null)
  }

  const name = exercise?.name ?? exerciseId
  const demoLink = exercise?.demonstrationLink
  const setsLogged = sets.length
  const totalTarget = isDeload ? Math.ceil(defaultSets / 2) : defaultSets

  return (
    <div
      className="rounded-2xl overflow-hidden mb-3"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Set counter pill */}
          <div
            className="shrink-0 rounded-lg flex items-center justify-center mt-0.5"
            style={{
              width: 36, height: 36,
              background: setsLogged >= totalTarget ? 'oklch(28% 0.16 293)' : 'oklch(18% 0.012 293)',
            }}
          >
            <span
              className="num"
              style={{
                fontSize: '15px',
                color: setsLogged >= totalTarget ? 'oklch(62% 0.24 293)' : 'oklch(50% 0.010 293)',
              }}
            >
              {setsLogged}/{totalTarget}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <p className="text-sm font-semibold leading-tight" style={{ color: 'oklch(97% 0.005 293)' }}>
                  {name}
                </p>
                {isSwapped && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded"
                    style={{
                      background: 'oklch(22% 0.10 150)',
                      color: 'oklch(65% 0.18 150)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: '9px',
                      letterSpacing: '0.08em',
                    }}
                  >
                    SWAPPED
                  </span>
                )}
                {isExtra && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded"
                    style={{
                      background: 'oklch(22% 0.12 80)',
                      color: 'oklch(78% 0.18 80)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: '9px',
                      letterSpacing: '0.08em',
                    }}
                  >
                    EXTRA
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onSwap && (
                  <button
                    onClick={() => exercise && onSwap(exercise.primaryMuscleGroup)}
                    className="px-2 py-0.5 rounded transition-colors active:bg-[oklch(22%_0.012_293)]"
                    style={{
                      border: '1px solid oklch(28% 0.016 293)',
                      color: 'oklch(50% 0.010 293)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                      fontSize: '10px',
                      letterSpacing: '0.08em',
                    }}
                  >
                    SWAP
                  </button>
                )}
                {demoLink && (
                  <a href={demoLink} target="_blank" rel="noopener noreferrer" className="mt-0.5" style={{ color: 'oklch(44% 0.008 293)' }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'oklch(44% 0.008 293)' }}>
              {defaultSets}×{defaultReps}{exercise?.equipment ? ` · ${exercise.equipment}` : ''}
            </p>
          </div>
        </div>

        {isDeload ? (
          <div
            className="mt-2 px-3 py-1.5 rounded-lg flex items-center gap-2"
            style={{ background: 'oklch(16% 0.10 55)' }}
          >
            <span style={{ fontSize: '11px', color: 'oklch(72% 0.18 55)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em' }}>
              DELOAD TARGET
            </span>
            <span style={{ fontSize: '13px', color: 'oklch(80% 0.12 55)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }}>
              {totalTarget} sets × same weight
            </span>
          </div>
        ) : suggestion && (
          <div
            className="mt-2 px-3 py-1.5 rounded-lg flex items-center gap-2"
            style={{ background: 'oklch(17% 0.10 293)' }}
          >
            <span style={{ fontSize: '11px', color: 'oklch(62% 0.24 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.06em' }}>
              NEXT TARGET
            </span>
            <span className="num" style={{ fontSize: '14px', color: 'oklch(97% 0.005 293)' }}>
              {formatWeight(unit === 'lb' ? kgToLbs(suggestion.weightKg) : suggestion.weightKg)} {unit} × {suggestion.reps}
            </span>
          </div>
        )}
      </div>

      {/* Set rows */}
      {sets.length > 0 && (
        <div
          className="mx-4 rounded-xl overflow-hidden mb-2"
          style={{ border: '1px solid oklch(19% 0.008 293)' }}
        >
          <div
            className="grid px-3 py-1.5"
            style={{
              gridTemplateColumns: '28px 1fr 1fr 44px 20px',
              background: 'oklch(15% 0.008 293)',
            }}
          >
            {['#', unit.toUpperCase(), 'REPS', 'RPE', ''].map((h, i) => (
              <span key={i} className="text-center" style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'oklch(34% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                {h}
              </span>
            ))}
          </div>
          {sets.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => { setEditingSetId(s.id); setSheetOpen(true) }}
              className="w-full grid px-3 py-2.5 transition-colors active:bg-[oklch(18%_0.012_293)] text-left"
              style={{
                gridTemplateColumns: '28px 1fr 1fr 44px 20px',
                borderTop: idx === 0 ? '1px solid oklch(19% 0.008 293)' : '1px solid oklch(16% 0.008 293)',
              }}
            >
              <span className="num text-center" style={{ fontSize: '13px', color: 'oklch(34% 0.008 293)' }}>{s.setNumber}</span>
              <span className="num text-center" style={{ fontSize: '16px', fontWeight: 800, color: 'oklch(97% 0.005 293)' }}>{formatWeight(unit === 'lb' ? kgToLbs(s.weightKg) : s.weightKg)}</span>
              <span className="num text-center" style={{ fontSize: '16px', fontWeight: 800, color: 'oklch(97% 0.005 293)' }}>{s.reps}</span>
              <span className="num text-center" style={{ fontSize: '13px', color: s.rpe ? RPE_COLORS[Math.round(s.rpe)] ?? 'oklch(50% 0.010 293)' : 'oklch(34% 0.008 293)' }}>
                {s.rpe ?? '—'}
              </span>
              <span className="flex items-center justify-center" style={{ color: 'oklch(30% 0.010 293)' }}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add set */}
      <button
        onClick={() => { setEditingSetId(null); setSheetOpen(true) }}
        className="w-full flex items-center justify-center gap-1.5 py-3 transition-colors active:bg-[oklch(15%_0.010_293)]"
        style={{ borderTop: '1px solid oklch(19% 0.008 293)' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'oklch(62% 0.24 293)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span style={{ fontSize: '12px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', color: 'oklch(62% 0.24 293)' }}>
          ADD SET
        </span>
      </button>

      <SetSheet
        open={sheetOpen}
        initial={sheetInitial}
        setNumber={sheetSetNumber}
        exerciseName={name}
        onConfirm={handleConfirm}
        onClose={() => { setSheetOpen(false); setEditingSetId(null) }}
      />
    </div>
  )
}
