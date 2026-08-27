# Run Progress Integration — Design Spec

**Date:** 2026-08-27
**Status:** Proposed

## Problem

The current `ProgressPage` only reflects lifting data:

- weekly volume by muscle group from `db.sets`
- lifting PRs from `db.sets`
- per-exercise progression from `db.sets`

Running sessions live in a separate `db.runSessions` table, so completed C25K sessions do not appear anywhere in the Progress section. This makes the new running feature feel disconnected from the rest of the app.

## Requirements

- Running progress must live inside the existing **Progress** area, not as a separate top-level page.
- Keep the current lifting progress experience intact.
- Do **not** force incomparable metrics into one chart/card (e.g. barbell tonnage vs run distance).
- Must work even when optional run fields are missing (`distanceKm`, `rpe`).
- Mobile-first, fast to scan, minimal taps, dark-mode aligned with the existing UI.

## Options considered

### Option A — Blend lifting and running into one unified overview

Example: mix weekly lifting volume, total run distance, and PRs in one continuous feed.

**Why not:** the metrics are fundamentally different. Tonnage, PRs, duration, and distance do not share the same mental model. This would feel noisy and hard to interpret on a phone.

### Option B — Add a run section below the existing lifting sections

Example: keep current lifting cards, then append a new “Running Progress” block further down.

**Why not as the primary approach:** it is simple, but the page becomes long and the lifting-first framing remains dominant. On a small screen the user has to scroll past strength metrics to reach run metrics every time.

### Option C — Add a segmented control inside Progress: **Lift | Run** ✅

This keeps one Progress destination while giving each training mode its own tailored view.

**Why this is the best option:**

- preserves the existing lifting UX with minimal risk
- makes run progress first-class without clutter
- aligns with the app’s mobile-first / minimal-taps goals
- avoids mixing incompatible metrics
- scales later if a third mode (“Overview”) is ever needed

## Recommended approach

Add a compact segmented control at the top of `ProgressPage`:

- **LIFT** — current view, unchanged in behavior
- **RUN** — new run-focused view powered by `db.runSessions`

Default to **LIFT** so existing behavior stays familiar.

## Run tab content

The run tab should prioritize metrics that are robust with the current data model.

### 1) Program progress hero

Show:

- completed sessions: `X / 27`
- completion percentage
- next session: `WEEK N · DAY M` or `PLAN COMPLETE`

This is the clearest top-level measure for a fixed C25K program.

### 2) Key stats row

Show 2–3 compact stats:

- **Longest Run Interval** — derived from the matched C25K session definition, not user-entered distance
- **Total Run Time** — sum of completed `durationSec`
- **Distance Logged** — sum of non-null `distanceKm` values; if none exist, show an “optional” empty state

These are meaningful even if the user does not log GPS-heavy data every time.

### 3) Session trend chart

Primary chart:

- **Session Duration Trend** — sparkline using completed `durationSec`

This is always available and naturally shows progression through the C25K plan.

Secondary chart, conditional:

- **Distance Trend** — only render when at least 2 completed runs have `distanceKm`

Do **not** make the run tab depend on distance logging.

### 4) Effort trend / recovery signal

If at least 2 completed runs have `rpe`, show a small trend or summary:

- recent average RPE
- latest RPE

If RPE is sparse, omit the section instead of showing broken UI.

## Data helpers

Create a dedicated pure helper module:

- `frontend/src/lib/runProgress.ts`

Suggested responsibilities:

- filter/sort completed run sessions
- compute completion summary (`completed`, `remaining`, `nextPlan`)
- compute longest completed continuous run interval
- compute total duration and total logged distance
- build trend points for duration / distance / RPE

This keeps `ProgressPage` thin and makes the run analytics easy to test.

## Files impacted

| File | Change |
|------|--------|
| `frontend/src/pages/ProgressPage.tsx` | Add segmented control and render lift vs run view |
| `frontend/src/lib/runProgress.ts` | New pure helpers for run analytics |
| `frontend/src/lib/runProgress.test.ts` | Unit tests for run analytics helpers |
| `frontend/src/components/RunProgressPanel.tsx` | New run-specific progress UI |

## Out of scope

- changing `HistoryPage` to mix lifting + running history
- adding GPS tracking or automatic distance capture
- changing the C25K plan structure
- syncing `runSessions` to the Go backend (current scope is frontend progress only)
