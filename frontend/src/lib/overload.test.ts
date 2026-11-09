import { describe, it, expect } from 'vitest'
import {
  suggestNext, weeklyVolumeByGroup, computePRs,
  exerciseProgression, rpeColor, rpeHistory, detectFatigue,
  parseRepRange, workingSetsOnly, estimate1RM, subgroupWeeklySets,
} from './overload.ts'
import type { SetLog, Exercise, WorkoutSession } from '../db/index.ts'

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

// ── rpeHistory ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'sess-1', routineId: 'r-1', routineName: 'Upper A',
    splitDay: 'upperA', startedAt: 1000, completedAt: 2000,
    notes: '', mesocycleId: null, isDeload: false, updatedAt: 0,
    ...overrides,
  }
}

describe('rpeHistory', () => {
  it('returns empty when no sets for exercise', () => {
    const sets = [makeSet({ exerciseId: 'squat' })]
    const sessions = [makeSession()]
    expect(rpeHistory(sets, sessions, 'bench')).toEqual([])
  })

  it('excludes sets from incomplete sessions', () => {
    const sess = makeSession({ id: 'sess-1', completedAt: null })
    const sets = [makeSet({ sessionId: 'sess-1', exerciseId: 'ex-1' })]
    expect(rpeHistory(sets, [sess], 'ex-1')).toHaveLength(0)
  })

  it('groups sets by session and picks maxRpe', () => {
    const sess = makeSession({ id: 'sess-1', startedAt: 1000, completedAt: 2000 })
    const sets = [
      makeSet({ id: 's1', sessionId: 'sess-1', exerciseId: 'ex-1', rpe: 7 }),
      makeSet({ id: 's2', sessionId: 'sess-1', exerciseId: 'ex-1', rpe: 9 }),
    ]
    const result = rpeHistory(sets, [sess], 'ex-1')
    expect(result).toHaveLength(1)
    expect(result[0].maxRpe).toBe(9)
    expect(result[0].sessionId).toBe('sess-1')
  })

  it('orders results oldest first', () => {
    const sessA = makeSession({ id: 'sess-a', startedAt: 1000, completedAt: 2000 })
    const sessB = makeSession({ id: 'sess-b', startedAt: 5000, completedAt: 6000 })
    const sets = [
      makeSet({ id: 's1', sessionId: 'sess-b', exerciseId: 'ex-1', rpe: 8 }),
      makeSet({ id: 's2', sessionId: 'sess-a', exerciseId: 'ex-1', rpe: 6 }),
    ]
    const result = rpeHistory(sets, [sessA, sessB], 'ex-1')
    expect(result[0].sessionId).toBe('sess-a')
    expect(result[1].sessionId).toBe('sess-b')
  })

  it('defaults null RPE to 8', () => {
    const sess = makeSession({ id: 'sess-1', completedAt: 2000 })
    const sets = [makeSet({ sessionId: 'sess-1', exerciseId: 'ex-1', rpe: null })]
    const result = rpeHistory(sets, [sess], 'ex-1')
    expect(result[0].maxRpe).toBe(8)
  })
})

// ── detectFatigue ─────────────────────────────────────────────────────────────

describe('detectFatigue', () => {
  function makeSessionPair(id: string, ts: number): WorkoutSession {
    return makeSession({ id, startedAt: ts, completedAt: ts + 1000 })
  }

  it('returns signal when 2+ consecutive sessions have RPE >= 9', () => {
    const sessions = [
      makeSessionPair('s1', 1000),
      makeSessionPair('s2', 2000),
    ]
    const sets = [
      makeSet({ id: 'a1', sessionId: 's1', exerciseId: 'ex-1', rpe: 9 }),
      makeSet({ id: 'a2', sessionId: 's2', exerciseId: 'ex-1', rpe: 10 }),
    ]
    const exMap = new Map([['ex-1', makeExercise({ id: 'ex-1', name: 'Bench Press' })]])
    const signals = detectFatigue(sets, sessions, exMap)
    expect(signals).toHaveLength(1)
    expect(signals[0].exerciseId).toBe('ex-1')
    expect(signals[0].shouldDeload).toBe(true)
    expect(signals[0].consecutiveHighRpe).toBe(2)
  })

  it('no signal when only 1 high-RPE session', () => {
    const sessions = [makeSessionPair('s1', 1000)]
    const sets = [makeSet({ sessionId: 's1', exerciseId: 'ex-1', rpe: 9 })]
    const exMap = new Map([['ex-1', makeExercise()]])
    expect(detectFatigue(sets, sessions, exMap)).toHaveLength(0)
  })

  it('signal clears when a low-RPE session resets the streak', () => {
    const sessions = [
      makeSessionPair('s1', 1000),
      makeSessionPair('s2', 2000),
      makeSessionPair('s3', 3000),
    ]
    const sets = [
      makeSet({ id: 'a1', sessionId: 's1', exerciseId: 'ex-1', rpe: 9 }),
      makeSet({ id: 'a2', sessionId: 's2', exerciseId: 'ex-1', rpe: 6 }),  // reset
      makeSet({ id: 'a3', sessionId: 's3', exerciseId: 'ex-1', rpe: 9 }),
    ]
    const exMap = new Map([['ex-1', makeExercise()]])
    expect(detectFatigue(sets, sessions, exMap)).toHaveLength(0)
  })

  it('handles null RPE treating it as 8 (below threshold)', () => {
    const sessions = [
      makeSessionPair('s1', 1000),
      makeSessionPair('s2', 2000),
    ]
    const sets = [
      makeSet({ id: 'a1', sessionId: 's1', exerciseId: 'ex-1', rpe: null }),
      makeSet({ id: 'a2', sessionId: 's2', exerciseId: 'ex-1', rpe: null }),
    ]
    const exMap = new Map([['ex-1', makeExercise()]])
    // RPE defaults to 8, which is < 9, so no signal
    expect(detectFatigue(sets, sessions, exMap)).toHaveLength(0)
  })

  it('detects signal from 3 consecutive high-RPE sessions', () => {
    const sessions = [
      makeSessionPair('s1', 1000),
      makeSessionPair('s2', 2000),
      makeSessionPair('s3', 3000),
    ]
    const sets = [
      makeSet({ id: 'a1', sessionId: 's1', exerciseId: 'ex-1', rpe: 9 }),
      makeSet({ id: 'a2', sessionId: 's2', exerciseId: 'ex-1', rpe: 9 }),
      makeSet({ id: 'a3', sessionId: 's3', exerciseId: 'ex-1', rpe: 10 }),
    ]
    const exMap = new Map([['ex-1', makeExercise()]])
    const signals = detectFatigue(sets, sessions, exMap)
    expect(signals[0].consecutiveHighRpe).toBe(3)
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

// ── Double progression & warmup filtering ────────────────────────────────────

describe('suggestNext double progression & warmup filtering', () => {
  it('ignores warmup sets when computing suggestion', () => {
    const sets = [
      makeSet({ id: 'w1', weightKg: 40, reps: 10, rpe: 6, setType: 'warmup' }),
      makeSet({ id: 's1', weightKg: 80, reps: 8, rpe: 8, setType: 'work' }),
    ]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(80)
    expect(res?.reps).toBe(9)
  })

  it('returns null when all sets are warmup sets', () => {
    expect(suggestNext([makeSet({ setType: 'warmup' })], '8-12')).toBeNull()
  })

  it('bumps weight +2.5 kg and resets reps to minReps when RPE 8 hits top of rep range', () => {
    const sets = [makeSet({ weightKg: 80, reps: 12, rpe: 8 })]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(82.5)
    expect(res?.reps).toBe(8)
    expect(res?.note).toContain('Top of 8-12')
  })

  it('resets reps to minReps when RPE <= 7 and rep range is provided', () => {
    const sets = [makeSet({ weightKg: 80, reps: 11, rpe: 7 })]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(82.5)
    expect(res?.reps).toBe(8)
  })

  it('holds weight and reps when RPE >= 9 even if top of rep range is reached', () => {
    const sets = [makeSet({ weightKg: 80, reps: 12, rpe: 9 })]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(80)
    expect(res?.reps).toBe(12)
    expect(res?.note).toContain('Hold')
  })
})

// ── parseRepRange & estimate1RM & workingSetsOnly ─────────────────────────────

describe('parseRepRange & estimate1RM', () => {
  it('parses standard rep range strings', () => {
    expect(parseRepRange('8-12')).toEqual({ minReps: 8, maxReps: 12 })
    expect(parseRepRange('6-8')).toEqual({ minReps: 6, maxReps: 8 })
    expect(parseRepRange(' 5 - 10 ')).toEqual({ minReps: 5, maxReps: 10 })
    expect(parseRepRange('5')).toEqual({ minReps: 5, maxReps: 5 })
    expect(parseRepRange(undefined)).toBeNull()
    expect(parseRepRange('')).toBeNull()
    expect(parseRepRange('invalid')).toBeNull()
  })

  it('calculates Epley RPE-adjusted 1RM', () => {
    // 100kg x 5 @ RPE 10 -> 0 RIR -> 100 * (1 + 5/30) = 116.7
    expect(estimate1RM(100, 5, 10)).toBeCloseTo(116.7, 1)
    // 100kg x 5 @ RPE 8 -> 2 RIR -> 7 effective reps -> 100 * (1 + 7/30) = 123.3
    expect(estimate1RM(100, 5, 8)).toBeCloseTo(123.3, 1)
    // 100kg x 1 @ RPE 10 -> 1 effective rep -> exactly 100
    expect(estimate1RM(100, 1, 10)).toBe(100)
    // handles null/undefined RPE (defaults to 8 -> 2 RIR)
    expect(estimate1RM(100, 5)).toBeCloseTo(123.3, 1)
    // 0 or negative weight/reps returns 0
    expect(estimate1RM(0, 5, 10)).toBe(0)
    expect(estimate1RM(100, 0, 10)).toBe(0)
    expect(estimate1RM(-10, 5, 10)).toBe(0)
    // caps effective reps at 15
    expect(estimate1RM(100, 20, 10)).toBeCloseTo(100 * (1 + 15 / 30), 1)
  })

  it('workingSetsOnly filters warmup sets and keeps others', () => {
    const sets = [
      makeSet({ id: '1', setType: 'warmup' }),
      makeSet({ id: '2', setType: 'work' }),
      makeSet({ id: '3', setType: 'drop' }),
      makeSet({ id: '4', setType: 'fail' }),
      makeSet({ id: '5', setType: undefined }),
    ]
    const work = workingSetsOnly(sets)
    expect(work.map(s => s.id)).toEqual(['2', '3', '4', '5'])
  })

  it('includes bestEst1RM in computePRs and skips warmup sets', () => {
    const sets = [
      makeSet({ id: 'w1', weightKg: 120, reps: 1, rpe: 6, setType: 'warmup' }),
      makeSet({ id: 's1', weightKg: 100, reps: 5, rpe: 10, setType: 'work' }),
    ]
    const prs = computePRs(sets)
    expect(prs).toHaveLength(1)
    expect(prs[0].bestWeightKg).toBe(100)
    expect(prs[0].bestEst1RM).toBeCloseTo(116.7, 1)
  })

  it('skips warmup sets in weeklyVolumeByGroup, exerciseProgression, and rpeHistory', () => {
    const now = Date.now()
    const exMap = new Map([['ex-1', makeExercise({ primaryMuscleGroup: 'Chest' })]])
    const sess = makeSession({ id: 'sess-1', completedAt: now })

    const sets = [
      makeSet({ id: 'w1', exerciseId: 'ex-1', sessionId: 'sess-1', weightKg: 120, reps: 5, rpe: 10, volume: 600, timestamp: now, setType: 'warmup' }),
      makeSet({ id: 's1', exerciseId: 'ex-1', sessionId: 'sess-1', weightKg: 80, reps: 8, rpe: 7, volume: 640, timestamp: now, setType: 'work' }),
    ]

    // weeklyVolumeByGroup
    const vol = weeklyVolumeByGroup(sets, exMap)
    expect(vol).toHaveLength(1)
    expect(vol[0].volume).toBe(640)
    expect(vol[0].sets).toBe(1)

    // exerciseProgression
    const prog = exerciseProgression(sets, 'ex-1')
    expect(prog).toHaveLength(1)
    expect(prog[0].maxWeightKg).toBe(80)
    expect(prog[0].totalVolume).toBe(640)

    // rpeHistory
    const hist = rpeHistory(sets, [sess], 'ex-1')
    expect(hist).toHaveLength(1)
    expect(hist[0].maxRpe).toBe(7)
  })
})

// ── subgroupWeeklySets ────────────────────────────────────────────────────────

describe('subgroupWeeklySets', () => {
  it('aggregates 7-day working sets across anatomical subgroups', () => {
    const now = Date.now()
    const exMap = new Map<string, Exercise>([
      ['ex-1', makeExercise({ id: 'ex-1', primaryMuscleGroup: 'Chest', subgroups: ['Chest: Upper', 'Chest: Middle'] })],
    ])
    const sets = [
      makeSet({ id: 's1', exerciseId: 'ex-1', timestamp: now - 1000, setType: 'work' }),
      makeSet({ id: 's2', exerciseId: 'ex-1', timestamp: now - 500, setType: 'drop' }),
      makeSet({ id: 'w1', exerciseId: 'ex-1', timestamp: now - 200, setType: 'warmup' }),
    ]
    const stats = subgroupWeeklySets(sets, exMap)
    const upper = stats.find(s => s.subgroup === 'Chest: Upper')
    expect(upper?.sets).toBe(2)
    expect(upper?.primaryGroup).toBe('Chest')
  })

  it('initializes subgroups from exercises with 0 sets and falls back to primaryMuscleGroup', () => {
    const exMap = new Map<string, Exercise>([
      ['ex-1', makeExercise({ id: 'ex-1', primaryMuscleGroup: 'Chest', subgroups: ['Chest: Upper'] })],
      ['ex-2', makeExercise({ id: 'ex-2', primaryMuscleGroup: 'Calves', subgroups: [] })],
    ])
    const stats = subgroupWeeklySets([], exMap)
    expect(stats).toHaveLength(2)
    expect(stats.find(s => s.subgroup === 'Chest: Upper')?.sets).toBe(0)
    expect(stats.find(s => s.subgroup === 'Calves')?.primaryGroup).toBe('Calves')
  })
})
