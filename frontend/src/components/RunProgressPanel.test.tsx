import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

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
import type { RunSession } from '../db/index.ts'
import RunProgressPanel from './RunProgressPanel.tsx'

function makeRunSession(id: string, overrides: Partial<RunSession> = {}): RunSession {
  return {
    id,
    week: 1,
    day: 1,
    startedAt: 1_000,
    completedAt: 1_600,
    durationSec: 1_800,
    distanceKm: 2.5,
    rpe: 6,
    updatedAt: 0,
    ...overrides,
  }
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

describe('RunProgressPanel', () => {
  it('shows the empty state when no completed runs exist', async () => {
    render(<RunProgressPanel />)

    expect(await screen.findByText('0 / 27')).toBeTruthy()
    expect(screen.getByText('COMPLETE A RUN TO SEE C25K PROGRESS')).toBeTruthy()
    expect(screen.queryByText('Duration Trend')).toBeNull()
  })

  it('renders run summary, stats, and conditional trend sections from completed runs', async () => {
    await db.runSessions.bulkAdd([
      makeRunSession('run-1', { week: 1, day: 1, startedAt: 1_000, completedAt: 1_600, durationSec: 1_800, distanceKm: 2.5, rpe: 6 }),
      makeRunSession('run-2', { week: 1, day: 2, startedAt: 2_000, completedAt: 2_700, durationSec: 1_900, distanceKm: null, rpe: 7 }),
      makeRunSession('run-3', { week: 1, day: 3, startedAt: 3_000, completedAt: 3_800, durationSec: 2_000, distanceKm: 3.2, rpe: null }),
    ])

    render(<RunProgressPanel />)

    expect(await screen.findByText('3 / 27')).toBeTruthy()
    expect(screen.getByText('Completed run sessions')).toBeTruthy()
    expect(screen.getByText('11%')).toBeTruthy()
    expect(screen.getByText('Week 2 · Day 1')).toBeTruthy()

    expect(screen.getByText('Longest Run')).toBeTruthy()
    expect(screen.getByText('1 min')).toBeTruthy()
    expect(screen.getByText('Total Time')).toBeTruthy()
    expect(screen.getByText('1h 35m')).toBeTruthy()
    expect(screen.getByText('Distance Logged')).toBeTruthy()
    expect(screen.getByText('5.7 km')).toBeTruthy()

    expect(screen.getByText('Duration Trend')).toBeTruthy()
    expect(screen.getByText('Distance Trend')).toBeTruthy()
    expect(screen.getByText('Effort Trend')).toBeTruthy()
  })
})
