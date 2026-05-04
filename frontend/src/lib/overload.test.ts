import { describe, it, expect } from 'vitest'
import {
  suggestNext, weeklyVolumeByGroup, computePRs,
  exerciseProgression, rpeColor,
} from './overload.ts'
import type { SetLog, Exercise } from '../db/index.ts'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: 'set-1', sessionId: 'sess-1', exerciseId: 'ex-1',
    exerciseName: 'Bench Press', setNumber: 1,
    reps: 8, weightKg: 80, rpe: 8,
    volume: 640, timestamp: Date.now(), updatedAt: 0,
    ...overrides,
  }
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1', name: 'Bench Press', primaryMuscleGroup: 'Chest',
    equipment: 'Barbell', nippardTierList: false, tierListGrade: null,
    muscleLadder: false, jeffSubgroupFav: false, demonstrationLink: null,
    ...overrides,
  }
}

// ── suggestNext ────────────────────────────────────────────────────────────────

describe('suggestNext', () => {
  it('returns null for empty sets', () => {
    expect(suggestNext([])).toBeNull()
  })

  it('RPE ≤ 7 → +2.5 kg, same reps', () => {
    const sets = [makeSet({ weightKg: 80, reps: 8, rpe: 7 })]
    const result = suggestNext(sets)
    expect(result?.weightKg).toBe(82.5)
    expect(result?.reps).toBe(8)
    expect(result?.note).toContain('+2.5')
  })

  it('RPE 6 also gets +2.5 kg', () => {
    const result = suggestNext([makeSet({ rpe: 6, weightKg: 60, reps: 10 })])
    expect(result?.weightKg).toBe(62.5)
  })

  it('RPE = 8 → same weight, +1 rep', () => {
    const sets = [makeSet({ weightKg: 80, reps: 8, rpe: 8 })]
    const result = suggestNext(sets)
    expect(result?.weightKg).toBe(80)
    expect(result?.reps).toBe(9)
    expect(result?.note).toContain('+1 rep')
  })

  it('RPE = 9 → hold weight and reps', () => {
    const sets = [makeSet({ weightKg: 100, reps: 5, rpe: 9 })]
    const result = suggestNext(sets)
    expect(result?.weightKg).toBe(100)
    expect(result?.reps).toBe(5)
    expect(result?.note).toContain('Hold')
  })

  it('RPE = 10 → hold weight and reps', () => {
    const result = suggestNext([makeSet({ rpe: 10, weightKg: 120, reps: 3 })])
    expect(result?.weightKg).toBe(120)
    expect(result?.reps).toBe(3)
  })

  it('uses max RPE across all sets in the session', () => {
    // If ANY set hit RPE 9, the session was hard — hold
    const sets = [
      makeSet({ id: 's1', rpe: 7, weightKg: 80, reps: 8 }),
      makeSet({ id: 's2', rpe: 9, weightKg: 80, reps: 8 }),
    ]
    const result = suggestNext(sets)
    expect(result?.note).toContain('Hold')
  })

  it('null RPE defaults to 8, triggers +1 rep rule', () => {
    const result = suggestNext([makeSet({ rpe: null, weightKg: 70, reps: 10 })])
    expect(result?.reps).toBe(11)
    expect(result?.weightKg).toBe(70)
  })

  it('uses last set for weight/reps basis', () => {
    const sets = [
      makeSet({ id: 's1', rpe: 7, weightKg: 80, reps: 8 }),
      makeSet({ id: 's2', rpe: 7, weightKg: 85, reps: 7 }),
    ]
    const result = suggestNext(sets)
    expect(result?.weightKg).toBe(87.5) // last set was 85 + 2.5
    expect(result?.reps).toBe(7)
  })
})

// ── weeklyVolumeByGroup ────────────────────────────────────────────────────────

describe('weeklyVolumeByGroup', () => {
  it('returns empty for no sets', () => {
    expect(weeklyVolumeByGroup([], new Map())).toEqual([])
  })

  it('counts recent sets by muscle group', () => {
    const now = Date.now()
    const recent = makeSet({ timestamp: now - 1000, volume: 1000 })
    const exMap = new Map([['ex-1', makeExercise({ primaryMuscleGroup: 'Chest' })]])

    const result = weeklyVolumeByGroup([recent], exMap)
    expect(result).toHaveLength(1)
    expect(result[0].group).toBe('Chest')
    expect(result[0].volume).toBe(1000)
    expect(result[0].sets).toBe(1)
    expect(result[0].pct).toBe(100)
  })

  it('filters out sets older than 7 days', () => {
    const now = Date.now()
    const old = makeSet({ timestamp: now - 8 * 24 * 60 * 60 * 1000, volume: 500 })
    const exMap = new Map([['ex-1', makeExercise()]])

    const result = weeklyVolumeByGroup([old], exMap)
    expect(result).toHaveLength(0)
  })

  it('groups sets by muscle group and sums volume', () => {
    const now = Date.now()
    const sets = [
      makeSet({ id: 's1', exerciseId: 'ex-1', volume: 800, timestamp: now - 1000 }),
      makeSet({ id: 's2', exerciseId: 'ex-1', volume: 400, timestamp: now - 2000 }),
      makeSet({ id: 's3', exerciseId: 'ex-2', volume: 600, timestamp: now - 1000 }),
    ]
    const exMap = new Map([
      ['ex-1', makeExercise({ id: 'ex-1', primaryMuscleGroup: 'Chest' })],
      ['ex-2', makeExercise({ id: 'ex-2', primaryMuscleGroup: 'Back' })],
    ])

    const result = weeklyVolumeByGroup(sets, exMap)
    expect(result).toHaveLength(2)
    const chest = result.find(r => r.group === 'Chest')!
    expect(chest.volume).toBe(1200)
    expect(chest.sets).toBe(2)
  })

  it('falls back to "Other" for unknown exercise', () => {
    const set = makeSet({ exerciseId: 'unknown', volume: 500, timestamp: Date.now() - 1000 })
    const result = weeklyVolumeByGroup([set], new Map())
    expect(result[0].group).toBe('Other')
  })

  it('sets pct=100 for the highest-volume group', () => {
    const now = Date.now()
    const sets = [
      makeSet({ id: 's1', exerciseId: 'ex-1', volume: 1000, timestamp: now - 1000 }),
      makeSet({ id: 's2', exerciseId: 'ex-2', volume: 400,  timestamp: now - 1000 }),
    ]
    const exMap = new Map([
      ['ex-1', makeExercise({ id: 'ex-1', primaryMuscleGroup: 'Chest' })],
      ['ex-2', makeExercise({ id: 'ex-2', primaryMuscleGroup: 'Back'  })],
    ])
    const result = weeklyVolumeByGroup(sets, exMap)
    const chest = result.find(r => r.group === 'Chest')!
    const back  = result.find(r => r.group === 'Back')!
    expect(chest.pct).toBe(100)
    expect(back.pct).toBe(40)
  })

  it('sorts by volume descending', () => {
    const now = Date.now()
    const sets = [
      makeSet({ id: 's1', exerciseId: 'ex-1', volume: 200, timestamp: now - 1000 }),
      makeSet({ id: 's2', exerciseId: 'ex-2', volume: 900, timestamp: now - 1000 }),
    ]
    const exMap = new Map([
      ['ex-1', makeExercise({ id: 'ex-1', primaryMuscleGroup: 'Chest' })],
      ['ex-2', makeExercise({ id: 'ex-2', primaryMuscleGroup: 'Back' })],
    ])
    const result = weeklyVolumeByGroup(sets, exMap)
    expect(result[0].group).toBe('Back')
    expect(result[1].group).toBe('Chest')
  })
})

// ── computePRs ─────────────────────────────────────────────────────────────────

describe('computePRs', () => {
  it('returns empty for no sets', () => {
    expect(computePRs([])).toEqual([])
  })

  it('creates a PR for a single set', () => {
    const result = computePRs([makeSet({ weightKg: 100, reps: 5 })])
    expect(result).toHaveLength(1)
    expect(result[0].bestWeightKg).toBe(100)
    expect(result[0].bestReps).toBe(5)
    expect(result[0].sessionCount).toBe(1)
  })

  it('updates PR when a heavier set appears', () => {
    const sets = [
      makeSet({ id: 's1', weightKg: 80, reps: 8, timestamp: 1000 }),
      makeSet({ id: 's2', weightKg: 100, reps: 5, timestamp: 2000 }),
      makeSet({ id: 's3', weightKg: 90, reps: 6, timestamp: 3000 }),
    ]
    const result = computePRs(sets)
    expect(result[0].bestWeightKg).toBe(100)
    expect(result[0].bestReps).toBe(5)
  })

  it('does not update PR when a lighter set appears', () => {
    const sets = [
      makeSet({ id: 's1', weightKg: 100, reps: 5 }),
      makeSet({ id: 's2', weightKg: 80,  reps: 8 }),
    ]
    const result = computePRs(sets)
    expect(result[0].bestWeightKg).toBe(100)
  })

  it('counts sessions correctly', () => {
    const sets = [
      makeSet({ id: 's1', weightKg: 80, reps: 8 }),
      makeSet({ id: 's2', weightKg: 85, reps: 7 }),
      makeSet({ id: 's3', weightKg: 90, reps: 6 }),
    ]
    expect(computePRs(sets)[0].sessionCount).toBe(3)
  })

  it('tracks multiple exercises separately', () => {
    const sets = [
      makeSet({ id: 's1', exerciseId: 'bench',  exerciseName: 'Bench',  weightKg: 100 }),
      makeSet({ id: 's2', exerciseId: 'squat',  exerciseName: 'Squat',  weightKg: 150 }),
      makeSet({ id: 's3', exerciseId: 'deadlift', exerciseName: 'Deadlift', weightKg: 180 }),
    ]
    const result = computePRs(sets)
    expect(result).toHaveLength(3)
  })

  it('sorts PRs by best weight descending', () => {
    const sets = [
      makeSet({ id: 's1', exerciseId: 'bench', exerciseName: 'Bench', weightKg: 100 }),
      makeSet({ id: 's2', exerciseId: 'squat', exerciseName: 'Squat', weightKg: 150 }),
    ]
    const result = computePRs(sets)
    expect(result[0].exerciseId).toBe('squat')
    expect(result[1].exerciseId).toBe('bench')
  })

  it('tracks latest timestamp', () => {
    const sets = [
      makeSet({ id: 's1', timestamp: 1000, weightKg: 80 }),
      makeSet({ id: 's2', timestamp: 5000, weightKg: 85 }),
    ]
    expect(computePRs(sets)[0].lastTs).toBe(5000)
  })
})

// ── exerciseProgression ────────────────────────────────────────────────────────

describe('exerciseProgression', () => {
  it('returns empty for no sets', () => {
    expect(exerciseProgression([], 'ex-1')).toEqual([])
  })

  it('returns empty when no sets match the exercise', () => {
    const sets = [makeSet({ exerciseId: 'bench' })]
    expect(exerciseProgression(sets, 'squat')).toEqual([])
  })

  it('filters to only the target exercise', () => {
    const sets = [
      makeSet({ id: 's1', exerciseId: 'bench', sessionId: 'sess-1', weightKg: 80, timestamp: 1000, volume: 640 }),
      makeSet({ id: 's2', exerciseId: 'squat', sessionId: 'sess-2', weightKg: 120, timestamp: 2000, volume: 960 }),
    ]
    const result = exerciseProgression(sets, 'bench')
    expect(result).toHaveLength(1)
    expect(result[0].maxWeightKg).toBe(80)
  })

  it('groups sets by sessionId and tracks max weight per session', () => {
    const sets = [
      makeSet({ id: 's1', sessionId: 'sess-1', weightKg: 80, timestamp: 1000, volume: 640 }),
      makeSet({ id: 's2', sessionId: 'sess-1', weightKg: 85, timestamp: 1100, volume: 680 }),
      makeSet({ id: 's3', sessionId: 'sess-1', weightKg: 75, timestamp: 1200, volume: 600 }),
    ]
    const result = exerciseProgression(sets, 'ex-1')
    expect(result).toHaveLength(1)
    expect(result[0].maxWeightKg).toBe(85)
  })

  it('sums volume within a session', () => {
    const sets = [
      makeSet({ id: 's1', sessionId: 'sess-1', volume: 400, timestamp: 1000, weightKg: 80 }),
      makeSet({ id: 's2', sessionId: 'sess-1', volume: 300, timestamp: 1100, weightKg: 75 }),
    ]
    const result = exerciseProgression(sets, 'ex-1')
    expect(result[0].totalVolume).toBe(700)
  })

  it('sorts by session date ascending', () => {
    const sets = [
      makeSet({ id: 's1', sessionId: 'sess-2', weightKg: 90, timestamp: 2000, volume: 720 }),
      makeSet({ id: 's2', sessionId: 'sess-1', weightKg: 80, timestamp: 1000, volume: 640 }),
    ]
    const result = exerciseProgression(sets, 'ex-1')
    expect(result[0].maxWeightKg).toBe(80)
    expect(result[1].maxWeightKg).toBe(90)
  })

  it('does not update session date when a later set has an earlier timestamp', () => {
    // First set seen establishes date=2000; second has timestamp=1000 (earlier),
    // so the false branch of `if (s.timestamp > entry.date)` is exercised.
    const sets = [
      makeSet({ id: 's1', sessionId: 'sess-1', weightKg: 80, timestamp: 2000, volume: 640 }),
      makeSet({ id: 's2', sessionId: 'sess-1', weightKg: 85, timestamp: 1000, volume: 680 }),
    ]
    const result = exerciseProgression(sets, 'ex-1')
    expect(result).toHaveLength(1)
    expect(result[0].sessionDate).toBe(2000) // sessionDate NOT updated because 1000 < 2000
  })
})

// ── rpeColor ──────────────────────────────────────────────────────────────────

describe('rpeColor', () => {
  it('RPE ≤ 6 returns emerald', () => {
    expect(rpeColor(6)).toContain('emerald')
    expect(rpeColor(5)).toContain('emerald')
  })

  it('RPE 7 returns green', () => {
    expect(rpeColor(7)).toContain('green')
  })

  it('RPE 8 returns yellow', () => {
    expect(rpeColor(8)).toContain('yellow')
  })

  it('RPE 9 returns orange', () => {
    expect(rpeColor(9)).toContain('orange')
  })

  it('RPE 10 returns red', () => {
    expect(rpeColor(10)).toContain('red')
  })
})
