import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getLastSetsForExercise } from '../db/index.ts'
import type { SetLog, Exercise, SetType } from '../db/index.ts'
import { suggestNext } from '../lib/overload.ts'
import { formatWeight, uid, kgToLbs, RPE_COLORS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import SetSheet, { type SetInput } from './SetSheet.tsx'

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
  backupExerciseIds?: string[]
  onQuickSwap?: (newExerciseId: string) => void
  onSetLogged?: (exercise: Exercise | undefined, setType: SetType) => void
}

const SET_TYPE_BADGE: Record<Exclude<SetType, 'work'>, { label: string; bg: string; color: string }> = {
  warmup: { label: 'W', bg: 'oklch(22% 0.04 220)', color: 'oklch(68% 0.14 220)' },
  drop:   { label: 'DROP', bg: 'oklch(24% 0.10 55)', color: 'oklch(76% 0.18 55)' },
  fail:   { label: 'FAIL', bg: 'oklch(24% 0.12 25)', color: 'oklch(75% 0.20 25)' },
}

export default function ExerciseBlock({
  sessionId,
  exerciseId,
  defaultSets,
  defaultReps,
  isDeload = false,
  onSwap,
  isSwapped = false,
  isExtra = false,
  backupExerciseIds,
  onQuickSwap,
  onSetLogged,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingSetId, setEditingSetId] = useState<string | null>(null)
  const [demoModalOpen, setDemoModalOpen] = useState(false)
  const { unit } = useWeightUnit()

  const exercise = useLiveQuery<Exercise | undefined>(() => db.exercises.get(exerciseId), [exerciseId])
  const backupExercises = useLiveQuery<Exercise[]>(
    () => backupExerciseIds && backupExerciseIds.length > 0
      ? db.exercises.where('id').anyOf(backupExerciseIds).toArray()
      : Promise.resolve([]),
    [backupExerciseIds?.join(',') ?? '']
  ) ?? []

  const sets = useLiveQuery<SetLog[]>(
    () => db.sets.where('sessionId').equals(sessionId).filter(s => s.exerciseId === exerciseId).sortBy('setNumber'),
    [sessionId, exerciseId]
  ) ?? []

  const lastSets = useLiveQuery<SetLog[]>(
    () => getLastSetsForExercise(exerciseId, sessionId),
    [sessionId, exerciseId],
  ) ?? []

  const suggestion = suggestNext(lastSets, defaultReps)
  const lastSet = sets[sets.length - 1]
  const defaultWeight = lastSet?.weightKg ?? suggestion?.weightKg ?? 20
  const defaultRepsNum = lastSet?.reps ?? suggestion?.reps ?? (parseInt(defaultReps) || 8)
  const defaultRpe = lastSet?.rpe ?? null

  const editingSet = editingSetId ? sets.find(s => s.id === editingSetId) : null
  const sheetInitial: SetInput = editingSet
    ? { weightKg: editingSet.weightKg, reps: editingSet.reps, rpe: editingSet.rpe, setType: editingSet.setType ?? 'work' }
    : { weightKg: defaultWeight, reps: defaultRepsNum, rpe: defaultRpe, setType: 'work' }
  const sheetSetNumber = editingSet ? editingSet.setNumber : sets.length + 1

  async function handleConfirm(data: SetInput) {
    const chosenType: SetType = data.setType ?? 'work'
    if (editingSetId) {
      await db.sets.update(editingSetId, { ...data, setType: chosenType, volume: data.reps * data.weightKg })
    } else {
      await db.sets.add({
        id: uid(), sessionId, exerciseId,
        exerciseName: exercise?.name ?? exerciseId,
        setNumber: sets.length + 1,
        reps: data.reps, weightKg: data.weightKg, rpe: data.rpe,
        setType: chosenType,
        volume: data.reps * data.weightKg,
        timestamp: Date.now(), updatedAt: 0,
      })
      onSetLogged?.(exercise, chosenType)
    }
    setSheetOpen(false)
    setEditingSetId(null)
  }

  const name = exercise?.name ?? exerciseId
  const demoLink = exercise?.demonstrationLink
  const workingSetsCount = sets.filter(s => s.setType !== 'warmup').length
  const totalTarget = isDeload ? Math.ceil(defaultSets / 2) : defaultSets

  const availableBackups = (backupExerciseIds ?? [])
    .filter(id => id !== exerciseId)
    .map(id => ({ id, name: backupExercises.find(e => e.id === id)?.name ?? id }))

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
              background: workingSetsCount >= totalTarget ? 'oklch(28% 0.16 293)' : 'oklch(18% 0.012 293)',
            }}
          >
            <span
              className="num"
              style={{
                fontSize: '15px',
                color: workingSetsCount >= totalTarget ? 'oklch(62% 0.24 293)' : 'oklch(50% 0.010 293)',
              }}
            >
              {workingSetsCount}/{totalTarget}
            </span>
          </div>

          {/* Exercise thumbnail (tappable for inline video/instructions modal) */}
          {exercise?.imageUrl && (
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="shrink-0 rounded-lg overflow-hidden mt-0.5 relative active:scale-95 transition-transform"
              style={{ width: 36, height: 36, border: '1px solid oklch(24% 0.012 293)' }}
              aria-label={`View ${name} demo`}
            >
              <img src={exercise.imageUrl} alt={name} loading="lazy" className="w-full h-full object-cover" />
            </button>
          )}

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

        {/* 1-tap backup chips when no sets logged yet */}
        {sets.length === 0 && availableBackups.length > 0 && onQuickSwap && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {availableBackups.map(bk => (
              <button
                key={bk.id}
                type="button"
                onClick={() => onQuickSwap(bk.id)}
                className="px-2 py-1 rounded-lg transition-colors active:scale-95"
                style={{
                  background: 'oklch(16% 0.012 293)',
                  border: '1px solid oklch(24% 0.014 293)',
                  color: 'oklch(68% 0.012 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                }}
              >
                ALT: {bk.name}
              </button>
            ))}
          </div>
        )}

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
              gridTemplateColumns: '44px 1fr 1fr 44px 20px',
              background: 'oklch(15% 0.008 293)',
            }}
          >
            {['#', unit.toUpperCase(), 'REPS', 'RPE', ''].map((h, i) => (
              <span key={i} className="text-center" style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'oklch(34% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                {h}
              </span>
            ))}
          </div>
          {sets.map((s, idx) => {
            const st = s.setType ?? 'work'
            const badge = st !== 'work' ? SET_TYPE_BADGE[st] : null
            return (
              <button
                key={s.id}
                onClick={() => { setEditingSetId(s.id); setSheetOpen(true) }}
                className="w-full grid px-3 py-2.5 transition-colors active:bg-[oklch(18%_0.012_293)] text-left items-center"
                style={{
                  gridTemplateColumns: '44px 1fr 1fr 44px 20px',
                  borderTop: idx === 0 ? '1px solid oklch(19% 0.008 293)' : '1px solid oklch(16% 0.008 293)',
                }}
              >
                <span className="num flex items-center justify-center gap-1" style={{ fontSize: '13px', color: 'oklch(34% 0.008 293)' }}>
                  {s.setNumber}
                  {badge && (
                    <span
                      className="px-1 py-0.2 rounded"
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700,
                        fontSize: '8px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {badge.label}
                    </span>
                  )}
                </span>
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
            )
          })}
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

      {/* Inline Demo Video & Instructions Modal */}
      {demoModalOpen && exercise && (
        <>
          <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setDemoModalOpen(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up px-5 pt-5 pb-10 max-h-[82svh] overflow-y-auto"
            style={{ background: 'oklch(12% 0.010 293)', borderTop: '1px solid oklch(28% 0.016 293)', borderRadius: '20px 20px 0 0' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'oklch(30% 0.010 293)' }} />
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '24px', color: 'oklch(97% 0.005 293)', margin: 0 }}>
                {name.toUpperCase()}
              </h3>
              <button onClick={() => setDemoModalOpen(false)} style={{ color: 'oklch(50% 0.010 293)' }}>✕</button>
            </div>
            {exercise.videoUrl && (
              <div className="rounded-xl overflow-hidden mb-3" style={{ background: 'oklch(8% 0.008 293)' }}>
                <video src={exercise.videoUrl} autoPlay loop muted playsInline className="w-full max-h-60 object-contain" />
              </div>
            )}
            {exercise.subgroups && exercise.subgroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {exercise.subgroups.map(sg => (
                  <span
                    key={sg}
                    className="px-2 py-0.5 rounded-md text-xs"
                    style={{
                      background: 'oklch(18% 0.012 293)',
                      color: 'oklch(68% 0.14 293)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {sg}
                  </span>
                ))}
              </div>
            )}
            {exercise.instructions && exercise.instructions.length > 0 && (
              <ol className="flex flex-col gap-1.5 pl-4 list-decimal">
                {exercise.instructions.map((step, i) => (
                  <li key={i} className="text-xs leading-relaxed" style={{ color: 'oklch(75% 0.010 293)' }}>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  )
}
