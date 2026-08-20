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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (timer.phase !== 'active') return
    const id = setInterval(() => {
      setTimer(prev => tickTimer(prev, intervals))
    }, 1000)
    return () => clearInterval(id)
  }, [timer.phase, intervals])

  async function save() {
    if (saving) return
    setSaving(true)
    await db.runSessions.update(sessionId, {
      completedAt: Date.now(),
      durationSec: timer.elapsed,
      distanceKm: distanceKm ? Math.max(0, parseFloat(distanceKm)) : null,
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
            onClick={() => setTimer(prev => ({ ...prev, phase: 'active', secondsLeft: intervals[0]?.durationSec ?? 0 }))}
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
          disabled={saving}
          className="w-full h-14 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: 'oklch(62% 0.24 293)', color: 'oklch(7% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '0.06em' }}
        >
          {saving ? 'SAVING…' : 'SAVE & FINISH'}
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
