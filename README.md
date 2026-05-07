# LedgerLift

A local-first PWA workout tracker built on Jeff Nippard's science-based protocols. Logs sets in ≤ 3 taps, works offline, syncs to a self-hosted Go/SQLite backend over your home network.

## Features

- **4-day Upper/Lower split** — Upper A → Lower A → Upper B → Lower B, cycling automatically
- **RPE-based progressive overload** — suggests next session's weight or reps based on how hard your last set felt
- **Weight pre-fill** — automatically loads the last weight used for each exercise so you start from where you left off
- **Mesocycle management** — track 4–6 week training blocks; start new cycles, toggle deload week, view full history
- **Exercise swaps** — swap any exercise in a routine from the full 154-exercise catalog; swap history recorded per mesocycle
- **Fatigue detection** — warns when RPE creeps ≥ 9 across consecutive sessions and suggests a deload
- **Deload support** — deload badge in the workout header; exercise blocks show halved set targets automatically
- **154-exercise catalog** — curated from Nippard's tier list and Muscle Ladder program, with YouTube demo links
- **Weekly volume dashboard** — rolling 7-day volume per muscle group with sparkline progression charts
- **Personal records** — all-time best weight per exercise, updated automatically
- **Offline first** — IndexedDB (Dexie.js) stores everything locally; installable as a PWA on Android
- **Optional sync** — delta sync to a self-hosted Go/SQLite backend; last-write-wins conflict resolution

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS v4 |
| Local DB | Dexie.js (IndexedDB) |
| PWA | `vite-plugin-pwa` · Workbox service worker |
| Backend | Go 1.22 · SQLite (`modernc.org/sqlite`, no CGO) |
| Deployment | Docker · single binary via `go:embed` |
| Testing | Vitest 4 (frontend) · Go stdlib `testing` (backend) |
| Package manager | Bun |

## Project Structure

```
ledgerlift/
├── frontend/                  # React PWA
│   ├── src/
│   │   ├── components/        # BottomNav, ExerciseBlock, ExercisePickerSheet, SetSheet
│   │   ├── db/index.ts        # Dexie schema v3 — exercises, routines, sessions, sets, mesocycles, exerciseSwaps
│   │   ├── lib/
│   │   │   ├── overload.ts    # RPE overload engine, volume analytics, fatigue detection
│   │   │   ├── split.ts       # 4-day cycle logic, mesocycle week helper
│   │   │   ├── sync.ts        # Delta sync client
│   │   │   └── utils.ts       # Formatting helpers
│   │   ├── pages/             # Home, Workout, Catalog, Progress, History, Settings, Plan
│   │   └── data/exercises.json  # 154 exercises (generated from xlsx)
│   ├── vitest.config.ts
│   └── vite.config.ts
├── backend/                   # Go API
│   ├── main.go                # HTTP server, SPA handler, CORS
│   ├── db.go                  # SQLite schema, upserts, delta fetch
│   ├── models.go              # Go structs mirroring TS types
│   ├── db_test.go             # DB integration tests
│   ├── handlers_test.go       # HTTP handler tests
│   └── Dockerfile             # 3-stage build (bun → go → alpine)
├── scripts/
│   ├── parse_catalog.py       # xlsx → exercises.json
│   └── install-hooks.sh       # installs pre-push hook (blocks direct push to master/dev)
├── .claude/commands/ship.md   # /ship slash command — branch, version, changelog, PR
├── docker-compose.yml
└── Makefile
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- [Go 1.22+](https://go.dev/dl/)
- [Docker](https://docs.docker.com/get-docker/) (for deployment only)

### Frontend dev server

```bash
cd frontend
bun install
bun run dev --host     # --host exposes on LAN for testing on phone
```

Open `http://localhost:5173`. The app seeds itself with the exercise catalog and default routines on first load.

### Backend dev server

```bash
cd backend
go run . -db ledgerlift.db
```

API available at `http://localhost:9090`. Set the server URL in the app's **Settings** tab to enable sync.

### Run both together

```bash
make dev
```

## Make Targets

```
make dev          Start frontend (bun dev) + backend (go run) in parallel
make build        Build frontend then embed into Go binary
make deploy       Build Docker image and start container
make logs         Tail container logs
make backup       Copy SQLite from Docker volume → ./backups/
make restore      Restore latest backup into Docker volume (prompts confirmation)
make catalog      Re-export exercises from xlsx → exercises.json
make clean        Remove build artifacts
```

## Deployment (Home Lab)

The backend serves the compiled frontend via `go:embed` — one binary, no separate static file server.

```bash
make deploy       # builds image + starts container on port 9090
```

Data persists in a Docker named volume (`ledgerlift-data`). The app connects to the backend over your local network; configure the URL in **Settings → Server URL**.

```bash
make backup       # → backups/ledgerlift_20240115_143022.db
make restore      # restores latest backup (destructive — prompts)
```

## Branch Workflow

```
feature/<slug>  →  dev  →  master
```

- All work goes on a `feature/*`, `fix/*`, or `chore/*` branch
- PRs target `dev`; direct pushes to `dev` and `master` are blocked by a pre-push hook
- `master` is promote-only — merge `dev → master` to publish a new Docker image

Install the pre-push hook after a fresh clone:

```bash
bash scripts/install-hooks.sh
```

Use the `/ship` Claude Code command to automate branching, versioning, changelog, and PR creation:

```
/ship add-rest-timer
```

## Testing

```bash
# Frontend — 153 tests
cd frontend && bun run test

# Backend — 50 tests
cd backend && go test ./... -v
```

Frontend tests use Vitest with jsdom. Backend tests use Go's stdlib `testing` package with per-test temporary SQLite files. Backend coverage is gated at ≥ 80% in CI.

## Overload Logic

```
Last session RPE ≤ 7  →  +2.5 kg next session (same reps)
Last session RPE = 8  →  same weight, +1 rep target
Last session RPE ≥ 9  →  hold weight and reps, cue form
```

RPE is optional per set; when omitted it defaults to 8 for suggestion purposes.

## Sync Protocol

The sync is intentionally simple: push all local records, pull everything updated since `lastSyncAt`. Conflict resolution is last-write-wins on `updatedAt`. No accounts, no tokens, no external services.

```
POST /api/sync   { lastSyncAt, sessions[], sets[], routines[], mesocycles[], exerciseSwaps[] }
→                { syncedAt,   sessions[], sets[], routines[], mesocycles[], exerciseSwaps[] }
```

## Exercise Catalog

154 exercises from Jeff Nippard's research, exported from `Nippard Exercise Catalog.xlsx`.

To regenerate after editing the spreadsheet:

```bash
# Create Python env (first time only)
uv venv .venv && uv pip install openpyxl --python .venv/bin/python

make catalog
```

Fields per exercise: `id`, `name`, `primaryMuscleGroup`, `equipment`, `tierListGrade` (S+/S/A/B/C), `muscleLadder`, `jeffSubgroupFav`, `demonstrationLink` (YouTube).
