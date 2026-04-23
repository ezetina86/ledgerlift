import { useState, useEffect } from 'react'
import {
  getServerUrl, setServerUrl,
  getLastSyncAt, syncWithBackend, checkHealth,
  type SyncResult,
} from '../lib/sync.ts'
import { formatDate, formatTime } from '../lib/utils.ts'

function Label({ children }: { children: string }) {
  return (
    <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </p>
  )
}

export default function SettingsPage() {
  const [url, setUrl] = useState(getServerUrl)
  const [saved, setSaved] = useState(false)
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const lastSyncAt = getLastSyncAt()

  useEffect(() => {
    if (!url) return
    checkHealth().then(setHealthy)
  }, [url])

  function saveUrl() {
    setServerUrl(url)
    setSaved(true)
    setHealthy(null)
    checkHealth().then(setHealthy)
    setTimeout(() => setSaved(false), 2000)
  }

  async function doSync() {
    setSyncing(true)
    setResult(null)
    const r = await syncWithBackend()
    setResult(r)
    setSyncing(false)
  }

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="px-4 pt-12 pb-5">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          SETTINGS
        </h1>
      </div>

      {/* Backend sync */}
      <section className="px-4 mb-6">
        <Label>Backend Sync</Label>
        <div
          className="rounded-2xl p-4 flex flex-col gap-4"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
        >
          {/* URL input */}
          <div>
            <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.08em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 8 }}>
              Server URL
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setSaved(false) }}
                placeholder="http://192.168.1.x:8080"
                className="flex-1 h-11 rounded-xl px-3 text-sm focus:outline-none"
                style={{
                  background: 'oklch(18% 0.012 293)',
                  border: '1px solid oklch(26% 0.012 293)',
                  color: 'oklch(97% 0.005 293)',
                  fontFamily: "'Barlow', sans-serif",
                }}
              />
              <button
                onClick={saveUrl}
                className="px-4 h-11 rounded-xl transition-all active:scale-95 shrink-0"
                style={{
                  background: saved ? 'oklch(28% 0.16 293)' : 'oklch(18% 0.012 293)',
                  color: saved ? 'oklch(62% 0.24 293)' : 'oklch(72% 0.012 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                  border: '1px solid ' + (saved ? 'oklch(36% 0.18 293)' : 'oklch(26% 0.012 293)'),
                }}
              >
                {saved ? 'SAVED' : 'SAVE'}
              </button>
            </div>
          </div>

          {/* Health indicator */}
          {url && (
            <div className="flex items-center gap-2.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: healthy === null
                    ? 'oklch(44% 0.008 293)'
                    : healthy
                      ? 'oklch(65% 0.18 150)'
                      : 'oklch(60% 0.22 25)',
                }}
              />
              <span style={{ fontSize: '13px', color: 'oklch(50% 0.010 293)', fontFamily: "'Barlow', sans-serif" }}>
                {healthy === null ? 'Checking…' : healthy ? 'Server reachable' : 'Server unreachable'}
              </span>
            </div>
          )}

          {/* Last sync timestamp */}
          {lastSyncAt > 0 && (
            <div className="flex items-center gap-2" style={{ color: 'oklch(34% 0.008 293)' }}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ fontSize: '11px', fontFamily: "'Barlow', sans-serif" }}>
                Last sync: {formatDate(lastSyncAt)} {formatTime(lastSyncAt)}
              </span>
            </div>
          )}

          {/* Sync button */}
          <button
            onClick={doSync}
            disabled={!url || syncing}
            className="w-full h-12 rounded-xl transition-all active:scale-[0.98]"
            style={{
              background: syncing
                ? 'oklch(15% 0.008 293)'
                : url
                  ? 'oklch(62% 0.24 293)'
                  : 'oklch(15% 0.008 293)',
              color: syncing || !url
                ? 'oklch(34% 0.008 293)'
                : 'oklch(8% 0.008 293)',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
          >
            {syncing ? 'SYNCING…' : 'SYNC NOW'}
          </button>

          {/* Result */}
          {result && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl"
              style={{
                background: result.status === 'ok'
                  ? 'oklch(20% 0.08 150)'
                  : 'oklch(18% 0.08 25)',
              }}
            >
              <span style={{ fontSize: '14px', color: result.status === 'ok' ? 'oklch(65% 0.18 150)' : 'oklch(60% 0.22 25)' }}>
                {result.status === 'ok' ? '✓' : '✕'}
              </span>
              <div>
                <p style={{ fontSize: '13px', color: result.status === 'ok' ? 'oklch(65% 0.18 150)' : 'oklch(60% 0.22 25)' }}>
                  {result.message}
                </p>
                {result.status === 'ok' && (
                  <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 2 }}>
                    Pushed {result.pushed} · Pulled {result.pulled}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section className="px-4">
        <Label>About</Label>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
        >
          {[
            ['App', 'LedgerLift'],
            ['Protocol', 'Jeff Nippard Upper/Lower'],
            ['Storage', 'IndexedDB (local-first)'],
            ['Weights', 'Kilograms (kg)'],
            ['RPE Scale', '1–10 (Nippard)'],
          ].map(([label, value], i) => (
            <div
              key={label}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: i > 0 ? '1px solid oklch(16% 0.008 293)' : 'none' }}
            >
              <span style={{ fontSize: '13px', color: 'oklch(44% 0.008 293)', fontFamily: "'Barlow', sans-serif" }}>
                {label}
              </span>
              <span style={{ fontSize: '13px', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow', sans-serif", fontWeight: 500 }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
