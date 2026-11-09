# Exercise Rotation, Smart Substitutes & Enhanced Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate workout monotony and broken catalog references by exporting 36 anatomical muscle subgroups + movement families from the Nippard catalog, adding an openGym-inspired smart rotation engine with 1-tap slot backups and an interactive rotation wizard, and upgrading workout tracking with rep-range double progression, set types (`work`/`warmup`/`drop`/`fail`), estimated 1RM, an auto rest timer header pill, and subgroup coverage analytics.

**Architecture:** We extend the Python catalog exporter (`scripts/parse_catalog.py`) to extract the 36 muscle subgroups (`cols K..AT` of `Nippard Exercise Catalog.xlsx`) and deterministic `movementFamily` tags into `frontend/src/data/exercises.json`. On the frontend, a Dexie `v6` migration repairs the 5 broken exercise IDs in existing routines/sets, seeds curated Nippard S+/S-tier `backupExerciseIds` per slot, and powers a pure rotation engine (`frontend/src/lib/rotation.ts`) plus upgraded progression/analytics helpers (`frontend/src/lib/overload.ts`), while the Go backend (`backend/models.go`, `backend/db.go`) persists `setType` and `backupExerciseIds` across syncs.

**Tech Stack:** React 19, TypeScript, Vite, Vitest 4, Tailwind CSS v4, Dexie.js (IndexedDB), Python 3 (`openpyxl`), Go 1.22+ (`modernc.org/sqlite`).

## Global Constraints

- Always use `bun` for frontend package and test operations (`cd frontend && bun run test`).
- Use `.venv/bin/python scripts/parse_catalog.py` to regenerate `frontend/src/data/exercises.json`.
- All internal weights are stored in **kg**; RPE scale is **1–10**.
- Never commit directly to `master` or `dev`; all commits go on `feature/exercise-rotation-and-tracking`.
- Backend test coverage must remain ≥ 80% (`cd backend && go test ./... -v`).

---

### Task 1: Export 36 Muscle Subgroups, Movement Families & openGym Media/Instructions in Catalog + Dexie v6 Migration

**Files:**
- Modify: `scripts/parse_catalog.py`
- Modify: `frontend/src/data/exercises.json`
- Create: `frontend/public/exercises/still/*.webp` and `frontend/public/exercises/clip/*.mp4`
- Modify: `frontend/src/db/index.ts`
- Test: `frontend/src/lib/split.test.ts`

**Interfaces:**
- Produces:
  - `MovementFamily` union type and updated `Exercise` (`subgroups: string[]`, `movementFamily: MovementFamily`, `imageUrl?: string | null`, `videoUrl?: string | null`, `instructions?: string[]`), `SetType` (`'work' | 'warmup' | 'drop' | 'fail'`), `RoutineExercise` (`backupExerciseIds?: string[]`), `SetLog` (`setType?: SetType`) in `frontend/src/db/index.ts`
  - `LEGACY_EXERCISE_ID_MAP: Record<string, string>` and repaired `DEFAULT_ROUTINES` in `frontend/src/db/index.ts`

- [ ] **Step 1: Write the failing catalog & routine integrity tests in `frontend/src/lib/split.test.ts`**

Append to `frontend/src/lib/split.test.ts`:

```ts
import exercisesData from '../data/exercises.json'
import { DEFAULT_ROUTINES, LEGACY_EXERCISE_ID_MAP, type Exercise } from '../db/index.ts'

describe('Catalog & DEFAULT_ROUTINES integrity', () => {
  const catalogMap = new Map((exercisesData as Exercise[]).map(e => [e.id, e]))

  it('every exercise in exercises.json has subgroups array and movementFamily', () => {
    expect(exercisesData.length).toBe(154)
    for (const ex of exercisesData as Exercise[]) {
      expect(Array.isArray(ex.subgroups)).toBe(true)
      expect(typeof ex.movementFamily).toBe('string')
      expect(ex.movementFamily.length).toBeGreaterThan(0)
    }
    const tbar = catalogMap.get('chest-supported-t-bar-row')
    expect(tbar?.subgroups).toContain('Back: Lats')
    expect(tbar?.movementFamily).toBe('horizontal-row')
    expect(tbar?.imageUrl).toBe('/exercises/still/chest-supported-t-bar-row.webp')
    expect(tbar?.videoUrl).toBe('/exercises/clip/chest-supported-t-bar-row.mp4')
    expect(Array.isArray(tbar?.instructions)).toBe(true)
  })

  it('every exerciseId and backupExerciseId in DEFAULT_ROUTINES exists in exercises.json', () => {
    for (const routine of DEFAULT_ROUTINES) {
      for (const slot of routine.exercises) {
        expect(catalogMap.has(slot.exerciseId), `Missing slot exerciseId: ${slot.exerciseId}`).toBe(true)
        expect(slot.backupExerciseIds?.length).toBeGreaterThanOrEqual(1)
        for (const backupId of slot.backupExerciseIds ?? []) {
          expect(catalogMap.has(backupId), `Missing backupExerciseId: ${backupId}`).toBe(true)
        }
      }
    }
  })

  it('maps all 5 legacy broken exercise IDs to valid catalog IDs', () => {
    expect(Object.keys(LEGACY_EXERCISE_ID_MAP)).toHaveLength(5)
    for (const targetId of Object.values(LEGACY_EXERCISE_ID_MAP)) {
      expect(catalogMap.has(targetId)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test src/lib/split.test.ts`
Expected: FAIL (`LEGACY_EXERCISE_ID_MAP` not exported, `ex.subgroups` undefined, and 5 missing IDs in `DEFAULT_ROUTINES`).

- [ ] **Step 3: Update `scripts/parse_catalog.py`, regenerate `exercises.json`, and update `frontend/src/db/index.ts`**

Replace `scripts/parse_catalog.py` with:

```python
#!/usr/bin/env python3
"""
parse_catalog.py
Converts Nippard Exercise Catalog.xlsx → frontend/src/data/exercises.json
Run with: .venv/bin/python scripts/parse_catalog.py
"""

import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not found. Run: uv pip install openpyxl --python .venv/bin/python")
    sys.exit(1)

XLSX_PATH = Path(__file__).parent.parent / "Nippard Exercise Catalog.xlsx"
OUT_PATH = Path(__file__).parent.parent / "frontend" / "src" / "data" / "exercises.json"
PUBLIC_EX_DIR = Path(__file__).parent.parent / "frontend" / "public" / "exercises"
OPENGYM_ROOT = Path("/Users/Enrique_Zetina/.gemini/antigravity-cli/brain/9fa08630-d116-43f2-bfd6-2aa2011ed43f/scratch/openGym/catalogue")


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text


def parse_grade(raw) -> str | None:
    if not raw or raw is False:
        return None
    s = str(raw).strip()
    return s if s else None


def classify_movement_family(name: str, group: str) -> str:
    n = name.lower()
    g = group.lower()

    if g in ("adductors", "abductors") or "adduction" in n or "abduction" in n:
        return "adductor-abductor"
    if g == "calves" or "calf" in n:
        return "calf"
    if g == "core" or "plank" in n or "crunch" in n or "sit-up" in n or "leg raise" in n:
        return "core"
    if g in ("forarm", "forearm") or "wrist" in n:
        return "forearm"
    if g == "neck" or "shrug" in n or "neck" in n:
        return "shrug-neck"

    if g == "chest":
        if "fly" in n or "crossover" in n or "pec deck" in n or "press-around" in n:
            return "chest-fly"
        if "incline" in n:
            return "incline-press"
        return "horizontal-press"

    if g == "back":
        if "face-pull" in n or "face pull" in n:
            return "face-pull"
        if "pull-over" in n or "pull-in" in n or "pull-around" in n:
            return "pullover"
        if "pull-up" in n or "pull-down" in n or "chin-up" in n:
            return "vertical-pull"
        return "horizontal-row"

    if g == "shoulder":
        if "press" in n:
            return "vertical-press"
        if "reverse" in n or "facepull" in n or "pull-apart" in n or "rear" in n:
            return "face-pull"
        return "lateral-raise"

    if g == "biceps":
        if "bayesian" in n or "incline" in n or "lying" in n or "behind" in n:
            return "curl-lengthened"
        return "curl-shortened"

    if g == "triceps":
        if "overhead" in n or "katana" in n or "french" in n:
            return "triceps-overhead"
        return "triceps-pressdown"

    if g == "quad":
        if "extension" in n or "reverse nordic" in n or "sissy" in n:
            return "leg-extension"
        if "leg press" in n:
            return "leg-press"
        if "split squat" in n or "lunge" in n:
            return "lunge"
        return "squat"

    if g == "hamstring":
        if "curl" in n or "glut-ham" in n:
            return "leg-curl"
        return "hip-hinge"

    if g == "glute":
        if "thrust" in n or "bridge" in n:
            return "hip-thrust"
        if "lunge" in n or "step up" in n or "split" in n:
            return "lunge"
        if "deadlift" in n or "extension" in n or "pull through" in n:
            return "hip-hinge"
        return "adductor-abductor"

    return "other"


def load_subgroup_columns(wb) -> dict[int, str]:
    ws_mg = wb["MuscleGroups"]
    row_to_label: dict[int, str] = {}
    for r in range(3, 39):
        primary = ws_mg.cell(r, 1).value
        sub = ws_mg.cell(r, 2).value
        if not primary:
            continue
        p_clean = "Forearm" if str(primary).strip() == "Forarm" else str(primary).strip()
        if sub and str(sub).strip():
            row_to_label[r] = f"{p_clean}: {str(sub).strip()}"
        else:
            row_to_label[r] = p_clean

    ws_ex = wb["Muscle Group Exercises"]
    col_to_label: dict[int, str] = {}
    for c in range(11, 47):
        ref = ws_ex.cell(1, c).value
        if ref is not None:
            ref_row = int(float(ref))
            if ref_row in row_to_label:
                col_to_label[c] = row_to_label[ref_row]
    return col_to_label


def main():
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["Muscle Group Exercises"]
    col_to_subgroup = load_subgroup_columns(wb)

    exercises = []
    seen_ids: set[str] = set()

    for r in range(3, ws.max_row + 1):
        name = ws.cell(r, 1).value
        if not name:
            continue

        primary_group = ws.cell(r, 2).value or "Unknown"
        equipment = ws.cell(r, 3).value or "Bodyweight"
        nippard_tier = bool(ws.cell(r, 5).value)
        tier_grade = parse_grade(ws.cell(r, 6).value)
        muscle_ladder = bool(ws.cell(r, 7).value)
        jeff_fav = bool(ws.cell(r, 8).value)
        demo_link = ws.cell(r, 10).value if ws.cell(r, 10).value else None

        subgroups = [
            label
            for col_idx, label in col_to_subgroup.items()
            if ws.cell(r, col_idx).value is True
        ]
        if not subgroups and primary_group != "Unknown":
            subgroups = ["Forearm" if primary_group == "Forarm" else primary_group]

        movement_family = classify_movement_family(name, primary_group)

        base_id = slugify(name)
        uid = base_id
        counter = 2
        while uid in seen_ids:
            uid = f"{base_id}-{counter}"
            counter += 1
        seen_ids.add(uid)

        exercises.append({
            "id": uid,
            "name": name,
            "primaryMuscleGroup": primary_group,
            "subgroups": subgroups,
            "movementFamily": movement_family,
            "equipment": equipment,
            "nippardTierList": nippard_tier,
            "tierListGrade": tier_grade,
            "muscleLadder": muscle_ladder,
            "jeffSubgroupFav": jeff_fav,
            "demonstrationLink": demo_link,
        })

    exercises.sort(key=lambda e: (e["primaryMuscleGroup"], e["name"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(exercises, indent=2, ensure_ascii=False))
    print(f"Exported {len(exercises)} exercises with subgroups & movement families to {OUT_PATH}")


if __name__ == "__main__":
    main()
```

Update `frontend/src/db/index.ts` to add `MovementFamily`, `SetType`, `subgroups`, `movementFamily`, `backupExerciseIds`, `LEGACY_EXERCISE_ID_MAP`, repaired `DEFAULT_ROUTINES` with curated backups, and `this.version(6)` migration.

- [ ] **Step 4: Run catalog export and test to verify it passes**

Run: `.venv/bin/python scripts/parse_catalog.py && cd frontend && bun run test src/lib/split.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/parse_catalog.py frontend/src/data/exercises.json frontend/src/db/index.ts frontend/src/lib/split.test.ts
git commit -m "feat(catalog): export 36 muscle subgroups and movement families, repair 5 routine IDs in Dexie v6"
```

---

### Task 2: Smart Exercise Rotation Engine (`frontend/src/lib/rotation.ts`)

**Files:**
- Create: `frontend/src/lib/rotation.ts`
- Test: `frontend/src/lib/rotation.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `MovementFamily`, `Routine`, `SetLog`, `WorkoutSession` from `frontend/src/db/index.ts`; `detectFatigue` from `frontend/src/lib/overload.ts`
- Produces:
  - `isCompoundMovement(family?: MovementFamily | string): boolean`
  - `RankedSubstitute`: `{ exercise: Exercise; score: number; isFresh: boolean; reasons: string[] }`
  - `rankSubstitutes(target: Exercise, catalog: Exercise[], opts?: { assignedIds?: Set<string>; recentExerciseIds?: Set<string>; fatiguedIds?: Set<string> }): RankedSubstitute[]`
  - `RotationProposalItem`: `{ routineId: string; routineName: string; order: number; currentExerciseId: string; currentExerciseName: string; suggestedExercise: Exercise; reasons: string[]; recommended: boolean; trigger: 'duplicate' | 'fatigued' | 'stale' | 'optional' }`
  - `buildRoutineRotationProposal(routines: Routine[], exercises: Map<string, Exercise>, sets: SetLog[], sessions: WorkoutSession[]): RotationProposalItem[]`

- [ ] **Step 1: Write the failing test in `frontend/src/lib/rotation.test.ts`**

Create `frontend/src/lib/rotation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isCompoundMovement, rankSubstitutes, buildRoutineRotationProposal } from './rotation.ts'
import exercisesData from '../data/exercises.json'
import { DEFAULT_ROUTINES, type Exercise, type Routine, type SetLog, type WorkoutSession } from '../db/index.ts'

const catalog = exercisesData as Exercise[]
const exMap = new Map(catalog.map(e => [e.id, e]))

describe('isCompoundMovement', () => {
  it('returns true for compound movement families and false for isolations', () => {
    expect(isCompoundMovement('horizontal-press')).toBe(true)
    expect(isCompoundMovement('squat')).toBe(true)
    expect(isCompoundMovement('hip-hinge')).toBe(true)
    expect(isCompoundMovement('curl-lengthened')).toBe(false)
    expect(isCompoundMovement('lateral-raise')).toBe(false)
    expect(isCompoundMovement('triceps-overhead')).toBe(false)
  })
})

describe('rankSubstitutes', () => {
  it('ranks same movementFamily + high Nippard tier + shared subgroups highest', () => {
    const target = exMap.get('bench-press')!
    const ranked = rankSubstitutes(target, catalog, {
      assignedIds: new Set(['bench-press', 'incline-dumbbell-press']),
      recentExerciseIds: new Set(['bench-press']),
    })

    expect(ranked.length).toBeGreaterThan(5)
    expect(ranked[0].exercise.id).toBe('machine-chest-press')
    expect(ranked[0].reasons).toContain('SAME PATTERN')
    expect(ranked[0].reasons).toContain('TIER S+')
    expect(ranked[0].isFresh).toBe(true)
  })

  it('penalizes exercises already assigned to a routine', () => {
    const target = exMap.get('chest-supported-t-bar-row')!
    const withoutAssigned = rankSubstitutes(target, catalog)
    const topId = withoutAssigned[0].exercise.id

    const withAssigned = rankSubstitutes(target, catalog, {
      assignedIds: new Set([topId]),
    })
    expect(withAssigned[0].exercise.id).not.toBe(topId)
  })
})

describe('buildRoutineRotationProposal', () => {
  it('flags duplicate exercises across A/B routines as recommended rotations', () => {
    const routines: Routine[] = DEFAULT_ROUTINES.map(r => ({
      ...r,
      createdAt: 1000,
      updatedAt: 1000,
    }))
    const proposals = buildRoutineRotationProposal(routines, exMap, [], [])
    expect(proposals.length).toBe(24)

    const upperBDup = proposals.find(
      p => p.routineId === 'upper-b' && p.currentExerciseId === 'chest-supported-t-bar-row'
    )
    expect(upperBDup).toBeDefined()
    expect(upperBDup?.trigger).toBe('duplicate')
    expect(upperBDup?.recommended).toBe(true)
    expect(upperBDup?.suggestedExercise.id).not.toBe('chest-supported-t-bar-row')
  })

  it('flags fatigued exercises (2+ consecutive RPE >= 9 sessions) as recommended', () => {
    const routines: Routine[] = DEFAULT_ROUTINES.map(r => ({
      ...r,
      createdAt: 1000,
      updatedAt: 1000,
    }))
    const sessions: WorkoutSession[] = [
      { id: 's1', routineId: 'upper-a', routineName: 'Upper A', splitDay: 'upperA', startedAt: 1000, completedAt: 2000, notes: '', mesocycleId: null, isDeload: false, updatedAt: 2000 },
      { id: 's2', routineId: 'upper-a', routineName: 'Upper A', splitDay: 'upperA', startedAt: 3000, completedAt: 4000, notes: '', mesocycleId: null, isDeload: false, updatedAt: 4000 },
    ]
    const sets: SetLog[] = [
      { id: 'st1', sessionId: 's1', exerciseId: 'bench-press', exerciseName: 'Bench Press', setNumber: 1, reps: 6, weightKg: 100, rpe: 9.5, volume: 600, timestamp: 1500, updatedAt: 1500 },
      { id: 'st2', sessionId: 's2', exerciseId: 'bench-press', exerciseName: 'Bench Press', setNumber: 1, reps: 6, weightKg: 100, rpe: 9.5, volume: 600, timestamp: 3500, updatedAt: 3500 },
    ]

    const proposals = buildRoutineRotationProposal(routines, exMap, sets, sessions)
    const benchProp = proposals.find(p => p.routineId === 'upper-a' && p.currentExerciseId === 'bench-press')
    expect(benchProp?.trigger).toBe('fatigued')
    expect(benchProp?.recommended).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test src/lib/rotation.test.ts`
Expected: FAIL (`Cannot find module './rotation.ts'`)

- [ ] **Step 3: Implement `frontend/src/lib/rotation.ts`**

Create `frontend/src/lib/rotation.ts`:

```ts
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

    const sgOverlap = jaccardSimilarity(target.subgroups ?? [], cand.subgroups ?? [])
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run test src/lib/rotation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/rotation.ts frontend/src/lib/rotation.test.ts
git commit -m "feat(rotation): add openGym-inspired movement family substitute ranking and rotation proposal engine"
```

---

### Task 3: Double Progression, Set Type Filtering, Est. 1RM & Subgroup Coverage (`frontend/src/lib/overload.ts`)

**Files:**
- Modify: `frontend/src/lib/overload.ts`
- Modify: `frontend/src/lib/overload.test.ts`

**Interfaces:**
- Consumes: `SetLog`, `Exercise`, `WorkoutSession` from `frontend/src/db/index.ts`
- Produces:
  - `parseRepRange(defaultReps?: string): { minReps: number; maxReps: number } | null`
  - `suggestNext(lastSets: SetLog[], defaultReps?: string): OverloadSuggestion | null`
  - `estimate1RM(weightKg: number, reps: number, rpe?: number | null): number`
  - `ExercisePR` extended with `bestEst1RM: number`
  - `SubgroupStat`: `{ subgroup: string; primaryGroup: string; sets: number }`
  - `subgroupWeeklySets(sets: SetLog[], exercises: Map<string, Exercise>, windowMs?: number): SubgroupStat[]`

- [ ] **Step 1: Write the failing tests in `frontend/src/lib/overload.test.ts`**

Append to `frontend/src/lib/overload.test.ts`:

```ts
import {
  parseRepRange, estimate1RM, subgroupWeeklySets,
} from './overload.ts'

describe('suggestNext double progression & warmup filtering', () => {
  it('ignores warmup sets when computing suggestion', () => {
    const sets = [
      makeSet({ id: 'w1', weightKg: 40, reps: 10, rpe: 6, setType: 'warmup' }),
      makeSet({ id: 's1', weightKg: 80, reps: 8, rpe: 8, setType: 'work' }),
    ]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(80)
    expect(res?.reps).toBe(9)
  })

  it('returns null when all sets are warmup sets', () => {
    expect(suggestNext([makeSet({ setType: 'warmup' })], '8-12')).toBeNull()
  })

  it('bumps weight +2.5 kg and resets reps to minReps when RPE 8 hits top of rep range', () => {
    const sets = [makeSet({ weightKg: 80, reps: 12, rpe: 8 })]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(82.5)
    expect(res?.reps).toBe(8)
    expect(res?.note).toContain('Top of 8-12')
  })

  it('resets reps to minReps when RPE <= 7 and rep range is provided', () => {
    const sets = [makeSet({ weightKg: 80, reps: 11, rpe: 7 })]
    const res = suggestNext(sets, '8-12')
    expect(res?.weightKg).toBe(82.5)
    expect(res?.reps).toBe(8)
  })
})

describe('parseRepRange & estimate1RM', () => {
  it('parses standard rep range strings', () => {
    expect(parseRepRange('8-12')).toEqual({ minReps: 8, maxReps: 12 })
    expect(parseRepRange('6-8')).toEqual({ minReps: 6, maxReps: 8 })
    expect(parseRepRange(undefined)).toBeNull()
  })

  it('calculates Epley RPE-adjusted 1RM', () => {
    // 100kg x 5 @ RPE 10 -> 0 RIR -> 100 * (1 + 5/30) = 116.7
    expect(estimate1RM(100, 5, 10)).toBeCloseTo(116.7, 1)
    // 100kg x 5 @ RPE 8 -> 2 RIR -> 7 effective reps -> 100 * (1 + 7/30) = 123.3
    expect(estimate1RM(100, 5, 8)).toBeCloseTo(123.3, 1)
  })

  it('includes bestEst1RM in computePRs and skips warmup sets', () => {
    const sets = [
      makeSet({ id: 'w1', weightKg: 120, reps: 1, rpe: 6, setType: 'warmup' }),
      makeSet({ id: 's1', weightKg: 100, reps: 5, rpe: 10, setType: 'work' }),
    ]
    const prs = computePRs(sets)
    expect(prs).toHaveLength(1)
    expect(prs[0].bestWeightKg).toBe(100)
    expect(prs[0].bestEst1RM).toBeCloseTo(116.7, 1)
  })
})

describe('subgroupWeeklySets', () => {
  it('aggregates 7-day working sets across anatomical subgroups', () => {
    const now = Date.now()
    const exMap = new Map<string, Exercise>([
      ['ex-1', makeExercise({ id: 'ex-1', primaryMuscleGroup: 'Chest', subgroups: ['Chest: Upper', 'Chest: Middle'] })],
    ])
    const sets = [
      makeSet({ id: 's1', exerciseId: 'ex-1', timestamp: now - 1000, setType: 'work' }),
      makeSet({ id: 's2', exerciseId: 'ex-1', timestamp: now - 500, setType: 'drop' }),
      makeSet({ id: 'w1', exerciseId: 'ex-1', timestamp: now - 200, setType: 'warmup' }),
    ]
    const stats = subgroupWeeklySets(sets, exMap)
    const upper = stats.find(s => s.subgroup === 'Chest: Upper')
    expect(upper?.sets).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run test src/lib/overload.test.ts`
Expected: FAIL (`parseRepRange`, `estimate1RM`, `subgroupWeeklySets` not exported)

- [ ] **Step 3: Update `frontend/src/lib/overload.ts`**

Update `frontend/src/lib/overload.ts` to filter out `setType === 'warmup'` across `suggestNext`, `weeklyVolumeByGroup`, `computePRs`, `exerciseProgression`, and `rpeHistory`, and add `parseRepRange`, `estimate1RM`, `bestEst1RM`, and `subgroupWeeklySets`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run test src/lib/overload.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/overload.ts frontend/src/lib/overload.test.ts
git commit -m "feat(overload): add rep-range double progression, warmup set filtering, est 1RM, and subgroup set tracking"
```

---

### Task 4: Backend Support for `SetType` and `BackupExerciseIDs` (`backend/`)

**Files:**
- Modify: `backend/models.go`
- Modify: `backend/db.go`
- Modify: `backend/db_test.go`

**Interfaces:**
- Produces:
  - `RoutineExercise.BackupExerciseIDs []string` (`json:"backupExerciseIds,omitempty"`)
  - `SetLog.SetType string` (`json:"setType,omitempty"`)
  - `sets.set_type TEXT NOT NULL DEFAULT 'work'` column + migration in `backend/db.go`

- [ ] **Step 1: Write the failing Go test in `backend/db_test.go`**

Append to `backend/db_test.go`:

```go
func TestUpsertSetAndRoutine_SetTypeAndBackups(t *testing.T) {
	db := testDB(t)

	r := Routine{
		ID: "upper-a", Name: "Upper A", SplitDay: "upperA",
		Exercises: []RoutineExercise{
			{
				ExerciseID:        "bench-press",
				Order:             1,
				DefaultSets:       3,
				DefaultReps:       "6-8",
				BackupExerciseIDs: []string{"machine-chest-press", "flat-dumbbell-press"},
			},
		},
		CreatedAt: 1000, UpdatedAt: 1000,
	}
	if err := upsertRoutine(db, r, 1000); err != nil {
		t.Fatalf("upsertRoutine: %v", err)
	}

	sess := WorkoutSession{
		ID: "sess-1", RoutineID: "upper-a", RoutineName: "Upper A",
		SplitDay: "upperA", StartedAt: 1000, UpdatedAt: 1000,
	}
	if err := upsertSession(db, sess, 1000); err != nil {
		t.Fatalf("upsertSession: %v", err)
	}

	s := SetLog{
		ID: "set-1", SessionID: "sess-1", ExerciseID: "bench-press",
		ExerciseName: "Bench Press", SetNumber: 1, Reps: 8, WeightKg: 80,
		SetType: "drop", Volume: 640, Timestamp: 1000, UpdatedAt: 1000,
	}
	if err := upsertSet(db, s, 1000); err != nil {
		t.Fatalf("upsertSet: %v", err)
	}

	routines, err := fetchRoutinesSince(db, 0)
	if err != nil || len(routines) != 1 {
		t.Fatalf("fetchRoutinesSince: %v", err)
	}
	if len(routines[0].Exercises[0].BackupExerciseIDs) != 2 {
		t.Errorf("expected 2 backupExerciseIds, got %v", routines[0].Exercises[0].BackupExerciseIDs)
	}

	sets, err := fetchSetsSince(db, 0)
	if err != nil || len(sets) != 1 {
		t.Fatalf("fetchSetsSince: %v", err)
	}
	if sets[0].SetType != "drop" {
		t.Errorf("expected setType 'drop', got %q", sets[0].SetType)
	}
}
```

- [ ] **Step 2: Run Go test to verify it fails**

Run: `cd backend && go test ./... -run TestUpsertSetAndRoutine_SetTypeAndBackups -v`
Expected: FAIL (`unknown field BackupExerciseIDs`, `unknown field SetType`)

- [ ] **Step 3: Update `backend/models.go` and `backend/db.go`**

In `backend/models.go`, add `BackupExerciseIDs []string` to `RoutineExercise` and `SetType string` to `SetLog`.
In `backend/db.go`:
- Add `set_type TEXT NOT NULL DEFAULT 'work'` to `CREATE TABLE IF NOT EXISTS sets`
- Add idempotent migration in `runMigrations` checking `!columnExists(db, "sets", "set_type")`
- Update `upsertSet` and `fetchSetsSince` to read/write `set_type` (defaulting empty `s.SetType` to `"work"`).

- [ ] **Step 4: Run Go test suite to verify it passes**

Run: `cd backend && go test ./... -v`
Expected: PASS (all backend tests pass)

- [ ] **Step 5: Commit**

```bash
git add backend/models.go backend/db.go backend/db_test.go
git commit -m "feat(backend): persist setType on sets and backupExerciseIds on routine slots"
```

---

### Task 5: Smart Swap Picker, Interactive Rotation Wizard & 1-Tap Workout Backups (`ExercisePickerSheet.tsx`, `PlanPage.tsx`, `ExerciseBlock.tsx`, `SetSheet.tsx`, `WorkoutPage.tsx`)

**Files:**
- Modify: `frontend/src/components/ExercisePickerSheet.tsx`
- Modify: `frontend/src/components/SetSheet.tsx`
- Modify: `frontend/src/components/ExerciseBlock.tsx`
- Modify: `frontend/src/pages/WorkoutPage.tsx`
- Modify: `frontend/src/pages/PlanPage.tsx`
- Modify: `frontend/src/pages/ProgressPage.tsx`
- Modify: `frontend/src/pages/CatalogPage.tsx`

**Interfaces:**
- Consumes: `rankSubstitutes`, `buildRoutineRotationProposal`, `isCompoundMovement` from `frontend/src/lib/rotation.ts`; `suggestNext`, `subgroupWeeklySets`, `computePRs` from `frontend/src/lib/overload.ts`
- Produces:
  - Ranked "Recommended Rotations" section + `FRESH` & subgroup chips in `ExercisePickerSheet.tsx`
  - Interactive "ROTATE EXERCISES" wizard sheet in `PlanPage.tsx` (both standalone button and inside New Mesocycle flow)
  - 1-tap `backupExerciseIds` chips + `defaultReps`-aware `suggestNext` + set type badges in `ExerciseBlock.tsx`
  - 4-option Set Type selector (`WORK`, `WARMUP`, `DROP`, `FAIL`) in `SetSheet.tsx`
  - Non-blocking Auto Rest Timer Pill (`2:30` compound / `1:30` isolation, `+30s`, `✕`) in `WorkoutPage.tsx`
  - `EST 1RM` display + 7-day Subgroup Coverage panel in `ProgressPage.tsx`, and `FRESH` + Subgroup chips in `CatalogPage.tsx`

- [ ] **Step 1: Write UI tests for Set Types, Rotation Wizard, and Subgroup Coverage**

Add tests in `frontend/src/pages/ProgressPage.test.tsx` and `frontend/src/pages/PlanPage.C25K.test.tsx` verifying the rotation button/wizard and subgroup coverage rendering.

- [ ] **Step 2: Run frontend tests to verify new assertions fail**

Run: `cd frontend && bun run test`
Expected: FAIL on the new UI test assertions.

- [ ] **Step 3: Implement the UI enhancements across `ExercisePickerSheet.tsx`, `SetSheet.tsx`, `ExerciseBlock.tsx`, `WorkoutPage.tsx`, `PlanPage.tsx`, `ProgressPage.tsx`, and `CatalogPage.tsx`**

- Update `ExercisePickerSheet.tsx` to accept optional `sourceExerciseId?: string` and render the top 5 `rankSubstitutes` matches under `"RECOMMENDED ROTATIONS"` when swapping, plus show `.webp` exercise thumbnails (`ex.imageUrl`).
- Update `SetSheet.tsx` to include `setType?: SetType` (`'work' | 'warmup' | 'drop' | 'fail'`) with 1-tap pills defaulting to `'work'`.
- Update `ExerciseBlock.tsx` to display the exercise `.webp` thumbnail (`exercise?.imageUrl`, tappable to open an inline demo modal with the looping `.mp4` video `exercise?.videoUrl` and `exercise?.instructions`), pass `defaultReps` into `suggestNext(lastSets, defaultReps)`, exclude warmup sets from `setsLogged`, render 1-tap backup chips when `setsLogged === 0`, and call `onSetLogged?.(exercise, setType)` when adding a set.
- Update `WorkoutPage.tsx` to start the Auto Rest Timer Pill in the sticky header when a non-warmup set is logged (`150s` for compound movements, `90s` for isolations) with `+30s` and `✕` controls, and support 1-tap backup swapping.
- Update `PlanPage.tsx` to show `.webp` exercise thumbnails on `RoutineCard` rows and add the **"ROTATE EXERCISES"** button and interactive Rotation Wizard sheet (showing `buildRoutineRotationProposal` items with thumbnails and checkboxes, applying swaps to routines, saving previous exercise IDs into `backupExerciseIds`, and logging `ExerciseSwap` entries).
- Update `ProgressPage.tsx` to show `EST 1RM` on PR cards and a **Subgroup Coverage (7d)** section powered by `subgroupWeeklySets`, and update `CatalogPage.tsx` to display `.webp` thumbnails in the list and the looping `.mp4` video (`selected.videoUrl`), step-by-step `selected.instructions`, `subgroups`, `movementFamily`, and `FRESH` badges in the detail sheet.

- [ ] **Step 4: Run full frontend & backend test suites and production build**

Run: `cd frontend && bun run test && bun run build && cd ../backend && go test ./... -v`
Expected: All frontend tests pass, TypeScript + Vite build succeeds with zero errors, and all Go backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat(ui): add interactive rotation wizard, smart swap recommendations, set types, auto rest timer, and subgroup coverage"
```
