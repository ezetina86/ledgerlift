import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { Exercise } from '../db/index.ts'

const GROUPS = ['All','Back','Chest','Shoulder','Biceps','Triceps','Quad','Hamstring','Glute','Calves','Core','Neck','Adductors','Forarm']

const TIER_STYLES: Record<string, { bg: string; color: string }> = {
  '5 - S+': { bg: 'oklch(30% 0.12 85)',  color: 'oklch(78% 0.18 85)'  },
  '4 - S':  { bg: 'oklch(25% 0.10 293)', color: 'oklch(72% 0.20 293)' },
  '3 - A':  { bg: 'oklch(25% 0.10 220)', color: 'oklch(68% 0.18 220)' },
  '2 - B':  { bg: 'oklch(18% 0.010 293)',color: 'oklch(44% 0.008 293)'},
  '1 - C':  { bg: 'oklch(15% 0.008 293)',color: 'oklch(34% 0.008 293)'},
}

export default function CatalogPage() {
  const [search, setSearch] = useState('')
  const [group, setGroup]   = useState('All')
  const [selected, setSelected] = useState<Exercise | null>(null)

  const exercises = useLiveQuery<Exercise[]>(() => db.exercises.toArray(), []) ?? []

  const filtered = exercises.filter(e => {
    const matchGroup  = group === 'All' || e.primaryMuscleGroup === group
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
    return matchGroup && matchSearch
  })

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ background: 'oklch(7% 0.008 293)' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-3">
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '36px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', lineHeight: 1, margin: '0 0 14px' }}>
          CATALOG
        </h1>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'oklch(44% 0.008 293)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search exercises…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 rounded-xl pl-9 pr-4 text-sm focus:outline-none"
            style={{
              background: 'oklch(12% 0.010 293)',
              border: '1px solid oklch(19% 0.008 293)',
              color: 'oklch(97% 0.005 293)',
              fontFamily: "'Barlow', sans-serif",
            }}
          />
        </div>
      </div>

      {/* Group filter */}
      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors active:scale-95"
              style={{
                background: group === g ? 'oklch(62% 0.24 293)' : 'oklch(12% 0.010 293)',
                color:      group === g ? 'oklch(8% 0.008 293)'  : 'oklch(50% 0.010 293)',
                border:     group === g ? 'none'                  : '1px solid oklch(19% 0.008 293)',
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize:   '12px',
                letterSpacing: '0.06em',
              }}
            >
              {g.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="px-4 pb-2">
        <p style={{ fontSize: '11px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: '0.1em', color: 'oklch(44% 0.008 293)' }}>
          {filtered.length} EXERCISES
        </p>
      </div>

      {/* List */}
      <div className="px-4 flex flex-col gap-1">
        {filtered.map(ex => {
          const tier = ex.tierListGrade ? TIER_STYLES[ex.tierListGrade] : null
          return (
            <button
              key={ex.id}
              onClick={() => setSelected(ex)}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors active:bg-[oklch(15%_0.010_293)]"
              style={{ background: 'oklch(12% 0.010 293)', border: '1px solid oklch(19% 0.008 293)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'oklch(97% 0.005 293)' }}>{ex.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'oklch(44% 0.008 293)' }}>{ex.equipment}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {ex.muscleLadder && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px]"
                    style={{ background: 'oklch(20% 0.10 293)', color: 'oklch(62% 0.24 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.08em' }}
                  >
                    ML
                  </span>
                )}
                {tier && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px]"
                    style={{ background: tier.bg, color: tier.color, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}
                  >
                    {ex.tierListGrade!.split(' - ')[1]}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail sheet */}
      {selected && (
        <>
          <div className="fixed inset-0 z-50 animate-fade-in" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={() => setSelected(null)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up px-5 pt-5 pb-10 max-h-[80svh] overflow-y-auto"
            style={{ background: 'oklch(12% 0.010 293)', borderTop: '1px solid oklch(28% 0.016 293)', borderRadius: '20px 20px 0 0' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'oklch(30% 0.010 293)' }} />

            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '26px', letterSpacing: '-0.01em', color: 'oklch(97% 0.005 293)', margin: 0, flex: 1 }}>
                {selected.name.toUpperCase()}
              </h2>
              <button onClick={() => setSelected(null)} style={{ color: 'oklch(44% 0.008 293)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[['Muscle', selected.primaryMuscleGroup], ['Equipment', selected.equipment]].map(([l, v]) => (
                <div key={l} className="p-3 rounded-xl" style={{ background: 'oklch(18% 0.012 293)' }}>
                  <p style={{ fontSize: '10px', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.12em', color: 'oklch(44% 0.008 293)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
                  <p className="text-sm font-medium" style={{ color: 'oklch(97% 0.005 293)' }}>{v}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap mb-4">
              {selected.tierListGrade && (() => {
                const t = TIER_STYLES[selected.tierListGrade]
                return (
                  <span className="px-3 py-1.5 rounded-lg text-sm" style={{ background: t?.bg, color: t?.color, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em' }}>
                    TIER {selected.tierListGrade.split(' - ')[1]}
                  </span>
                )
              })()}
              {selected.muscleLadder && (
                <span className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'oklch(20% 0.10 293)', color: 'oklch(62% 0.24 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em' }}>
                  MUSCLE LADDER
                </span>
              )}
              {selected.jeffSubgroupFav && (
                <span className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'oklch(28% 0.12 85)', color: 'oklch(78% 0.18 85)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: '0.06em' }}>
                  JEFF'S FAV
                </span>
              )}
            </div>

            {selected.demonstrationLink && (
              <a
                href={selected.demonstrationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full h-12 rounded-xl transition-all active:scale-[0.98]"
                style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(72% 0.012 293)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '14px', letterSpacing: '0.08em' }}
              >
                <svg className="w-4 h-4" style={{ color: 'oklch(60% 0.22 25)' }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.69a8.28 8.28 0 004.83 1.54V7.77a4.84 4.84 0 01-1.06-.08z"/>
                </svg>
                WATCH DEMO
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}
