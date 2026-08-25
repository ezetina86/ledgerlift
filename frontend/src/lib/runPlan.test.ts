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

  it('is a no-op when phase is paused', () => {
    const s: TimerState = { phase: 'paused', intervalIdx: 0, secondsLeft: 60, elapsed: 50 }
    expect(tickTimer(s, intervals)).toBe(s)
  })
})
