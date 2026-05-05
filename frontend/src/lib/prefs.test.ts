import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Stub localStorage before importing prefs (same pattern as sync.test.ts)
// Node.js 22 ships a global localStorage that lacks .clear() — stub it.
const _store = new Map<string, string>()
const mockStorage: Storage = {
  getItem:    (k) => _store.get(k) ?? null,
  setItem:    (k, v) => { _store.set(k, v) },
  removeItem: (k) => { _store.delete(k) },
  clear:      () => { _store.clear() },
  get length() { return _store.size },
  key:        (i) => [..._store.keys()][i] ?? null,
}
vi.stubGlobal('localStorage', mockStorage)

import { getWeightUnit, setWeightUnit, useWeightUnit, WEIGHT_UNIT_KEY } from './prefs.ts'

beforeEach(() => _store.clear())

describe('getWeightUnit', () => {
  it('returns kg by default when nothing is stored', () => {
    expect(getWeightUnit()).toBe('kg')
  })

  it('returns lb after setWeightUnit(lb)', () => {
    setWeightUnit('lb')
    expect(getWeightUnit()).toBe('lb')
  })

  it('returns kg after setWeightUnit(kg)', () => {
    setWeightUnit('kg')
    expect(getWeightUnit()).toBe('kg')
  })

  it('defaults to kg for unknown stored value', () => {
    _store.set(WEIGHT_UNIT_KEY, 'stones')
    expect(getWeightUnit()).toBe('kg')
  })
})

describe('setWeightUnit', () => {
  it('persists kg to localStorage', () => {
    setWeightUnit('kg')
    expect(localStorage.getItem(WEIGHT_UNIT_KEY)).toBe('kg')
  })

  it('persists lb to localStorage', () => {
    setWeightUnit('lb')
    expect(localStorage.getItem(WEIGHT_UNIT_KEY)).toBe('lb')
  })

  it('overwrites lb with kg', () => {
    setWeightUnit('lb')
    setWeightUnit('kg')
    expect(getWeightUnit()).toBe('kg')
  })
})

describe('useWeightUnit', () => {
  it('initialises with kg when nothing stored', () => {
    const { result } = renderHook(() => useWeightUnit())
    expect(result.current.unit).toBe('kg')
  })

  it('initialises with lb when lb is stored', () => {
    setWeightUnit('lb')
    const { result } = renderHook(() => useWeightUnit())
    expect(result.current.unit).toBe('lb')
  })

  it('toggle switches kg → lb', () => {
    const { result } = renderHook(() => useWeightUnit())
    act(() => { result.current.toggle() })
    expect(result.current.unit).toBe('lb')
  })

  it('toggle switches lb → kg', () => {
    setWeightUnit('lb')
    const { result } = renderHook(() => useWeightUnit())
    act(() => { result.current.toggle() })
    expect(result.current.unit).toBe('kg')
  })

  it('toggle persists new unit to localStorage', () => {
    const { result } = renderHook(() => useWeightUnit())
    act(() => { result.current.toggle() })
    expect(localStorage.getItem(WEIGHT_UNIT_KEY)).toBe('lb')
  })

  it('double toggle returns to original unit', () => {
    const { result } = renderHook(() => useWeightUnit())
    act(() => { result.current.toggle() })
    act(() => { result.current.toggle() })
    expect(result.current.unit).toBe('kg')
  })
})
