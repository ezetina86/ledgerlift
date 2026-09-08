export function uid(): string {
  return crypto.randomUUID()
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

export function formatElapsed(startTs: number): string {
  const s = Math.floor((Date.now() - startTs) / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m ${s % 60}s`
}

export function formatWeight(kg: number): string {
  return kg % 1 === 0 ? `${kg}` : kg.toFixed(1)
}

export function totalVolume(sets: { reps: number; weightKg: number }[]): number {
  return sets.reduce((acc, s) => acc + s.reps * s.weightKg, 0)
}

export const KG_TO_LBS = 2.20462

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS
}

export function lbsToKg(lbs: number): number {
  return lbs / KG_TO_LBS
}

export const MUSCLE_GROUPS = [
  'All', 'Back', 'Shoulder', 'Chest', 'Biceps', 'Glute',
  'Triceps', 'Quad', 'Hamstring', 'Core', 'Calves',
  'Adductors', 'Neck', 'Forearm',
]

export const RPE_COLORS: Record<number, string> = {
  6:  'oklch(68% 0.18 150)',
  7:  'oklch(76% 0.16 115)',
  8:  'oklch(76% 0.16 85)',
  9:  'oklch(65% 0.20 42)',
  10: 'oklch(60% 0.22 25)',
}
