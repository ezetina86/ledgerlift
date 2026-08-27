import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

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
import type { Exercise, SetLog } from '../db/index.ts'
import ProgressPage from './ProgressPage.tsx'

vi.mock('../components/ExerciseDashboardSheet.tsx', () => ({
  default: ({ exerciseName }: { exerciseName: string }) => (
    <div data-testid="exercise-dashboard-sheet">{exerciseName}</div>
  ),
}))

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'bench-press',
    name: 'Bench Press',
    primaryMuscleGroup: 'Chest',
    equipment: 'Barbell',
    nippardTierList: true,
    tierListGrade: '4 - S',
    muscleLadder: false,
    jeffSubgroupFav: false,
    demonstrationLink: null,
    ...overrides,
  }
}

function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: 'set-1',
    sessionId: 'session-1',
    exerciseId: 'bench-press',
    exerciseName: 'Bench Press',
    setNumber: 1,
    reps: 8,
    weightKg: 80,
    rpe: 8,
    volume: 640,
    timestamp: 1_000,
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

describe('ProgressPage', () => {
  it('defaults to lift mode and toggles into the run progress view', async () => {
    await db.exercises.add(makeExercise())
    await db.sets.add(makeSet())

    render(<ProgressPage />)

    expect(await screen.findByText('Weekly Volume')).toBeTruthy()
    expect(screen.getByText('Personal Records')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'RUN' }))

    expect(await screen.findByText('COMPLETE A RUN TO SEE C25K PROGRESS')).toBeTruthy()
    expect(screen.queryByText('Weekly Volume')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'LIFT' }))

    expect(await screen.findByText('Weekly Volume')).toBeTruthy()
    expect(screen.getByText('Personal Records')).toBeTruthy()
  })

  it('closes the lift drill-down sheet when switching to run mode', async () => {
    await db.exercises.add(makeExercise())
    await db.sets.add(makeSet())

    render(<ProgressPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Bench Press/i }))
    expect(screen.getByTestId('exercise-dashboard-sheet')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'RUN' }))

    expect(await screen.findByText('COMPLETE A RUN TO SEE C25K PROGRESS')).toBeTruthy()
    expect(screen.queryByTestId('exercise-dashboard-sheet')).toBeNull()
  })
})
