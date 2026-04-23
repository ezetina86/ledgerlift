import Dexie, { type EntityTable } from 'dexie'

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface Exercise {
  id: string
  name: string
  primaryMuscleGroup: string
  equipment: string
  nippardTierList: boolean
  tierListGrade: string | null
  muscleLadder: boolean
  jeffSubgroupFav: boolean
  demonstrationLink: string | null
}

export type SplitDay = 'upperA' | 'lowerA' | 'upperB' | 'lowerB'

export interface RoutineExercise {
  exerciseId: string
  order: number
  defaultSets: number
  defaultReps: string  // e.g. "8-12"
}

export interface Routine {
  id: string
  name: string
  splitDay: SplitDay
  exercises: RoutineExercise[]
  createdAt: number
  updatedAt: number         // auto-stamped by Dexie hook
}

export interface WorkoutSession {
  id: string
  routineId: string
  routineName: string
  splitDay: SplitDay
  startedAt: number
  completedAt: number | null
  notes: string
  updatedAt: number         // auto-stamped by Dexie hook
}

export interface SetLog {
  id: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  reps: number
  weightKg: number
  rpe: number | null        // 1–10
  volume: number            // reps * weightKg (computed on write)
  timestamp: number
  updatedAt: number         // auto-stamped by Dexie hook
}

// ─── Seed data — default Upper/Lower split ────────────────────────────────────

export const DEFAULT_ROUTINES: Omit<Routine, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'upper-a',
    name: 'Upper A',
    splitDay: 'upperA',
    exercises: [
      { exerciseId: 'bench-press',                        order: 1, defaultSets: 3, defaultReps: '6-8' },
      { exerciseId: 'chest-supported-t-bar-row',          order: 2, defaultSets: 3, defaultReps: '8-12' },
      { exerciseId: 'incline-dumbbell-press',             order: 3, defaultSets: 3, defaultReps: '8-12' },
      { exerciseId: 'cable-row-neutral-grip',             order: 4, defaultSets: 3, defaultReps: '10-12' },
      { exerciseId: 'overhead-cable-triceps-extension-bar', order: 5, defaultSets: 3, defaultReps: '10-15' },
      { exerciseId: 'face-away-bayesian-curl',            order: 6, defaultSets: 3, defaultReps: '10-15' },
    ],
  },
  {
    id: 'lower-a',
    name: 'Lower A',
    splitDay: 'lowerA',
    exercises: [
      { exerciseId: 'barbell-back-squat',                 order: 1, defaultSets: 3, defaultReps: '6-8' },
      { exerciseId: 'romanian-deadlift',                  order: 2, defaultSets: 3, defaultReps: '8-12' },
      { exerciseId: 'hack-squat',                         order: 3, defaultSets: 3, defaultReps: '10-12' },
      { exerciseId: 'lying-leg-curl',                     order: 4, defaultSets: 3, defaultReps: '10-15' },
      { exerciseId: 'seated-calf-raise',                  order: 5, defaultSets: 4, defaultReps: '10-15' },
      { exerciseId: 'cable-crunch',                       order: 6, defaultSets: 3, defaultReps: '12-15' },
    ],
  },
  {
    id: 'upper-b',
    name: 'Upper B',
    splitDay: 'upperB',
    exercises: [
      { exerciseId: 'weighted-pull-up',                   order: 1, defaultSets: 3, defaultReps: '6-8' },
      { exerciseId: 'dumbbell-shoulder-press',            order: 2, defaultSets: 3, defaultReps: '8-12' },
      { exerciseId: 'chest-supported-t-bar-row',          order: 3, defaultSets: 3, defaultReps: '8-12' },
      { exerciseId: 'cable-lateral-raise',                order: 4, defaultSets: 4, defaultReps: '12-15' },
      { exerciseId: 'barbell-skullcrusher',               order: 5, defaultSets: 3, defaultReps: '8-12' },
      { exerciseId: 'dumbbell-preacher-curl',             order: 6, defaultSets: 3, defaultReps: '10-15' },
    ],
  },
  {
    id: 'lower-b',
    name: 'Lower B',
    splitDay: 'lowerB',
    exercises: [
      { exerciseId: 'bulgarian-split-squat',              order: 1, defaultSets: 3, defaultReps: '8-10' },
      { exerciseId: 'hip-thrust',                         order: 2, defaultSets: 3, defaultReps: '10-12' },
      { exerciseId: 'leg-press',                          order: 3, defaultSets: 3, defaultReps: '10-15' },
      { exerciseId: 'romanian-deadlift',                  order: 4, defaultSets: 3, defaultReps: '10-12' },
      { exerciseId: 'standing-calf-raise',                order: 5, defaultSets: 4, defaultReps: '10-15' },
      { exerciseId: 'hanging-leg-raise',                  order: 6, defaultSets: 3, defaultReps: '10-15' },
    ],
  },
]

// ─── Database class ───────────────────────────────────────────────────────────

export class LedgerLiftDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  sets!: EntityTable<SetLog, 'id'>

  constructor() {
    super('ledgerlift')

    this.version(1).stores({
      exercises: 'id, primaryMuscleGroup, nippardTierList, muscleLadder',
      routines:  'id, splitDay, createdAt',
      sessions:  'id, routineId, splitDay, startedAt, completedAt',
      sets:      'id, sessionId, exerciseId, timestamp',
    })

    // v2: add updatedAt index for sync delta queries
    this.version(2).stores({
      exercises: 'id, primaryMuscleGroup, nippardTierList, muscleLadder',
      routines:  'id, splitDay, createdAt, updatedAt',
      sessions:  'id, routineId, splitDay, startedAt, completedAt, updatedAt',
      sets:      'id, sessionId, exerciseId, timestamp, updatedAt',
    })

    // Auto-stamp updatedAt on every write
    this.sessions.hook('creating', (_pk, obj) => { obj.updatedAt = Date.now() })
    this.sessions.hook('updating', (mods: Partial<WorkoutSession>) => {
      (mods as any).updatedAt = Date.now()
    })
    this.sets.hook('creating', (_pk, obj) => { obj.updatedAt = Date.now() })
    this.sets.hook('updating', (mods: Partial<SetLog>) => {
      (mods as any).updatedAt = Date.now()
    })
    this.routines.hook('creating', (_pk, obj) => { obj.updatedAt = Date.now() })
    this.routines.hook('updating', (mods: Partial<Routine>) => {
      (mods as any).updatedAt = Date.now()
    })
  }
}

export const db = new LedgerLiftDB()

// ─── Seed on first load ───────────────────────────────────────────────────────

export async function seedDatabase() {
  const { default: exercises } = await import('../data/exercises.json')

  const existingEx = await db.exercises.count()
  if (existingEx === 0) {
    await db.exercises.bulkAdd(exercises as Exercise[])
  }

  const existingRoutines = await db.routines.count()
  if (existingRoutines === 0) {
    const now = Date.now()
    await db.routines.bulkAdd(
      DEFAULT_ROUTINES.map(r => ({ ...r, createdAt: now, updatedAt: now }))
    )
  }
}
