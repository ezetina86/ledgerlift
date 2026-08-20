# 5K Running Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Couch-to-5K (C25K) guided run plan to LedgerLift — a second, independent training track that sits on the Home screen alongside the existing Upper/Lower lifting split.

**Architecture:** Static C25K plan data lives in `src/lib/runPlan.ts` (never DB — it's a fixed 9-week program). Completed run sessions are stored in a new `runSessions` Dexie table (v4 migration). `RunPage` is a full-screen overlay — same pattern as `WorkoutPage` — launched from a new card on `HomePage`.

**Tech Stack:** React 19 + TypeScript, Dexie.js v4 (EntityTable), Vitest 4.x + jsdom, Tailwind CSS v4, Barlow Condensed font.

## Global Constraints

- Package manager: `bun` always — never npm or yarn
- Test command: `bun run test` from `frontend/` (NOT `bun test`)
- All weights/distances in metric (km)
- RPE scale 1–10 (Nippard convention)
- Dark mode default; use `oklch()` color tokens matching existing palette
- Font: `'Barlow Condensed', sans-serif` for all headings and labels; `fontFamily: 'Barlow', sans-serif` for body numbers (`className="num"`)
- Never commit directly to `master` or `dev` — use `/ship` to open a PR to `dev`
- C25K plan has exactly 27 sessions (9 weeks × 3 days)
- DB must stay backward-compatible — v4 migration adds a new table, no upgrade() needed

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/runPlan.ts` | C25K plan constant, types, helpers, tickTimer |
| Create | `src/lib/runPlan.test.ts` | Tests for plan data + helpers + tickTimer |
| Create | `src/pages/RunPage.tsx` | Full-screen guided timer + completion form |
| Modify | `src/db/index.ts` | RunSession interface, runSessions table, v4 schema, updatedAt hook |
| Modify | `src/App.tsx` | activeRunSessionId state, render RunPage |
| Modify | `src/pages/HomePage.tsx` | Next Run card (start/resume/complete states) |

---

## Task 1: Plan data, types, and timer logic

**Files:**
- Create: `src/lib/runPlan.ts`
- Create: `src/lib/runPlan.test.ts`

**Interfaces produced (consumed by Tasks 3 & 4):**
```ts
export type IntervalType = 'warmup' | 'run' | 'walk' | 'cooldown'
export interface RunInterval { type: IntervalType; durationSec: number }
export interface C25KSession  { week: number; day: number; intervals: RunInterval[] }
export interface TimerState {
  phase: 'ready' | 'active' | 'done'
  intervalIdx: number
  secondsLeft: number
  elapsed: number        // total seconds since BEGIN tapped
}
export const C25K_PLAN: C25KSession[]                            // 27 entries
export function nextRunSession(completedCount: number): C25KSession | null
export function totalDurationSec(session: C25KSession): number
export function tickTimer(state: TimerState, intervals: RunInterval[]): TimerState
```

- [ ] **Step 1.1: Write the failing tests**

Create `frontend/src/lib/runPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  C25K_PLAN, nextRunSession, totalDurationSec, tickTimer,
} from './runPlan.ts'
import type { TimerState } from './runPlan.ts'

describe('C25K_PLAN', () => {
  it('has exactly 27 sessions', () => {
    expect(C25K_PLAN).toHaveLength(27)
  })

  it('starts at week 1 day 1', () => {
    expect(C25K_PLAN[0]).toMatchObject({ week: 1, day: 1 })
  })

  it('ends at week 9 day 3', () => {
    expect(C25K_PLAN[26]).toMatchObject({ week: 9, day: 3 })
  })

  it('week 1 sessions have 18 intervals (warmup + 8×run+walk + cooldown)', () => {
    // 1 + 16 + 1 = 18
    expect(C25K_PLAN[0].intervals).toHaveLength(18)
    expect(C25K_PLAN[1].intervals).toHaveLength(18)
    expect(C25K_PLAN[2].intervals).toHaveLength(18)
  })

  it('week 5 day 3 is a single 20-minute run', () => {
    const s = C25K_PLAN.find(s => s.week === 5 && s.day === 3)!
    const runs = s.intervals.filter(i => i.type === 'run')
    expect(runs).toHaveLength(1)
    expect(runs[0].durationSec).toBe(1200)
  })

  it('week 9 sessions end with a 30-minute run', () => {
    const s = C25K_PLAN.find(s => s.week === 9 && s.day === 1)!
    const runs = s.intervals.filter(i => i.type === 'run')
    expect(runs).toHaveLength(1)
    expect(runs[0].durationSec).toBe(1800)
  })
})

describe('nextRunSession', () => {
  it('returns first session (week 1 day 1) when 0 completed', () => {
    expect(nextRunSession(0)).toMatchObject({ week: 1, day: 1 })
  })

  it('returns week 1 day 2 when 1 completed', () => {
    expect(nextRunSession(1)).toMatchObject({ week: 1, day: 2 })
  })

  it('returns week 5 day 1 at index 12 (first after weeks 1–4)', () => {
    expect(nextRunSession(12)).toMatchObject({ week: 5, day: 1 })
  })

  it('returns null when all 27 completed', () => {
    expect(nextRunSession(27)).toBeNull()
  })
})

describe('totalDurationSec', () => {
  it('sums all interval durations for week 1 day 1', () => {
    // warmup 300 + (run 60 + walk 90) × 8 + cooldown 300 = 300 + 1200 + 300 = 1800
    expect(totalDurationSec(C25K_PLAN[0])).toBe(1800)
  })
})

describe('tickTimer', () => {
  const intervals = C25K_PLAN[0].intervals  // 18 intervals, first is warmup 300s

  it('decrements secondsLeft and increments elapsed', () => {
    const s: TimerState = { phase: 'active', intervalIdx: 0, secondsLeft: 60, elapsed: 0 }
    expect(tickTimer(s, intervals)).toMatchObject({ secondsLeft: 59, elapsed: 1 })
  })

  it('advances to next interval when secondsLeft reaches 1', () => {
    const s: TimerState = { phase: 'active', intervalIdx: 0, secondsLeft: 1, elapsed: 10 }
    const next = tickTimer(s, intervals)
    expect(next.intervalIdx).toBe(1)
    expect(next.secondsLeft).toBe(intervals[1].durationSec)
    expect(next.elapsed).toBe(11)
  })

  it('transitions to done when last interval expires', () => {
    const last = intervals.length - 1
    const s: TimerState = { phase: 'active', intervalIdx: last, secondsLeft: 1, elapsed: 1790 }
    expect(tickTimer(s, intervals).phase).toBe('done')
  })

  it('is a no-op when phase is not active', () => {
    const s: TimerState = { phase: 'done', intervalIdx: 0, secondsLeft: 60, elapsed: 50 }
    expect(tickTimer(s, intervals)).toBe(s)
  })
})
```

- [ ] **Step 1.2: Run the tests — confirm they fail**

```bash
cd frontend && bun run test --run src/lib/runPlan.test.ts
```

Expected: **FAIL** — `Cannot find module './runPlan.ts'`

- [ ] **Step 1.3: Implement `src/lib/runPlan.ts`**

Create `frontend/src/lib/runPlan.ts`:

```ts
export type IntervalType = 'warmup' | 'run' | 'walk' | 'cooldown'

export interface RunInterval {
  type: IntervalType
  durationSec: number
}

export interface C25KSession {
  week: number  // 1–9
  day: number   // 1–3
  intervals: RunInterval[]
}

export interface TimerState {
  phase: 'ready' | 'active' | 'done'
  intervalIdx: number
  secondsLeft: number
  elapsed: number
}

// ─── Plan construction helpers ────────────────────────────────────────────────

const wu: RunInterval = { type: 'warmup',   durationSec: 300 }
const cd: RunInterval = { type: 'cooldown', durationSec: 300 }
const run  = (s: number): RunInterval => ({ type: 'run',  durationSec: s })
const walk = (s: number): RunInterval => ({ type: 'walk', durationSec: s })

function rpt(n: number, ...ivs: RunInterval[]): RunInterval[] {
  const out: RunInterval[] = []
  for (let i = 0; i < n; i++) out.push(...ivs)
  return out
}

function sess(week: number, day: number, intervals: RunInterval[]): C25KSession {
  return { week, day, intervals }
}

function wk(w: number, intervals: RunInterval[]): C25KSession[] {
  return [sess(w, 1, intervals), sess(w, 2, intervals), sess(w, 3, intervals)]
}

// ─── The 27-session C25K plan ─────────────────────────────────────────────────

export const C25K_PLAN: C25KSession[] = [
  // Week 1: (60s run / 90s walk) × 8
  ...wk(1, [wu, ...rpt(8, run(60),  walk(90)),  cd]),
  // Week 2: (90s run / 2m walk) × 6
  ...wk(2, [wu, ...rpt(6, run(90),  walk(120)), cd]),
  // Week 3: (90s run / 90s walk / 3m run / 3m walk) × 2
  ...wk(3, [wu, ...rpt(2, run(90),  walk(90),  run(180), walk(180)), cd]),
  // Week 4: (3m run / 90s walk / 5m run / 2.5m walk) × 2
  ...wk(4, [wu, ...rpt(2, run(180), walk(90),  run(300), walk(150)), cd]),
  // Week 5 — 3 distinct sessions
  sess(5, 1, [wu, ...rpt(3, run(300), walk(180)), cd]),
  sess(5, 2, [wu, run(480), walk(300), run(480), cd]),
  sess(5, 3, [wu, run(1200), cd]),
  // Week 6 — 3 distinct sessions
  sess(6, 1, [wu, ...rpt(3, run(300), walk(180)), cd]),
  sess(6, 2, [wu, run(600), walk(180), run(600), cd]),
  sess(6, 3, [wu, run(1320), cd]),
  // Week 7: 25m run
  ...wk(7, [wu, run(1500), cd]),
  // Week 8: 28m run
  ...wk(8, [wu, run(1680), cd]),
  // Week 9: 30m run
  ...wk(9, [wu, run(1800), cd]),
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function nextRunSession(completedCount: number): C25KSession | null {
  return C25K_PLAN[completedCount] ?? null
}

export function totalDurationSec(session: C25KSession): number {
  return session.intervals.reduce((sum, i) => sum + i.durationSec, 0)
}

export function tickTimer(state: TimerState, intervals: RunInterval[]): TimerState {
  if (state.phase !== 'active') return state
  const elapsed = state.elapsed + 1
  if (state.secondsLeft > 1) {
    return { ...state, secondsLeft: state.secondsLeft - 1, elapsed }
  }
  const nextIdx = state.intervalIdx + 1
  if (nextIdx >= intervals.length) {
    return { ...state, phase: 'done', secondsLeft: 0, elapsed }
  }
  return { ...state, intervalIdx: nextIdx, secondsLeft: intervals[nextIdx].durationSec, elapsed }
}
```

- [ ] **Step 1.4: Run the tests — confirm they pass**

```bash
cd frontend && bun run test --run src/lib/runPlan.test.ts
```

Expected: **PASS** — all 12 tests green.

- [ ] **Step 1.5: Run the full suite — confirm no regressions**

```bash
cd frontend && bun run test --run
```

Expected: all existing tests still pass.

- [ ] **Step 1.6: Commit**

```bash
git add frontend/src/lib/runPlan.ts frontend/src/lib/runPlan.test.ts
git commit -m "feat(run): add C25K plan data, types, and timer logic"
```

---

## Task 2: DB schema — RunSession + Dexie v4

**Files:**
- Modify: `src/db/index.ts`

**Interfaces produced (consumed by Tasks 3 & 4):**
```ts
export interface RunSession {
  id: string
  week: number
  day: number
  startedAt: number
  completedAt: number | null
  durationSec: number | null
  distanceKm: number | null
  rpe: number | null
  updatedAt: number
}
// db.runSessions: EntityTable<RunSession, 'id'>
```

- [ ] **Step 2.1: Add `RunSession` interface and table to `src/db/index.ts`**

Open `frontend/src/db/index.ts`. Make three additions:

**a) Add the `RunSession` interface** after the `SetLog` interface (around line 82):

```ts
export interface RunSession {
  id: string
  week: number
  day: number
  startedAt: number
  completedAt: number | null
  durationSec: number | null   // actual elapsed seconds
  distanceKm: number | null    // user-entered, optional
  rpe: number | null           // 1–10
  updatedAt: number
}
```

**b) Add `runSessions` EntityTable** to the `LedgerLiftDB` class declaration (after `exerciseSwaps`):

```ts
runSessions!: EntityTable<RunSession, 'id'>
```

**c) Add version 4 migration** in the constructor after the `version(3)` block:

```ts
// v4: add runSessions table for C25K running plan
this.version(4).stores({
  exercises:     'id, primaryMuscleGroup, nippardTierList, muscleLadder',
  routines:      'id, splitDay, createdAt, updatedAt',
  sessions:      'id, routineId, splitDay, startedAt, completedAt, updatedAt, mesocycleId',
  sets:          'id, sessionId, exerciseId, timestamp, updatedAt',
  mesocycles:    'id, startedAt, endedAt, updatedAt',
  exerciseSwaps: 'id, mesocycleId, routineId, swappedAt',
  runSessions:   'id, startedAt, completedAt, updatedAt',
})
```

**d) Add `updatedAt` hooks for `runSessions`** at the end of the constructor (after the existing `mesocycles` hooks):

```ts
this.runSessions.hook('creating', (_pk, obj) => { if (!_isSyncing) obj.updatedAt = Date.now() })
this.runSessions.hook('updating', (mods: Partial<RunSession> & { updatedAt?: number }) => {
  if (!_isSyncing) mods.updatedAt = Date.now()
})
```

- [ ] **Step 2.2: Run the full test suite — confirm no regressions**

```bash
cd frontend && bun run test --run
```

Expected: all existing tests pass (schema changes don't affect pure logic tests).

- [ ] **Step 2.3: Commit**

```bash
git add frontend/src/db/index.ts
git commit -m "feat(run): add RunSession interface and runSessions Dexie v4 table"
```

---

## Task 3: RunPage component

**Files:**
- Create: `src/pages/RunPage.tsx`

**Interfaces consumed:**
- From Task 1: `C25KSession`, `RunInterval`, `IntervalType`, `TimerState`, `C25K_PLAN`, `totalDurationSec`, `tickTimer`
- From Task 2: `RunSession`, `db.runSessions`

**Props produced (consumed by Task 4):**
```ts
interface Props {
  sessionId: string
  onComplete: () => void
  onBack: () => void
}
```

- [ ] **Step 3.1: Create `src/pages/RunPage.tsx`**

Create `frontend/src/pages/RunPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { RunSession } from '../db/index.ts'
import {
  C25K_PLAN, totalDurationSec, tickTimer,
} from '../lib/runPlan.ts'
import type { IntervalType, TimerState } from '../lib/runPlan.ts'

interface Props {
  sessionId: string
  onComplete: () => void
  onBack: () => void
}

const INTERVAL_COLOR: Record<IntervalType, string> = {
  warmup:   'oklch(72% 0.18 55)',
  run:      'oklch(62% 0.24 293)',
  walk:     'oklch(50% 0.010 293)',
  cooldown: 'oklch(72% 0.18 55)',
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RunPage({ sessionId, onComplete, onBack }: Props) {
  const dbSession = useLiveQuery<RunSession | undefined>(
    () => db.runSessions.get(sessionId), [sessionId]
  )

  const planSession = dbSession
    ? C25K_PLAN.find(s => s.week === dbSession.week && s.day === dbSession.day)
    : undefined
  const intervals = planSession?.intervals ?? []

  const [timer, setTimer] = useState<TimerState>({
    phase: 'ready',
    intervalIdx: 0,
    secondsLeft: 0,
    elapsed: 0,
  })
  const [distanceKm, setDistanceKm] = useState('')
  const [rpe, setRpe] = useState<number | null>(null)

  // Set initial secondsLeft once intervals are available
  useEffect(() => {
    if (intervals.length > 0 && timer.phase === 'ready') {
      setTimer(prev => ({ ...prev, secondsLeft: intervals[0].durationSec }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervals.length])

  useEffect(() => {
    if (timer.phase !== 'active') return
    const id = setInterval(() => {
      setTimer(prev => tickTimer(prev, intervals))
    }, 1000)
    return () => clearInterval(id)
  }, [timer.phase, intervals])

  async function save() {
    await db.runSessions.update(sessionId, {
      completedAt: Date.now(),
      durationSec: timer.elapsed,
      distanceKm: distanceKm ? parseFloat(distanceKm) : null,
      rpe,
    })
    onComplete()
  }

  if (!dbSession || !planSession) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'oklch(44% 0.008 293)' }}>
        Loading…
      </div>
    )
  }

  const current  = intervals[timer.intervalIdx]
  const next     = intervals[timer.intervalIdx + 1]
  const totalSec = totalDurationSec(planSession)
  const progPct  = current
    ? ((current.durationSec - timer.secondsLeft) / current.durationSec) * 100
    : 0

  // ─── Ready phase ────────────────────────────────────────────────────────────
  if (timer.phase === 'ready') {
    return (
      <div className="flex flex-col min-h-full pb-6" style={{ background: 'oklch(7% 0.008 293)' }}>
        <div className="flex items-center gap-3 px-4 pt-12 pb-6">
          <button onClick={onBack} style={{ color: 'oklch(44% 0.008 293)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase' }}>
              Couch to 5K
            </p>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '28px', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
              WEEK {dbSession.week} · DAY {dbSession.day}
            </h1>
          </div>
          <div className="ml-auto px-3 py-1.5 rounded-lg" style={{ background: 'oklch(17% 0.010 293)', border: '1px solid oklch(24% 0.010 293)' }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px', color: 'oklch(62% 0.24 293)' }}>
              ~{Math.round(totalSec / 60)} MIN
            </span>
          </div>
        </div>

        <div className="flex-1 px-4 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {intervals.map((iv, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
              >
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', color: INTERVAL_COLOR[iv.type], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {iv.type}
                </span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: '14px', color: 'oklch(72% 0.012 293)' }}>
                  {fmtSecs(iv.durationSec)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 mt-6">
          <button
            onClick={() => setTimer(prev => ({ ...prev, phase: 'active' }))}
            className="w-full h-14 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(7% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.06em' }}
          >
            BEGIN
          </button>
        </div>
      </div>
    )
  }

  // ─── Done phase ─────────────────────────────────────────────────────────────
  if (timer.phase === 'done') {
    return (
      <div className="flex flex-col min-h-full px-4 pb-6" style={{ background: 'oklch(7% 0.008 293)' }}>
        <div className="pt-16 pb-8 text-center">
          <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.15em', color: 'oklch(62% 0.24 293)', textTransform: 'uppercase', marginBottom: 6 }}>
            Session Complete
          </p>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
            WEEK {dbSession.week} · DAY {dbSession.day} ✓
          </h1>
        </div>

        <div className="rounded-xl px-4 py-4 mb-4" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 4 }}>Duration</p>
          <p className="num" style={{ fontSize: '32px', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
            {fmtSecs(timer.elapsed)}
          </p>
        </div>

        <div className="rounded-xl px-4 py-4 mb-4" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 8 }}>
            Distance (optional)
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={distanceKm}
              onChange={e => setDistanceKm(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="flex-1 bg-transparent rounded-lg px-3 py-2 text-right num"
              style={{ fontSize: '28px', color: 'oklch(97% 0.005 293)', border: '1px solid oklch(28% 0.010 293)', outline: 'none' }}
            />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', color: 'oklch(44% 0.008 293)' }}>KM</span>
          </div>
        </div>

        <div className="rounded-xl px-4 py-4 mb-6" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
          <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 8 }}>
            Effort (RPE)
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setRpe(n)}
                className="w-9 h-9 rounded-lg transition-all active:scale-95"
                style={{
                  background: rpe === n ? 'oklch(62% 0.24 293)' : 'oklch(18% 0.012 293)',
                  color:      rpe === n ? 'oklch(8% 0.008 293)'  : 'oklch(72% 0.012 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '15px',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={save}
          className="w-full h-14 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(7% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.06em' }}
        >
          SAVE & FINISH
        </button>
      </div>
    )
  }

  // ─── Active phase ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full pb-6" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '0.10em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase' }}>
          WEEK {dbSession.week} · DAY {dbSession.day}
        </p>
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: '12px', color: 'oklch(44% 0.008 293)' }}>
          {fmtSecs(timer.elapsed)} elapsed
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '52px', letterSpacing: '0.04em', color: INTERVAL_COLOR[current?.type ?? 'walk'], textTransform: 'uppercase', lineHeight: 1, marginBottom: 12 }}>
          {current?.type ?? ''}
        </p>
        <p className="num" style={{ fontSize: '88px', color: 'oklch(97% 0.005 293)', lineHeight: 1, marginBottom: 24 }}>
          {fmtSecs(timer.secondsLeft)}
        </p>

        <div className="w-full h-2 rounded-full overflow-hidden mb-6" style={{ background: 'oklch(20% 0.010 293)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${progPct}%`, background: INTERVAL_COLOR[current?.type ?? 'walk'] }}
          />
        </div>

        {next && (
          <p style={{ fontSize: '13px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.08em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase' }}>
            NEXT: {next.type} · {fmtSecs(next.durationSec)}
          </p>
        )}
      </div>

      <div className="px-4 mb-6 flex gap-1.5 flex-wrap justify-center">
        {intervals.map((iv, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: i < timer.intervalIdx
                ? 'oklch(35% 0.010 293)'
                : i === timer.intervalIdx
                  ? INTERVAL_COLOR[current?.type ?? 'walk']
                  : 'oklch(20% 0.010 293)',
            }}
          />
        ))}
      </div>

      <div className="px-4 flex gap-3">
        <button
          onClick={() => setTimer(prev => tickTimer({ ...prev, secondsLeft: 1 }, intervals))}
          className="flex-1 h-12 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: 'oklch(17% 0.010 293)', border: '1px solid oklch(28% 0.010 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
        >
          SKIP
        </button>
        <button
          onClick={() => setTimer(prev => ({ ...prev, phase: 'done' }))}
          className="flex-1 h-12 rounded-xl transition-all active:scale-[0.98]"
          style={{ background: 'oklch(17% 0.010 293)', border: '1px solid oklch(28% 0.010 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
        >
          FINISH EARLY
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3.2: Run the full test suite — confirm no regressions**

```bash
cd frontend && bun run test --run
```

Expected: all tests pass (RunPage has no unit tests — timer logic is covered by Task 1).

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/pages/RunPage.tsx
git commit -m "feat(run): add RunPage with guided C25K interval timer"
```

---

## Task 4: Wire up App.tsx + HomePage

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/HomePage.tsx`

**Interfaces consumed:**
- From Task 2: `RunSession`, `db.runSessions`
- From Task 1: `nextRunSession`, `totalDurationSec`, `C25K_PLAN`
- From Task 3: `RunPage` (default export), Props `{ onStartRun, onResumeRun }`

- [ ] **Step 4.1: Update `src/App.tsx`**

The full updated file (changes: add `RunPage` import, add `activeRunSessionId` state, add `RunPage` render block, add props to `HomePage`):

```tsx
import { useState } from 'react'
import BottomNav from './components/BottomNav.tsx'
import HomePage from './pages/HomePage.tsx'
import WorkoutPage from './pages/WorkoutPage.tsx'
import RunPage from './pages/RunPage.tsx'
import CatalogPage from './pages/CatalogPage.tsx'
import ProgressPage from './pages/ProgressPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import PlanPage from './pages/PlanPage.tsx'

type Page = 'home' | 'catalog' | 'progress' | 'history' | 'settings' | 'plan'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeRunSessionId, setActiveRunSessionId] = useState<string | null>(null)

  if (activeRunSessionId) {
    return (
      <RunPage
        sessionId={activeRunSessionId}
        onComplete={() => setActiveRunSessionId(null)}
        onBack={() => setActiveRunSessionId(null)}
      />
    )
  }

  if (activeSessionId) {
    return (
      <WorkoutPage
        sessionId={activeSessionId}
        onComplete={() => setActiveSessionId(null)}
        onBack={() => setActiveSessionId(null)}
      />
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-zinc-950">
      <main className="flex-1 overflow-y-auto">
        {page === 'home'     && (
          <HomePage
            onStartWorkout={id => setActiveSessionId(id)}
            onResumeWorkout={id => setActiveSessionId(id)}
            onNavigatePlan={() => setPage('plan')}
            onStartRun={id => setActiveRunSessionId(id)}
            onResumeRun={id => setActiveRunSessionId(id)}
          />
        )}
        {page === 'catalog'  && <CatalogPage />}
        {page === 'progress' && <ProgressPage />}
        {page === 'history'  && <HistoryPage />}
        {page === 'plan'     && <PlanPage />}
        {page === 'settings' && <SettingsPage />}
      </main>

      <BottomNav active={page} onChange={setPage} />
    </div>
  )
}
```

- [ ] **Step 4.2: Update `src/pages/HomePage.tsx`**

**a) Update the existing import lines** at the top of the file:

Change the existing `import type { WorkoutSession, Mesocycle }` line to add `RunSession`:
```ts
import type { WorkoutSession, Mesocycle, RunSession } from '../db/index.ts'
```

Add one new import line (after the existing lib imports):
```ts
import { nextRunSession, totalDurationSec } from '../lib/runPlan.ts'
```

(`db`, `uid`, `useLiveQuery`, `useMemo` are already imported — do not add them again.)

**b) Update the `Props` interface** (add two new props):

```ts
interface Props {
  onStartWorkout: (sessionId: string) => void
  onResumeWorkout: (sessionId: string) => void
  onNavigatePlan?: () => void
  onStartRun: (sessionId: string) => void
  onResumeRun: (sessionId: string) => void
}
```

**c) Add run queries** inside `HomePage` after the existing `useLiveQuery` calls (e.g., after the `exercises` query):

```ts
const activeRun = useLiveQuery<RunSession | undefined>(
  () => db.runSessions.filter(s => s.completedAt === null).first()
)
const completedRunCount = useLiveQuery<number>(
  () => db.runSessions.filter(s => s.completedAt !== null).count()
) ?? 0
const nextPlan = nextRunSession(completedRunCount)
```

**d) Add `startRun` function** after the existing `startWorkout` function:

```ts
async function startRun() {
  if (!nextPlan) return
  const session: RunSession = {
    id: uid(),
    week: nextPlan.week,
    day: nextPlan.day,
    startedAt: Date.now(),
    completedAt: null,
    durationSec: null,
    distanceKm: null,
    rpe: null,
    updatedAt: 0,
  }
  await db.runSessions.add(session)
  onStartRun(session.id)
}
```

**e) Add the "Next Run" card** in the JSX, directly after the closing `</div>` of the "Next workout card" block (the one containing `START WORKOUT`) and before the "4-day cycle" section. Insert this block:

```tsx
{/* ── Run card ────────────────────────────────── */}
{activeRun ? (
  <div
    className="mx-4 mb-4 rounded-2xl p-4"
    style={{ background: 'oklch(14% 0.06 150)', border: '1px solid oklch(24% 0.10 150)' }}
  >
    <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(55% 0.18 150)', textTransform: 'uppercase', marginBottom: 4 }}>
      Run In Progress
    </p>
    <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em' }}>
      WEEK {activeRun.week} · DAY {activeRun.day}
    </p>
    <button
      onClick={() => onResumeRun(activeRun.id)}
      className="mt-3 w-full h-12 rounded-xl font-bold transition-all active:scale-[0.98]"
      style={{ background: 'oklch(50% 0.18 150)', color: 'oklch(97% 0.005 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em' }}
    >
      RESUME RUN
    </button>
  </div>
) : nextPlan ? (
  <div
    className="mx-4 mb-4 rounded-2xl overflow-hidden"
    style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
  >
    <div className="px-4 pt-4 pb-3">
      <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(50% 0.010 293)', textTransform: 'uppercase', marginBottom: 4 }}>
        Up Next — Run
      </p>
      <div className="flex items-baseline gap-3">
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', lineHeight: 1, letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', margin: 0 }}>
          WEEK {nextPlan.week} · DAY {nextPlan.day}
        </h2>
        <span
          className="px-2.5 py-1 rounded-lg"
          style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(50% 0.18 150)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em' }}
        >
          ~{Math.round(totalDurationSec(nextPlan) / 60)} MIN
        </span>
      </div>
    </div>
    <div className="px-4 pb-4">
      <button
        onClick={startRun}
        className="w-full h-12 rounded-xl font-bold transition-all active:scale-[0.98]"
        style={{ background: 'oklch(50% 0.18 150)', color: 'oklch(97% 0.005 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '0.06em' }}
      >
        START RUN
      </button>
    </div>
  </div>
) : (
  <div
    className="mx-4 mb-4 rounded-2xl px-4 py-4"
    style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
  >
    <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', color: 'oklch(62% 0.24 293)', letterSpacing: '0.04em' }}>
      C25K COMPLETE
    </p>
    <p style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', marginTop: 2 }}>
      All 27 sessions finished. 🎉
    </p>
  </div>
)}
```

- [ ] **Step 4.3: Run the full test suite — confirm no regressions**

```bash
cd frontend && bun run test --run
```

Expected: all tests pass.

- [ ] **Step 4.4: Smoke-test in the browser**

```bash
cd frontend && bun dev
```

Open `http://localhost:5173` (or the port shown). Verify:

1. **Home screen** — "Up Next — Run" card appears below the lifting card with WEEK 1 · DAY 1 and ~30 MIN chip
2. **START RUN** — tap it; RunPage opens showing the interval list (warmup 5:00, then run/walk pairs)
3. **BEGIN** — tap it; timer counts down, interval label changes color (RUN = purple, WALK = grey)
4. **SKIP** — advances to the next interval immediately
5. **FINISH EARLY** — opens the completion form with auto-filled duration
6. **SAVE & FINISH** — returns to Home; the card now shows WEEK 1 · DAY 2
7. **DB check** — DevTools → Application → IndexedDB → ledgerlift → runSessions — confirm the record exists with `completedAt` set

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/HomePage.tsx
git commit -m "feat(run): wire RunPage into App and add Next Run card to HomePage"
```

---

## Task 5: Ship

- [ ] **Step 5.1: Final test run**

```bash
cd frontend && bun run test --run
```

Expected: all tests pass (runPlan.test.ts + all existing tests).

- [ ] **Step 5.2: Open PR to dev**

```
/ship 5k-run-plan
```

This creates a `feature/5k-run-plan` branch from current commits, pushes, and opens a PR to `dev`.
