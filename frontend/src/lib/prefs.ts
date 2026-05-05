import { useState, useCallback } from 'react'

export type WeightUnit = 'kg' | 'lb'
export const WEIGHT_UNIT_KEY = 'ledgerlift:weightUnit'

export function getWeightUnit(): WeightUnit {
  const stored = localStorage.getItem(WEIGHT_UNIT_KEY)
  return stored === 'lb' ? 'lb' : 'kg'
}

export function setWeightUnit(unit: WeightUnit): void {
  localStorage.setItem(WEIGHT_UNIT_KEY, unit)
}

export function useWeightUnit(): { unit: WeightUnit; toggle: () => void } {
  const [unit, setUnit] = useState<WeightUnit>(getWeightUnit)
  const toggle = useCallback(() => {
    const next: WeightUnit = unit === 'kg' ? 'lb' : 'kg'
    setWeightUnit(next)
    setUnit(next)
  }, [unit])
  return { unit, toggle }
}
