import { useState } from 'react'
import { formatWeight, kgToLbs, lbsToKg } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'

export interface SetInput {
  weightKg: number
  reps: number
  rpe: number | null
}

interface Props {
  open: boolean
  initial: SetInput
  setNumber: number
  exerciseName: string
  onConfirm: (data: SetInput) => void
  onClose: () => void
}

const RPE_OPTIONS = [6, 7, 8, 9, 10]
const RPE_LABELS: Record<number, string> = { 6: 'Easy', 7: 'Moderate', 8: 'Hard', 9: 'Very Hard', 10: 'Max' }
const RPE_COLORS: Record<number, string> = {
  6:  'oklch(68% 0.18 150)',
  7:  'oklch(76% 0.16 115)',
  8:  'oklch(76% 0.16 85)',
  9:  'oklch(65% 0.20 42)',
  10: 'oklch(60% 0.22 25)',
}

// Wrapper mounts/unmounts the inner sheet so state always initialises fresh
export default function SetSheet({ open, ...props }: Props) {
  if (!open) return null
  return <SetSheetInner {...props} />
}

function SetSheetInner({ initial, setNumber, exerciseName, onConfirm, onClose }: Omit<Props, 'open'>) {
  const { unit } = useWeightUnit()
  const [weight, setWeight] = useState(unit === 'lb' ? kgToLbs(initial.weightKg) : initial.weightKg)
  const [reps, setReps] = useState(initial.reps)
  const [rpe, setRpe] = useState<number | null>(initial.rpe)

  const MAIN_STEP = unit === 'lb' ? 5 : 2.5

  function nudgeWeight(delta: number) {
    const precision = unit === 'lb' ? 2 : 4
    setWeight(w => Math.max(0, Math.round((w + delta) * precision) / precision))
  }
  function nudgeReps(delta: number) {
    setReps(r => Math.max(1, r + delta))
  }

  const activeRpeColor = rpe ? RPE_COLORS[rpe] ?? 'oklch(62% 0.24 293)' : 'oklch(62% 0.24 293)'

  return (
    <>
      <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={onClose} />

      <div
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
        style={{
          background: 'oklch(12% 0.010 293)',
          borderTop: '1px solid oklch(28% 0.016 293)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 20px 36px',
        }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'oklch(30% 0.010 293)' }} />

        {/* Exercise + set */}
        <p className="text-sm mb-0.5" style={{ color: 'oklch(50% 0.010 293)', fontFamily: "'Barlow', sans-serif" }}>
          {exerciseName}
        </p>
        <p
          className="mb-6"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '0.12em',
            color: 'oklch(62% 0.24 293)',
            textTransform: 'uppercase',
          }}
        >
          Set {setNumber}
        </p>

        {/* Weight + Reps in 2-col grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Weight */}
          <div
            className="rounded-2xl p-4 flex flex-col"
            style={{ background: 'oklch(18% 0.012 293)' }}
          >
            <span
              className="mb-2"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 600,
                fontSize: '11px',
                letterSpacing: '0.12em',
                color: 'oklch(50% 0.010 293)',
                textTransform: 'uppercase',
              }}
            >
              {unit.toUpperCase()}
            </span>
            <div
              className="num text-center mb-3"
              style={{ fontSize: 'clamp(40px, 11vw, 60px)', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}
            >
              {formatWeight(weight)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => nudgeWeight(-MAIN_STEP)}
                className="flex-1 h-10 rounded-xl text-lg font-medium transition-colors active:scale-95"
                style={{ background: 'oklch(24% 0.010 293)', color: 'oklch(72% 0.012 293)' }}
              >−</button>
              <button
                onClick={() => nudgeWeight(MAIN_STEP)}
                className="flex-1 h-10 rounded-xl text-lg font-medium transition-colors active:scale-95"
                style={{ background: 'oklch(24% 0.010 293)', color: 'oklch(72% 0.012 293)' }}
              >+</button>
            </div>
            <div className="flex gap-1 mt-1.5">
              {[0.25, 0.5, 1.25].map(d => (
                <button
                  key={d}
                  onClick={() => nudgeWeight(d)}
                  className="flex-1 h-7 rounded-lg text-[10px] transition-colors active:scale-95"
                  style={{
                    background: 'oklch(20% 0.010 293)',
                    color: 'oklch(50% 0.010 293)',
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 600,
                  }}
                >+{d}</button>
              ))}
            </div>
          </div>

          {/* Reps */}
          <div
            className="rounded-2xl p-4 flex flex-col"
            style={{ background: 'oklch(18% 0.012 293)' }}
          >
            <span
              className="mb-2"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 600,
                fontSize: '11px',
                letterSpacing: '0.12em',
                color: 'oklch(50% 0.010 293)',
                textTransform: 'uppercase',
              }}
            >
              REPS
            </span>
            <div
              className="num text-center mb-3"
              style={{ fontSize: 'clamp(40px, 11vw, 60px)', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}
            >
              {reps}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => nudgeReps(-1)}
                className="flex-1 h-10 rounded-xl text-lg font-medium transition-colors active:scale-95"
                style={{ background: 'oklch(24% 0.010 293)', color: 'oklch(72% 0.012 293)' }}
              >−</button>
              <button
                onClick={() => nudgeReps(1)}
                className="flex-1 h-10 rounded-xl text-lg font-medium transition-colors active:scale-95"
                style={{ background: 'oklch(24% 0.010 293)', color: 'oklch(72% 0.012 293)' }}
              >+</button>
            </div>
            {/* RPE mini bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.1em', color: 'oklch(50% 0.010 293)' }}>
                  RPE
                </span>
                {rpe && (
                  <span style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: activeRpeColor }}>
                    {rpe} · {RPE_LABELS[rpe]}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {RPE_OPTIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setRpe(rpe === r ? null : r)}
                    className="flex-1 h-7 rounded-md text-xs font-bold transition-all active:scale-95"
                    style={{
                      background: rpe === r ? RPE_COLORS[r] : 'oklch(20% 0.010 293)',
                      color: rpe === r ? 'oklch(10% 0.005 293)' : 'oklch(44% 0.008 293)',
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Volume preview */}
        <div className="flex items-center justify-center mb-4">
          <span style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)', fontFamily: "'Barlow', sans-serif" }}>
            Volume&nbsp;
          </span>
          <span
            className="num"
            style={{ fontSize: '16px', color: 'oklch(72% 0.012 293)' }}
          >
            {formatWeight(weight * reps)} {unit}
          </span>
        </div>

        {/* CTA */}
        <button
          onClick={() => onConfirm({ weightKg: unit === 'lb' ? lbsToKg(weight) : weight, reps, rpe })}
          className="w-full h-14 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
          style={{
            background: 'oklch(62% 0.24 293)',
            color: 'oklch(8% 0.008 293)',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: '18px',
            letterSpacing: '0.06em',
          }}
        >
          LOG SET
        </button>
      </div>
    </>
  )
}
