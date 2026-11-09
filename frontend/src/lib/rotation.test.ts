import { describe, it, expect } from 'vitest'
import { isCompoundMovement, rankSubstitutes, buildRoutineRotationProposal, recentExerciseIdsFromSets } from './rotation.ts'
import exercisesData from '../data/exercises.json'
import { DEFAULT_ROUTINES, type Exercise, type Routine, type SetLog, type WorkoutSession } from '../db/index.ts'

const catalog = exercisesData as Exercise[]
const exMap = new Map(catalog.map(e => [e.id, e]))

describe('isCompoundMovement', () => {
  it('returns true for compound movement families and false for isolations or undefined', () => {
    expect(isCompoundMovement(undefined)).toBe(false)
    expect(isCompoundMovement('horizontal-press')).toBe(true)
    expect(isCompoundMovement('squat')).toBe(true)
    expect(isCompoundMovement('hip-hinge')).toBe(true)
    expect(isCompoundMovement('curl-lengthened')).toBe(false)
    expect(isCompoundMovement('lateral-raise')).toBe(false)
    expect(isCompoundMovement('triceps-overhead')).toBe(false)
  })
})

describe('recentExerciseIdsFromSets', () => {
  it('excludes warmup sets and sets outside window', () => {
    const now = Date.now()
    const sets: SetLog[] = [
      { id: '1', sessionId: 's1', exerciseId: 'bench-press', exerciseName: 'Bench', setNumber: 1, reps: 5, weightKg: 60, rpe: null, volume: 300, timestamp: now - 1000, updatedAt: now, setType: 'warmup' },
      { id: '2', sessionId: 's1', exerciseId: 'hack-squat', exerciseName: 'Hack', setNumber: 1, reps: 8, weightKg: 100, rpe: null, volume: 800, timestamp: now - 1000, updatedAt: now, setType: 'work' },
      { id: '3', sessionId: 's0', exerciseId: 'romanian-deadlift', exerciseName: 'RDL', setNumber: 1, reps: 8, weightKg: 100, rpe: null, volume: 800, timestamp: 1000, updatedAt: 1000 },
    ]
    const recent = recentExerciseIdsFromSets(sets)
    expect(recent.has('hack-squat')).toBe(true)
    expect(recent.has('bench-press')).toBe(false)
    expect(recent.has('romanian-deadlift')).toBe(false)
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

  it('flags stale accessory exercises (4+ completed sessions and order >= 3) and handles missing/empty candidates', () => {
    const routines: Routine[] = [
      {
        id: 'r-test',
        name: 'Test Routine',
        splitDay: 'upperA',
        exercises: [
          { exerciseId: 'missing-id', order: 1, defaultSets: 3, defaultReps: '8-12' },
          { exerciseId: 'cable-lateral-raise', order: 4, defaultSets: 3, defaultReps: '12-15' },
        ],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]
    const now = Date.now()
    const sessions: WorkoutSession[] = [1, 2, 3, 4].map(i => ({
      id: `s-${i}`,
      routineId: 'r-test',
      routineName: 'Test Routine',
      splitDay: 'upperA',
      startedAt: now - i * 10000,
      completedAt: now - i * 9000,
      notes: '',
      mesocycleId: null,
      isDeload: false,
      updatedAt: now,
    }))
    const sets: SetLog[] = [1, 2, 3, 4].map(i => ({
      id: `st-${i}`,
      sessionId: `s-${i}`,
      exerciseId: 'cable-lateral-raise',
      exerciseName: 'Cable Lateral Raise',
      setNumber: 1,
      reps: 12,
      weightKg: 10,
      rpe: 8,
      volume: 120,
      timestamp: now - i * 9500,
      updatedAt: now,
    }))

    const proposals = buildRoutineRotationProposal(routines, exMap, sets, sessions)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].trigger).toBe('stale')
    expect(proposals[0].recommended).toBe(true)

    const soloMap = new Map([['cable-lateral-raise', exMap.get('cable-lateral-raise')!]])
    expect(buildRoutineRotationProposal(routines, soloMap, sets, sessions)).toEqual([])
  })
})
