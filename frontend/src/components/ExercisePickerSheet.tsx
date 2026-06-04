import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.ts'
import type { Exercise } from '../db/index.ts'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (exercise: Exercise) => void
  filterMuscleGroup?: string
  excludeIds?: string[]
  title?: string
}

const MUSCLE_GROUPS = [
  'All', 'Back', 'Shoulder', 'Chest', 'Biceps', 'Glute',
  'Triceps', 'Quad', 'Hamstring', 'Core', 'Calves',
  'Adductors', 'Neck', 'Forearm',
]

export default function ExercisePickerSheet({ open, onClose, onSelect, filterMuscleGroup, excludeIds, title = 'PICK EXERCISE' }: Props) {
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState(filterMuscleGroup ?? 'All')

  const exercises = useLiveQuery(() => db.exercises.toArray())

  const filtered = useMemo(() => {
    if (!exercises) return []
    const q = search.toLowerCase()
    return exercises.filter(ex => {
      if (excludeIds?.includes(ex.id)) return false
      const matchGroup = activeGroup === 'All' || ex.primaryMuscleGroup === activeGroup
      const matchSearch = !q || ex.name.toLowerCase().includes(q) || ex.primaryMuscleGroup.toLowerCase().includes(q)
      return matchGroup && matchSearch
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [exercises, search, activeGroup, excludeIds])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up flex flex-col"
        style={{
          background: 'oklch(12% 0.010 293)',
          borderTop: '1px solid oklch(28% 0.016 293)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '82vh',
        }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-2 shrink-0" style={{ background: 'oklch(30% 0.010 293)' }} />

        {/* Header */}
        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: '22px', color: 'oklch(97% 0.005 293)', letterSpacing: '-0.01em', margin: 0 }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'oklch(18% 0.012 293)', color: 'oklch(50% 0.010 293)' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises…"
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: 'oklch(18% 0.012 293)',
              border: '1px solid oklch(24% 0.010 293)',
              color: 'oklch(97% 0.005 293)',
              fontFamily: "'Barlow', sans-serif",
            }}
          />
        </div>

        {/* Muscle group chips */}
        <div className="shrink-0 overflow-x-auto px-5 pb-3" style={{ scrollbarWidth: 'none' }}>
          <div className="flex gap-2 min-w-max">
            {MUSCLE_GROUPS.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className="px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                style={{
                  background: activeGroup === g ? 'oklch(62% 0.24 293)' : 'oklch(18% 0.012 293)',
                  color: activeGroup === g ? 'oklch(8% 0.008 293)' : 'oklch(62% 0.010 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '12px',
                  letterSpacing: '0.06em',
                }}
              >
                {g.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {filtered.length === 0 && (
            <p className="text-center py-10" style={{ color: 'oklch(44% 0.008 293)', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '14px' }}>
              No exercises found
            </p>
          )}
          {filtered.map(ex => (
            <button
              key={ex.id}
              onClick={() => { onSelect(ex); onClose() }}
              className="w-full flex items-center justify-between py-3 transition-colors active:bg-[oklch(18%_0.012_293)]"
              style={{ borderBottom: '1px solid oklch(19% 0.008 293)' }}
            >
              <div className="flex-1 min-w-0 text-left">
                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '15px', color: 'oklch(97% 0.005 293)' }}>
                  {ex.name}
                </p>
                <p style={{ fontSize: '11px', color: 'oklch(44% 0.008 293)', marginTop: 1 }}>
                  {ex.equipment}
                </p>
              </div>
              <span
                className="ml-3 shrink-0 px-2 py-1 rounded-md"
                style={{
                  background: 'oklch(18% 0.012 293)',
                  color: 'oklch(62% 0.24 293)',
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                }}
              >
                {ex.primaryMuscleGroup.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
