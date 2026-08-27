import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HistoryPage from './HistoryPage.tsx'

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn(() => []) }))
vi.mock('../db/index.ts', () => ({ db: {} }))
vi.mock('../lib/prefs.ts', () => ({ useWeightUnit: () => ({ unit: 'kg' }) }))

describe('HistoryPage', () => {
  it('renders LIFT and RUN tabs', () => {
    render(<HistoryPage />)
    expect(screen.getByText('LIFT')).toBeTruthy()
    expect(screen.getByText('RUN')).toBeTruthy()
  })

  it('shows LIFT empty state by default', () => {
    render(<HistoryPage />)
    expect(screen.getByText('NO WORKOUTS YET')).toBeTruthy()
  })

  it('switches to RUN tab and shows run empty state', () => {
    render(<HistoryPage />)
    fireEvent.click(screen.getByText('RUN'))
    expect(screen.getByText('NO RUNS YET')).toBeTruthy()
  })
})
