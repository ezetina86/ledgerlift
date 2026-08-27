import { describe, it, expect } from 'vitest'
import type { RunSession } from '../db/index.ts'
import {
  completedRunSessions,
  runSummary,
  totalRunDurationSec,
  totalRunDistanceKm,
  longestCompletedRunIntervalSec,
  durationTrend,
  distanceTrend,
  rpeTrend,
} from './runProgress.ts'

function makeRunSession(overrides: Partial<RunSession> = {}): RunSession {
  return {
    id: 'run-1',
    week: 1,
    day: 1,
    startedAt: 1_000,
    completedAt: 1_600,
    durationSec: 1_800,
    distanceKm: 2.4,
    rpe: 6,
    updatedAt: 0,
    ...overrides,
  }
}

describe('completedRunSessions', () => {
  it('filters out incomplete sessions and sorts completed sessions by completion time', () => {
    const sessions = [
      makeRunSession({
        id: 'run-3', week: 1, day: 3, startedAt: 3_000, completedAt: 4_000,
      }),
      makeRunSession({
        id: 'run-2', week: 1, day: 2, startedAt: 2_000, completedAt: 3_000,
      }),
      makeRunSession({
        id: 'run-active', week: 2, day: 1, startedAt: 5_000, completedAt: null,
      }),
    ]

    expect(completedRunSessions(sessions).map(session => session.id)).toEqual(['run-2', 'run-3'])
  })
})

describe('runSummary', () => {
  it('returns completed count, total planned count, completion percent, and next label', () => {
    const sessions = [
      makeRunSession({ id: 'run-1', week: 1, day: 1 }),
      makeRunSession({ id: 'run-2', week: 1, day: 2, completedAt: 2_600, startedAt: 2_000 }),
      makeRunSession({ id: 'run-active', week: 1, day: 3, completedAt: null, startedAt: 3_000 }),
    ]

    expect(runSummary(sessions)).toEqual({
      completedCount: 2,
      totalPlanned: 27,
      completionPct: 7,
      nextSessionLabel: 'Week 1 · Day 3',
    })
  })

  it('returns null nextSessionLabel when all planned runs are completed', () => {
    const sessions = Array.from({ length: 27 }, (_, index) => {
      const week = Math.floor(index / 3) + 1
      const day = (index % 3) + 1

      return makeRunSession({
        id: `run-${index + 1}`,
        week,
        day,
        startedAt: index * 1_000,
        completedAt: index * 1_000 + 600,
      })
    })

    expect(runSummary(sessions).nextSessionLabel).toBeNull()
  })
})

describe('totals', () => {
  it('sums duration from completed sessions only', () => {
    const sessions = [
      makeRunSession({ id: 'run-1', durationSec: 1_800 }),
      makeRunSession({ id: 'run-2', durationSec: 2_100, startedAt: 2_000, completedAt: 2_700 }),
      makeRunSession({ id: 'run-3', durationSec: null, startedAt: 3_000, completedAt: 3_800 }),
      makeRunSession({ id: 'run-active', durationSec: 999, startedAt: 4_000, completedAt: null }),
    ]

    expect(totalRunDurationSec(sessions)).toBe(3_900)
  })

  it('sums logged distance from completed sessions only', () => {
    const sessions = [
      makeRunSession({ id: 'run-1', distanceKm: 2.4 }),
      makeRunSession({ id: 'run-2', distanceKm: 3.1, startedAt: 2_000, completedAt: 2_700 }),
      makeRunSession({ id: 'run-3', distanceKm: null, startedAt: 3_000, completedAt: 3_800 }),
      makeRunSession({ id: 'run-active', distanceKm: 5.0, startedAt: 4_000, completedAt: null }),
    ]

    expect(totalRunDistanceKm(sessions)).toBeCloseTo(5.5)
  })
})

describe('longestCompletedRunIntervalSec', () => {
  it('derives the longest planned run interval from completed week/day sessions', () => {
    const sessions = [
      makeRunSession({ id: 'run-1', week: 1, day: 1 }),
      makeRunSession({ id: 'run-2', week: 5, day: 2, startedAt: 2_000, completedAt: 2_700 }),
      makeRunSession({ id: 'run-3', week: 5, day: 3, startedAt: 3_000, completedAt: 3_800 }),
      makeRunSession({ id: 'run-active', week: 9, day: 1, startedAt: 4_000, completedAt: null }),
    ]

    expect(longestCompletedRunIntervalSec(sessions)).toBe(1_200)
  })

  it('ignores completed sessions that do not map to the C25K plan', () => {
    const sessions = [
      makeRunSession({ id: 'run-unknown', week: 99, day: 1 }),
    ]

    expect(longestCompletedRunIntervalSec(sessions)).toBe(0)
  })
})

describe('trend helpers', () => {
  it('builds duration trend points in completed-session order', () => {
    const sessions = [
      makeRunSession({ id: 'run-2', week: 1, day: 2, startedAt: 2_000, completedAt: 2_700, durationSec: 1_900 }),
      makeRunSession({ id: 'run-1', week: 1, day: 1, startedAt: 1_000, completedAt: 1_600, durationSec: 1_800 }),
      makeRunSession({ id: 'run-3', week: 1, day: 3, startedAt: 3_000, completedAt: 3_800, durationSec: null }),
    ]

    expect(durationTrend(sessions)).toEqual([
      {
        order: 1,
        label: 'Week 1 · Day 1',
        value: 1_800,
        week: 1,
        day: 1,
        completedAt: 1_600,
        durationSec: 1_800,
      },
      {
        order: 2,
        label: 'Week 1 · Day 2',
        value: 1_900,
        week: 1,
        day: 2,
        completedAt: 2_700,
        durationSec: 1_900,
      },
    ])
  })

  it('filters null distance and rpe values from trend data', () => {
    const sessions = [
      makeRunSession({ id: 'run-1', week: 1, day: 1, distanceKm: 2.5, rpe: 6 }),
      makeRunSession({ id: 'run-2', week: 1, day: 2, startedAt: 2_000, completedAt: 2_700, distanceKm: null, rpe: 7 }),
      makeRunSession({ id: 'run-3', week: 1, day: 3, startedAt: 3_000, completedAt: 3_800, distanceKm: 3.2, rpe: null }),
      makeRunSession({ id: 'run-active', week: 2, day: 1, startedAt: 4_000, completedAt: null, distanceKm: 9.9, rpe: 10 }),
    ]

    expect(distanceTrend(sessions)).toEqual([
      {
        order: 1,
        label: 'Week 1 · Day 1',
        value: 2.5,
        week: 1,
        day: 1,
        completedAt: 1_600,
        distanceKm: 2.5,
      },
      {
        order: 2,
        label: 'Week 1 · Day 3',
        value: 3.2,
        week: 1,
        day: 3,
        completedAt: 3_800,
        distanceKm: 3.2,
      },
    ])

    expect(rpeTrend(sessions)).toEqual([
      {
        order: 1,
        label: 'Week 1 · Day 1',
        value: 6,
        week: 1,
        day: 1,
        completedAt: 1_600,
        rpe: 6,
      },
      {
        order: 2,
        label: 'Week 1 · Day 2',
        value: 7,
        week: 1,
        day: 2,
        completedAt: 2_700,
        rpe: 7,
      },
    ])
  })
})
