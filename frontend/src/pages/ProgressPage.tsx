import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { Exercise, SetLog } from '../db/index.ts'
import { weeklyVolumeByGroup, computePRs, exerciseProgression } from '../lib/overload.ts'
import type { ProgressPoint } from '../lib/overload.ts'
import { formatWeight, kgToLbs, KG_TO_LBS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'
import ExerciseDashboardSheet from '../components/ExerciseDashboardSheet.tsx'
import RunProgressPanel from '../components/RunProgressPanel.tsx'

const GROUP_COLORS: Record<string, string> = {
  Back:      'oklch(55% 0.18 265)',
  Chest:     'oklch(55% 0.18 220)',
  Shoulder:  'oklch(58% 0.18 55)',
  Biceps:    'oklch(55% 0.20 293)',
  Triceps:   'oklch(52% 0.18 305)',
  Quad:      'oklch(58% 0.18 150)',
  Hamstring: 'oklch(56% 0.16 170)',
  Glute:     'oklch(55% 0.20 340)',
  Calves:    'oklch(56% 0.16 190)',
  Core:      'oklch(60% 0.18 85)',
  Other:     'oklch(44% 0.008 293)',
}

function Label({ children }: { children: string }) {
  return (
    <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </p>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl p-6 text-center" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
      <p style={{ fontSize: '13px', color: 'oklch(44% 0.008 293)' }}>{text}</p>
    </div>
  )
}

function Sparkline({ points, height = 60 }: { points: number[]; height?: number }) {
  if (points.length < 2) return null
  const W = 320, H = height, PAD = Math.max(3, Math.round(height * 0.1))
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1
  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2))
  const ys = points.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2))
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const areaD = pathD + ` L${xs[xs.length - 1].toFixed(1)} ${H} L${xs[0].toFixed(1)} ${H}Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" height={H}>
      <defs>
        <linearGradient id="spkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(62% 0.24 293)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="oklch(62% 0.24 293)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#spkGrad)" />
      <path d={pathD} fill="none" stroke="oklch(62% 0.24 293)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="oklch(62% 0.24 293)" />)}
    </svg>
  )
}

export default function ProgressPage() {
  const [mode, setMode] = useState<'lift' | 'run'>('lift')
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)
  const [barsVisible, setBarsVisible] = useState(false)
  const { unit } = useWeightUnit()

  const rawSets = useLiveQuery<SetLog[]>(() => db.sets.toArray(), [])
  const rawExercises = useLiveQuery<Exercise[]>(() => db.exercises.toArray(), [])
  const allSets = useMemo(() => rawSets ?? [], [rawSets])
  const allExercises = useMemo(() => rawExercises ?? [], [rawExercises])

  const exMap         = useMemo(() => new Map(allExercises.map(e => [e.id, e])), [allExercises])
  const volByGroup    = useMemo(() => weeklyVolumeByGroup(allSets, exMap), [allSets, exMap])
  const prs           = useMemo(() => computePRs(allSets), [allSets])
  const progressionMap = useMemo(() => {
    const map = new Map<string, ProgressPoint[]>()
    prs.forEach(pr => { map.set(pr.exerciseId, exerciseProgression(allSets, pr.exerciseId)) })
    return map
  }, [allSets, prs])

  useEffect(() => {
    if (volByGroup.length > 0) {
      const id = requestAnimationFrame(() => setBarsVisible(true))
      return () => cancelAnimationFrame(id)
    }
  }, [volByGroup.length])

  const totalWeekVol = volByGroup.reduce((acc, r) => acc + r.volume, 0)
  const displayTotalVol = unit === 'lb'
    ? Math.round(totalWeekVol * KG_TO_LBS / 100) / 10
    : Math.round(totalWeekVol / 100) / 10

  const selectedPr = selectedPrId ? prs.find(p => p.exerciseId === selectedPrId) : null
  const selectedEx = selectedPrId ? exMap.get(selectedPrId) : null

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="px-4 pt-12 pb-5">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          PROGRESS
        </h1>
        <div
          className="mt-4 inline-flex rounded-2xl p-1"
          style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
        >
          {(['lift', 'run'] as const).map(tab => {
            const active = mode === tab
            return (
              <button
                key={tab}
                onClick={() => {
                  setMode(tab)
                  if (tab === 'run') setSelectedPrId(null)
                }}
                className="min-w-24 rounded-xl px-4 py-2.5 transition-all active:scale-[0.98]"
                style={{
                  background: active ? 'oklch(62% 0.24 293)' : 'transparent',
                  color: active ? 'oklch(7% 0.008 293)' : 'oklch(72% 0.012 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 800,
                  fontSize: '14px',
                  letterSpacing: '0.08em',
                }}
              >
                {tab.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {mode === 'lift' ? (
        <>
          {/* Section A: Weekly Volume */}
          <section className="px-4 mb-6">
            {volByGroup.length > 0 && (
              <div className="flex items-baseline gap-2 mb-3">
                <span style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.15em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase' }}>
                  THIS WEEK ·
                </span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '28px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em', lineHeight: 1 }}>
                  {displayTotalVol}k
                </span>
                <span style={{ fontSize: '13px', color: 'oklch(44% 0.008 293)' }}>{unit}</span>
              </div>
            )}
            <Label>Weekly Volume</Label>
            {volByGroup.length === 0 ? <Empty text="Log workouts to see weekly volume" /> : (
              <div className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
                {volByGroup.map((row, i) => {
                  const vol = unit === 'lb' ? row.volume * KG_TO_LBS : row.volume
                  const color = GROUP_COLORS[row.group] ?? 'oklch(62% 0.24 293)'
                  return (
                    <div key={row.group}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color, marginTop: 2 }}
                          />
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: 'oklch(72% 0.012 293)', textTransform: 'uppercase' }}>
                            {row.group}
                          </span>
                        </div>
                        <div className="text-right">
                          <p style={{ fontSize: '14px', fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: 'oklch(90% 0.008 293)' }}>
                            {Math.round(vol).toLocaleString()}{' '}
                            <span style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', fontFamily: "'Barlow', sans-serif", fontWeight: 400 }}>{unit}</span>
                          </p>
                          <p style={{ fontSize: '11px', color: 'oklch(40% 0.008 293)' }}>{row.sets} sets</p>
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'oklch(18% 0.012 293)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: barsVisible ? `${row.pct}%` : '0%',
                            background: color,
                            transition: `width 700ms ease-out ${i * 75}ms`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Section C: Personal Records — tappable card grid */}
          <section className="px-4">
            <Label>Personal Records</Label>
            {prs.length === 0 ? <Empty text="Complete workouts to build PRs" /> : (
              <div className="grid grid-cols-2 gap-3">
                {prs.map(pr => {
                  const ex = exMap.get(pr.exerciseId)
                  const prog = progressionMap.get(pr.exerciseId) ?? []
                  const trend = prog.length >= 2
                    ? (prog[prog.length - 1].maxWeightKg > prog[0].maxWeightKg ? '↑' : '→')
                    : null
                  const groupColor = GROUP_COLORS[ex?.primaryMuscleGroup ?? 'Other'] ?? 'oklch(44% 0.008 293)'
                  const displayBest = formatWeight(unit === 'lb' ? kgToLbs(pr.bestWeightKg) : pr.bestWeightKg)

                  return (
                    <button
                      key={pr.exerciseId}
                      onClick={() => setSelectedPrId(pr.exerciseId)}
                      className="rounded-2xl p-4 text-left flex flex-col gap-2 active:scale-[0.97] transition-transform"
                      style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
                    >
                      {/* Muscle chip + trend */}
                      <div className="flex items-center justify-between">
                        <span
                          className="rounded px-1.5 py-0.5 font-bold uppercase"
                          style={{
                            fontSize: '9px',
                            fontFamily: "'Barlow Condensed', sans-serif",
                            letterSpacing: '0.08em',
                            background: `color-mix(in oklch, ${groupColor} 18%, transparent)`,
                            color: groupColor,
                          }}
                        >
                          {ex?.primaryMuscleGroup ?? '—'}
                        </span>
                        {trend && (
                          <span style={{ fontSize: '16px', color: trend === '↑' ? 'oklch(62% 0.24 293)' : 'oklch(35% 0.008 293)' }}>
                            {trend}
                          </span>
                        )}
                      </div>

                      {/* Exercise name */}
                      <p
                        className="line-clamp-2 leading-tight"
                        style={{ fontSize: '12px', color: 'oklch(72% 0.012 293)' }}
                      >
                        {pr.exerciseName}
                      </p>

                      {/* Best weight */}
                      <div className="flex items-baseline gap-1">
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '32px', color: 'oklch(97% 0.005 293)', lineHeight: 1 }}>
                          {displayBest}
                        </span>
                        <span style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)' }}>{unit}</span>
                      </div>

                      {/* Mini sparkline */}
                      {prog.length >= 2 && (
                        <Sparkline points={prog.map(p => p.maxWeightKg)} height={32} />
                      )}

                      {/* Metadata */}
                      <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>
                        {pr.bestReps} reps · {pr.sessionCount} sessions
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <RunProgressPanel />
      )}

      {/* Exercise drill-down overlay */}
      {mode === 'lift' && selectedPrId != null && selectedPr != null && (
        <ExerciseDashboardSheet
          exerciseId={selectedPrId}
          exerciseName={selectedPr.exerciseName}
          muscleGroup={selectedEx?.primaryMuscleGroup ?? '—'}
          unit={unit}
          onClose={() => setSelectedPrId(null)}
        />
      )}
    </div>
  )
}
