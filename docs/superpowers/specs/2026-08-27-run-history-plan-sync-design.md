# Run History, Plan Tracking & Sync — Design Spec

**Date:** 2026-08-27  
**Status:** Approved

---

## Overview

Three gaps left after the run progress feature (PR #23):

1. **History** doesn't show run sessions — only lifting.
2. **Plan** has no awareness of the C25K running plan.
3. **Sync** doesn't include `runSessions` — they live only in IndexedDB, never reach the backend.

These are implemented independently; no feature depends on another.

---

## 1. History — Run Sessions

### What changes
`HistoryPage.tsx` gains a LIFT / RUN segmented tab, matching the pattern already used in `ProgressPage.tsx`.

- **LIFT tab** — existing `SessionCard` list, unchanged.
- **RUN tab** — new `RunSessionCard` list, ordered by `startedAt` descending, filtered to `completedAt !== null`.

### RunSessionCard content
Each card shows:
- **Header:** Week · Day label (e.g. "WEEK 2 · DAY 1") + date + time
- **Stats row:** Duration (min), Distance (km, if logged), RPE (if logged)
- **Interval summary:** e.g. "8 intervals · 20 min run / 12 min walk" — derived from `C25K_PLAN[week][day]` via `runPlan.ts`

### Data source
`db.runSessions` — already in Dexie schema (v4), `EntityTable<RunSession, 'id'>`.

### Empty state
"NO RUNS YET" with cue to start the first C25K session.

---

## 2. Plan — C25K Progress Block

### What changes
`PlanPage.tsx` gains a read-only C25K block rendered below the active mesocycle card (or the "Start New Mesocycle" button if no meso is active). It is always visible — run plan is independent of the lifting mesocycle.

### Block content
- **Header:** "C25K PLAN" label + completion fraction (e.g. "3 / 27")
- **Week grid:** 9 rows (one per week), each showing 3 session dots. Completed sessions = filled dot. Current session = pulsing/highlighted dot. Future = empty dot.
- **Next up callout:** "NEXT: WEEK X · DAY Y — ~N MIN" (uses `nextRunSession` from `runPlan.ts` and `totalDurationSec` for the estimate)

### Data source
`db.runSessions` — count of completed sessions drives position, same logic as `RunProgressPanel.tsx`. Reuse `nextRunSession(completedCount)` from `runPlan.ts`.

### No management controls
No reset, skip, or manual-mark. Auto-advance on completion is sufficient.

---

## 3. Sync — RunSessions Full-Stack

Same delta-sync pattern as the existing 5 tables: full push every sync, pull records with `updated_at > lastSyncAt`.

### Frontend (`sync.ts`)
- Add `runSessions: db.runSessions.toArray()` to the parallel gather.
- Stamp `updatedAt` if missing.
- Add to push payload JSON.
- Merge pulled `runSessions` via `db.runSessions.bulkPut(data.runSessions)`.

### Backend — models (`models.go`)
New struct:
```go
type RunSession struct {
    ID          string   `json:"id"`
    Week        int      `json:"week"`
    Day         int      `json:"day"`
    StartedAt   int64    `json:"startedAt"`
    CompletedAt *int64   `json:"completedAt"`
    DurationSec *int64   `json:"durationSec"`
    DistanceKm  *float64 `json:"distanceKm"`
    RPE         *float64 `json:"rpe"`
    UpdatedAt   int64    `json:"updatedAt"`
}
```
Add `RunSessions []RunSession` to both `SyncRequest` and `SyncResponse`.

### Backend — database (`db.go`)
New table (added to `initDB`):
```sql
CREATE TABLE IF NOT EXISTS run_sessions (
    id           TEXT PRIMARY KEY,
    week         INTEGER NOT NULL,
    day          INTEGER NOT NULL,
    started_at   INTEGER NOT NULL,
    completed_at INTEGER,
    duration_sec INTEGER,
    distance_km  REAL,
    rpe          REAL,
    updated_at   INTEGER NOT NULL
);
```
New functions:
- `upsertRunSession(db, rs, now)` — INSERT OR REPLACE with server-side `updated_at = now`.
- `fetchRunSessionsSince(db, since)` — SELECT WHERE `updated_at > since`.

### Backend — sync handler (`main.go`)
Wire `req.RunSessions` through `upsertRunSession` and include `fetchRunSessionsSince` result in `SyncResponse`.

### Migration
`CREATE TABLE IF NOT EXISTS` — safe on existing deployed DB. First sync after deploy pushes all local `runSessions` from IndexedDB. No data loss.

---

## Testing

- **Frontend:** Update `sync.test.ts` — add `runSessions` to mock push/pull payloads. Add `HistoryPage` test for RUN tab empty state and card render.
- **Backend:** Add `TestUpsertRunSession` and `TestFetchRunSessionsSince` in `db_test.go`. Add `runSessions` to `handlers_test.go` sync round-trip.

---

## Out of scope

- Editing or deleting run sessions from History.
- Resetting / skipping C25K sessions from Plan.
- Per-interval breakdown stored in DB (interval structure comes from `C25K_PLAN` constant, not persisted).
