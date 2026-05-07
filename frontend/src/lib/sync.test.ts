import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { WorkoutSession, Routine, SetLog } from '../db/index.ts'

// Mock Dexie before importing sync.ts so we don't try to open IndexedDB
vi.mock('../db/index.ts', () => ({
  db: {
    sessions: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    sets: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    routines: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    mesocycles: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
    exerciseSwaps: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
    },
  },
  setSyncing: vi.fn(),
}))

import {
  getServerUrl, setServerUrl, getLastSyncAt,
  checkHealth, syncWithBackend,
} from './sync.ts'

// Node.js 22 ships a global localStorage that lacks .clear() — stub it.
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

beforeEach(() => _store.clear())
afterEach(() => vi.restoreAllMocks())

// ── localStorage helpers ───────────────────────────────────────────────────────

describe('getServerUrl', () => {
  it('returns empty string when not set', () => {
    expect(getServerUrl()).toBe('')
  })

  it('returns the stored URL after setServerUrl', () => {
    setServerUrl('http://192.168.1.10:8080')
    expect(getServerUrl()).toBe('http://192.168.1.10:8080')
  })
})

describe('setServerUrl', () => {
  it('strips a trailing slash', () => {
    setServerUrl('http://server/')
    expect(getServerUrl()).toBe('http://server')
  })

  it('leaves a URL without trailing slash unchanged', () => {
    setServerUrl('http://server:8080')
    expect(getServerUrl()).toBe('http://server:8080')
  })

  it('updating the URL replaces the previous value', () => {
    setServerUrl('http://old')
    setServerUrl('http://new')
    expect(getServerUrl()).toBe('http://new')
  })
})

describe('getLastSyncAt', () => {
  it('returns 0 when not set', () => {
    expect(getLastSyncAt()).toBe(0)
  })
})

// ── checkHealth ───────────────────────────────────────────────────────────────

describe('checkHealth', () => {
  it('returns false when no URL is configured', async () => {
    expect(await checkHealth()).toBe(false)
  })

  it('returns true when the server responds 200', async () => {
    setServerUrl('http://localhost:8080')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await checkHealth()).toBe(true)
  })

  it('returns false when the server responds 500', async () => {
    setServerUrl('http://localhost:8080')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await checkHealth()).toBe(false)
  })

  it('returns false when fetch throws a network error', async () => {
    setServerUrl('http://localhost:8080')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    expect(await checkHealth()).toBe(false)
  })
})

// ── syncWithBackend ───────────────────────────────────────────────────────────

describe('syncWithBackend', () => {
  it('returns error result when no URL is configured', async () => {
    const result = await syncWithBackend()
    expect(result.status).toBe('error')
    expect(result.pushed).toBe(0)
    expect(result.pulled).toBe(0)
  })

  it('returns error result when fetch throws', async () => {
    setServerUrl('http://localhost:8080')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const result = await syncWithBackend()
    expect(result.status).toBe('error')
    expect(result.message).toContain('Network error')
  })

  it('returns error result on non-2xx response', async () => {
    setServerUrl('http://localhost:8080')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const result = await syncWithBackend()
    expect(result.status).toBe('error')
    expect(result.message).toContain('503')
  })

  it('returns ok result and reports pushed/pulled counts', async () => {
    setServerUrl('http://localhost:8080')

    const { db } = await import('../db/index.ts')
    // Return 2 sessions and 1 routine from local DB
    vi.mocked(db.sessions.toArray).mockResolvedValue([
      { id: 's1' } as WorkoutSession, { id: 's2' } as WorkoutSession,
    ])
    vi.mocked(db.routines.toArray).mockResolvedValue([{ id: 'r1' } as Routine])

    const serverPayload = {
      syncedAt: 9999,
      sessions: [{ id: 's3' }],
      sets: [{ id: 'set1' }, { id: 'set2' }],
      routines: [],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(serverPayload),
    }))

    const result = await syncWithBackend()
    expect(result.status).toBe('ok')
    expect(result.pushed).toBe(3)  // 2 sessions + 1 routine + 0 sets
    expect(result.pulled).toBe(3)  // 1 session + 2 sets + 0 routines
    expect(result.syncedAt).toBe(9999)
  })

  it('calls bulkPut for each entity type received from server', async () => {
    setServerUrl('http://localhost:8080')
    const { db } = await import('../db/index.ts')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        syncedAt: 1000,
        sessions: [{ id: 's1' }],
        sets: [{ id: 'set1' }],
        routines: [{ id: 'r1' }],
      }),
    }))

    await syncWithBackend()
    expect(db.sessions.bulkPut).toHaveBeenCalled()
    expect(db.sets.bulkPut).toHaveBeenCalled()
    expect(db.routines.bulkPut).toHaveBeenCalled()
  })

  it('stamps updatedAt=now for sets that are missing updatedAt', async () => {
    // Exercises the `s.updatedAt ?? now` fallback on the stampedSets map (line 53)
    // by returning a set record without updatedAt from the local DB mock.
    setServerUrl('http://localhost:8080')
    const { db } = await import('../db/index.ts')

    const before = Date.now()
    vi.mocked(db.sets.toArray).mockResolvedValue([{ id: 'set-old' } as SetLog])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ syncedAt: 1000, sessions: [], sets: [], routines: [] }),
    }))

    const result = await syncWithBackend()
    expect(result.status).toBe('ok')

    // Verify the outgoing request body has updatedAt stamped for the set
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.sets[0].updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('reports pulled=0 and skips bulkPut when server returns all empty arrays', async () => {
    // Covers the false branches of `if (data.sessions?.length)` and
    // `if (data.sets?.length)` (lines 90-97) when the server has nothing new.
    setServerUrl('http://localhost:8080')
    const { db } = await import('../db/index.ts')

    // vi.restoreAllMocks() is a no-op for vi.fn() mocks — clear accumulated
    // call counts from previous tests before making our assertions.
    vi.mocked(db.sessions.bulkPut).mockClear()
    vi.mocked(db.sets.bulkPut).mockClear()
    vi.mocked(db.routines.bulkPut).mockClear()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ syncedAt: 5000, sessions: [], sets: [], routines: [] }),
    }))

    const result = await syncWithBackend()
    expect(result.status).toBe('ok')
    expect(result.pulled).toBe(0)
    expect(db.sessions.bulkPut).not.toHaveBeenCalled()
    expect(db.sets.bulkPut).not.toHaveBeenCalled()
  })

  it('calls setSyncing(false) in finally even when bulkPut throws', async () => {
    // Exercises the try/finally block: setSyncing must be reset to false
    // regardless of whether the bulkPut operation succeeds or throws.
    setServerUrl('http://localhost:8080')
    const { db, setSyncing } = await import('../db/index.ts')

    vi.mocked(db.routines.bulkPut).mockRejectedValue(new Error('DB write error'))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        syncedAt: 1000,
        sessions: [],
        sets: [],
        routines: [{ id: 'r1' }],  // non-empty → triggers bulkPut which throws
      }),
    }))

    let threw = false
    try {
      await syncWithBackend()
    } catch {
      threw = true
    }

    expect(threw).toBe(true)
    // setSyncing(false) must have been the last call despite the throw
    expect(vi.mocked(setSyncing)).toHaveBeenLastCalledWith(false)
  })
})
