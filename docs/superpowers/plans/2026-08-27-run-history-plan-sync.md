# Run History, Plan Tracking & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add run sessions to History (detailed cards), Plan (C25K block), and full-stack sync.

**Architecture:** Four independent tasks in dependency order — backend sync first, then frontend sync, then UI. Each task is fully testable on its own. Backend adds a `run_sessions` table via `CREATE TABLE IF NOT EXISTS` (safe on existing deployed DB). Frontend sync follows the identical push-all / pull-delta pattern used by the other 5 tables.

**Tech Stack:** React 19 + TypeScript, Dexie.js v4, Vitest, Go 1.22+, SQLite (modernc.org/sqlite), net/http/httptest.

## Global Constraints

- Package manager: `bun` — always `bun run test`, never `npm` or `yarn`
- Frontend tests: `cd frontend && bun run test --run` (Vitest runner, NOT `bun test`)
- Backend tests: `cd backend && go test ./...`
- All weights in kg; RPE scale 1–10
- Dark mode default — use existing `oklch(...)` colour tokens, never add new ones
- Never commit directly to `master` or `dev` — all work is on `feature/run-history-plan-sync`
- Tailwind v4 — utility classes only, no `tailwind.config.js`

---

## Task 1: Backend — run_sessions table + sync

**Files:**
- Modify: `backend/models.go` — add `RunSession` struct, extend `SyncRequest`/`SyncResponse`
- Modify: `backend/db.go` — add table DDL, `upsertRunSession`, `fetchRunSessionsSince`
- Modify: `backend/main.go` — wire into `makeSync`
- Modify: `backend/db_test.go` — table existence + upsert + fetch tests
- Modify: `backend/handlers_test.go` — sync round-trip test

**Interfaces:**
- Produces: `RunSession` struct, `upsertRunSession(db, rs, serverNow)`, `fetchRunSessionsSince(db, since)` — consumed by Task 2 indirectly via the JSON sync API

- [ ] **Step 1: Add RunSession struct and extend sync types in models.go**

Open `backend/models.go`. After the `SetLog` struct (line 66), add:

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

Then add `RunSessions []RunSession \`json:"runSessions"\`` to **both** `SyncRequest` (after `ExerciseSwaps`) and `SyncResponse` (after `ExerciseSwaps`).

- [ ] **Step 2: Add run_sessions table to db.go**

In `backend/db.go`, inside the `schema` string literal (after the `exercise_swaps` table block, before the closing backtick), add:

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

	CREATE INDEX IF NOT EXISTS idx_run_sessions_updated ON run_sessions(updated_at);
```

- [ ] **Step 3: Add upsertRunSession and fetchRunSessionsSince to db.go**

Append to the end of `backend/db.go` (before `func nowMs()`):

```go
func upsertRunSession(db *sql.DB, rs RunSession, serverNow int64) error {
	effectiveUpdatedAt := max(rs.UpdatedAt, serverNow)
	_, err := db.Exec(`
		INSERT INTO run_sessions(id,week,day,started_at,completed_at,duration_sec,distance_km,rpe,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			completed_at=excluded.completed_at, duration_sec=excluded.duration_sec,
			distance_km=excluded.distance_km, rpe=excluded.rpe,
			updated_at=excluded.updated_at
		WHERE excluded.updated_at > run_sessions.updated_at`,
		rs.ID, rs.Week, rs.Day, rs.StartedAt,
		rs.CompletedAt, rs.DurationSec, rs.DistanceKm, rs.RPE,
		effectiveUpdatedAt,
	)
	return err
}

func fetchRunSessionsSince(db *sql.DB, since int64) ([]RunSession, error) {
	rows, err := db.Query(
		`SELECT id,week,day,started_at,completed_at,duration_sec,distance_km,rpe,updated_at FROM run_sessions WHERE updated_at > ?`,
		since,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []RunSession
	for rows.Next() {
		var rs RunSession
		if err := rows.Scan(
			&rs.ID, &rs.Week, &rs.Day, &rs.StartedAt,
			&rs.CompletedAt, &rs.DurationSec, &rs.DistanceKm, &rs.RPE,
			&rs.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, rs)
	}
	return out, rows.Err()
}
```

- [ ] **Step 4: Wire runSessions into makeSync in main.go**

In `backend/main.go`, inside `makeSync`, after the `for _, sw := range req.ExerciseSwaps` block (around line 118), add:

```go
		for _, rs := range req.RunSessions {
			if err := upsertRunSession(db, rs, now); err != nil {
				log.Printf("upsert run_session %s: %v", rs.ID, err)
			}
		}
```

After `exerciseSwaps, err := fetchExerciseSwapsSince(...)` (around line 136), add:

```go
		runSessions, err := fetchRunSessionsSince(db, req.LastSyncAt)
		if err != nil {
			log.Printf("fetch run_sessions: %v", err)
		}
```

Add `if runSessions == nil { runSessions = []RunSession{} }` with the other nil guards.

Add `RunSessions: runSessions` to the `writeJSON(w, http.StatusOK, SyncResponse{...})` call.

- [ ] **Step 5: Write backend tests**

In `backend/db_test.go`, add after `TestInitDB_IndexesExist`:

```go
func TestInitDB_RunSessionsTableExists(t *testing.T) {
	db := testDB(t)
	var name string
	err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='run_sessions'`).Scan(&name)
	if err != nil {
		t.Errorf("table run_sessions not found: %v", err)
	}
}

func TestUpsertRunSession_Insert(t *testing.T) {
	db := testDB(t)
	rs := RunSession{ID: "rs-1", Week: 1, Day: 1, StartedAt: 1000, UpdatedAt: 100}
	if err := upsertRunSession(db, rs, 0); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	var id string
	if err := db.QueryRow(`SELECT id FROM run_sessions WHERE id='rs-1'`).Scan(&id); err != nil {
		t.Fatalf("not found: %v", err)
	}
}

func TestUpsertRunSession_LastWriteWins(t *testing.T) {
	db := testDB(t)
	rs := RunSession{ID: "rs-2", Week: 1, Day: 2, StartedAt: 1000, CompletedAt: nil, UpdatedAt: 50}
	_ = upsertRunSession(db, rs, 0)

	completed := int64(2000)
	rs2 := RunSession{ID: "rs-2", Week: 1, Day: 2, StartedAt: 1000, CompletedAt: &completed, UpdatedAt: 200}
	_ = upsertRunSession(db, rs2, 0)

	var got *int64
	if err := db.QueryRow(`SELECT completed_at FROM run_sessions WHERE id='rs-2'`).Scan(&got); err != nil {
		t.Fatalf("query: %v", err)
	}
	if got == nil || *got != 2000 {
		t.Errorf("expected completed_at=2000, got %v", got)
	}
}

func TestFetchRunSessionsSince_ReturnsOnlyNewer(t *testing.T) {
	db := testDB(t)
	_ = upsertRunSession(db, RunSession{ID: "rs-old", Week: 1, Day: 1, StartedAt: 100, UpdatedAt: 10}, 0)
	_ = upsertRunSession(db, RunSession{ID: "rs-new", Week: 1, Day: 2, StartedAt: 200, UpdatedAt: 500}, 0)

	rows, err := fetchRunSessionsSince(db, 100)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(rows) != 1 || rows[0].ID != "rs-new" {
		t.Errorf("expected [rs-new], got %v", rows)
	}
}
```

In `backend/handlers_test.go`, add a sync round-trip test for run sessions. Find the existing sync round-trip test (search for `TestSync_RoundTrip` or similar) and add a new one:

```go
func TestSync_RunSessionRoundTrip(t *testing.T) {
	db := testDB(t)
	body, _ := json.Marshal(SyncRequest{
		LastSyncAt: 0,
		RunSessions: []RunSession{
			{ID: "rs-1", Week: 2, Day: 3, StartedAt: 5000, UpdatedAt: 5000},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/sync", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	makeSync(db)(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp SyncResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.RunSessions) != 1 || resp.RunSessions[0].ID != "rs-1" {
		t.Errorf("expected rs-1 in response, got %v", resp.RunSessions)
	}
}
```

- [ ] **Step 6: Run backend tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass including the 4 new run_session tests.

- [ ] **Step 7: Commit**

```bash
git add backend/models.go backend/db.go backend/main.go backend/db_test.go backend/handlers_test.go
git commit -m "feat(sync): add run_sessions to backend sync pipeline"
```

---

## Task 2: Frontend — sync runSessions

**Files:**
- Modify: `frontend/src/lib/sync.ts` — push + pull runSessions
- Modify: `frontend/src/lib/sync.test.ts` — add runSessions to db mock + push/pull tests

**Interfaces:**
- Consumes: `db.runSessions` (EntityTable already in Dexie schema v4)
- Produces: runSessions included in every sync push/pull (same semantics as sessions/sets/etc.)

- [ ] **Step 1: Write failing test for runSessions push**

In `frontend/src/lib/sync.test.ts`, add `runSessions` to the `db` mock object inside `vi.mock('../db/index.ts', ...)`:

```ts
    runSessions: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
```

Then add a new test inside `describe('syncWithBackend', ...)`:

```ts
  it('includes runSessions in the push payload', async () => {
    setServerUrl('http://localhost:8080')
    const { db } = await import('../db/index.ts')

    vi.mocked(db.runSessions.toArray).mockResolvedValue([
      { id: 'rs-1', week: 1, day: 1, startedAt: 1000, completedAt: null, durationSec: null, distanceKm: null, rpe: null, updatedAt: 1000 },
    ])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ syncedAt: 9999, sessions: [], sets: [], routines: [], runSessions: [] }),
    }))

    const result = await syncWithBackend()
    expect(result.status).toBe('ok')
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.runSessions).toHaveLength(1)
    expect(body.runSessions[0].id).toBe('rs-1')
  })

  it('calls bulkPut on runSessions received from server', async () => {
    setServerUrl('http://localhost:8080')
    const { db } = await import('../db/index.ts')
    vi.mocked(db.runSessions.bulkPut).mockClear()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        syncedAt: 9999,
        sessions: [], sets: [], routines: [],
        runSessions: [{ id: 'rs-server', week: 2, day: 1, startedAt: 2000, updatedAt: 2000 }],
      }),
    }))

    await syncWithBackend()
    expect(db.runSessions.bulkPut).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && bun run test --run src/lib/sync.test.ts
```

Expected: 2 new tests FAIL (runSessions not in sync.ts yet).

- [ ] **Step 3: Update sync.ts to push and pull runSessions**

In `frontend/src/lib/sync.ts`:

1. Add `runSessions` to the `Promise.all` gather (after `exerciseSwaps`):
```ts
  const [sessions, sets, routines, mesocycles, exerciseSwaps, runSessions] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.routines.toArray(),
    db.mesocycles.toArray(),
    db.exerciseSwaps.toArray(),
    db.runSessions.toArray(),
  ])
```

2. Stamp `updatedAt` for runSessions (after the other stamped* lines):
```ts
  const stampedRunSessions = runSessions.map(rs => ({ ...rs, updatedAt: (rs.updatedAt ?? now) }))
```

3. Update `pushed` count:
```ts
  const pushed = sessions.length + sets.length + routines.length + mesocycles.length + exerciseSwaps.length + runSessions.length
```

4. Add `runSessions: stampedRunSessions` to the `JSON.stringify` body.

5. Update the response type annotation to add `runSessions?: typeof stampedRunSessions`.

6. Add the merge block inside the `setSyncing(true)` try block (after exerciseSwaps):
```ts
    if (data.runSessions?.length) {
      await db.runSessions.bulkPut(data.runSessions)
      pulled += data.runSessions.length
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && bun run test --run src/lib/sync.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sync.ts frontend/src/lib/sync.test.ts
git commit -m "feat(sync): push/pull runSessions in frontend sync"
```

---

## Task 3: History — LIFT/RUN tabs

**Files:**
- Modify: `frontend/src/pages/HistoryPage.tsx` — add tab state, RunSessionCard component

**Interfaces:**
- Consumes: `db.runSessions` (EntityTable<RunSession>), `C25K_PLAN` from `runPlan.ts`
- Produces: updated HistoryPage with LIFT/RUN tabs visible to user

- [ ] **Step 1: Write failing test**

Create `frontend/src/pages/HistoryPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HistoryPage from './HistoryPage.tsx'

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn(() => []) }))
vi.mock('../db/index.ts', () => ({ db: {} }))
vi.mock('../lib/prefs.ts', () => ({ useWeightUnit: () => ({ unit: 'kg' }) }))

describe('HistoryPage', () => {
  it('renders LIFT and RUN tabs', () => {
    render(<HistoryPage />)
    expect(screen.getByText('LIFT')).toBeTruthy()
    expect(screen.getByText('RUN')).toBeTruthy()
  })

  it('shows LIFT empty state by default', () => {
    render(<HistoryPage />)
    expect(screen.getByText('NO WORKOUTS YET')).toBeTruthy()
  })

  it('switches to RUN tab and shows run empty state', () => {
    render(<HistoryPage />)
    fireEvent.click(screen.getByText('RUN'))
    expect(screen.getByText('NO RUNS YET')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && bun run test --run src/pages/HistoryPage.test.tsx
```

Expected: FAIL — "Cannot find module" or missing RUN tab elements.

- [ ] **Step 3: Rewrite HistoryPage.tsx**

Replace the entire content of `frontend/src/pages/HistoryPage.tsx` with:

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { WorkoutSession, SetLog, RunSession } from '../db/index.ts'
import { formatDate, formatTime, totalVolume, formatWeight, kgToLbs, KG_TO_LBS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import { SPLIT_LABELS } from '../lib/split.ts'
import { C25K_PLAN } from '../lib/runPlan.ts'

export default function HistoryPage() {
  const [mode, setMode] = useState<'lift' | 'run'>('lift')

  const sessions = useLiveQuery<WorkoutSession[]>(
    () => db.sessions.orderBy('startedAt').reverse().filter(s => s.completedAt !== null).toArray(),
    []
  ) ?? []

  const runSessions = useLiveQuery<RunSession[]>(
    () => db.runSessions.orderBy('startedAt').reverse().filter(s => s.completedAt !== null).toArray(),
    []
  ) ?? []

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="px-4 pt-12 pb-5">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          HISTORY
        </h1>
        <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.1em', color: 'oklch(44% 0.008 293)', marginTop: 6, minHeight: 16 }}>
          {mode === 'lift' && sessions.length > 0 && `${sessions.length} WORKOUTS LOGGED`}
          {mode === 'run' && runSessions.length > 0 && `${runSessions.length} RUNS LOGGED`}
        </p>

        {/* Tab selector */}
        <div
          className="mt-3 inline-flex rounded-2xl p-1"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
        >
          {(['lift', 'run'] as const).map(tab => {
            const active = mode === tab
            return (
              <button
                key={tab}
                onClick={() => setMode(tab)}
                className="min-w-24 rounded-xl px-4 py-2.5 transition-all active:scale-[0.98]"
                style={{
                  background: active ? 'oklch(62% 0.24 293)' : 'transparent',
                  color: active ? 'oklch(7% 0.008 293)' : 'oklch(72% 0.012 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '14px',
                  letterSpacing: '0.08em',
                }}
              >
                {tab.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {mode === 'lift' ? (
        sessions.length === 0 ? (
          <EmptyState icon="clipboard" title="NO WORKOUTS YET" sub="Complete your first session to see history" />
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        )
      ) : (
        runSessions.length === 0 ? (
          <EmptyState icon="run" title="NO RUNS YET" sub="Complete your first C25K session to see history" />
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {runSessions.map(rs => <RunSessionCard key={rs.id} session={rs} />)}
          </div>
        )
      )}
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: 'clipboard' | 'run'; title: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-20">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
      >
        {icon === 'clipboard' ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'oklch(30% 0.010 293)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'oklch(30% 0.010 293)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>
      <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '18px', letterSpacing: '0.04em', color: 'oklch(50% 0.010 293)' }}>
        {title}
      </p>
      <p style={{ fontSize: '13px', color: 'oklch(34% 0.008 293)', marginTop: 4 }}>
        {sub}
      </p>
    </div>
  )
}

// ── SessionCard (lift) ─────────────────────────────────────────────────────────

function SessionCard({ session }: { session: WorkoutSession }) {
  const sets = useLiveQuery<SetLog[]>(
    () => db.sets.where('sessionId').equals(session.id).toArray(),
    [session.id]
  ) ?? []

  const { unit } = useWeightUnit()
  const vol = totalVolume(sets)
  const displayVol = unit === 'lb' ? vol * KG_TO_LBS : vol
  const duration = session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 60000)
    : null

  const byExercise = sets.reduce<Record<string, SetLog[]>>((acc, s) => {
    ;(acc[s.exerciseName] ??= []).push(s)
    return acc
  }, {})

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.02em', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              {session.routineName.toUpperCase()}
            </p>
            <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 3 }}>
              {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
            </p>
          </div>
          <span
            className="shrink-0 px-2 py-1 rounded-lg"
            style={{ background: 'oklch(18% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', color: 'oklch(50% 0.010 293)' }}
          >
            {SPLIT_LABELS[session.splitDay]?.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-5 mt-3">
          <Stat label="VOLUME" value={`${Math.round(displayVol / 100) / 10}k`} unit={unit} />
          <Stat label="SETS" value={String(sets.length)} />
          {duration !== null && <Stat label="TIME" value={String(duration)} unit="min" />}
        </div>
      </div>
      {Object.keys(byExercise).length > 0 && (
        <div className="px-4 py-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid oklch(16% 0.008 293)' }}>
          {Object.entries(byExercise).map(([name, exSets]) => {
            const best = exSets.reduce((a, b) => a.weightKg > b.weightKg ? a : b)
            return (
              <div key={name} className="flex items-center justify-between">
                <p className="truncate flex-1" style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)' }}>{name}</p>
                <p className="num ml-4 shrink-0" style={{ fontSize: '13px', color: 'oklch(72% 0.012 293)' }}>
                  {exSets.length}× {formatWeight(unit === 'lb' ? kgToLbs(best.weightKg) : best.weightKg)}{unit}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── RunSessionCard ─────────────────────────────────────────────────────────────

function RunSessionCard({ session }: { session: RunSession }) {
  const plan = C25K_PLAN.find(s => s.week === session.week && s.day === session.day)
  const duration = session.durationSec !== null
    ? Math.round(session.durationSec / 60)
    : null

  const runIntervals = plan?.intervals.filter(i => i.type === 'run') ?? []
  const walkIntervals = plan?.intervals.filter(i => i.type === 'walk') ?? []
  const totalRunSec = runIntervals.reduce((s, i) => s + i.durationSec, 0)
  const totalWalkSec = walkIntervals.reduce((s, i) => s + i.durationSec, 0)
  const intervalCount = runIntervals.length

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.02em', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              WEEK {session.week} · DAY {session.day}
            </p>
            <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 3 }}>
              {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
            </p>
          </div>
          <span
            className="shrink-0 px-2 py-1 rounded-lg"
            style={{ background: 'oklch(18% 0.12 150)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '10px', letterSpacing: '0.08em', color: 'oklch(62% 0.18 150)' }}
          >
            C25K
          </span>
        </div>

        {/* Stats row */}
        <div className="flex gap-5 mt-3">
          {duration !== null && <Stat label="TIME" value={String(duration)} unit="min" />}
          {session.distanceKm !== null && <Stat label="DIST" value={session.distanceKm.toFixed(1)} unit="km" />}
          {session.rpe !== null && <Stat label="RPE" value={String(session.rpe)} />}
        </div>
      </div>

      {/* Interval breakdown */}
      {plan && intervalCount > 0 && (
        <div className="px-4 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid oklch(16% 0.008 293)' }}>
          <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>
            {intervalCount} interval{intervalCount !== 1 ? 's' : ''} ·{' '}
            {Math.round(totalRunSec / 60)} min run / {Math.round(totalWalkSec / 60)} min walk
          </p>
        </div>
      )}
    </div>
  )
}

// ── Stat ───────────────────────────────────────────────────────────────────────

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p style={{ fontSize: '9px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(34% 0.008 293)', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </p>
      <p className="num" style={{ fontSize: '20px', fontWeight: 800, color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: '11px', fontFamily: "'Barlow', sans-serif", fontWeight: 400, color: 'oklch(44% 0.008 293)', marginLeft: 2 }}>{unit}</span>}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && bun run test --run src/pages/HistoryPage.test.tsx
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/HistoryPage.tsx frontend/src/pages/HistoryPage.test.tsx
git commit -m "feat(history): add LIFT/RUN tabs with run session cards"
```

---

## Task 4: Plan — C25K progress block

**Files:**
- Modify: `frontend/src/pages/PlanPage.tsx` — add C25K block component

**Interfaces:**
- Consumes: `db.runSessions`, `nextRunSession(completedCount)` and `totalDurationSec(session)` from `runPlan.ts`
- Produces: C25K block rendered below the mesocycle card in PlanPage

- [ ] **Step 1: Write failing test**

Create `frontend/src/pages/PlanPage.C25K.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// useLiveQuery returns undefined for all calls — avoids executing Dexie query
// chains. Components fall back to their `?? []` defaults; activeMeso is
// undefined, so PlanPage renders the "start new mesocycle" path.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => undefined),
}))
vi.mock('../db/index.ts', () => ({ db: {}, uid: () => 'test-uid' }))
vi.mock('../lib/split.ts', () => ({ mesocycleWeek: () => 1 }))
vi.mock('../lib/utils.ts', () => ({ uid: () => 'x' }))
vi.mock('../components/ExercisePickerSheet.tsx', () => ({ default: () => null }))

import PlanPage from './PlanPage.tsx'

describe('PlanPage C25K block', () => {
  it('renders the C25K section heading', () => {
    render(<PlanPage />)
    expect(screen.getByText('C25K PLAN')).toBeTruthy()
  })

  it('shows 0/27 when no runs completed', () => {
    render(<PlanPage />)
    expect(screen.getByText('0 / 27')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && bun run test --run src/pages/PlanPage.C25K.test.tsx
```

Expected: FAIL — no element with text "C25K PLAN".

- [ ] **Step 3: Add C25K block to PlanPage.tsx**

At the top of `frontend/src/pages/PlanPage.tsx`, add to the imports:

```ts
import type { RunSession } from '../db/index.ts'
import { nextRunSession, totalDurationSec, C25K_PLAN } from '../lib/runPlan.ts'
```

Add a `useLiveQuery` for runSessions inside `PlanPage` (after the `allSets` query):

```ts
  const runSessions = useLiveQuery<RunSession[]>(
    () => db.runSessions.filter(s => s.completedAt !== null).toArray()
  ) ?? []
```

Then in the JSX, add the `<C25KBlock>` component just before the closing `</div>` of the page (before the End Cycle Confirm Sheet section), after the Mesocycle History section:

```tsx
      {/* ── C25K Run Plan ─────────────────────────────── */}
      <C25KBlock runSessions={runSessions} />
```

Then add the component at the bottom of the file (after `RoutineCard`):

```tsx
// ── C25KBlock ──────────────────────────────────────────────────────────────────

function C25KBlock({ runSessions }: { runSessions: RunSession[] }) {
  const completedCount = runSessions.length
  const next = nextRunSession(completedCount)
  const TOTAL = C25K_PLAN.length // 27

  return (
    <div className="px-4 mb-5">
      <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
        Run Plan
      </p>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
      >
        {/* Header row */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div>
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(62% 0.18 150)', textTransform: 'uppercase' }}>
              C25K PLAN
            </p>
            <p className="num" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '26px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em', lineHeight: 1, marginTop: 2 }}>
              {completedCount} / {TOTAL}
            </p>
            <p style={{ fontSize: '12px', color: 'oklch(50% 0.010 293)', marginTop: 2 }}>
              Completed sessions
            </p>
          </div>
          <div
            className="px-3 py-2 rounded-xl text-right"
            style={{ background: 'oklch(18% 0.012 293)' }}
          >
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.1em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 2 }}>
              Completion
            </p>
            <p className="num" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', color: 'oklch(62% 0.18 150)', lineHeight: 1 }}>
              {Math.round((completedCount / TOTAL) * 100)}%
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mx-4 mb-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(20% 0.010 293)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min((completedCount / TOTAL) * 100, 100)}%`, background: 'oklch(62% 0.18 150)' }}
          />
        </div>

        {/* Week grid — 9 weeks × 3 sessions */}
        <div
          className="mx-4 mb-4 grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}
        >
          {Array.from({ length: 9 }, (_, wi) => {
            const weekNum = wi + 1
            const weekSessions = C25K_PLAN.filter(s => s.week === weekNum)
            return (
              <div key={weekNum} className="flex flex-col items-center gap-1">
                <p style={{ fontSize: '8px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em', color: 'oklch(34% 0.008 293)' }}>
                  W{weekNum}
                </p>
                {weekSessions.map(planSess => {
                  const idx = C25K_PLAN.indexOf(planSess)
                  const done = idx < completedCount
                  const isCurrent = idx === completedCount
                  return (
                    <div
                      key={planSess.day}
                      className="w-full aspect-square rounded-full"
                      style={{
                        background: done
                          ? 'oklch(62% 0.18 150)'
                          : isCurrent
                            ? 'oklch(40% 0.12 150)'
                            : 'oklch(20% 0.010 293)',
                        border: isCurrent ? '1px solid oklch(62% 0.18 150)' : '1px solid transparent',
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Next up callout */}
        {next && (
          <div
            className="mx-4 mb-4 px-4 py-3 rounded-xl"
            style={{ background: 'oklch(16% 0.010 293)', border: '1px solid oklch(22% 0.010 293)' }}
          >
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 4 }}>
              Next Up
            </p>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              Week {next.week} · Day {next.day}
            </p>
            <p style={{ fontSize: '12px', color: 'oklch(50% 0.010 293)', marginTop: 3 }}>
              ~{Math.round(totalDurationSec(next) / 60)} min
            </p>
          </div>
        )}

        {completedCount >= TOTAL && (
          <div className="mx-4 mb-4 px-4 py-3 rounded-xl text-center" style={{ background: 'oklch(16% 0.010 293)' }}>
            <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em', color: 'oklch(62% 0.18 150)' }}>
              C25K COMPLETE
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && bun run test --run src/pages/PlanPage.C25K.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd frontend && bun run test --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PlanPage.tsx frontend/src/pages/PlanPage.C25K.test.tsx
git commit -m "feat(plan): add C25K run plan progress block"
```

---

## Final Step: Push branch and open PR

- [ ] **Push branch**

```bash
git push -u origin feature/run-history-plan-sync
```

- [ ] **Open PR to dev**

```bash
gh pr create \
  --base dev \
  --title "feat: run history, C25K plan block, and run session sync" \
  --body "$(cat <<'EOF'
## Summary
- History page gains LIFT/RUN tabs — run sessions shown with week·day label, duration, distance, RPE, and interval breakdown
- Plan page gains a C25K progress block with week grid, completion %, and next-session callout
- Full-stack sync extended to include \`runSessions\` — backend adds \`run_sessions\` table (safe migration via CREATE TABLE IF NOT EXISTS), frontend pushes all and pulls delta

## Test plan
- [ ] \`cd backend && go test ./...\` — all pass including new run_session tests
- [ ] \`cd frontend && bun run test --run\` — all pass including HistoryPage and PlanPage C25K tests
- [ ] Navigate to History on device → switch to RUN tab
- [ ] Navigate to Plan on device → verify C25K block visible
- [ ] Trigger sync in Settings → confirm no errors, run sessions push to backend

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
