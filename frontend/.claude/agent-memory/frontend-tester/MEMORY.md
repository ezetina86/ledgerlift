# Frontend Tester Agent Memory

## Last Confirmed State
- Test suite: 130 tests across 6 test files — all passing
- Coverage: 100% statements / 100% branches / 100% functions / 100% lines
- Branch: test/frontend-coverage-80 (as of 2026-05-05)

## Test Files (src/lib/)
| File | Tests | Notes |
|------|-------|-------|
| utils.test.ts | ~20 | Includes kgToLbs, lbsToKg, KG_TO_LBS describe blocks |
| split.test.ts | ~20 | Upper/Lower split logic |
| overload.test.ts | ~20 | RPE-based progressive overload |
| sync.test.ts | ~40 | Dexie sync, uses vi.stubGlobal localStorage |
| prefs.test.ts | 16 | getWeightUnit, setWeightUnit, useWeightUnit |
| (6th file) | varies | check glob if count changes |

## Critical Patterns

### localStorage Stub (REQUIRED for Node.js 22)
All test files touching localStorage MUST stub it before import:
```ts
const _store = new Map<string, string>()
const mockStorage: Storage = {
  getItem:    (k) => _store.get(k) ?? null,
  setItem:    (k, v) => { _store.set(k, v) },
  removeItem: (k) => { _store.delete(k) },
  clear:      () => { _store.clear() },
  get length() { return _store.size },
  key:        (i) => [..._store.keys()][i] ?? null,
}
vi.stubGlobal('localStorage', mockStorage)
```
Files confirmed using this pattern: sync.test.ts, prefs.test.ts

### Test Commands
- Run tests:    `bun run test -- --run`  (NOT `bun test`)
- Run coverage: `bun run test:coverage`
- Full path if PATH missing: `~/.bun/bin/bun run test -- --run`

### Coverage Config (vitest.config.ts)
- Provider: v8
- Include: `src/lib/**/*.ts`, `src/db/index.ts`
- All four thresholds: 80% (currently at 100%)

## Key Domain Rules (test validation)
- RPE scale: 1–10 (Nippard). RPE <= 7 -> +2.5 kg | RPE 8 -> +1 rep | RPE >= 9 -> form cue
- Weights: always kg. kgToLbs/lbsToKg conversions use KG_TO_LBS = 2.20462
- Volume formula: reps x weightKg (NOT sets x reps x weight)
- prefs.ts: WeightUnit = 'kg' | 'lb', key = 'ledgerlift:weightUnit', default = 'kg'

## Dexie Notes
- Dexie v4: use EntityTable generic (not Table)
- Tests use fake-indexeddb/auto via setupFiles in vitest.config.ts

## Links
- Detailed debugging notes: debugging.md (create if needed)
