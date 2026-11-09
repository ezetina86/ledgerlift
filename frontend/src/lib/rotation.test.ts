import { describe, it, expect } from 'vitest'
import { isCompoundMovement, rankSubstitutes, buildRoutineRotationProposal } from './rotation.ts'
import exercisesData from '../data/exercises.json'
import { DEFAULT_ROUTINES, type Exercise, type Routine, type SetLog, type WorkoutSession } from '../db/index.ts'

const catalog = exercisesData as Exercise[]
const exMap = new Map(catalog.map(e => [e.id, e]))

describe('isCompoundMovement', () => {
  it('returns true for compound movement families and false for isolations', () => {
    expect(isCompoundMovement('horizontal-press')).toBe(true)
    expect(isCompoundMovement('squat')).toBe(true)
    expect(isCompoundMovement('hip-hinge')).toBe(true)
    expect(isCompoundMovement('curl-lengthened')).toBe(false)
    expect(isCompoundMovement('lateral-raise')).toBe(false)
    expect(isCompoundMovement('triceps-overhead')).toBe(false)
  })
})

describe('rankSubstitutes', () => {
  it('ranks same movementFamily + high Nippard tier + shared subgroups highest', () => {
    const target = exMap.get('bench-press')!
    const ranked = rankSubstitutes(target, catalog, {
      assignedIds: new Set(['bench-press', 'incline-dumbbell-press']),
      recentExerciseIds: new Set(['bench-press']),
    })

    expect(ranked.length).toBeGreaterThan(5)
    expect(ranked[0].exercise.id).toBe('machine-chest-press')
    expect(ranked[0].reasons).toContain('SAME PATTERN')
    expect(ranked[0].reasons).toContain('TIER S+')
    expect(ranked[0].isFresh).toBe(true)
  })

  it('penalizes exercises already assigned to a routine', () => {
    const target = exMap.get('chest-supported-t-bar-row')!
    const withoutAssigned = rankSubstitutes(target, catalog)
    const topId = withoutAssigned[0].exercise.id

    const withAssigned = rankSubstitutes(target, catalog, {
      assignedIds: new Set([topId]),
    })
    expect(withAssigned[0].exercise.id).not.toBe(topId)
  })
})

describe('buildRoutineRotationProposal', () => {
  it('flags duplicate exercises across A/B routines as recommended rotations', () => {
    const routines: Routine[] = DEFAULT_ROUTINES.map(r => ({
      ...r,
      createdAt: 1000,
      updatedAt: 1000,
    }))
    const proposals = buildRoutineRotationProposal(routines, exMap, [], [])
    expect(proposals.length).toBe(24)

    const upperBDup = proposals.find(
      p => p.routineId === 'upper-b' && p.currentExerciseId === 'chest-supported-t-bar-row'
    )
    expect(upperBDup).toBeDefined()
    expect(upperBDup?.trigger).toBe('duplicate')
    expect(upperBDup?.recommended).toBe(true)
    expect(upperBDup?.suggestedExercise.id).not.toBe('chest-supported-t-bar-row')
  })

  it('flags fatigued exercises (2+ consecutive RPE >= 9 sessions) as recommended', () => {
    const routines: Routine[] = DEFAULT_ROUTINES.map(r => ({
      ...r,
      createdAt: 1000,
      updatedAt: 1000,
    }))
    const sessions: WorkoutSession[] = [
      { id: 's1', routineId: 'upper-a', routineName: 'Upper A', splitDay: 'upperA', startedAt: 1000, completedAt: 2000, notes: '', mesocycleId: null, isDeload: false, updatedAt: 2000 },
      { id: 's2', routineId: 'upper-a', routineName: 'Upper A', splitDay: 'upperA', startedAt: 3000, completedAt: 4000, notes: '', mesocycleId: null, isDeload: false, updatedAt: 4000 },
    ]
    const sets: SetLog[] = [
      { id: 'st1', sessionId: 's1', exerciseId: 'bench-press', exerciseName: 'Bench Press', setNumber: 1, reps: 6, weightKg: 100, rpe: 9.5, volume: 600, timestamp: 1500, updatedAt: 1500 },
      { id: 'st2', sessionId: 's2', exerciseId: 'bench-press', exerciseName: 'Bench Press', setNumber: 1, reps: 6, weightKg: 100, rpe: 9.5, volume: 600, timestamp: 3500, updatedAt: 3500 },
    ]

    const proposals = buildRoutineRotationProposal(routines, exMap, sets, sessions)
    const benchProp = proposals.find(p => p.routineId === 'upper-a' && p.currentExerciseId === 'bench-press')
    expect(benchProp?.trigger).toBe('fatigued')
    expect(benchProp?.recommended).toBe(true)
  })
})
