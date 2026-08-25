# Interval Pause/Resume — Design Spec

**Date:** 2026-08-25
**Status:** Approved

## Problem

During an active run interval the user has no way to pause the timer. If they need to stop briefly (e.g. tie a shoelace), both the interval countdown and the total elapsed time keep running.

## Requirements

- Pause freezes the interval countdown and the total elapsed timer simultaneously.
- Resume picks up both from exactly where they stopped.
- All existing actions (SKIP, FINISH EARLY) remain accessible while running.
- No actions change while paused except RESUME.

## Approach

Add `'paused'` as a fourth `TimerState.phase` value. The tick `useEffect` already guards on `phase !== 'active'`, so the interval timer stops automatically — no extra logic needed.

### Button layout

| State   | Buttons                             |
|---------|-------------------------------------|
| Running | SKIP · PAUSE · FINISH EARLY         |
| Paused  | SKIP · RESUME · FINISH EARLY        |

SKIP and FINISH EARLY remain always visible. PAUSE and RESUME toggle the same slot.

### Visual feedback when paused

The large interval label changes to **PAUSED** (dimmed color `oklch(44% 0.008 293)`). The countdown and elapsed numerics stay visible but frozen. The progress bar stays frozen.

## Files changed

| File | Change |
|------|--------|
| `frontend/src/lib/runPlan.ts` | Add `'paused'` to `TimerState.phase` union |
| `frontend/src/pages/RunPage.tsx` | Add PAUSE/RESUME button; show PAUSED label in active view |

## Out of scope

- Pausing the warm-up or cool-down intervals (same mechanic, same button — no special casing needed).
- Persisting pause state to IndexedDB (in-memory only; refreshing the page resets to ready, which is acceptable for a local PWA).
