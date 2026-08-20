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
