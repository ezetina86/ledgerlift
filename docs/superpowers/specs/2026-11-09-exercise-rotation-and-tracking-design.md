# Exercise Rotation, Smart Substitutes & Enhanced Tracking — Design Spec

**Date:** 2026-11-09  
**Branch:** `feature/exercise-rotation-and-tracking`  
**Status:** Draft for Review

---

## 1. Problem Statement & Goals

After running the same 4-day Upper/Lower split for many weeks, workouts become monotonous and progression stalls on repetitive movements. A deep audit of the LedgerLift codebase and `Nippard Exercise Catalog.xlsx` alongside inspiration from [`DuarteSantos8/openGym`](https://github.com/DuarteSantos8/openGym) revealed four core opportunities:

1. **Data Integrity & Untapped Catalog Metadata**:
   - Five exercise IDs in `DEFAULT_ROUTINES` (`cable-row-neutral-grip`, `weighted-pull-up`, `dumbbell-shoulder-press`, `hip-thrust`, `leg-press`) do not match the canonical IDs in `frontend/src/data/exercises.json`, causing dead `SWAP` buttons during workouts, raw slug display, and volume misattributed to `"Other"`.
   - `Nippard Exercise Catalog.xlsx` contains **36 anatomical Muscle Subgroups** across columns `K–AT` (linked to the `MuscleGroups` sheet) that `scripts/parse_catalog.py` currently ignores.
   - `DEFAULT_ROUTINES` repeats `chest-supported-t-bar-row` (Upper A & B) and `romanian-deadlift` (Lower A & B) twice per week and provides no pre-configured backup exercises (`backupExerciseIds`).
2. **Science-Based Exercise Rotation**:
   - Provide structured variation at mesocycle boundaries and on-demand without losing historical progression: rank replacement exercises by **biomechanical movement family**, **muscle subgroup overlap**, **Nippard Tier (`S+`/`S`/`A`)**, and **freshness** (not performed in the last 30 days / not duplicated in another routine).
   - Provide an interactive **"Rotate Exercises" Wizard** in `PlanPage.tsx` (and inside the **New Mesocycle** flow) plus **1-tap Slot Backups** in `ExerciseBlock.tsx`.
3. **Smarter Overload, Set Variety & Auto Rest Timer**:
   - Upgrade `suggestNext()` in `overload.ts` from single-rep-only RPE rules to **Rep-Range Double Progression** (respecting `defaultReps`, e.g., climbing `8 → 12` before adding `+2.5 kg` and resetting to `8`) with stall detection (`consecutiveHighRpe >= 2`) and **Estimated 1RM** (`est1RM`).
   - Add 1-tap **Set Type tags** (`work` | `warmup` | `drop` | `fail`) in `SetSheet.tsx` so warmup sets do not inflate working set counts or fatigue signals, and final sets can be logged as drop sets or failure/AMRAP sets.
   - Add a non-blocking **Smart Auto Rest Timer Pill** in the sticky header of `WorkoutPage.tsx` (`2:30` for compounds, `1:30` for isolations; skipped on warmup sets) with `+30s` and `✕` controls.
4. **Subgroup Coverage & Freshness Visibility**:
   - Surface 7-day **Muscle Subgroup Coverage** on `ProgressPage.tsx` (highlighting hit vs. neglected heads) and display `subgroups`, `movementFamily`, and `FRESH` badges in `CatalogPage.tsx` and `ExercisePickerSheet.tsx`.

---

## 2. Data Model & Schema Changes

### 2.1 Exercise Catalog (`scripts/parse_catalog.py` → `frontend/src/data/exercises.json`)

Update `scripts/parse_catalog.py` to parse the `MuscleGroups` sheet (rows `3..38`) and boolean columns `K..AT` (`cols 11..46`) of `Muscle Group Exercises`, plus classify each exercise into one of 18 deterministic `MovementFamily` values:

```ts
export type MovementFamily =
  | 'horizontal-press'
  | 'incline-press'
  | 'vertical-press'
  | 'vertical-pull'
  | 'horizontal-row'
  | 'pullover'
  | 'face-pull'
  | 'squat'
  | 'leg-press'
  | 'lunge'
  | 'hip-hinge'
  | 'hip-thrust'
  | 'leg-curl'
  | 'leg-extension'
  | 'curl-lengthened'
  | 'curl-shortened'
  | 'triceps-overhead'
  | 'triceps-pressdown'
  | 'lateral-raise'
  | 'calf'
  | 'core'
  | 'adductor-abductor'
  | 'shrug-neck'
  | 'forearm'
  | 'other'

export interface Exercise {
  id: string
  name: string
  primaryMuscleGroup: string
  subgroups: string[]          // e.g. ["Chest: Upper", "Chest: Middle", "Chest: Lower"]
  movementFamily: MovementFamily
  equipment: string
  nippardTierList: boolean
  tierListGrade: string | null
  muscleLadder: boolean
  jeffSubgroupFav: boolean
  demonstrationLink: string | null
}
```

### 2.2 Routine & Set Models (`frontend/src/db/index.ts`, `backend/models.go`, `backend/db.go`)

```ts
export type SetType = 'work' | 'warmup' | 'drop' | 'fail'

export interface RoutineExercise {
  exerciseId: string
  order: number
  defaultSets: number
  defaultReps: string          // e.g. "8-12"
  backupExerciseIds?: string[] // up to 2 curated backup exercise IDs for 1-tap switching
}

export interface SetLog {
  id: string
  sessionId: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  reps: number
  weightKg: number
  rpe: number | null           // 1–10
  setType?: SetType            // default 'work' when omitted
  volume: number               // reps * weightKg
  timestamp: number
  updatedAt: number
}
```

- **Canonical `DEFAULT_ROUTINES` & Legacy ID Map**:
  ```ts
  export const LEGACY_EXERCISE_ID_MAP: Record<string, string> = {
    'cable-row-neutral-grip': 'neutral-grip-cable-row',
    'weighted-pull-up': 'wide-grip-pull-up',
    'dumbbell-shoulder-press': 'seated-dumbbell-overhead-press',
    'hip-thrust': 'barbell-hip-thrust',
    'leg-press': 'machine-leg-press-45-degree',
  }
  ```
- **Dexie Schema `version(6)` Upgrade (`frontend/src/db/index.ts`)**:
  1. Upsert all 154 exercises from `exercises.json` via `tx.table('exercises').bulkPut(exercises)` so existing installations receive `subgroups` and `movementFamily`.
  2. Rewrite any occurrence of the 5 legacy IDs in `routines` (`exercises[].exerciseId`), `sets` (`exerciseId` + `exerciseName`), `sessions` (`swaps` keys/values and `extraExercises`), and `exerciseSwaps` (`removedExerciseId`, `addedExerciseId`), stamping `updatedAt = Date.now()` on modified records.
  3. Populate default `backupExerciseIds` on existing routine slots that do not yet have `backupExerciseIds`.
- **Go Backend (`backend/models.go`, `backend/db.go`)**:
  - Add `BackupExerciseIDs []string` (`json:"backupExerciseIds,omitempty"`) to `RoutineExercise` (stored inside `routines.exercises` JSON text—no table change needed).
  - Add `SetType string` (`json:"setType,omitempty"`) to `SetLog` and add an idempotent migration in `runMigrations(db)` adding `set_type TEXT NOT NULL DEFAULT 'work'` to `sets`.

---

## 3. Component & Engine Architecture

### 3.1 Smart Exercise Rotation Engine (`frontend/src/lib/rotation.ts`)

Pure module with zero UI or IndexedDB side effects:

- **`isCompoundMovement(family: MovementFamily): boolean`**:
  Returns `true` for multi-joint families (`horizontal-press`, `incline-press`, `vertical-press`, `vertical-pull`, `horizontal-row`, `squat`, `leg-press`, `lunge`, `hip-hinge`, `hip-thrust`). Used by both rotation prioritization and the Auto Rest Timer (`150s` vs `90s`).
- **`rankSubstitutes(target: Exercise, catalog: Exercise[], opts: { assignedIds: Set<string>; recentExerciseIds: Set<string>; fatiguedIds: Set<string> }): RankedSubstitute[]`**:
  Filters out `target.id` and scores candidates in the same `primaryMuscleGroup` (or sharing `movementFamily`):
  - Same `movementFamily`: `+100`
  - Subgroup Jaccard similarity (`|A ∩ B| / |A ∪ B|`): up to `+60`
  - Tier grade bonus: `5 - S+` (`+40`), `4 - S` (`+30`), `3 - A` (`+20`), `2 - B` (`+10`)
  - `jeffSubgroupFav`: `+15`; `muscleLadder`: `+10`
  - Freshness bonus (`!recentExerciseIds.has(cand.id)`): `+25` (tagged `isFresh: true`)
  - Duplicate penalty (`assignedIds.has(cand.id)`): `-80`
  - Fatigue penalty (`fatiguedIds.has(cand.id)`): `-50`
  Returns sorted `RankedSubstitute[]` with human-readable `reasons: string[]` (e.g. `['SAME PATTERN', 'TIER S+', 'FRESH']`).
- **`buildRoutineRotationProposal(routines: Routine[], exercises: Map<string, Exercise>, sets: SetLog[], sessions: WorkoutSession[]): RotationProposalItem[]`**:
  Evaluates every slot across all routines and proposes the top non-duplicate substitute, marking `recommended: true` when:
  - The exercise is duplicated across two routines (e.g., `chest-supported-t-bar-row` on Upper B or `romanian-deadlift` on Lower B), OR
  - The exercise has a fatigue signal (`consecutiveHighRpe >= 2`), OR
  - It is an accessory/isolation slot (`order >= 3`) that has been performed in `>= 4` completed sessions without rotation.

### 3.2 UI Updates for Rotation & Backups

1. **`PlanPage.tsx` — Interactive "Rotate Exercises" Sheet**:
   - Adds a **"ROTATE EXERCISES"** button in the Routines section header and a **"Review Exercise Rotations"** toggle in the **New Mesocycle** sheet.
   - Displays each proposed slot swap grouped by routine (`Current → Suggested`, badges `TIER S+`, `FRESH`, `DUPLICATE`, `HIGH RPE`, and a checkbox).
   - Tapping **APPLY SELECTED ROTATIONS** updates each selected `RoutineExercise`, prepends the removed `exerciseId` into `backupExerciseIds` (max 2 unique backups), and records `ExerciseSwap` entries for the active mesocycle.
2. **`ExercisePickerSheet.tsx` — Ranked Recommendations Header**:
   - Accepts optional `sourceExerciseId?: string` and `recentExerciseIds?: string[]`.
   - When `sourceExerciseId` is provided (swap mode) and search is empty, renders a **"RECOMMENDED ROTATIONS"** section at the top with the top 5 ranked substitutes and their badges (`SAME PATTERN`, `TIER S+`, `FRESH`), followed by the full filterable catalog list showing subgroup chips.
3. **`ExerciseBlock.tsx` — 1-Tap Backup Chips**:
   - Accepts `backupExerciseIds?: string[]` and `onQuickSwap?: (newExerciseId: string) => void`.
   - When `setsLogged === 0` and `backupExerciseIds` is non-empty, renders compact 1-tap chips (`ALT: Machine Chest Press`, etc.) so the lifter can switch to a pre-planned backup in a single tap if equipment is busy or they want A/B variety.

### 3.3 Double Progression, Set Types, Est. 1RM & Auto Rest Timer

1. **Rep-Range Double Progression & Est. 1RM (`frontend/src/lib/overload.ts`)**:
   - `parseRepRange(defaultReps?: string): { minReps: number; maxReps: number }` parses `"8-12"` → `{ minReps: 8, maxReps: 12 }` (fallback `{ minReps: 8, maxReps: 12 }`).
   - `workingSetsOnly(sets: SetLog[]): SetLog[]` excludes `s.setType === 'warmup'`.
   - `suggestNext(lastSets: SetLog[], defaultReps?: string): OverloadSuggestion | null`:
     - Filters `lastSets` via `workingSetsOnly`. If empty, returns `null`.
     - If `maxRpe <= 7`: `{ weightKg: last.weightKg + 2.5, reps: range ? range.minReps : last.reps, note: '↑ +2.5 kg (RPE easy)' }`.
     - If `maxRpe === 8`:
       - When `defaultReps` is provided and `last.reps >= range.maxReps`: `{ weightKg: last.weightKg + 2.5, reps: range.minReps, note: '★ Top of rep range hit! ↑ +2.5 kg' }`.
       - Otherwise: `{ weightKg: last.weightKg, reps: last.reps + 1, note: '↑ +1 rep (same weight)' }`.
     - If `maxRpe >= 9`: `{ weightKg: last.weightKg, reps: last.reps, note: '→ Hold. Cue form (RPE high)' }`.
   - `estimate1RM(weightKg: number, reps: number, rpe?: number | null): number`:
     - Uses RPE-adjusted effective reps (`effectiveReps = reps + Math.max(0, 10 - (rpe ?? 8))`, capped at 15) with Epley formula `Math.round(weightKg * (1 + effectiveReps / 30) * 10) / 10` (returns `weightKg` when `reps === 1` and `(rpe ?? 10) >= 10`).
   - `computePRs(sets: SetLog[])`: Ignores warmup sets and includes `bestEst1RM: number` on `ExercisePR`.
   - `subgroupWeeklySets(sets: SetLog[], exercises: Map<string, Exercise>, windowMs?: number): SubgroupStat[]`:
     - Computes 7-day working sets per anatomical subgroup (`Chest: Upper`, `Biceps: Brachialis`, etc.).
2. **Set Type Selector (`SetSheet.tsx` & `ExerciseBlock.tsx`)**:
   - `SetInput` adds `setType?: SetType` (default `'work'`).
   - `SetSheet.tsx` renders 4 compact pills above the Weight/Reps grid: `WORK`, `WARMUP`, `DROP`, `FAIL`.
   - `ExerciseBlock.tsx` counts only non-warmup sets (`sets.filter(s => s.setType !== 'warmup').length`) toward `setsLogged / totalTarget` and renders a badge (`W`, `DROP`, `FAIL`) in the set table.
3. **Smart Auto Rest Timer Pill (`WorkoutPage.tsx`)**:
   - When `ExerciseBlock` logs a new non-warmup set, it triggers `onSetLogged(exercise: Exercise | undefined, setType: SetType)`.
   - `WorkoutPage.tsx` starts a countdown (`150s` if `isCompoundMovement(exercise.movementFamily)`, else `90s`) displayed as a compact pill in the sticky header with `+30s` and `✕` buttons.
4. **Subgroup Coverage & Freshness Badges (`ProgressPage.tsx` & `CatalogPage.tsx`)**:
   - `ProgressPage.tsx` displays `EST 1RM` on PR cards and adds a collapsible/scrollable **Subgroup Coverage (7d)** card showing sets per muscle head and flagging neglected subgroups (`0 sets`).
   - `CatalogPage.tsx` shows subgroup chips, movement family, and a `FRESH` badge on exercises not logged in the last 30 days.

---

## 4. Testing Strategy

- **Unit Tests (Vitest)**:
  - `frontend/src/lib/rotation.test.ts`: Tests `rankSubstitutes`, `isCompoundMovement`, and `buildRoutineRotationProposal` (verifying duplicate detection, S+/S tier preference, subgroup Jaccard scoring, and freshness bonuses).
  - `frontend/src/lib/overload.test.ts`: Tests `suggestNext` with rep-range double progression (climbing `8→12`, jumping `+2.5 kg` and resetting to `8` at top of range), warmup set exclusion in `weeklyVolumeByGroup` / `computePRs` / `detectFatigue`, `estimate1RM`, and `subgroupWeeklySets`.
  - Component tests for `PlanPage` rotation sheet, `WorkoutPage` auto rest timer pill, and `SetSheet` set types.
- **Backend Tests (Go `testing`)**:
  - `backend/db_test.go` & `backend/handlers_test.go`: Verify `set_type` column migration, `SetLog.SetType` and `RoutineExercise.BackupExerciseIDs` round-trip sync.
