import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// useLiveQuery returns undefined for all calls — avoids executing Dexie query
// chains. Components fall back to their `?? []` defaults; activeMeso is
// undefined, so PlanPage renders the "start new mesocycle" path.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => undefined),
}))
vi.mock('../db/index.ts', () => ({ db: {}, uid: () => 'test-uid' }))
vi.mock('../lib/split.ts', () => ({ mesocycleWeek: () => 1 }))
vi.mock('../lib/utils.ts', () => ({ uid: () => 'x' }))
vi.mock('../components/ExercisePickerSheet.tsx', () => ({ default: () => null }))

import PlanPage from './PlanPage.tsx'

describe('PlanPage C25K block', () => {
  it('renders the C25K section heading', () => {
    render(<PlanPage />)
    expect(screen.getByText('C25K PLAN')).toBeTruthy()
  })

  it('shows 0/27 when no runs completed', () => {
    render(<PlanPage />)
    expect(screen.getByText('0 / 27')).toBeTruthy()
  })
})
