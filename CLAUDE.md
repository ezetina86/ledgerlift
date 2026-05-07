# LedgerLift — Claude Code Project Config

## Project Overview

**LedgerLift** is a local-first Progressive Web App (PWA) for fat-loss-focused weight training on a Pixel 9 (Android).
It implements Jeff Nippard's science-based protocols: a 4-day Upper/Lower split with RPE-based progressive overload.

## Objective

Track workouts offline-first (IndexedDB), sync to a self-hosted Go/SQLite backend in a home lab Docker container.
The app must feel native on mobile — fast, minimal UI, zero bloat, usable between sets.

---

## Tech Stack

### Frontend
- **React 19 + TypeScript** via Vite
- **Tailwind CSS v4** — mobile-first, dark mode default
- **Dexie.js** — IndexedDB wrapper for local-first persistence
- **Vite PWA plugin** — service worker + offline support + installable on Android
- **Package manager: Bun** (fast installs, native TS)

### Backend (phase 2)
- **Go 1.22+** — REST API server
- **SQLite** via `modernc.org/sqlite` (pure Go, no CGO)
- **Docker** — deployed in home lab on local network
- Sync protocol: delta-based push/pull over HTTP (no realtime needed)

---

## Repository Structure

```
ledgerlift/
├── CLAUDE.md                  # ← this file
├── Nippard Exercise Catalog.xlsx
├── .venv/                     # uv Python env (scripts only)
├── scripts/
│   └── parse_catalog.py       # xlsx → src/data/exercises.json
├── frontend/                  # React PWA
│   ├── public/
│   │   └── manifest.json
│   ├── src/
│   │   ├── data/
│   │   │   └── exercises.json # 154 exercises from catalog
│   │   ├── db/
│   │   │   └── index.ts       # Dexie schema (exercises, routines, sessions, sets)
│   │   ├── lib/
│   │   │   ├── overload.ts    # progressive overload + volume calculations
│   │   │   └── split.ts       # Upper/Lower split logic
│   │   ├── components/
│   │   └── pages/
│   ├── vite.config.ts
│   └── package.json
└── backend/                   # Go API (phase 2)
    ├── main.go
    ├── schema.sql
    └── go.mod
```

---

## Exercise Catalog (Source of Truth)

File: `Nippard Exercise Catalog.xlsx` → exported to `frontend/src/data/exercises.json`

**154 exercises across 13 primary muscle groups:**

| Group      | Count | Examples |
|------------|-------|---------|
| Back       | 23    | Chest-Supported T-Bar Row, Pull-Up |
| Shoulder   | 23    | Cable Lateral Raise, Face Pull |
| Chest      | 22    | Bench Press, Cable Crossovers |
| Biceps     | 18    | Bayesian Curl, Preacher Curl |
| Glute      | 17    | Romanian Deadlift, Hip Thrust |
| Triceps    | 16    | Overhead Cable Extension, Skullcrusher |
| Quad       | 12    | Hack Squat, Bulgarian Split Squat |
| Hamstring  | 6     | Romanian Deadlift, Lying Leg Curl |
| Neck       | 6     | Barbell Shrug, Neck Curl |
| Core       | 5     | Cable Crunch, Hanging Leg Raise |
| Calves     | 2     | Seated Calf Raise, Standing Calf Raise |
| Adductors  | 2     | Cable Hip Adduction, Hip Adduction |
| Forearm    | 2     | Wrist Curl, Wrist Extension |

**Exercise fields:**
```ts
interface Exercise {
  id: string                  // slugified name
  name: string
  primaryMuscleGroup: string
  equipment: string
  nippardTierList: boolean    // appears in Jeff's tier list video
  tierListGrade: string|null  // e.g. "5 - S+", "4 - S", "3 - A"
  muscleLadder: boolean       // featured in Muscle Ladder program
  jeffSubgroupFav: boolean
  demonstrationLink: string|null  // YouTube URL
}
```

---

## Core Data Models (Dexie / IndexedDB)

```ts
// db/index.ts
interface Routine {
  id: string
  name: string           // "Upper A", "Lower A", "Upper B", "Lower B"
  splitDay: 'upperA' | 'lowerA' | 'upperB' | 'lowerB'
  exerciseIds: string[]
  createdAt: number
}

interface WorkoutSession {
  id: string
  routineId: string
  startedAt: number
  completedAt: number | null
  notes: string
}

interface SetLog {
  id: string
  sessionId: string
  exerciseId: string
  setNumber: number
  reps: number
  weightKg: number
  rpe: number | null       // 1-10 scale
  volume: number           // computed: reps * weightKg
  timestamp: number
}
```

---

## Training Logic

### 4-Day Upper/Lower Split
- **Upper A** (Mon): Chest + Back primary, Biceps + Triceps secondary
- **Lower A** (Tue): Quad + Hamstring primary, Glutes + Calves secondary
- **Upper B** (Thu): Back + Shoulder primary, Biceps + Triceps secondary
- **Lower B** (Fri): Glute + Hamstring primary, Quad + Calves secondary

### Progressive Overload (RPE-based)
- If last session RPE ≤ 7: increase weight 2.5 kg next session
- If last session RPE 8: keep weight, add 1 rep target
- If last session RPE ≥ 9: keep weight/reps, focus form
- Volume = Sets × Reps × Weight — tracked per muscle group per week

---

## Design Principles

1. **Mobile first** — all interactions optimized for one-handed use between sets
2. **Dark mode default** — gym lighting, battery, OLED screen
3. **Minimal taps** — log a set in ≤ 3 taps from the active workout screen
4. **Offline first** — works fully without internet; syncs when home network available
5. **No bloat** — no auth, no social, no subscriptions. Just logging.

---

## Development Commands

```bash
# Frontend dev
cd frontend && bun dev

# Export exercise catalog
.venv/bin/python scripts/parse_catalog.py

# Backend (phase 2)
cd backend && go run main.go
```

---

## Phase Roadmap

- [x] Phase 0: Project init + CLAUDE.md
- [x] Phase 1: Exercise catalog JSON export + Dexie schema
- [x] Phase 2: Frontend scaffold (Vite + React + Tailwind + PWA)
- [x] Phase 3: Core UI — Routine view, Active Workout, Set Logger
- [x] Phase 4: Progressive overload engine + Volume dashboard
- [x] Phase 5: Go backend + sync protocol
- [x] Phase 6: Docker deployment to home lab

---

## Branch Workflow

```
feature/<name>  →  PR to dev  →  CI gate  →  merge
dev             →  PR to master ("promote")  →  CI gate  →  merge  →  Docker :latest published
```

**Rules (enforced by branch protection):**
- **Never commit directly to `master` or `dev`**
- All work goes on a `feature/*`, `fix/*`, or `chore/*` branch
- Feature branches target `dev` (never `master`)
- Only `dev` → `master` PRs promote to production
- Use `/ship <slug>` to create branch · commit · push · open PR to dev

**To promote dev → production:**
```bash
gh pr create --base master --head dev --title "chore: promote dev → master"
```
CI must pass; then merge → CD Prod publishes `ezetina86/ledgerlift:latest`.

---

## Notes for Claude

- Always use `bun` for frontend package operations (never npm or yarn)
- Keep components small and co-located with their logic
- Prefer Tailwind utility classes over custom CSS
- All weights in **kg** (user preference)
- RPE scale is **1–10** (Nippard convention, not Borg)
- Never add auth, user accounts, or cloud services — this is a local app
- The `.venv` is for Python scripts only (xlsx parsing), not app runtime
- **Never commit directly to `master` or `dev`** — always use `/ship` to open a PR to `dev`
