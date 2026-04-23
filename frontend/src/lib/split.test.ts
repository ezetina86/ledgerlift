import { describe, it, expect } from 'vitest'
import {
  nextSplitDay, upcomingSchedule,
  SPLIT_LABELS, SPLIT_FOCUS, ROUTINE_ID,
} from './split.ts'
import type { WorkoutSession } from '../db/index.ts'

function mockSession(splitDay: WorkoutSession['splitDay']): WorkoutSession {
  return {
    id: 'sess-1', routineId: 'r-1', routineName: 'Test',
    splitDay, startedAt: 0, completedAt: 0,
    notes: '', updatedAt: 0,
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
