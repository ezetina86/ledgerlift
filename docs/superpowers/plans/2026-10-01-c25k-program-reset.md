# C25K Running Program Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to reset their C25K running program to Week 1 · Day 1 as a new attempt while preserving all past run history, cumulative stats, and trend data.

**Architecture:** Introduce a `RunProgram` entity in Dexie v5 (and SQLite backend sync) that tracks running program attempts (`startedAt`, `endedAt`, `number`), mirroring the lifting `Mesocycle` pattern. Plan progress (0/27) on the Plan page, Home page, and Progress panel evaluates only runs within the active program attempt, while the History tab and cumulative stats keep all-time run records.

**Tech Stack:** TypeScript, React, Dexie.js (IndexedDB), Vitest, Go, SQLite.

## Global Constraints

- Never delete completed `RunSession` records on reset — user history must remain completely intact.
- Active in-progress runs (`completedAt === null`) must be discarded on reset to prevent orphaned runs.
- If no `RunProgram` exists, Attempt 1 is automatically initialized so existing runs are seamlessly preserved under Attempt 1.
- All tests must pass: `npm test -- --run` in `frontend` and `go test ./...` in `backend`.

---

### Task 1: Database Schema v5 & `RunProgram` Model

**Files:**
- Modify: `frontend/src/db/index.ts`
- Test: `frontend/src/db/db.test.ts`

**Interfaces:**
- Consumes: `Dexie`, `EntityTable`
- Produces: `RunProgram` interface, `db.runPrograms`, `getActiveRunProgram(dbInstance?: AppDatabase): Promise<RunProgram>`

- [ ] **Step 1: Write the failing test for `RunProgram` and `getActiveRunProgram`**

In `frontend/src/db/db.test.ts`, add a test suite for `runPrograms` and `getActiveRunProgram`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, getActiveRunProgram } from './index.ts'

describe('RunProgram and Dexie v5 schema', () => {
  beforeEach(async () => {
    await db.runPrograms.clear()
    await db.runSessions.clear()
  })

  it('auto-seeds Attempt 1 if no runPrograms exist', async () => {
    const active = await getActiveRunProgram()
    expect(active).toBeDefined()
    expect(active.number).toBe(1)
    expect(active.endedAt).toBeNull()
    expect(active.startedAt).toBeGreaterThan(0)

    // Second call returns the existing one
    const activeAgain = await getActiveRunProgram()
    expect(activeAgain.id).toBe(active.id)
  })

  it('returns the active program with endedAt === null', async () => {
    await db.runPrograms.add({
      id: 'p1',
      number: 1,
      startedAt: 1000,
      endedAt: 2000,
      updatedAt: 2000,
    })
    await db.runPrograms.add({
      id: 'p2',
      number: 2,
      startedAt: 2001,
      endedAt: null,
      updatedAt: 2001,
    })

    const active = await getActiveRunProgram()
    expect(active.id).toBe('p2')
    expect(active.number).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/db/db.test.ts`
Expected: FAIL with `getActiveRunProgram is not exported` or `db.runPrograms is undefined`.

- [ ] **Step 3: Implement `RunProgram` and Dexie v5 in `frontend/src/db/index.ts`**

In `frontend/src/db/index.ts`:
1. Define and export `RunProgram`:
```ts
export interface RunProgram {
  id: string
  number: number           // 1-based increment (1, 2, ...)
  startedAt: number
  endedAt: number | null   // null = currently active attempt
  updatedAt: number        // sync timestamp
}
```
2. In `AppDatabase` class:
   - Add property: `runPrograms!: EntityTable<RunProgram, 'id'>`
   - Add version 5 schema:
   ```ts
   // v5: add runPrograms table for C25K running program attempts
   this.version(5).stores({
     routines:      'id, splitDay, createdAt, updatedAt',
     sessions:      'id, routineId, splitDay, startedAt, completedAt, mesocycleId, isDeload, updatedAt',
     sets:          'id, sessionId, exerciseId, timestamp, updatedAt',
     mesocycles:    'id, number, startedAt, endedAt, updatedAt',
     exerciseSwaps: 'id, mesocycleId, routineId, swappedAt',
     runSessions:   'id, startedAt, completedAt, updatedAt',
     runPrograms:   'id, number, startedAt, endedAt, updatedAt',
   })
   ```
   - Add hook for `runPrograms`:
   ```ts
   this.runPrograms.hook('creating', (_pk, obj) => { if (!_isSyncing) obj.updatedAt = Date.now() })
   this.runPrograms.hook('updating', (mods: Partial<RunProgram> & { updatedAt?: number }) => {
     if (!_isSyncing) mods.updatedAt = Date.now()
   })
   ```
3. Implement `getActiveRunProgram`:
```ts
export async function getActiveRunProgram(database = db): Promise<RunProgram> {
  const active = await database.runPrograms.filter(p => p.endedAt === null).first()
  if (active) return active

  // Check if there are completed or existing run sessions to determine startedAt
  const firstSession = await database.runSessions.orderBy('startedAt').first()
  const startedAt = firstSession?.startedAt ?? Date.now()
  const initialProgram: RunProgram = {
    id: uid(),
    number: 1,
    startedAt,
    endedAt: null,
    updatedAt: Date.now(),
  }
  await database.runPrograms.add(initialProgram)
  return initialProgram
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/db/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/db/index.ts frontend/src/db/db.test.ts
git commit -m "feat(db): add RunProgram model and v5 Dexie schema migration"
```

---

### Task 2: Backend SQLite Migration & Sync Support

**Files:**
- Modify: `backend/db.go`
- Modify: `backend/main.go`
- Modify: `backend/db_test.go`
- Modify: `frontend/src/lib/sync.ts`
- Modify: `frontend/src/lib/sync.test.ts`

**Interfaces:**
- Consumes: `RunProgram`
- Produces: Backend sync endpoint supporting `run_programs` payload, `sync.ts` handling `runPrograms`

- [ ] **Step 1: Write the failing backend test in `backend/db_test.go`**

In `backend/db_test.go`:
Add a test verifying `run_programs` table exists and `UpsertSync` handles `RunProgram`:
```go
func TestSyncRunPrograms(t *testing.T) {
	db, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer db.Close()

	payload := SyncPayload{
		RunPrograms: []RunProgram{
			{ID: "rp-1", Number: 1, StartedAt: 1000, EndedAt: nil, UpdatedAt: 1000},
		},
	}
	res, err := UpsertSync(db, payload)
	if err != nil {
		t.Fatalf("UpsertSync: %v", err)
	}
	if len(res.RunPrograms) != 1 {
		t.Fatalf("expected 1 run_program, got %d", len(res.RunPrograms))
	}
	if res.RunPrograms[0].ID != "rp-1" {
		t.Errorf("expected id rp-1, got %s", res.RunPrograms[0].ID)
	}
}
```

- [ ] **Step 2: Run backend test to verify it fails**

Run: `go test ./...` in `backend`
Expected: FAIL compilation with `RunProgram undefined` / `unknown field RunPrograms`.

- [ ] **Step 3: Update `backend/db.go`, `backend/main.go`, and `frontend/src/lib/sync.ts`**

1. In `backend/db.go`:
   - Add schema table:
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
   - Add `RunProgram` struct:
   ```go
   type RunProgram struct {
       ID        string `json:"id"`
       Number    int    `json:"number"`
       StartedAt int64  `json:"startedAt"`
       EndedAt   *int64 `json:"endedAt"`
       UpdatedAt int64  `json:"updatedAt"`
   }
   ```
   - Add `RunPrograms []RunProgram` to `SyncPayload` and `SyncResponse`.
   - In `UpsertSync`, insert/upsert into `run_programs`:
   ```go
   for _, rp := range p.RunPrograms {
       _, err := tx.Exec(`
           INSERT INTO run_programs(id,number,started_at,ended_at,updated_at)
           VALUES(?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
               number=excluded.number,
               started_at=excluded.started_at,
               ended_at=excluded.ended_at,
               updated_at=excluded.updated_at
           WHERE excluded.updated_at > run_programs.updated_at`,
           rp.ID, rp.Number, rp.StartedAt, rp.EndedAt, serverNow,
       )
       if err != nil {
           return SyncResponse{}, fmt.Errorf("upsert run_programs %s: %w", rp.ID, err)
       }
   }
   ```
   - Query delta updates for `run_programs WHERE updated_at > ?` and populate `res.RunPrograms`.

2. In `frontend/src/lib/sync.ts`:
   - Include `runPrograms` in the push query (`db.runPrograms.where('updatedAt').above(lastSyncAt).toArray()`).
   - Add `runPrograms` to `syncPayload` and handle `data.runPrograms` in `bulkPut`.

3. In `frontend/src/lib/sync.test.ts`:
   - Add test ensuring `runPrograms` are pushed and pulled.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./...` in `backend`
Run: `npm test -- --run src/lib/sync.test.ts` in `frontend`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ frontend/src/lib/sync.ts frontend/src/lib/sync.test.ts
git commit -m "feat(sync): add run_programs table and sync support"
```

---

### Task 3: Active Run Filtering & Plan Progress Logic

**Files:**
- Modify: `frontend/src/lib/runProgress.ts`
- Modify: `frontend/src/lib/runProgress.test.ts`

**Interfaces:**
- Consumes: `RunSession`, `RunProgram`
- Produces:
  - `activeRunSessions(sessions: RunSession[], activeProgram?: RunProgram | null): RunSession[]`
  - Updated `runSummary(sessions: RunSession[], activeProgram?: RunProgram | null): RunProgressSummary`

- [ ] **Step 1: Write unit tests in `frontend/src/lib/runProgress.test.ts`**

Add tests covering active program filtering and reset:
```ts
import { activeRunSessions, runSummary } from './runProgress.ts'
import type { RunSession, RunProgram } from '../db/index.ts'

describe('activeRunSessions and runSummary with RunProgram', () => {
  const p1: RunProgram = { id: 'p1', number: 1, startedAt: 1000, endedAt: 5000, updatedAt: 5000 }
  const p2: RunProgram = { id: 'p2', number: 2, startedAt: 5001, endedAt: null, updatedAt: 5001 }

  const run1: RunSession = { id: 'r1', week: 1, day: 1, startedAt: 1100, completedAt: 1200, durationSec: 1800, distanceKm: 3, rpe: 6, updatedAt: 1200 }
  const run2: RunSession = { id: 'r2', week: 1, day: 2, startedAt: 1300, completedAt: 1400, durationSec: 1800, distanceKm: 3.2, rpe: 7, updatedAt: 1400 }
  const run3: RunSession = { id: 'r3', week: 1, day: 1, startedAt: 5100, completedAt: 5200, durationSec: 1800, distanceKm: 3.1, rpe: 5, updatedAt: 5200 }

  it('filters runs by active program startedAt', () => {
    const activeRuns = activeRunSessions([run1, run2, run3], p2)
    expect(activeRuns).toHaveLength(1)
    expect(activeRuns[0].id).toBe('r3')
  })

  it('calculates plan progress using only active program runs', () => {
    // Before reset (all runs in p1)
    const summaryP1 = runSummary([run1, run2], p1)
    expect(summaryP1.completedCount).toBe(2)
    expect(summaryP1.nextSessionLabel).toBe('Week 1 · Day 3')

    // After reset to p2 with no runs yet
    const summaryP2Empty = runSummary([run1, run2], p2)
    expect(summaryP2Empty.completedCount).toBe(0)
    expect(summaryP2Empty.nextSessionLabel).toBe('Week 1 · Day 1')

    // After completing 1 run in p2
    const summaryP2One = runSummary([run1, run2, run3], p2)
    expect(summaryP2One.completedCount).toBe(1)
    expect(summaryP2One.nextSessionLabel).toBe('Week 1 · Day 2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/runProgress.test.ts`
Expected: FAIL with `activeRunSessions is not a function`.

- [ ] **Step 3: Implement `activeRunSessions` and update `runSummary` in `frontend/src/lib/runProgress.ts`**

In `frontend/src/lib/runProgress.ts`:
1. Import `RunProgram`:
```ts
import type { RunSession, RunProgram } from '../db/index.ts'
```
2. Export `activeRunSessions`:
```ts
export function activeRunSessions(sessions: RunSession[], activeProgram?: RunProgram | null): RunSession[] {
  if (!activeProgram) return sessions
  return sessions.filter(session => session.startedAt >= activeProgram.startedAt)
}
```
3. Update `runSummary`:
```ts
export function runSummary(sessions: RunSession[], activeProgram?: RunProgram | null): RunProgressSummary {
  const activeSessions = activeRunSessions(sessions, activeProgram)
  const completedCount = completedRunSessions(activeSessions).length
  const nextSession = nextRunSession(completedCount)

  return {
    completedCount,
    totalPlanned: TOTAL_PLANNED_RUNS,
    completionPct: TOTAL_PLANNED_RUNS === 0
      ? 0
      : Math.min(100, Math.round((completedCount / TOTAL_PLANNED_RUNS) * 100)),
    nextSessionLabel: nextSession ? sessionLabel(nextSession.week, nextSession.day) : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/runProgress.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/runProgress.ts frontend/src/lib/runProgress.test.ts
git commit -m "feat(run): add activeRunSessions filter and update runSummary for active program"
```

---

### Task 4: PlanPage Reset UI & Confirmation Modal

**Files:**
- Modify: `frontend/src/pages/PlanPage.tsx`
- Modify: `frontend/src/pages/PlanPage.C25K.test.tsx`

**Interfaces:**
- Consumes: `db.runPrograms`, `getActiveRunProgram`, `RunProgram`
- Produces: Attempt badge and "RESET" button in `C25KBlock`, Reset confirmation modal, reset handler.

- [ ] **Step 1: Write component tests for Reset UI in `frontend/src/pages/PlanPage.C25K.test.tsx`**

Add tests verifying Attempt badge and reset flow:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import PlanPage from './PlanPage.tsx'
import { db } from '../db/index.ts'

describe('PlanPage C25K Reset Feature', () => {
  beforeEach(async () => {
    await db.runPrograms.clear()
    await db.runSessions.clear()
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
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/pages/PlanPage.C25K.test.tsx`
Expected: FAIL with `ATTEMPT 1` or `reset button` not found.

- [ ] **Step 3: Implement Reset UI and Handler in `frontend/src/pages/PlanPage.tsx`**

1. In `PlanPage.tsx`, query the active `RunProgram`:
```ts
const activeProgram = useLiveQuery<RunProgram | undefined>(
  () => db.runPrograms.filter(p => p.endedAt === null).first()
)
```
Auto-seed Attempt 1 if undefined on initial load using `getActiveRunProgram()`.
2. Pass `activeProgram` and `onResetProgram` to `C25KBlock`.
3. In `C25KBlock`:
   - Filter `activeRuns = activeRunSessions(runSessions, activeProgram)`.
   - Render Attempt badge next to `C25K PLAN`:
   ```tsx
   <div className="flex items-center gap-2">
     <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(62% 0.18 150)', textTransform: 'uppercase' }}>
       C25K PLAN
     </p>
     <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider" style={{ background: 'oklch(20% 0.010 293)', color: 'oklch(70% 0.010 293)' }}>
       ATTEMPT {activeProgram?.number ?? 1}
     </span>
   </div>
   ```
   - Render a `RESET` button:
   ```tsx
   <button
     onClick={() => setShowResetConfirm(true)}
     className="px-2 py-1 rounded-lg text-xs font-semibold"
     style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(70% 0.010 293)', border: '1px solid oklch(25% 0.010 293)' }}
   >
     RESET
   </button>
   ```
4. Render the confirmation dialog modal when `showResetConfirm` is true:
   ```tsx
   {showResetConfirm && (
     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
       <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'oklch(14% 0.010 293)', border: '1px solid oklch(24% 0.010 293)' }}>
         <h3 className="text-lg font-bold text-white mb-2 font-display">Reset C25K Program?</h3>
         <p className="text-sm mb-5" style={{ color: 'oklch(65% 0.010 293)' }}>
           This will restart your C25K plan from Week 1 · Day 1 as Attempt {(activeProgram?.number ?? 1) + 1}. All previously logged runs remain intact in your History.
         </p>
         <div className="flex gap-3 justify-end">
           <button
             onClick={() => setShowResetConfirm(false)}
             className="px-4 py-2 rounded-xl text-sm font-semibold"
             style={{ background: 'oklch(20% 0.010 293)', color: 'oklch(80% 0.010 293)' }}
           >
             Cancel
           </button>
           <button
             onClick={handleConfirmReset}
             className="px-4 py-2 rounded-xl text-sm font-semibold"
             style={{ background: 'oklch(62% 0.18 150)', color: 'oklch(12% 0.010 293)' }}
           >
             Reset to Week 1
           </button>
         </div>
       </div>
     </div>
   )}
   ```
5. Handle confirm reset:
   ```ts
   async function handleConfirmReset() {
     const program = await getActiveRunProgram()
     const now = Date.now()
     await db.runPrograms.update(program.id, { endedAt: now })
     await db.runPrograms.add({
       id: uid(),
       number: program.number + 1,
       startedAt: now,
       endedAt: null,
       updatedAt: now,
     })
     // Delete in-progress run if any
     const inProgress = await db.runSessions.filter(s => s.completedAt === null).first()
     if (inProgress) {
       await db.runSessions.delete(inProgress.id)
     }
     setShowResetConfirm(false)
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/pages/PlanPage.C25K.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PlanPage.tsx frontend/src/pages/PlanPage.C25K.test.tsx
git commit -m "feat(plan): add reset program button and confirmation modal to C25K card"
```

---

### Task 5: Integrate Active Program in HomePage and ProgressPage

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/components/RunProgressPanel.tsx`
- Modify: `frontend/src/components/RunProgressPanel.test.tsx`

**Interfaces:**
- Consumes: `db.runPrograms`, `activeRunSessions`, `runSummary`
- Produces: Home page run card and Progress panel C25K metrics reflecting active program

- [ ] **Step 1: Write test for RunProgressPanel with multiple attempts in `RunProgressPanel.test.tsx`**

Add test in `frontend/src/components/RunProgressPanel.test.tsx`:
```tsx
it('shows C25K plan progress for active attempt while preserving cumulative totals', async () => {
  const p1Time = 1000
  const p2Time = 5000
  await db.runPrograms.bulkAdd([
    { id: 'p1', number: 1, startedAt: p1Time, endedAt: p2Time - 1, updatedAt: p2Time - 1 },
    { id: 'p2', number: 2, startedAt: p2Time, endedAt: null, updatedAt: p2Time },
  ])
  await db.runSessions.bulkAdd([
    { id: 'r1', week: 1, day: 1, startedAt: p1Time + 10, completedAt: p1Time + 20, durationSec: 1800, distanceKm: 3.0, rpe: 6, updatedAt: p1Time + 20 },
    { id: 'r2', week: 1, day: 2, startedAt: p1Time + 30, completedAt: p1Time + 40, durationSec: 1800, distanceKm: 3.0, rpe: 7, updatedAt: p1Time + 40 },
  ])

  render(<RunProgressPanel />)

  // In Attempt 2, completed runs in attempt 2 is 0 / 27
  await waitFor(() => {
    expect(screen.getByText(/0 \/ 27/i)).toBeInTheDocument()
    // Cumulative distance preserves 6.0 km from Attempt 1
    expect(screen.getByText(/6\.0 km/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/RunProgressPanel.test.tsx`
Expected: FAIL (displays `2 / 27` instead of `0 / 27`).

- [ ] **Step 3: Update `HomePage.tsx` and `RunProgressPanel.tsx`**

1. In `HomePage.tsx`:
   - Query `activeProgram`:
   ```ts
   const activeProgram = useLiveQuery<RunProgram | undefined>(
     () => db.runPrograms.filter(p => p.endedAt === null).first()
   )
   ```
   - Calculate `completedRunCount`:
   ```ts
   const completedRunCount = useLiveQuery<number>(async () => {
     const program = activeProgram ?? await getActiveRunProgram()
     const sessions = await db.runSessions.filter(s => s.completedAt !== null).toArray()
     return activeRunSessions(sessions, program).length
   }, [activeProgram]) ?? 0
   ```
2. In `RunProgressPanel.tsx`:
   - Query `activeProgram`:
   ```ts
   const activeProgram = useLiveQuery<RunProgram | undefined>(
     () => db.runPrograms.filter(p => p.endedAt === null).first()
   )
   ```
   - Pass `activeProgram` into `runSummary(runSessions, activeProgram)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/RunProgressPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/HomePage.tsx frontend/src/components/RunProgressPanel.tsx frontend/src/components/RunProgressPanel.test.tsx
git commit -m "feat(run): sync active program with HomePage and ProgressPanel"
```

---

### Task 6: Full Verification & End-to-End Suite

**Files:**
- None (verification of all suites)

- [ ] **Step 1: Run frontend test suite**

Run: `npm test -- --run` in `frontend`
Expected: All test suites PASS (including db, sync, runProgress, PlanPage, HomePage, HistoryPage).

- [ ] **Step 2: Run backend test suite**

Run: `go test ./...` in `backend`
Expected: PASS

- [ ] **Step 3: Run linter/build check**

Run: `npm run build` in `frontend`
Expected: Build succeeds without TypeScript or bundling errors.

- [ ] **Step 4: Commit and finalize**

```bash
git status
```
Verify working tree is clean.
