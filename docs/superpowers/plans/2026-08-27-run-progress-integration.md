# Run Progress Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate completed C25K running sessions into the existing **Progress** section without weakening the current lifting progress experience.

**Architecture:** Keep one top-level `ProgressPage`, but split it into two in-page modes via a segmented control: **LIFT** and **RUN**. Preserve the current lifting metrics exactly as they are. Add a new run-focused panel backed by `db.runSessions` and pure helpers in `src/lib/runProgress.ts`.

**Tech Stack:** React 19 + TypeScript, Dexie.js, Vite, Vitest, Bun

## Global Constraints

- Package manager: **bun** (never npm or yarn)
- Run tests with: `bun run test` (NOT `bun test`)
- All weights remain in **kg** internally; do not alter lifting calculations
- RPE remains **1–10**
- Keep components small and co-located when reasonable
- Prefer Tailwind utility classes over custom CSS
- Never commit directly to `master` or `dev` — use `/ship` to open a PR to `dev`

---

## Recommended UX decision

Implement **Option C: segmented Progress view (`LIFT | RUN`)**.

Why:

- best mobile ergonomics
- minimal disruption to the existing lifting page
- avoids mixing incompatible training metrics
- gives running a first-class place in the app

---

### Task 1: Add pure run-progress analytics helpers

**Files:**
- Create: `frontend/src/lib/runProgress.ts`
- Create: `frontend/src/lib/runProgress.test.ts`

**Interfaces:**
- Consumes: `RunSession` from `src/db/index.ts`
- Consumes: `C25K_PLAN` and `nextRunSession` from `src/lib/runPlan.ts`
- Produces:
  - completion summary
  - longest completed run interval
  - total run time
  - total logged distance
  - duration / distance / RPE trend points

- [ ] **Step 1: Create helper types**

Define small, explicit types such as:

```ts
interface RunSummary {
  completedCount: number
  totalPlanned: number
  completionPct: number
  nextSessionLabel: string | null
}

interface RunTrendPoint {
  label: string
  value: number
  timestamp: number
}
```

- [ ] **Step 2: Implement completed-session filtering + stable sorting**

Helpers should:

- ignore incomplete run sessions (`completedAt === null`)
- sort oldest → newest by completion time (fallback to `startedAt`)
- never rely on UI order

- [ ] **Step 3: Implement summary helpers**

Add pure functions for:

- `runSummary(runSessions)`
- `totalRunDurationSec(runSessions)`
- `totalLoggedDistanceKm(runSessions)`
- `longestCompletedRunIntervalSec(runSessions)`

`longestCompletedRunIntervalSec` should derive its answer from the matching C25K plan definition (`week` + `day`) and the longest `run` interval in that planned session.

- [ ] **Step 4: Implement chart/trend helpers**

Add:

- `durationTrend(runSessions)` — all completed runs with `durationSec`
- `distanceTrend(runSessions)` — completed runs with non-null `distanceKm`
- `rpeTrend(runSessions)` — completed runs with non-null `rpe`

- [ ] **Step 5: Add unit tests**

Cover at minimum:

- incomplete run sessions are excluded
- summary counts are correct
- next session label advances correctly
- longest run interval is derived correctly for milestone sessions
- distance trend ignores null distance
- RPE trend ignores null RPE
- duration totals sum correctly

- [ ] **Step 6: Run tests**

```bash
cd frontend && bun run test --run src/lib/runProgress.test.ts
```

Expected: all run-progress helper tests pass.

---

### Task 2: Build the run-specific progress panel

**Files:**
- Create: `frontend/src/components/RunProgressPanel.tsx`

**Interfaces:**
- Consumes: `db.runSessions`
- Consumes: helpers from `src/lib/runProgress.ts`

- [ ] **Step 1: Load run sessions from Dexie**

Use `useLiveQuery` to read all run sessions, then compute derived data via `useMemo`.

- [ ] **Step 2: Add a program-progress hero card**

Render:

- `X / 27` completed
- completion percentage
- next planned session (`WEEK N · DAY M`) or `PLAN COMPLETE`

- [ ] **Step 3: Add the key stats row**

Show:

- Longest Run Interval
- Total Run Time
- Distance Logged

Distance should degrade gracefully:

- if total logged distance is `0` because all entries are null, show a muted helper like “Add distance after runs to track this”.

- [ ] **Step 4: Add the duration trend card**

Use the existing sparkline visual language from `ProgressPage` or extract a shared sparkline if that keeps code cleaner.

Primary trend = session duration.

- [ ] **Step 5: Add conditional secondary sections**

Only render when data exists:

- Distance trend card if there are at least 2 distance points
- Effort/RPE trend card if there are at least 2 RPE points

If there are no completed runs yet, show an empty state like:

`Complete a run to see C25K progress`

- [ ] **Step 6: Keep styling aligned with existing Progress page**

Use:

- dark surfaces already used on `ProgressPage`
- Barlow Condensed for labels/headlines
- green/purple accent cues that feel consistent with the rest of LedgerLift

---

### Task 3: Wire segmented Lift/Run navigation into ProgressPage

**Files:**
- Modify: `frontend/src/pages/ProgressPage.tsx`

**Interfaces:**
- Consumes: new `RunProgressPanel`

- [ ] **Step 1: Add local view state**

Add:

```ts
const [mode, setMode] = useState<'lift' | 'run'>('lift')
```

- [ ] **Step 2: Add segmented control near the page header**

Use a 2-option pill/toggle:

- LIFT
- RUN

Requirements:

- easy thumb target
- strong active state
- minimal vertical space

- [ ] **Step 3: Keep the existing lifting content intact**

Wrap the current Weekly Volume + Personal Records UI behind:

```tsx
{mode === 'lift' ? <LiftingContent /> : <RunProgressPanel />}
```

If `ProgressPage.tsx` becomes too large, extract the existing lifting content into a local subcomponent or `LiftingProgressPanel.tsx`.

- [ ] **Step 4: Preserve the exercise drill-down**

`ExerciseDashboardSheet` should still open only from the lifting mode. Switching to run mode should close or hide lifting-specific overlays cleanly.

- [ ] **Step 5: Verify empty states**

Confirm:

- no lifting data + no run data
- lifting data only
- run data only
- mixed data

all render sensibly.

---

### Task 4: Test and manually validate

**Files:**
- Optional test updates in `frontend/src/pages/ProgressPage`-adjacent files if needed

- [ ] **Step 1: Run focused tests**

```bash
cd frontend && bun run test --run src/lib/runProgress.test.ts src/lib/runPlan.test.ts src/lib/overload.test.ts
```

- [ ] **Step 2: Run the full frontend suite**

```bash
cd frontend && bun run test --run
```

- [ ] **Step 3: Manual smoke test**

```bash
cd frontend && bun dev
```

Verify:

1. `Progress` opens in **LIFT**
2. Existing lifting Weekly Volume and PR cards still work unchanged
3. Tapping **RUN** shows run-specific progress
4. Completed runs update the run progress cards immediately
5. Run tab still looks useful when `distanceKm` is missing
6. Exercise drill-down does not leak into run mode
7. The page remains readable on a narrow mobile viewport

---

### Task 5: Ship cleanly

- [ ] **Step 1: Review changed files**

Expected changed files:

- `frontend/src/pages/ProgressPage.tsx`
- `frontend/src/components/RunProgressPanel.tsx`
- `frontend/src/lib/runProgress.ts`
- `frontend/src/lib/runProgress.test.ts`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ProgressPage.tsx \
        frontend/src/components/RunProgressPanel.tsx \
        frontend/src/lib/runProgress.ts \
        frontend/src/lib/runProgress.test.ts \
        docs/superpowers/specs/2026-08-27-run-progress-integration-design.md \
        docs/superpowers/plans/2026-08-27-run-progress-integration.md
git commit -m "feat(progress): add run progress view"
```

- [ ] **Step 3: Open PR to `dev` using the normal project workflow**

Use a feature branch, then `/ship` when ready.
