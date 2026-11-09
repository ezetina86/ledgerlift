import type { SetLog, Exercise, WorkoutSession } from '../db/index.ts'

export interface OverloadSuggestion {
  weightKg: number
  reps: number
  note: string
}

export function parseRepRange(defaultReps?: string): { minReps: number; maxReps: number } | null {
  if (!defaultReps) return null
  const rangeMatch = defaultReps.trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    return { minReps: Number(rangeMatch[1]), maxReps: Number(rangeMatch[2]) }
  }
  const singleMatch = defaultReps.trim().match(/^(\d+)$/)
  if (singleMatch) {
    const val = Number(singleMatch[1])
    return { minReps: val, maxReps: val }
  }
  return null
}

export function workingSetsOnly(sets: SetLog[]): SetLog[] {
  return sets.filter(s => s.setType !== 'warmup')
}

export function estimate1RM(weightKg: number, reps: number, rpe?: number | null): number {
  if (weightKg <= 0 || reps <= 0) return 0
  const rir = Math.max(0, 10 - (rpe ?? 8))
  const effectiveReps = Math.min(15, reps + rir)
  if (effectiveReps === 1) return weightKg
  return Math.round(weightKg * (1 + effectiveReps / 30) * 10) / 10
}

/**
 * RPE rules (Nippard, 1–10) + Double Progression:
 *   ≤ 7  → +2.5 kg, minReps (if rep range given) or same reps
 *   = 8  → if hit top of rep range: +2.5 kg, reset to minReps; else: same weight, +1 rep
 *   ≥ 9  → hold weight + reps, cue form
 */
export function suggestNext(lastSets: SetLog[], defaultReps?: string): OverloadSuggestion | null {
  const workSets = workingSetsOnly(lastSets)
  if (workSets.length === 0) return null
  const last = workSets[workSets.length - 1]
  const maxRpe = Math.max(...workSets.map(s => s.rpe ?? 8))
  const range = parseRepRange(defaultReps)

  if (maxRpe <= 7) {
    return { weightKg: last.weightKg + 2.5, reps: range ? range.minReps : last.reps, note: '↑ +2.5 kg (RPE easy)' }
  }
  if (maxRpe === 8) {
    if (range && last.reps >= range.maxReps) {
      return { weightKg: last.weightKg + 2.5, reps: range.minReps, note: `★ Top of ${defaultReps} hit! ↑ +2.5 kg` }
    }
    return { weightKg: last.weightKg, reps: last.reps + 1, note: '↑ +1 rep (same weight)' }
  }
  return { weightKg: last.weightKg, reps: last.reps, note: '→ Hold. Cue form (RPE high)' }
}

export interface VolumeByGroup {
  group: string
  volume: number      // kg total
  sets: number
  pct: number         // 0–100 relative to max group
}

/** Compute 7-day rolling volume per muscle group. Needs exercises map for group lookup. Skips warmup sets. */
export function weeklyVolumeByGroup(
  sets: SetLog[],
  exercises: Map<string, Exercise>,
  windowMs = 7 * 24 * 60 * 60 * 1000
): VolumeByGroup[] {
  const cutoff = Date.now() - windowMs
  const recent = workingSetsOnly(sets).filter(s => s.timestamp >= cutoff)

  const vol: Record<string, { volume: number; sets: number }> = {}
  for (const s of recent) {
    const group = exercises.get(s.exerciseId)?.primaryMuscleGroup ?? 'Other'
    const entry = vol[group] ?? { volume: 0, sets: 0 }
    entry.volume += s.volume
    entry.sets += 1
    vol[group] = entry
  }

  const rows = Object.entries(vol).map(([group, v]) => ({ group, ...v, pct: 0 }))
  const maxVol = Math.max(...rows.map(r => r.volume), 1)
  rows.forEach(r => { r.pct = Math.round((r.volume / maxVol) * 100) })
  return rows.sort((a, b) => b.volume - a.volume)
}

export interface ExercisePR {
  exerciseId: string
  exerciseName: string
  bestWeightKg: number
  bestReps: number
  bestEst1RM: number
  sessionCount: number
  lastTs: number
}

/** Personal records: best weight and best estimated 1RM per exercise across all time (skips warmup sets). */
export function computePRs(sets: SetLog[]): ExercisePR[] {
  const map = new Map<string, ExercisePR>()
  for (const s of workingSetsOnly(sets)) {
    const est1RM = estimate1RM(s.weightKg, s.reps, s.rpe)
    const existing = map.get(s.exerciseId)
    if (!existing) {
      map.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        exerciseName: s.exerciseName,
        bestWeightKg: s.weightKg,
        bestReps: s.reps,
        bestEst1RM: est1RM,
        sessionCount: 1,
        lastTs: s.timestamp,
      })
    } else {
      if (s.weightKg > existing.bestWeightKg) {
        existing.bestWeightKg = s.weightKg
        existing.bestReps = s.reps
      }
      if (est1RM > existing.bestEst1RM) {
        existing.bestEst1RM = est1RM
      }
      existing.sessionCount += 1
      if (s.timestamp > existing.lastTs) existing.lastTs = s.timestamp
    }
  }
  return [...map.values()].sort((a, b) => b.bestWeightKg - a.bestWeightKg)
}

export interface ProgressPoint {
  sessionDate: number   // timestamp
  maxWeightKg: number
  totalVolume: number
}

/** Per-exercise progression: max weight per session, sorted ascending by date (skips warmup sets). */
export function exerciseProgression(
  sets: SetLog[],
  exerciseId: string
): ProgressPoint[] {
  const bySess = new Map<string, { date: number; maxW: number; vol: number }>()
  for (const s of workingSetsOnly(sets)) {
    if (s.exerciseId !== exerciseId) continue
    const entry = bySess.get(s.sessionId)
    if (!entry) {
      bySess.set(s.sessionId, { date: s.timestamp, maxW: s.weightKg, vol: s.volume })
    } else {
      if (s.weightKg > entry.maxW) entry.maxW = s.weightKg
      entry.vol += s.volume
      if (s.timestamp > entry.date) entry.date = s.timestamp
    }
  }
  return [...bySess.values()]
    .sort((a, b) => a.date - b.date)
    .map(e => ({ sessionDate: e.date, maxWeightKg: e.maxW, totalVolume: e.vol }))
}

export function rpeColor(rpe: number): string {
  if (rpe <= 6) return 'text-emerald-400'
  if (rpe <= 7) return 'text-green-400'
  if (rpe === 8) return 'text-yellow-400'
  if (rpe === 9) return 'text-orange-400'
  return 'text-red-400'
}

// ── Fatigue detection ──────────────────────────────────────────────────────────

export interface FatigueSignal {
  exerciseId: string
  exerciseName: string
  consecutiveHighRpe: number   // sessions in a row with maxRpe >= 9
  avgRpeLast3: number
  shouldDeload: boolean        // true when consecutiveHighRpe >= 2
}

/**
 * Returns per-exercise RPE history grouped by session (ordered oldest → newest).
 * Only completed sessions and working sets are included.
 */
export function rpeHistory(
  sets: SetLog[],
  sessions: WorkoutSession[],
  exerciseId: string,
): { sessionId: string; date: number; maxRpe: number }[] {
  const completedIds = new Set(sessions.filter(s => s.completedAt !== null).map(s => s.id))
  const sessionDateMap = new Map(sessions.map(s => [s.id, s.startedAt]))

  const bySess = new Map<string, { date: number; maxRpe: number }>()
  for (const s of workingSetsOnly(sets)) {
    if (s.exerciseId !== exerciseId) continue
    if (!completedIds.has(s.sessionId)) continue
    const rpe = s.rpe ?? 8
    const existing = bySess.get(s.sessionId)
    if (!existing) {
      bySess.set(s.sessionId, { date: sessionDateMap.get(s.sessionId) ?? s.timestamp, maxRpe: rpe })
    } else {
      if (rpe > existing.maxRpe) existing.maxRpe = rpe
    }
  }

  return [...bySess.entries()]
    .map(([sessionId, v]) => ({ sessionId, date: v.date, maxRpe: v.maxRpe }))
    .sort((a, b) => a.date - b.date)
}

/**
 * Detects fatigue signals across all exercises in the last N sessions.
 * Returns exercises where RPE >= 9 appeared in 2+ consecutive sessions.
 */
export function detectFatigue(
  sets: SetLog[],
  sessions: WorkoutSession[],
  exercises: Map<string, Exercise>,
  minConsecutive = 2,
): FatigueSignal[] {
  const exerciseIds = [...new Set(sets.map(s => s.exerciseId))]
  const signals: FatigueSignal[] = []

  for (const exerciseId of exerciseIds) {
    const history = rpeHistory(sets, sessions, exerciseId)
    if (history.length === 0) continue

    // Count consecutive high-RPE sessions from the most recent going backwards
    let consecutive = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].maxRpe >= 9) {
        consecutive++
      } else {
        break
      }
    }

    const last3 = history.slice(-3).map(h => h.maxRpe)
    const avgRpeLast3 = last3.length > 0
      ? last3.reduce((a, b) => a + b, 0) / last3.length
      : 0

    if (consecutive >= minConsecutive) {
      const ex = exercises.get(exerciseId)
      signals.push({
        exerciseId,
        exerciseName: ex?.name ?? exerciseId,
        consecutiveHighRpe: consecutive,
        avgRpeLast3: Math.round(avgRpeLast3 * 10) / 10,
        shouldDeload: consecutive >= minConsecutive,
      })
    }
  }

  return signals
}

// ── Subgroup coverage ────────────────────────────────────────────────────────

export interface SubgroupStat {
  subgroup: string
  primaryGroup: string
  sets: number
}

/**
 * Aggregates rolling window working sets across anatomical subgroups.
 * Known subgroups are gathered from `exercises.values()` and initialized to 0.
 * Sets fallback to `[ex.primaryMuscleGroup]` if `ex.subgroups` is empty.
 * Returns sorted by sets descending, then subgroup alphabetical.
 */
export function subgroupWeeklySets(
  sets: SetLog[],
  exercises: Map<string, Exercise>,
  windowMs = 7 * 24 * 60 * 60 * 1000,
): SubgroupStat[] {
  const cutoff = Date.now() - windowMs
  const map = new Map<string, SubgroupStat>()

  for (const ex of exercises.values()) {
    const sgs = ex.subgroups && ex.subgroups.length > 0
      ? ex.subgroups
      : (ex.primaryMuscleGroup ? [ex.primaryMuscleGroup] : [])
    for (const sg of sgs) {
      if (!map.has(sg)) {
        const colonIdx = sg.indexOf(':')
        const primaryGroup = colonIdx !== -1 ? sg.slice(0, colonIdx).trim() : ex.primaryMuscleGroup
        map.set(sg, { subgroup: sg, primaryGroup, sets: 0 })
      }
    }
  }

  const recent = workingSetsOnly(sets).filter(s => s.timestamp >= cutoff)
  for (const s of recent) {
    const ex = exercises.get(s.exerciseId)
    if (!ex) continue
    const sgs = ex.subgroups && ex.subgroups.length > 0
      ? ex.subgroups
      : (ex.primaryMuscleGroup ? [ex.primaryMuscleGroup] : [])
    for (const sg of sgs) {
      const entry = map.get(sg)
      if (entry) {
        entry.sets += 1
      } else {
        const colonIdx = sg.indexOf(':')
        const primaryGroup = colonIdx !== -1 ? sg.slice(0, colonIdx).trim() : ex.primaryMuscleGroup
        map.set(sg, { subgroup: sg, primaryGroup, sets: 1 })
      }
    }
  }

  return [...map.values()].sort((a, b) => b.sets - a.sets || a.subgroup.localeCompare(b.subgroup))
}
