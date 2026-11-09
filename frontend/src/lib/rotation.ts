import type { Exercise, MovementFamily, Routine, SetLog, WorkoutSession } from '../db/index.ts'
import { detectFatigue } from './overload.ts'

const COMPOUND_FAMILIES = new Set<string>([
  'horizontal-press',
  'incline-press',
  'vertical-press',
  'vertical-pull',
  'horizontal-row',
  'squat',
  'leg-press',
  'lunge',
  'hip-hinge',
  'hip-thrust',
])

export function isCompoundMovement(family?: MovementFamily | string): boolean {
  if (!family) return false
  return COMPOUND_FAMILIES.has(family)
}

const TIER_BONUS: Record<string, number> = {
  '5 - S+': 40,
  '4 - S':  30,
  '3 - A':  20,
  '2 - B':  10,
  '1 - C':  0,
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function subgroupSimilarity(target: Exercise, cand: Exercise): number {
  const targetSg = target.subgroups ?? []
  const candSg = cand.subgroups ?? []
  if (!targetSg.length || !candSg.length) return 0

  const prefix = target.primaryMuscleGroup === 'Forarm' ? 'Forearm' : target.primaryMuscleGroup
  const targetPrimarySg = targetSg.filter(s => s.startsWith(prefix) || s === prefix)
  const candPrimarySg = candSg.filter(s => s.startsWith(prefix) || s === prefix)

  if (targetPrimarySg.length > 0 && candPrimarySg.length > 0) {
    return jaccardSimilarity(targetPrimarySg, candPrimarySg)
  }
  return jaccardSimilarity(targetSg, candSg)
}

export interface RankedSubstitute {
  exercise: Exercise
  score: number
  isFresh: boolean
  reasons: string[]
}

export interface RankOptions {
  assignedIds?: Set<string>
  recentExerciseIds?: Set<string>
  fatiguedIds?: Set<string>
}

export function rankSubstitutes(
  target: Exercise,
  catalog: Exercise[],
  opts: RankOptions = {},
): RankedSubstitute[] {
  const assignedIds = opts.assignedIds ?? new Set<string>()
  const recentExerciseIds = opts.recentExerciseIds ?? new Set<string>()
  const fatiguedIds = opts.fatiguedIds ?? new Set<string>()

  const results: RankedSubstitute[] = []

  for (const cand of catalog) {
    if (cand.id === target.id) continue
    const sameGroup = cand.primaryMuscleGroup === target.primaryMuscleGroup
    const sameFamily = cand.movementFamily === target.movementFamily && cand.movementFamily !== 'other'
    if (!sameGroup && !sameFamily) continue

    let score = 0
    const reasons: string[] = []

    if (sameFamily) {
      score += 100
      reasons.push('SAME PATTERN')
    } else if (sameGroup) {
      score += 35
    }

    const sgOverlap = subgroupSimilarity(target, cand)
    if (sgOverlap > 0) {
      score += Math.round(sgOverlap * 60)
      if (sgOverlap >= 0.5 && !reasons.includes('SAME PATTERN')) {
        reasons.push('SUBGROUP MATCH')
      }
    }

    const tierBonus = cand.tierListGrade ? (TIER_BONUS[cand.tierListGrade] ?? 0) : 0
    score += tierBonus
    if (cand.tierListGrade === '5 - S+') reasons.push('TIER S+')
    else if (cand.tierListGrade === '4 - S') reasons.push('TIER S')

    if (cand.jeffSubgroupFav) {
      score += 15
      reasons.push("JEFF'S FAV")
    }
    if (cand.muscleLadder) {
      score += 10
    }

    const isFresh = !recentExerciseIds.has(cand.id)
    if (isFresh) {
      score += 25
      reasons.push('FRESH')
    }

    if (assignedIds.has(cand.id)) {
      score -= 80
    }
    if (fatiguedIds.has(cand.id)) {
      score -= 50
    }

    results.push({ exercise: cand, score, isFresh, reasons: reasons.slice(0, 3) })
  }

  return results.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
}

export interface RotationProposalItem {
  routineId: string
  routineName: string
  order: number
  currentExerciseId: string
  currentExerciseName: string
  suggestedExercise: Exercise
  reasons: string[]
  recommended: boolean
  trigger: 'duplicate' | 'fatigued' | 'stale' | 'optional'
}

export function buildRoutineRotationProposal(
  routines: Routine[],
  exercises: Map<string, Exercise>,
  sets: SetLog[],
  sessions: WorkoutSession[],
  windowMs = 30 * 24 * 60 * 60 * 1000,
): RotationProposalItem[] {
  const catalog = [...exercises.values()]
  const cutoff = Date.now() - windowMs

  const recentExerciseIds = new Set<string>(
    sets.filter(s => s.timestamp >= cutoff && s.setType !== 'warmup').map(s => s.exerciseId)
  )

  const fatigueSignals = detectFatigue(sets, sessions, exercises)
  const fatiguedIds = new Set<string>(fatigueSignals.map(f => f.exerciseId))

  const sessionCountByEx = new Map<string, Set<string>>()
  const completedIds = new Set(sessions.filter(s => s.completedAt !== null).map(s => s.id))
  for (const s of sets) {
    if (!completedIds.has(s.sessionId) || s.setType === 'warmup') continue
    const setIds = sessionCountByEx.get(s.exerciseId) ?? new Set<string>()
    setIds.add(s.sessionId)
    sessionCountByEx.set(s.exerciseId, setIds)
  }

  const assignedIds = new Set<string>()
  for (const r of routines) {
    for (const slot of r.exercises) {
      assignedIds.add(slot.exerciseId)
    }
  }

  const seenInEarlierRoutine = new Set<string>()
  const proposals: RotationProposalItem[] = []

  const sortedRoutines = [...routines].sort((a, b) => a.id.localeCompare(b.id))
  for (const routine of sortedRoutines) {
    const sortedSlots = [...routine.exercises].sort((a, b) => a.order - b.order)
    for (const slot of sortedSlots) {
      const targetEx = exercises.get(slot.exerciseId)
      if (!targetEx) continue

      const isDuplicate = seenInEarlierRoutine.has(slot.exerciseId)
      seenInEarlierRoutine.add(slot.exerciseId)

      const isFatigued = fatiguedIds.has(slot.exerciseId)
      const completedSessCount = sessionCountByEx.get(slot.exerciseId)?.size ?? 0
      const isStale = completedSessCount >= 4 && slot.order >= 3

      const ranked = rankSubstitutes(targetEx, catalog, {
        assignedIds,
        recentExerciseIds,
        fatiguedIds,
      })
      if (ranked.length === 0) continue

      const best = ranked[0]
      assignedIds.add(best.exercise.id)

      let trigger: RotationProposalItem['trigger'] = 'optional'
      if (isDuplicate) trigger = 'duplicate'
      else if (isFatigued) trigger = 'fatigued'
      else if (isStale) trigger = 'stale'

      proposals.push({
        routineId: routine.id,
        routineName: routine.name,
        order: slot.order,
        currentExerciseId: slot.exerciseId,
        currentExerciseName: targetEx.name,
        suggestedExercise: best.exercise,
        reasons: best.reasons,
        recommended: trigger !== 'optional',
        trigger,
      })
    }
  }

  return proposals
}
