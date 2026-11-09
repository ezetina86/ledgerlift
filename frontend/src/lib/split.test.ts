import { describe, it, expect } from 'vitest'
import {
  nextSplitDay, upcomingSchedule, mesocycleWeek,
  SPLIT_LABELS, SPLIT_FOCUS, ROUTINE_ID,
} from './split.ts'
import type { WorkoutSession, Mesocycle, Exercise } from '../db/index.ts'
import { DEFAULT_ROUTINES, LEGACY_EXERCISE_ID_MAP } from '../db/index.ts'
import exercisesData from '../data/exercises.json'

function mockSession(splitDay: WorkoutSession['splitDay']): WorkoutSession {
  return {
    id: 'sess-1', routineId: 'r-1', routineName: 'Test',
    splitDay, startedAt: 0, completedAt: 0,
    notes: '', mesocycleId: null, isDeload: false, updatedAt: 0,
  }
}

describe('nextSplitDay', () => {
  it('returns upperA when no last session', () => {
    expect(nextSplitDay(undefined)).toBe('upperA')
  })

  it('upperA → lowerA', () => {
    expect(nextSplitDay(mockSession('upperA'))).toBe('lowerA')
  })

  it('lowerA → upperB', () => {
    expect(nextSplitDay(mockSession('lowerA'))).toBe('upperB')
  })

  it('upperB → lowerB', () => {
    expect(nextSplitDay(mockSession('upperB'))).toBe('lowerB')
  })

  it('lowerB wraps back to upperA', () => {
    expect(nextSplitDay(mockSession('lowerB'))).toBe('upperA')
  })
})

describe('upcomingSchedule', () => {
  it('returns exactly 4 days', () => {
    expect(upcomingSchedule(undefined)).toHaveLength(4)
  })

  it('starts from upperA with no session', () => {
    expect(upcomingSchedule(undefined)).toEqual(['upperA', 'lowerA', 'upperB', 'lowerB'])
  })

  it('starts from lowerA after upperA session', () => {
    expect(upcomingSchedule(mockSession('upperA'))).toEqual(['lowerA', 'upperB', 'lowerB', 'upperA'])
  })

  it('starts from upperB after lowerA session', () => {
    expect(upcomingSchedule(mockSession('lowerA'))).toEqual(['upperB', 'lowerB', 'upperA', 'lowerA'])
  })

  it('wraps correctly from lowerB', () => {
    expect(upcomingSchedule(mockSession('lowerB'))).toEqual(['upperA', 'lowerA', 'upperB', 'lowerB'])
  })

  it('contains no duplicates', () => {
    const schedule = upcomingSchedule(undefined)
    expect(new Set(schedule).size).toBe(4)
  })
})

describe('SPLIT_LABELS', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(SPLIT_LABELS)).toHaveLength(4)
  })

  it('has a label for every split day', () => {
    expect(SPLIT_LABELS.upperA).toBe('Upper A')
    expect(SPLIT_LABELS.lowerA).toBe('Lower A')
    expect(SPLIT_LABELS.upperB).toBe('Upper B')
    expect(SPLIT_LABELS.lowerB).toBe('Lower B')
  })
})

describe('SPLIT_FOCUS', () => {
  it('upperA focuses on Chest and Back', () => {
    expect(SPLIT_FOCUS.upperA).toContain('Chest')
    expect(SPLIT_FOCUS.upperA).toContain('Back')
  })

  it('lowerA focuses on Quads', () => {
    expect(SPLIT_FOCUS.lowerA).toContain('Quads')
  })

  it('upperB focuses on Back and Shoulders', () => {
    expect(SPLIT_FOCUS.upperB).toContain('Back')
    expect(SPLIT_FOCUS.upperB).toContain('Shoulders')
  })

  it('lowerB focuses on Glutes', () => {
    expect(SPLIT_FOCUS.lowerB).toContain('Glutes')
  })

  it('every day has at least 2 focus groups', () => {
    for (const day of ['upperA', 'lowerA', 'upperB', 'lowerB'] as const) {
      expect(SPLIT_FOCUS[day].length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('ROUTINE_ID', () => {
  it('maps to hyphenated IDs', () => {
    expect(ROUTINE_ID.upperA).toBe('upper-a')
    expect(ROUTINE_ID.lowerA).toBe('lower-a')
    expect(ROUTINE_ID.upperB).toBe('upper-b')
    expect(ROUTINE_ID.lowerB).toBe('lower-b')
  })
})

// ── mesocycleWeek ──────────────────────────────────────────────────────────────

function makeMesocycle(startedAtOffset = 0): Mesocycle {
  return {
    id: 'meso-1',
    number: 1,
    name: 'Mesocycle 1',
    targetWeeks: 5,
    startedAt: Date.now() - startedAtOffset,
    endedAt: null,
    isDeloadWeek: false,
    updatedAt: 0,
  }
}

describe('mesocycleWeek', () => {
  it('returns 1 on day 0 (just started)', () => {
    expect(mesocycleWeek(makeMesocycle(0))).toBe(1)
  })

  it('returns 1 after 6 days (still week 1)', () => {
    const sixDaysMs = 6 * 24 * 60 * 60 * 1000
    expect(mesocycleWeek(makeMesocycle(sixDaysMs))).toBe(1)
  })

  it('returns 2 after exactly 7 days', () => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(mesocycleWeek(makeMesocycle(sevenDaysMs))).toBe(2)
  })

  it('returns 3 after 14 days', () => {
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000
    expect(mesocycleWeek(makeMesocycle(fourteenDaysMs))).toBe(3)
  })

  it('handles a 6-week cycle correctly at week 6', () => {
    const fiveWeeksMs = 35 * 24 * 60 * 60 * 1000
    const meso = { ...makeMesocycle(fiveWeeksMs), targetWeeks: 6 }
    expect(mesocycleWeek(meso)).toBe(6)
  })

  it('returns week > targetWeeks when cycle runs long', () => {
    const eightWeeksMs = 56 * 24 * 60 * 60 * 1000
    expect(mesocycleWeek(makeMesocycle(eightWeeksMs))).toBeGreaterThan(5)
  })
})

describe('Catalog & DEFAULT_ROUTINES integrity', () => {
  const catalogMap = new Map((exercisesData as Exercise[]).map(e => [e.id, e]))

  it('every exercise in exercises.json has subgroups array and movementFamily', () => {
    expect(exercisesData.length).toBe(154)
    for (const ex of exercisesData as Exercise[]) {
      expect(Array.isArray(ex.subgroups)).toBe(true)
      expect(typeof ex.movementFamily).toBe('string')
      expect(ex.movementFamily?.length).toBeGreaterThan(0)
    }
    const tbar = catalogMap.get('chest-supported-t-bar-row')
    expect(tbar?.subgroups).toContain('Back: Lats')
    expect(tbar?.movementFamily).toBe('horizontal-row')
    expect(tbar?.imageUrl).toBe('/exercises/still/chest-supported-t-bar-row.webp')
    expect(tbar?.videoUrl).toBe('/exercises/clip/chest-supported-t-bar-row.mp4')
    expect(Array.isArray(tbar?.instructions)).toBe(true)
  })

  it('every exerciseId and backupExerciseId in DEFAULT_ROUTINES exists in exercises.json', () => {
    for (const routine of DEFAULT_ROUTINES) {
      for (const slot of routine.exercises) {
        expect(catalogMap.has(slot.exerciseId), `Missing slot exerciseId: ${slot.exerciseId}`).toBe(true)
        expect(slot.backupExerciseIds?.length).toBeGreaterThanOrEqual(1)
        for (const backupId of slot.backupExerciseIds ?? []) {
          expect(catalogMap.has(backupId), `Missing backupExerciseId: ${backupId}`).toBe(true)
        }
      }
    }
  })

  it('maps all 5 legacy broken exercise IDs to valid catalog IDs', () => {
    expect(Object.keys(LEGACY_EXERCISE_ID_MAP)).toHaveLength(5)
    for (const targetId of Object.values(LEGACY_EXERCISE_ID_MAP)) {
      expect(catalogMap.has(targetId)).toBe(true)
    }
  })
})

