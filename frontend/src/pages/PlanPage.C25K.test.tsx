import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import PlanPage from './PlanPage.tsx'
import { db } from '../db/index.ts'

expect.extend({
  toBeInTheDocument(received: unknown) {
    const pass = received != null
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in document`,
    }
  },
})

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> {
    toBeInTheDocument(): T
  }
}

describe('PlanPage C25K Reset Feature', () => {
  beforeEach(async () => {
    cleanup()
    await db.open()
    await db.runPrograms.clear()
    await db.runSessions.clear()
  })

  afterEach(async () => {
    cleanup()
  })

  it('renders the C25K section heading', async () => {
    render(<PlanPage />)
    expect(await screen.findByText('C25K PLAN')).toBeTruthy()
  })

  it('shows 0/27 when no runs completed', async () => {
    render(<PlanPage />)
    expect(await screen.findByText('0 / 27')).toBeTruthy()
  })

  it('renders Attempt badge and Reset button', async () => {
    await db.runPrograms.add({
      id: 'p1',
      number: 1,
      startedAt: Date.now(),
      endedAt: null,
      updatedAt: Date.now(),
    })
    render(<PlanPage />)

    await waitFor(() => {
      expect(screen.getByText(/ATTEMPT 1/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
    })
  })

  it('clicking Reset opens confirmation modal and confirming creates Attempt 2', async () => {
    const startTime = Date.now() - 10000
    await db.runPrograms.add({
      id: 'p1',
      number: 1,
      startedAt: startTime,
      endedAt: null,
      updatedAt: startTime,
    })
    // Add 1 completed run and 1 incomplete run
    await db.runSessions.add({
      id: 'r1',
      week: 1,
      day: 1,
      startedAt: startTime + 100,
      completedAt: startTime + 1800,
      durationSec: 1800,
      distanceKm: 3,
      rpe: 6,
      updatedAt: startTime + 1800,
    })
    await db.runSessions.add({
      id: 'r-inprog',
      week: 1,
      day: 2,
      startedAt: startTime + 2000,
      completedAt: null,
      durationSec: null,
      distanceKm: null,
      rpe: null,
      updatedAt: startTime + 2000,
    })

    render(<PlanPage />)

    const resetBtn = await screen.findByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)

    expect(screen.getByText(/Reset C25K Program\?/i)).toBeInTheDocument()
    expect(screen.getByText(/Attempt 2/i)).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /Reset to Week 1/i })
    fireEvent.click(confirmBtn)

    await waitFor(async () => {
      const programs = await db.runPrograms.toArray()
      expect(programs).toHaveLength(2)
      const p2 = programs.find(p => p.number === 2)
      expect(p2).toBeDefined()
      expect(p2?.endedAt).toBeNull()

      // In-progress run cleared, completed run intact
      const sessions = await db.runSessions.toArray()
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('r1')
    })

    // UI updates to 0/27, Attempt 2, Next Up Week 1 · Day 1
    expect(await screen.findByText('0 / 27')).toBeInTheDocument()
    expect(screen.getByText('ATTEMPT 2')).toBeInTheDocument()
    expect(screen.getByText('Week 1 · Day 1')).toBeInTheDocument()
  })

  it('canceling reset modal closes without making changes', async () => {
    await db.runPrograms.add({
      id: 'p1',
      number: 1,
      startedAt: Date.now(),
      endedAt: null,
      updatedAt: Date.now(),
    })
    render(<PlanPage />)

    const resetBtn = await screen.findByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)

    expect(screen.getByText(/Reset C25K Program\?/i)).toBeInTheDocument()
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByText(/Reset C25K Program\?/i)).toBeNull()
    })
    const programs = await db.runPrograms.toArray()
    expect(programs).toHaveLength(1)
    expect(programs[0].number).toBe(1)
  })
})
