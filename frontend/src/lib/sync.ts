import { db, setSyncing } from '../db/index.ts'

const LAST_SYNC_KEY = 'ledgerlift:lastSyncAt'
const SERVER_URL_KEY = 'ledgerlift:serverUrl'

export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) ?? ''
}

export function setServerUrl(url: string) {
  localStorage.setItem(SERVER_URL_KEY, url.replace(/\/$/, ''))
}

export function getLastSyncAt(): number {
  return parseInt(localStorage.getItem(LAST_SYNC_KEY) ?? '0', 10)
}

function setLastSyncAt(ts: number) {
  localStorage.setItem(LAST_SYNC_KEY, String(ts))
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

export interface SyncResult {
  status: SyncStatus
  message: string
  syncedAt?: number
  pushed: number
  pulled: number
}

/**
 * Delta sync with the Go backend.
 * Pushes all local records, pulls everything newer than lastSyncAt.
 * Last-write-wins on updatedAt conflict.
 */
export async function syncWithBackend(): Promise<SyncResult> {
  const url = getServerUrl()
  if (!url) return { status: 'error', message: 'No server URL configured', pushed: 0, pulled: 0 }

  const lastSyncAt = getLastSyncAt()

  // Gather all local data to push
  const [sessions, sets, routines, mesocycles, exerciseSwaps, runSessions] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.routines.toArray(),
    db.mesocycles.toArray(),
    db.exerciseSwaps.toArray(),
    db.runSessions.toArray(),
  ])

  // Stamp updatedAt if missing (older records before sync was added)
  const now = Date.now()
  const stampedSessions    = sessions.map(s    => ({ ...s, updatedAt: (s.updatedAt ?? now) }))
  const stampedSets        = sets.map(s        => ({ ...s, updatedAt: (s.updatedAt ?? now) }))
  const stampedRoutines    = routines.map(r    => ({ ...r, updatedAt: (r.updatedAt ?? now) }))
  const stampedMesocycles  = mesocycles.map(m  => ({ ...m, updatedAt: (m.updatedAt ?? now) }))
  const stampedRunSessions = runSessions.map(rs => ({ ...rs, updatedAt: (rs.updatedAt ?? now) }))

  const pushed = sessions.length + sets.length + routines.length + mesocycles.length + exerciseSwaps.length + runSessions.length

  let res: Response
  try {
    res = await fetch(`${url}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastSyncAt,
        sessions: stampedSessions,
        sets: stampedSets,
        routines: stampedRoutines,
        mesocycles: stampedMesocycles,
        exerciseSwaps,
        runSessions: stampedRunSessions,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { status: 'error', message: `Network error: ${(e as Error).message}`, pushed: 0, pulled: 0 }
  }

  if (!res.ok) {
    return { status: 'error', message: `Server error: ${res.status}`, pushed: 0, pulled: 0 }
  }

  const data = await res.json() as {
    syncedAt: number
    sessions: typeof stampedSessions
    sets: typeof stampedSets
    routines: typeof stampedRoutines
    mesocycles?: typeof stampedMesocycles
    exerciseSwaps?: typeof exerciseSwaps
    runSessions?: typeof stampedRunSessions
  }

  // Merge server response into IndexedDB — disable updatedAt hooks so
  // server-stamped timestamps are preserved (not overwritten by local time)
  let pulled = 0
  setSyncing(true)
  try {
    if (data.routines?.length) {
      await db.routines.bulkPut(data.routines)
      pulled += data.routines.length
    }
    if (data.sessions?.length) {
      await db.sessions.bulkPut(data.sessions)
      pulled += data.sessions.length
    }
    if (data.sets?.length) {
      await db.sets.bulkPut(data.sets)
      pulled += data.sets.length
    }
    if (data.mesocycles?.length) {
      await db.mesocycles.bulkPut(data.mesocycles)
      pulled += data.mesocycles.length
    }
    if (data.exerciseSwaps?.length) {
      await db.exerciseSwaps.bulkPut(data.exerciseSwaps)
      pulled += data.exerciseSwaps.length
    }
    if (data.runSessions?.length) {
      await db.runSessions.bulkPut(data.runSessions)
      pulled += data.runSessions.length
    }
  } finally {
    setSyncing(false)
  }

  setLastSyncAt(data.syncedAt)

  return {
    status: 'ok',
    message: `Sync complete`,
    syncedAt: data.syncedAt,
    pushed,
    pulled,
  }
}

export async function checkHealth(): Promise<boolean> {
  const url = getServerUrl()
  if (!url) return false
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3_000) })
    return res.ok
  } catch {
    return false
  }
}
