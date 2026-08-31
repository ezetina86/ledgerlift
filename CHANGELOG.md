# Changelog

All notable changes to LedgerLift are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.13.1] - 2026-08-31

### Fixed
- **Sync data corruption** — client now pushes only records modified since `lastSyncAt` (delta push). Previously, every sync pushed all local records; the backend stamped them with the current server time, causing the last device to sync to silently overwrite newer data from another device. Last-write-wins now resolves correctly across phone and laptop.

---

## [0.13.0] - 2026-08-28

### Added
- **Version display** — Settings → About now shows the current app version (`vX.Y.Z`), baked in at build time from the `VERSION` file.
- **Check for Updates button** — Settings → App Update triggers a service worker refresh and page reload, letting you force the latest deployed version without clearing browser data.

---

## [0.12.0] - 2026-08-25

### Added
- **Interval pause/resume** — tap PAUSE mid-interval to freeze both the countdown and total elapsed timer; tap RESUME to continue from exactly where you stopped. Button sits between SKIP and FINISH EARLY in the active run view. The interval label shows PAUSED (dimmed) while frozen.

---

## [0.11.0] - 2026-08-24

### Added
- **Screen wake lock** — screen stays on during active run sessions via the Web Wake Lock API; auto-releases when session ends or pauses
- **Global session timer** — total elapsed time displayed below the interval countdown on the active run screen
- **Interval transition warnings** — last 5 seconds of each interval: label and countdown turn red with pulse/bounce animations; last 3 seconds play an 880 Hz audio beep (created on BEGIN tap to satisfy browser autoplay policy)

---

## [0.10.1] - 2026-06-30

### Fixed
- **Swap exercise stale closure** — rapid or resumed swaps no longer lose previously applied swaps; `handleSwapSelect` now uses `effectiveSwaps` (merged persisted + pending) as the write base instead of the potentially stale `session?.swaps` from `useLiveQuery`

---

## [0.10.0] - 2026-06-04

### Added
- **Mid-workout extra exercise** — ADD EXERCISE button at the bottom of any active workout session
- Tapping ADD EXERCISE opens `ExercisePickerSheet` filtered to exclude exercises already in the routine
- Extra exercises are session-scoped: the routine is never mutated; they don't appear in future sessions
- Extra exercises persisted to `WorkoutSession.extraExercises` (IndexedDB) — survives page refresh during active workout
- EXTRA badge on exercise block header to distinguish session additions from routine exercises
- `extraExercises?: RoutineExercise[]` field added to `WorkoutSession` (no migration needed)
- `excludeIds?: string[]` prop added to `ExercisePickerSheet` for filtering already-used exercises

---

## [0.9.0] - 2026-06-04

### Added
- **Mid-workout exercise swap** — SWAP button on every exercise block during an active session
- Tapping SWAP opens `ExercisePickerSheet` pre-filtered to the same muscle group (instant substitution suggestions)
- Swap is session-scoped: the routine is never mutated; future workouts restore the original plan
- Swaps persisted to `WorkoutSession.swaps` (IndexedDB) so resume-workout correctly restores substitutions
- SWAPPED badge on the exercise block header after a substitution is applied
- `swaps?: Record<string, string>` field added to `WorkoutSession` (no migration needed)

---

## [0.8.0] - 2026-05-07

### Added
- **Visual Progress Dashboard** (Phase 8)
- `ExerciseDashboardSheet` — full-screen bottom-sheet overlay with recharts charts:
  - Stat chips: all-time PR weight, session count, best reps
  - Weight Over Time `AreaChart` with purple gradient fill
  - Volume Per Session `BarChart`
  - RPE Trend `LineChart` with per-dot color coding (green ≤7 / yellow 8 / orange 9 / red ≥10); hidden when fewer than 3 data points
  - Last 3 sessions grouped set list with RPE badges
  - Slide-up animation with backdrop fade
- `recharts@3.8.1` dependency for responsive chart components
- **ProgressPage** — Weekly Volume section overhaul:
  - `THIS WEEK · Xk kg` header in 28px Barlow Condensed ExtraBold
  - Volume bars now 8px tall with staggered CSS entry animation (`700ms ease-out`, 75ms delay per bar)
  - Each bar row displays actual volume (`15,700 kg`) + set count on a second line with a colour dot
- **ProgressPage** — Personal Records redesigned as a tappable 2-column card grid:
  - Muscle group chip with `color-mix` tint, trend indicator (↑ purple / → gray)
  - 32px best-weight number in Barlow Condensed ExtraBold
  - 32px mini sparkline showing weight progression history
  - Removed the 15-row cap — all ever-logged exercises shown
  - Tap any card → opens `ExerciseDashboardSheet` for that exercise
- `useMemo` for `exMap`, `volByGroup`, `prs`, and `progressionMap` to avoid redundant recomputation

### Removed
- Exercise Trend dropdown section (`<select>` + static `Sparkline`) from ProgressPage — superseded by the drill-down sheet

---

## [0.7.0] - 2026-05-07

### Added
- **Mesocycle management** (Phase 7)
- `Mesocycle` + `ExerciseSwap` Dexie tables (schema v3); `mesocycleId` / `isDeload`
  fields on `WorkoutSession`
- Auto-seeds Mesocycle 1 on first app load
- **PLAN tab** in bottom nav → `PlanPage`:
  - Active mesocycle card with week progress bar, deload toggle, and end-cycle action
  - Start new mesocycle sheet (name + 4/5/6 week target picker)
  - 4 routine cards with per-exercise **SWAP** button backed by `ExercisePickerSheet`
  - Completed mesocycle history (dates, session count, total volume, swap log)
- `ExercisePickerSheet` — reusable bottom sheet with live search and muscle-group filter chips
- **Fatigue detection** (`detectFatigue`, `rpeHistory` in `overload.ts`): surfaces a
  warning banner on HomePage when any exercise hits RPE ≥ 9 in 2+ consecutive sessions
- **Mesocycle status chip** on HomePage with inline week progress bar
- `mesocycleWeek()` helper in `split.ts`
- **Deload mode**: WorkoutPage shows DELOAD badge; ExerciseBlock shows halved set target
  and orange "DELOAD TARGET" banner when `isDeload` is active
- Sync: push/pull `mesocycles` + `exerciseSwaps` with backend
- Go backend: `mesocycles` + `exercise_swaps` SQL tables; `mesocycle_id` / `is_deload`
  columns on `sessions`; upsert/fetch helpers; updated `/api/sync` handler
- 18 new tests (153 frontend total, 37 backend total)
- `feature → dev → master` branch workflow documented in `CLAUDE.md`
- `/ship` slash command (`.claude/commands/ship.md`)
- `scripts/install-hooks.sh` — installs pre-push hook that blocks direct pushes to
  `master` / `dev`

### Fixed
- ESLint `react-hooks/exhaustive-deps` warnings in `ExercisePickerSheet`, `HomePage`,
  `PlanPage` — `?? []` fallbacks moved inside `useMemo` callbacks
- Removed unused `onNavigate` prop from `PlanPage`

### Changed
- CI/CD pipeline with GitHub Actions (`.github/workflows/`):
  - `ci.yml` — PR quality gate: lint, type-check, test, frontend build, Docker verify
  - `cd-dev.yml` — push to `dev` builds and publishes `ledgerlift:dev-<sha>` to Docker Hub
  - `cd-prod.yml` — merge to `master` (promote) publishes `ledgerlift:latest` and semver
    tags; direct pushes to `master` blocked by pre-push hook
- `dev` integration branch created; `master` is promote-only

---

## [0.6.0] - 2026-05-04

### Added
- Docker home-lab deployment (Phase 6)
- Three-stage Dockerfile: `oven/bun` frontend build → `golang:1.25-alpine` Go builder → `alpine:3.19` runtime
- `docker-compose.yml` with named volume `ledgerlift-data` for SQLite persistence
- Container health check via `wget` to `/api/health`
- `make deploy` — builds and recreates container in one command
- `make backup` — snapshots live SQLite DB from Docker volume to `./backups/`
- `make restore` — destructive restore with confirmation prompt
- `make stop` / `make restart` / `make logs` convenience targets
- Single Go binary (9.8 MB) embedding `frontend/dist/` via `go:embed static/*`
- `CGO_ENABLED=0` build — pure Go SQLite via `modernc.org/sqlite`, no native deps

### Fixed
- Docker builder upgraded to `golang:1.25-alpine` with `GOTOOLCHAIN=local` to resolve toolchain version mismatch
- SPA fallback uses `sub.Open(path)` existence check instead of `StatFS` (subFS does not implement `StatFS`)
- Port conflict resolved — default port changed to 9090

---

## [0.5.0] - 2026-05-03

### Added
- Go backend REST API (Phase 5)
- SQLite database via `modernc.org/sqlite` (pure Go, no CGO)
- Delta-based sync protocol: push/pull over HTTP, no realtime required
- Endpoints: `GET/POST /api/sessions`, `GET/POST /api/sets`, `GET /api/health`, `GET /api/sync`
- `backend/main.go` — server entrypoint with `go:embed static/*` for frontend
- `backend/db.go` — SQLite connection and schema migrations
- `backend/models.go` — shared data model structs
- `backend/handlers_test.go` + `backend/db_test.go` — 33 Go tests using stdlib `testing`
- `backend/schema.sql` — canonical schema (exercises, routines, sessions, sets, sync_log)
- `testDB(t)` helper — creates isolated temp-file SQLite per test case

---

## [0.4.0] - 2026-05-02

### Added
- Progressive overload engine (Phase 4)
- RPE-based weight progression: RPE ≤ 7 → +2.5 kg, RPE 8 → +1 rep, RPE ≥ 9 → hold
- Volume dashboard: weekly sets × reps × weight per muscle group
- `frontend/src/lib/overload.ts` — overload calculation logic
- Vitest test suite: `overload.test.ts`, `split.test.ts`, `sync.test.ts`, `utils.test.ts` (90 tests total)
- `frontend/vitest.config.ts` — Vitest config with jsdom environment
- `vi.stubGlobal` for `localStorage` to handle Node.js 22 compatibility

---

## [0.3.0] - 2026-05-01

### Added
- Core UI screens (Phase 3)
- Routine view — displays 4-day Upper/Lower split with exercise cards
- Active Workout screen — set-by-set logging with RPE input
- Set Logger component — log a set in ≤ 3 taps
- Dexie v4 integration with `EntityTable` generics for typed tables

---

## [0.2.0] - 2026-04-30

### Added
- Frontend scaffold (Phase 2)
- React 19 + TypeScript via Vite
- Tailwind CSS v4 with `@tailwindcss/vite` plugin (no `tailwind.config.js` needed)
- `vite-plugin-pwa` v1.2.0 — service worker, offline support, installable on Android
- Dark mode default with OLED-friendly color palette
- `frontend/src/lib/split.ts` — Upper/Lower split logic

---

## [0.1.0] - 2026-04-29

### Added
- Exercise catalog export (Phase 1)
- `scripts/parse_catalog.py` — parses `Nippard Exercise Catalog.xlsx` into `exercises.json`
- 154 exercises across 13 primary muscle groups with tier-list grades, equipment, and demo links
- Dexie schema: `Exercise`, `Routine`, `WorkoutSession`, `SetLog` interfaces

---

## [0.0.0] - 2026-04-28

### Added
- Project initialisation (Phase 0)
- `CLAUDE.md` — full project specification and development conventions
- Repository structure: `frontend/`, `backend/`, `scripts/`
- Jeff Nippard 4-day Upper/Lower split protocol documented
- RPE 1-10 scale (Nippard convention) established as project standard

[Unreleased]: https://github.com/ezetina86/ledgerlift/compare/v0.13.0...HEAD
[0.13.0]: https://github.com/ezetina86/ledgerlift/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ezetina86/ledgerlift/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ezetina86/ledgerlift/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/ezetina86/ledgerlift/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/ezetina86/ledgerlift/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/ezetina86/ledgerlift/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ezetina86/ledgerlift/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ezetina86/ledgerlift/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ezetina86/ledgerlift/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ezetina86/ledgerlift/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ezetina86/ledgerlift/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ezetina86/ledgerlift/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ezetina86/ledgerlift/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ezetina86/ledgerlift/compare/v0.0.0...v0.1.0
[0.0.0]: https://github.com/ezetina86/ledgerlift/releases/tag/v0.0.0
