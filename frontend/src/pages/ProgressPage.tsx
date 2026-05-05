import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { Exercise, SetLog } from '../db/index.ts'
import { weeklyVolumeByGroup, computePRs, exerciseProgression } from '../lib/overload.ts'
import { formatDate, formatWeight, kgToLbs, KG_TO_LBS } from '../lib/utils.ts'
import { useWeightUnit } from '../lib/prefs.ts'

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

export default function ProgressPage() {
  const [selectedExId, setSelectedExId] = useState<string | null>(null)
  const { unit } = useWeightUnit()

  const allSets      = useLiveQuery<SetLog[]>(() => db.sets.toArray(), []) ?? []
  const allExercises = useLiveQuery<Exercise[]>(() => db.exercises.toArray(), []) ?? []

  const exMap      = new Map(allExercises.map(e => [e.id, e]))
  const volByGroup = weeklyVolumeByGroup(allSets, exMap)
  const prs        = computePRs(allSets)

  const loggedExIds    = [...new Set(allSets.map(s => s.exerciseId))]
  const loggedExercises = loggedExIds.map(id => exMap.get(id)).filter((e): e is Exercise => !!e).sort((a,b) => a.name.localeCompare(b.name))

  const progression = selectedExId ? exerciseProgression(allSets, selectedExId) : []

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      <div className="px-4 pt-12 pb-5">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: 0 }}>
          PROGRESS
        </h1>
      </div>

      {/* Weekly volume */}
      <section className="px-4 mb-6">
        <Label>Weekly Volume</Label>
        {volByGroup.length === 0 ? <Empty text="Log workouts to see weekly volume" /> : (
          <div className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
            {volByGroup.map(row => (
              <div key={row.group}>
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: 'oklch(72% 0.012 293)', textTransform: 'uppercase' }}>
                    {row.group}
                  </span>
                  <span className="num" style={{ fontSize: '13px', color: 'oklch(50% 0.010 293)' }}>
                    {Math.round((unit === 'lb' ? row.volume * KG_TO_LBS : row.volume) / 100) / 10}k · {row.sets}s
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(18% 0.012 293)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${row.pct}%`, background: GROUP_COLORS[row.group] ?? 'oklch(62% 0.24 293)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Exercise trend */}
      <section className="px-4 mb-6">
        <Label>Exercise Trend</Label>
        {loggedExercises.length === 0 ? <Empty text="No logged exercises yet" /> : (
          <>
            <select
              value={selectedExId ?? ''}
              onChange={e => setSelectedExId(e.target.value || null)}
              className="w-full h-11 rounded-xl px-3 text-sm focus:outline-none mb-3"
              style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)', color: 'oklch(97% 0.005 293)', fontFamily: "'Barlow', sans-serif", appearance: 'none' }}
            >
              <option value="">Pick an exercise…</option>
              {loggedExercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>

            {selectedExId && progression.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
                <Sparkline points={progression.map(p => p.maxWeightKg)} />
                <div className="mt-4 flex flex-col gap-2">
                  {progression.slice(-5).reverse().map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span style={{ fontSize: '12px', color: 'oklch(44% 0.008 293)' }}>{formatDate(p.sessionDate)}</span>
                      <span className="num" style={{ fontSize: '16px', fontWeight: 800, color: i === 0 ? 'oklch(62% 0.24 293)' : 'oklch(97% 0.005 293)' }}>
                        {formatWeight(unit === 'lb' ? kgToLbs(p.maxWeightKg) : p.maxWeightKg)} <span style={{ fontSize: '11px', fontFamily: "'Barlow', sans-serif", fontWeight: 400, color: 'oklch(44% 0.008 293)' }}>{unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* PRs */}
      <section className="px-4">
        <Label>Personal Records</Label>
        {prs.length === 0 ? <Empty text="Complete workouts to build PRs" /> : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}>
            {prs.slice(0, 15).map((pr, i) => (
              <div
                key={pr.exerciseId}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid oklch(16% 0.008 293)' : 'none' }}
              >
                <span className="num w-5 text-right" style={{ fontSize: '12px', color: 'oklch(34% 0.008 293)' }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'oklch(72% 0.012 293)' }}>{pr.exerciseName}</p>
                  <p style={{ fontSize: '11px', color: 'oklch(34% 0.008 293)' }}>{pr.sessionCount} sessions</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="num" style={{ fontSize: '20px', fontWeight: 800, color: 'oklch(97% 0.005 293)' }}>
                    {formatWeight(unit === 'lb' ? kgToLbs(pr.bestWeightKg) : pr.bestWeightKg)}<span style={{ fontSize: '11px', fontFamily: "'Barlow', sans-serif", fontWeight: 400, color: 'oklch(44% 0.008 293)' }}> {unit}</span>
                  </p>
                  <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)' }}>{pr.bestReps} reps</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const W = 320, H = 60, PAD = 6
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1
  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2))
  const ys = points.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2))
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const areaD = pathD + ` L${xs[xs.length-1].toFixed(1)} ${H} L${xs[0].toFixed(1)} ${H}Z`

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
