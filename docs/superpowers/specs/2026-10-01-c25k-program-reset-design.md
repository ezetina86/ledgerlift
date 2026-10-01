# C25K Running Program Reset Feature — Design Spec
_Date: 2026-10-01_

## Goal

Add a "Reset Program" capability to the Couch-to-5K (C25K) running tracker in LedgerLift. If a user needs to pause training (e.g., due to injury or a prolonged break) and start over from Week 1 · Day 1, they can reset their active plan progress without losing their previously logged run sessions, stats, or history.

---

## Decisions & Requirements

| Item | Decision | Rationale |
|------|----------|-----------|
| **Trigger Location** | Plan page inside the C25K card block | Fits existing patterns (like Mesocycle management in lifting); keeps the main Home run card uncluttered. |
| **Safety / Confirmation** | Dedicated confirmation dialog | Prevents accidental resets by informing the user that progress resets to Week 1 · Day 1 while history remains intact. |
| **Attempt Tracking** | Dedicated `RunProgram` entity (mirrors lifting `Mesocycle`) | Clean lifecycle (`startedAt`, `endedAt`, `number`), syncable, and future-proof. |
| **Attempt Labeling** | Header badge (e.g. `ATTEMPT 2`) on the Plan page | Visible context of which cycle the user is currently on without cluttering cards in the History tab. |
| **Progress Tab Scope** | Hybrid: Plan completion scoped to active attempt; cumulative stats & trend charts scoped to all-time | Honors previous mileage and duration trends while giving an accurate completion gauge for the current attempt. |
| **History Tab Scope** | All-time completed runs listed chronologically | Full historical log remains intact and unmodified. |
| **In-Progress Run Cleanup** | Discard active in-progress run on reset | Avoids orphan runs belonging to the previous attempt. |

---

## Architecture & Data Model

### 1. Dexie Schema: `RunProgram` (`src/db/index.ts`)

Introduce a new table `runPrograms` in Dexie schema version 5.

```ts
export interface RunProgram {
  id: string
  number: number           // 1-based increment (1, 2, ...)
  startedAt: number        // timestamp when attempt started
  endedAt: number | null   // null = currently active attempt
  updatedAt: number        // sync timestamp
}
```

- Dexie stores index: `'id, startedAt, endedAt, updatedAt'`
- Dexie auto-stamp hook: `updatedAt` hooks identical to `mesocycles` and `runSessions`.

### 2. Auto-Seeding & Migration
- Helper function `getActiveRunProgram(db)`:
  - Finds the first program where `endedAt === null`.
  - If no programs exist in the database:
    - Finds the earliest completed or started run in `runSessions` (or `Date.now()` if empty).
    - Seeds Attempt 1: `{ id: uid(), number: 1, startedAt: earliestTime, endedAt: null, updatedAt: Date.now() }`.
    - Returns this active program.

### 3. Backend SQLite & Sync (`backend/db.go`, `frontend/src/lib/sync.ts`)
- In `backend/db.go`:
  - Create table `run_programs`:
    ```sql
    CREATE TABLE IF NOT EXISTS run_programs (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_run_programs_updated ON run_programs(updated_at);
    ```
  - Add sync handlers for `run_programs` in `UpsertSync` and sync queries.
- In `frontend/src/lib/sync.ts`:
  - Include `runPrograms` in the push/pull payload and Dexie bulk operations.

---

## Calculations & Helpers (`frontend/src/lib/runProgress.ts`)

### Active Program Runs Filter
```ts
export function activeRunSessions(sessions: RunSession[], activeProgram?: RunProgram | null): RunSession[] {
  if (!activeProgram) return sessions
  return sessions.filter(s => s.startedAt >= activeProgram.startedAt)
}
```

### Plan Progress
- `activeCompletedCount`: number of completed runs where `startedAt >= activeProgram.startedAt`.
- `nextPlan`: `nextRunSession(activeCompletedCount)` (Week 1 · Day 1 when count is 0).

### Cumulative Trends & Stats
- `totalRunDurationSec(allSessions)`: uses all completed runs across all attempts.
- `totalRunDistanceKm(allSessions)`: uses all completed runs across all attempts.
- `durationTrend(allSessions)`, `distanceTrend(allSessions)`, `rpeTrend(allSessions)`: use all completed runs.

---

## UI Components & Flow

### 1. Plan Page (`frontend/src/pages/PlanPage.tsx`)
- Inside `C25KBlock`:
  - Render Attempt badge: `ATTEMPT {activeProgram.number}`.
  - Render a secondary button: `RESET`.
  - Clicking `RESET` sets `showResetConfirm(true)`.

### 2. Reset Confirmation Modal
- Rendered when `showResetConfirm === true`.
- Card styled to match `showEndConfirm` in `PlanPage`:
  - Title: **Reset C25K Program?**
  - Explanation: *"This will start your C25K plan over at Week 1 · Day 1 as Attempt {activeProgram.number + 1}. All previous runs will remain safely in your History."*
  - Buttons:
    - **Cancel** (closes modal)
    - **Reset to Week 1** (executes reset)

### 3. Reset Execution Handler
```ts
async function handleResetProgram() {
  const active = await getActiveRunProgram()
  const now = Date.now()
  if (active) {
    await db.runPrograms.update(active.id, { endedAt: now })
  }
  await db.runPrograms.add({
    id: uid(),
    number: (active?.number ?? 1) + 1,
    startedAt: now,
    endedAt: null,
    updatedAt: now,
  })
  // Remove any lingering in-progress run
  const activeRun = await db.runSessions.filter(s => s.completedAt === null).first()
  if (activeRun) {
    await db.runSessions.delete(activeRun.id)
  }
  setShowResetConfirm(false)
}
```

### 4. Home Page (`frontend/src/pages/HomePage.tsx`)
- Subscribes to `activeProgram` via `useLiveQuery`.
- Filters completed runs by `startedAt >= activeProgram.startedAt` to derive `completedRunCount`.
- Next run card updates to `Week 1 · Day 1` immediately when reset.

---

## Verification & Testing

1. **Database & Migration Tests (`frontend/src/db/db.test.ts`)**:
   - Verify `runPrograms` table created in Dexie schema v5.
   - Verify `getActiveRunProgram` auto-seeds Attempt 1 correctly.
2. **Logic Tests (`frontend/src/lib/runProgress.test.ts`)**:
   - Verify `activeRunSessions` filters runs before/after program `startedAt`.
   - Verify plan progress resets to 0 while total distance/duration retains all runs.
3. **Component Tests (`frontend/src/pages/PlanPage.C25K.test.tsx`)**:
   - Verify Attempt badge renders.
   - Verify clicking "RESET" opens confirmation dialog.
   - Verify confirming reset closes the active program, creates Attempt 2, and resets grid dots.
4. **Backend Sync Tests (`backend/db_test.go`, `frontend/src/lib/sync.test.ts`)**:
   - Verify `run_programs` syncing between client and server.
