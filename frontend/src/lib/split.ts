import type { SplitDay, WorkoutSession, Mesocycle } from '../db/index.ts'

const SPLIT_ORDER: SplitDay[] = ['upperA', 'lowerA', 'upperB', 'lowerB']

export const SPLIT_LABELS: Record<SplitDay, string> = {
  upperA: 'Upper A',
  lowerA: 'Lower A',
  upperB: 'Upper B',
  lowerB: 'Lower B',
}

export const SPLIT_FOCUS: Record<SplitDay, string[]> = {
  upperA: ['Chest', 'Back', 'Biceps', 'Triceps'],
  lowerA: ['Quads', 'Hamstrings', 'Calves', 'Core'],
  upperB: ['Back', 'Shoulders', 'Biceps', 'Triceps'],
  lowerB: ['Glutes', 'Hamstrings', 'Quads', 'Calves'],
}

export const ROUTINE_ID: Record<SplitDay, string> = {
  upperA: 'upper-a',
  lowerA: 'lower-a',
  upperB: 'upper-b',
  lowerB: 'lower-b',
}

/** Returns the next split day after the last completed session. */
export function nextSplitDay(lastSession: WorkoutSession | undefined): SplitDay {
  if (!lastSession) return 'upperA'
  const idx = SPLIT_ORDER.indexOf(lastSession.splitDay)
  return SPLIT_ORDER[(idx + 1) % SPLIT_ORDER.length]
}

/** Returns the full 4-day schedule starting from next session. */
export function upcomingSchedule(lastSession: WorkoutSession | undefined): SplitDay[] {
  const next = nextSplitDay(lastSession)
  const start = SPLIT_ORDER.indexOf(next)
  return [0, 1, 2, 3].map(i => SPLIT_ORDER[(start + i) % SPLIT_ORDER.length])
}

/** Returns 1-based week number within a mesocycle. */
export function mesocycleWeek(mesocycle: Mesocycle): number {
  return Math.floor((Date.now() - mesocycle.startedAt) / (7 * 24 * 60 * 60 * 1000)) + 1
}
