# Interval Pause/Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pause and resume the current interval during an active run session, freezing both the countdown and elapsed timer.

**Architecture:** Add `'paused'` to the `TimerState.phase` union. The existing tick `useEffect` already guards on `phase !== 'active'`, so the timer stops automatically. Add a PAUSE/RESUME button to the active-run UI and swap the interval label to "PAUSED" when frozen.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest, Bun

## Global Constraints

- Package manager: **bun** (never npm or yarn)
- Run tests with: `bun run test` (NOT `bun test`)
- All weights in kg, RPE 1–10 (not relevant here, but don't change those conventions)
- Never commit directly to `master` or `dev` — use `/ship` to open a PR to `dev`
- Dark mode default; Tailwind utility classes; Barlow Condensed font for labels

---

### Task 1: Extend TimerState type and add paused no-op test

**Files:**
- Modify: `frontend/src/lib/runPlan.ts` (line 15 — the `phase` union type)
- Test: `frontend/src/lib/runPlan.test.ts`

**Interfaces:**
- Produces: `TimerState.phase` now accepts `'ready' | 'active' | 'paused' | 'done'`; `tickTimer` returns state unchanged when `phase === 'paused'` (already works — the existing guard is `!== 'active'`)

- [ ] **Step 1: Write the failing test**

Add this test to the `describe('tickTimer', ...)` block in `frontend/src/lib/runPlan.test.ts`, after the existing "no-op" test:

```ts
it('is a no-op when phase is paused', () => {
  const s: TimerState = { phase: 'paused', intervalIdx: 0, secondsLeft: 60, elapsed: 50 }
  expect(tickTimer(s, intervals)).toBe(s)
})
```

- [ ] **Step 2: Run test to verify it fails (type error)**

```bash
cd frontend && bun run test --run src/lib/runPlan.test.ts
```

Expected: TypeScript compile error — `'paused'` is not assignable to `phase`.

- [ ] **Step 3: Add `'paused'` to the phase union in runPlan.ts**

In `frontend/src/lib/runPlan.ts`, change line 15 from:
```ts
  phase: 'ready' | 'active' | 'done'
```
to:
```ts
  phase: 'ready' | 'active' | 'paused' | 'done'
```

No other changes needed — `tickTimer` already returns `state` unchanged for any phase that isn't `'active'`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && bun run test --run src/lib/runPlan.test.ts
```

Expected: all tests in the file PASS (including the new one).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/runPlan.ts frontend/src/lib/runPlan.test.ts
git commit -m "feat(run): add paused phase to TimerState"
```

---

### Task 2: Add PAUSE/RESUME button and PAUSED label to RunPage

**Files:**
- Modify: `frontend/src/pages/RunPage.tsx`

**Interfaces:**
- Consumes: `TimerState.phase` now includes `'paused'` (from Task 1)

- [ ] **Step 1: Replace the SKIP/FINISH EARLY button row in the active phase**

In `frontend/src/pages/RunPage.tsx`, find the `<div className="px-4 flex gap-3">` block (lines 302–317) and replace it with three buttons — SKIP, PAUSE/RESUME, FINISH EARLY:

```tsx
<div className="px-4 flex gap-3">
  <button
    onClick={() => setTimer(prev => tickTimer({ ...prev, secondsLeft: 1 }, intervals))}
    className="flex-1 h-12 rounded-xl transition-all active:scale-[0.98]"
    style={{ background: 'oklch(17% 0.010 293)', border: '1px solid oklch(28% 0.010 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
  >
    SKIP
  </button>
  <button
    onClick={() => setTimer(prev => ({ ...prev, phase: prev.phase === 'paused' ? 'active' : 'paused' }))}
    className="flex-1 h-12 rounded-xl transition-all active:scale-[0.98]"
    style={{ background: 'oklch(17% 0.010 293)', border: '1px solid oklch(28% 0.010 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
  >
    {timer.phase === 'paused' ? 'RESUME' : 'PAUSE'}
  </button>
  <button
    onClick={() => setTimer(prev => ({ ...prev, phase: 'done' }))}
    className="flex-1 h-12 rounded-xl transition-all active:scale-[0.98]"
    style={{ background: 'oklch(17% 0.010 293)', border: '1px solid oklch(28% 0.010 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', letterSpacing: '0.06em' }}
  >
    FINISH EARLY
  </button>
</div>
```

- [ ] **Step 2: Show PAUSED label when phase is paused**

In the active-phase return block, find the large interval-type label (`<p className={isWarning ? 'animate-bounce' : ''}` around line 257). Change its content from:

```tsx
{current?.type ?? ''}
```

to:

```tsx
{timer.phase === 'paused' ? 'PAUSED' : (current?.type ?? '')}
```

Also update the `style` color expression to dim the label when paused. Change the `color:` value from:

```tsx
color: isWarning ? 'oklch(65% 0.22 25)' : INTERVAL_COLOR[current?.type ?? 'walk'],
```

to:

```tsx
color: timer.phase === 'paused'
  ? 'oklch(44% 0.008 293)'
  : isWarning
    ? 'oklch(65% 0.22 25)'
    : INTERVAL_COLOR[current?.type ?? 'walk'],
```

- [ ] **Step 3: Fix the useEffect phase guard to include paused**

The tick `useEffect` (line 51–57) already returns early when `phase !== 'active'`, so the timer stops on pause automatically — no change needed.

The wake lock `useEffect` (line 59–64) also guards on `phase !== 'active'`, meaning it releases on pause. That's fine — the screen will dim but the app stays open.

Verify neither effect needs changes by reading them; if they already use `timer.phase !== 'active'` as their guard, leave them alone.

- [ ] **Step 4: Run the full frontend test suite**

```bash
cd frontend && bun run test --run
```

Expected: all tests PASS (the RunPage has no unit tests, only visual — verify those pass by inspection in Step 5).

- [ ] **Step 5: Manual smoke test**

```bash
cd frontend && bun dev
```

Open the app, start a run session (Week 1 Day 1), and verify:

1. Active state: three buttons visible — SKIP, PAUSE, FINISH EARLY.
2. Tap PAUSE: countdown freezes, elapsed freezes, large label shows "PAUSED" (dimmed), button reads "RESUME".
3. Tap RESUME: countdown and elapsed resume from where they stopped, label returns to interval type (WALK/RUN etc.), button reads "PAUSE".
4. SKIP and FINISH EARLY still work as before.
5. Interval auto-advance still works (wait for countdown to hit 0).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RunPage.tsx
git commit -m "feat(run): add pause/resume button to active interval"
```
