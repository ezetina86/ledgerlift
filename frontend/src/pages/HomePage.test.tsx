import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

const _store = new Map<string, string>()
const mockStorage: Storage = {
  getItem: (k) => _store.get(k) ?? null,
  setItem: (k, v) => { _store.set(k, v) },
  removeItem: (k) => { _store.delete(k) },
  clear: () => { _store.clear() },
  get length() { return _store.size },
  key: (i) => [..._store.keys()][i] ?? null,
}
vi.stubGlobal('localStorage', mockStorage)

import { db, setSyncing } from '../db/index.ts'
import HomePage from './HomePage.tsx'

const defaultProps = {
  onStartWorkout: vi.fn(),
  onResumeWorkout: vi.fn(),
  onNavigatePlan: vi.fn(),
  onStartRun: vi.fn(),
  onResumeRun: vi.fn(),
}

beforeEach(async () => {
  cleanup()
  localStorage.clear()
  setSyncing(false)
  await db.delete()
  await db.open()
})

afterEach(async () => {
  cleanup()
  setSyncing(false)
  await db.delete()
})

describe('HomePage Next Run card', () => {
  it('derives next run from active RunProgram after reset', async () => {
    const p1Time = 1000
    const p2Time = 5000
    // Attempt 1 has 2 completed runs (Week 1 Day 1, Week 1 Day 2)
    // Attempt 2 was started at p2Time with no runs
    await db.runPrograms.bulkAdd([
      { id: 'p1', number: 1, startedAt: p1Time, endedAt: p2Time - 1, updatedAt: p2Time - 1 },
      { id: 'p2', number: 2, startedAt: p2Time, endedAt: null, updatedAt: p2Time },
    ])
    await db.runSessions.bulkAdd([
      { id: 'r1', week: 1, day: 1, startedAt: p1Time + 10, completedAt: p1Time + 20, durationSec: 1800, distanceKm: 3.0, rpe: 6, updatedAt: p1Time + 20 },
      { id: 'r2', week: 1, day: 2, startedAt: p1Time + 30, completedAt: p1Time + 40, durationSec: 1800, distanceKm: 3.0, rpe: 7, updatedAt: p1Time + 40 },
    ])

    render(<HomePage {...defaultProps} />)

    // With active attempt 2 having 0 completed runs, Up Next should be Week 1 · Day 1
    await waitFor(() => {
      expect(screen.getByText(/WEEK 1 · DAY 1/i)).toBeTruthy()
    })
  })

  it('advances next run when runs are completed in active program', async () => {
    const p1Time = 1000
    await db.runPrograms.add({ id: 'p1', number: 1, startedAt: p1Time, endedAt: null, updatedAt: p1Time })
    await db.runSessions.bulkAdd([
      { id: 'r1', week: 1, day: 1, startedAt: p1Time + 10, completedAt: p1Time + 20, durationSec: 1800, distanceKm: 3.0, rpe: 6, updatedAt: p1Time + 20 },
    ])

    render(<HomePage {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText(/WEEK 1 · DAY 2/i)).toBeTruthy()
    })
  })
})
