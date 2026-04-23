import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uid, formatWeight, formatDate, formatTime, formatElapsed, totalVolume } from './utils.ts'

describe('uid', () => {
  it('returns a string', () => {
    expect(typeof uid()).toBe('string')
  })

  it('generates a non-empty string', () => {
    expect(uid().length).toBeGreaterThan(0)
  })

  it('each call returns a unique value', () => {
    const ids = Array.from({ length: 10 }, uid)
    const unique = new Set(ids)
    expect(unique.size).toBe(10)
  })
})

describe('formatWeight', () => {
  it('renders integer without decimal', () => {
    expect(formatWeight(100)).toBe('100')
  })

  it('renders float with one decimal', () => {
    expect(formatWeight(100.5)).toBe('100.5')
  })

  it('renders zero as integer', () => {
    expect(formatWeight(0)).toBe('0')
  })

  it('renders 2.5 with one decimal', () => {
    expect(formatWeight(2.5)).toBe('2.5')
  })

  it('renders whole-number float without trailing decimal', () => {
    expect(formatWeight(80.0)).toBe('80')
  })
})

describe('totalVolume', () => {
  it('returns 0 for empty array', () => {
    expect(totalVolume([])).toBe(0)
  })

  it('computes reps × weightKg for a single set', () => {
    expect(totalVolume([{ reps: 8, weightKg: 80 }])).toBe(640)
  })

  it('sums multiple sets', () => {
    const sets = [
      { reps: 10, weightKg: 100 },
      { reps: 8,  weightKg: 80  },
      { reps: 6,  weightKg: 60  },
    ]
    expect(totalVolume(sets)).toBe(10 * 100 + 8 * 80 + 6 * 60)
  })

  it('handles fractional weight', () => {
    expect(totalVolume([{ reps: 4, weightKg: 102.5 }])).toBeCloseTo(410)
  })
})

describe('formatElapsed', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows minutes and seconds for short durations', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:45Z'))
    const start = new Date('2024-01-01T00:00:00Z').getTime()
    expect(formatElapsed(start)).toBe('0m 45s')
  })

  it('shows minutes correctly', () => {
    vi.setSystemTime(new Date('2024-01-01T00:01:30Z'))
    const start = new Date('2024-01-01T00:00:00Z').getTime()
    expect(formatElapsed(start)).toBe('1m 30s')
  })

  it('shows hours for long sessions', () => {
    vi.setSystemTime(new Date('2024-01-01T01:05:00Z'))
    const start = new Date('2024-01-01T00:00:00Z').getTime()
    expect(formatElapsed(start)).toBe('1h 5m')
  })

  it('shows two hours', () => {
    vi.setSystemTime(new Date('2024-01-01T02:00:00Z'))
    const start = new Date('2024-01-01T00:00:00Z').getTime()
    expect(formatElapsed(start)).toBe('2h 0m')
  })
})

describe('formatDate', () => {
  it('returns a non-empty string', () => {
    expect(formatDate(Date.now()).length).toBeGreaterThan(0)
  })

  it('contains month abbreviation for a known date', () => {
    const ts = new Date('2024-03-15T12:00:00Z').getTime()
    const result = formatDate(ts)
    // The locale format is "Fri, Mar 15" or similar
    expect(result).toMatch(/Mar/)
    expect(result).toMatch(/15/)
  })

  it('formats a mid-month date correctly', () => {
    // Use noon UTC on Jan 15 — safe in all timezones
    const ts = new Date('2024-01-15T12:00:00Z').getTime()
    const result = formatDate(ts)
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/15/)
  })
})

describe('formatTime', () => {
  it('returns a non-empty string', () => {
    expect(formatTime(Date.now()).length).toBeGreaterThan(0)
  })

  it('contains AM or PM', () => {
    const result = formatTime(new Date('2024-01-01T14:30:00Z').getTime())
    expect(result).toMatch(/AM|PM/)
  })
})
