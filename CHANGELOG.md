# Changelog

All notable changes to LedgerLift are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- CI/CD pipeline with GitHub Actions (`.github/workflows/`):
  - `ci.yml` — PR quality gate: lint, type-check, test, frontend build, Docker verify
  - `cd-dev.yml` — push to `dev` builds and publishes `ledgerlift:dev-<sha>` to ghcr.io
  - `cd-prod.yml` — push to `master` or `v*.*.*` tag publishes `ledgerlift:latest` and semver tags; includes commented-out SSH home-lab deploy job ready for activation
- Branching strategy documented: `master` (production) / `dev` (integration) / `feature/*` / `fix/*` / `hotfix/*`
- Makefile targets: `make test`, `make test-frontend`, `make test-backend`, `make lint`, `make ci`
- This `CHANGELOG.md` file

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

[Unreleased]: https://github.com/github_username/ledgerlift/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/github_username/ledgerlift/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/github_username/ledgerlift/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/github_username/ledgerlift/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/github_username/ledgerlift/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/github_username/ledgerlift/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/github_username/ledgerlift/compare/v0.0.0...v0.1.0
[0.0.0]: https://github.com/github_username/ledgerlift/releases/tag/v0.0.0
