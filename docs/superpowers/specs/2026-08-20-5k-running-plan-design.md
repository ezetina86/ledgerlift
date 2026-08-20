# 5K Running Plan Feature — Design Spec
_Date: 2026-08-20_

## Goal

Add a Couch-to-5K (C25K) running plan to LedgerLift as an independent but integrated feature. The user is a complete beginner targeting their first 5K race. The running plan sits alongside the existing 4-day Upper/Lower lifting split without interfering with it.

---

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| What to log | Full detail: duration, distance (km), RPE 1–10 |
| Schedule coupling | Completely independent — user decides when to run |
| Navigation entry point | Second card on HomePage, below the lifting card |
| Active session UX | Guided interval timer — app coaches through each run/walk phase |
| Plan storage | Static typed constant in `src/lib/runPlan.ts` (not DB) |
| Session storage | New `runSessions` Dexie table (separate from lifting `sessions`) |

---

## C25K Program Structure

Standard 9-week plan, 3 sessions per week (27 sessions total).

| Week | Pattern | ~Duration |
|------|---------|-----------|
| 1 | 5m warmup · (60s run / 90s walk) × 8 · 5m cooldown | 30 min |
| 2 | 5m warmup · (90s run / 2m walk) × 6 · 5m cooldown | 30 min |
| 3 | 5m warmup · (90s run / 90s walk / 3m run / 3m walk) × 2 · 5m cooldown | 28 min |
| 4 | 5m warmup · (3m run / 90s walk / 5m run / 2.5m walk) × 2 · 5m cooldown | 31 min |
| 5 Day 1 | 5m warmup · (5m run / 3m walk) × 3 · 5m cooldown | 34 min |
| 5 Day 2 | 5m warmup · 8m run / 5m walk / 8m run · 5m cooldown | 31 min |
| 5 Day 3 | 5m warmup · 20m run · 5m cooldown | 30 min |
| 6 Day 1 | 5m warmup · (5m run / 3m walk) × 3 · 5m cooldown | 34 min |
| 6 Day 2 | 5m warmup · 10m run / 3m walk / 10m run · 5m cooldown | 33 min |
| 6 Day 3 | 5m warmup · 22m run · 5m cooldown | 32 min |
| 7 | 5m warmup · 25m run · 5m cooldown | 35 min |
| 8 | 5m warmup · 28m run · 5m cooldown | 38 min |
| 9 | 5m warmup · 30m run · 5m cooldown | 40 min |

Weeks 1–4 and 7–9: all 3 days per week are identical.
Week 5–6: each day has a distinct interval pattern (see above).

---

## Data Model

### Static plan — `src/lib/runPlan.ts`

```ts
type IntervalType = 'warmup' | 'run' | 'walk' | 'cooldown'

interface RunInterval {
  type: IntervalType
  durationSec: number
}

interface C25KSession {
  week: number   // 1–9
  day: number    // 1–3
  intervals: RunInterval[]
}

export const C25K_PLAN: C25KSession[]   // 27 entries

export function nextRunSession(completedCount: number): C25KSession | null
// Returns C25K_PLAN[completedCount] or null if all 27 done.

export function totalDurationSec(session: C25KSession): number
// Sum of all interval durations.
```

### DB — `runSessions` table

New Dexie table added in **version 4** migration.

```ts
interface RunSession {
  id: string
  week: number
  day: number
  startedAt: number
  completedAt: number | null
  durationSec: number | null   // actual elapsed (auto-filled from timer)
  distanceKm: number | null    // user-entered at end, optional
  rpe: number | null           // 1–10, same scale as lifting
  updatedAt: number            // auto-stamped by Dexie hook (same pattern as other tables)
}
```

Dexie index: `'id, startedAt, completedAt, updatedAt'`

**Position derivation:** `db.runSessions.filter(s => s.completedAt !== null).count()` → index into `C25K_PLAN`. No position field stored — derived at query time.

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/runPlan.ts` | C25K plan constant + helpers |
| `src/pages/RunPage.tsx` | Full-screen active run session (guided timer + completion form) |

---

## Modified Files

| File | Change |
|------|--------|
| `src/db/index.ts` | Add `RunSession` interface, `runSessions` EntityTable, v4 schema + `updatedAt` hook |
| `src/App.tsx` | Add `activeRunSessionId` state; render `<RunPage>` when set |
| `src/pages/HomePage.tsx` | Add "Next Run" card |

---

## App Flow

### App.tsx

```ts
const [activeRunSessionId, setActiveRunSessionId] = useState<string | null>(null)

// Priority: run > lift > normal nav
if (activeRunSessionId) return <RunPage sessionId={activeRunSessionId} onComplete/onBack />
if (activeSessionId)    return <WorkoutPage ... />
// else: normal BottomNav layout
```

### HomePage additions

New props added to `HomePage`:
```ts
onStartRun: (sessionId: string) => void
onResumeRun: (sessionId: string) => void
```

Below the existing lifting card:

- **Normal state:** "WEEK X · DAY Y" label + `~N MIN` duration chip + `START RUN` button
- **Run in progress:** "RESUME RUN" banner (same pattern as active lifting session banner)
- **All 27 done:** "C25K COMPLETE" celebration state replaces the card

`START RUN` creates a `RunSession` record in DB (`completedAt: null`) and calls `onStartRun(id)`.
`RESUME RUN` calls `onResumeRun(activeRunSession.id)` with the existing in-progress record's id.

---

## RunPage Design

### Phase state machine

```
'ready' → 'active' → 'done'
```

### Ready phase

Shows the full interval list for this session (type + duration for each interval). "BEGIN" button transitions to active.

**Resume policy:** Timer state is not persisted to DB. If the user navigates away mid-run and returns, `RunPage` always opens in the `ready` phase — the user taps BEGIN again and the timer restarts from 0. The `durationSec` saved at completion reflects only the post-resume elapsed time. This is acceptable for a training logger (not a race clock).

### Active phase (guided timer)

**State:**
- `intervalIdx: number` — current position in `session.intervals`
- `secondsLeft: number` — countdown within the current interval
- `elapsed: number` — total session seconds (for auto-fill at end)

**Tick logic:** Single `setInterval(1000)` decrements `secondsLeft` and increments `elapsed`. When `secondsLeft === 0`, auto-advance `intervalIdx`. When `intervalIdx` exceeds last interval, transition to `done`.

**UI (mobile, one-handed):**

```
WEEK 3 · DAY 2

      RUN            ← accent color (run) / muted grey (walk) / amber (warmup/cooldown)
     0:42            ← large Barlow Condensed countdown

████████████░░░░░    ← progress bar for current interval

Next: WALK · 1:30   ← preview of next interval

○ ○ ● ○ ○ ○ ○ ○    ← dot strip (one dot per interval, current highlighted)

[ SKIP ]  [ FINISH EARLY ]
```

- **RUN** → accent purple label
- **WALK** → muted grey label (visual rest cue)
- **WARMUP / COOLDOWN** → amber label
- **SKIP** advances `intervalIdx` immediately
- **FINISH EARLY** opens done phase with current `elapsed`

### Done phase (completion form)

```
SESSION COMPLETE
WEEK 3 · DAY 2  ✓

Duration    28:14     ← auto-filled from elapsed, display only
Distance    [____] km ← number input, optional
Effort      RPE 1–10  ← tap-to-select row (reuse SetSheet RPE pattern)

[ SAVE & FINISH ]
```

On save: writes `completedAt`, `durationSec`, `distanceKm`, `rpe` to the `runSessions` record → calls `onComplete()`.

---

## What Is Not In Scope

- Run history view (deferred — can add a "Run" tab to HistoryPage later)
- Go backend sync for `runSessions` (deferred — add when the feature is proven)
- GPS/pace tracking (user logs distance manually)
- Custom plan editing
- Multiple concurrent run plans

---

## Testing

- `src/lib/runPlan.test.ts`: assert `C25K_PLAN` has exactly 27 entries, `nextRunSession` returns correct week/day for various completed counts, `totalDurationSec` sums correctly
- `RunPage` timer logic is pure state — the tick handler can be unit-tested by calling it N times and asserting interval/phase transitions
