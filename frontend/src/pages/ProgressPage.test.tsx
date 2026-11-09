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
import SetSheet from '../components/SetSheet.tsx'
import WorkoutPage from './WorkoutPage.tsx'

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

  it('renders EST 1RM on PR cards and Subgroup Coverage (7d) with active and neglected subgroups', async () => {
    await db.exercises.bulkPut([
      makeExercise({
        id: 'bench-press',
        name: 'Bench Press',
        primaryMuscleGroup: 'Chest',
        subgroups: ['Chest: Upper', 'Chest: Middle'],
      }),
      makeExercise({
        id: 'incline-curl',
        name: 'Incline Curl',
        primaryMuscleGroup: 'Biceps',
        subgroups: ['Biceps: Long Head'],
      }),
    ])
    await db.sets.add(makeSet({
      timestamp: Date.now() - 1000,
      weightKg: 80,
      reps: 8,
      rpe: 8,
      volume: 640,
    }))

    render(<ProgressPage />)

    expect(await screen.findByText(/EST 1RM/i)).toBeTruthy()
    expect(await screen.findByText(/Subgroup Coverage/i)).toBeTruthy()
    expect(screen.getByText('Chest: Middle')).toBeTruthy()
    expect(screen.getByText('Biceps: Long Head')).toBeTruthy()
  })
})

describe('SetSheet & WorkoutPage Rest Timer and Backups', () => {
  it('allows selecting setType in SetSheet and passes it to onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <SetSheet
        open={true}
        initial={{ weightKg: 80, reps: 8, rpe: 8 }}
        setNumber={1}
        exerciseName="Bench Press"
        onConfirm={onConfirm}
        onClose={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'WORK' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'WARMUP' })).toBeTruthy()
    const dropBtn = screen.getByRole('button', { name: 'DROP' })
    expect(dropBtn).toBeTruthy()
    expect(screen.getByRole('button', { name: 'FAIL' })).toBeTruthy()

    fireEvent.click(dropBtn)
    fireEvent.click(screen.getByRole('button', { name: 'LOG SET' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      weightKg: 80,
      reps: 8,
      rpe: 8,
      setType: 'drop',
    }))
  })

  it('shows 1-tap backup chips before logging sets and starts Auto Rest Timer Pill on working set log', async () => {
    const now = Date.now()
    await db.exercises.bulkPut([
      makeExercise({
        id: 'bench-press',
        name: 'Bench Press',
        primaryMuscleGroup: 'Chest',
        movementFamily: 'horizontal-press',
      }),
      makeExercise({
        id: 'dumbbell-bench-press',
        name: 'Dumbbell Bench Press',
        primaryMuscleGroup: 'Chest',
        movementFamily: 'horizontal-press',
      }),
    ])
    await db.routines.add({
      id: 'upper-a',
      name: 'Upper A',
      splitDay: 'upperA',
      exercises: [
        {
          exerciseId: 'bench-press',
          order: 1,
          defaultSets: 3,
          defaultReps: '6-8',
          backupExerciseIds: ['dumbbell-bench-press'],
        },
      ],
      createdAt: now,
      updatedAt: now,
    })
    await db.sessions.add({
      id: 'sess-1',
      routineId: 'upper-a',
      routineName: 'Upper A',
      splitDay: 'upperA',
      startedAt: now,
      completedAt: null,
      notes: '',
      mesocycleId: null,
      isDeload: false,
      updatedAt: now,
    })

    render(<WorkoutPage sessionId="sess-1" onComplete={() => {}} onBack={() => {}} />)

    // 1-tap backup chip is rendered when 0 sets logged
    expect(await screen.findByRole('button', { name: /ALT: Dumbbell Bench Press/i })).toBeTruthy()

    // Log a working set
    fireEvent.click(screen.getByRole('button', { name: /ADD SET/i }))
    fireEvent.click(await screen.findByRole('button', { name: /LOG SET/i }))

    // Auto rest timer pill starts at 2:30 for compound horizontal-press
    expect(await screen.findByText(/REST 2:30/i)).toBeTruthy()

    // +30s adds 30 seconds -> 3:00
    fireEvent.click(screen.getByRole('button', { name: '+30s' }))
    expect(await screen.findByText(/REST 3:00/i)).toBeTruthy()
  })
})
