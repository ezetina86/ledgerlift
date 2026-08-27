import type { RunSession } from '../db/index.ts'
import { C25K_PLAN, nextRunSession } from './runPlan.ts'

export interface CompletedRunSession extends RunSession {
  completedAt: number
}

export interface RunProgressSummary {
  completedCount: number
  totalPlanned: number
  completionPct: number
  nextSessionLabel: string | null
}

export interface RunDurationTrendPoint {
  order: number
  label: string
  value: number
  week: number
  day: number
  completedAt: number
  durationSec: number
}

export interface RunDistanceTrendPoint {
  order: number
  label: string
  value: number
  week: number
  day: number
  completedAt: number
  distanceKm: number
}

export interface RunRpeTrendPoint {
  order: number
  label: string
  value: number
  week: number
  day: number
  completedAt: number
  rpe: number
}

const TOTAL_PLANNED_RUNS = C25K_PLAN.length

function sessionLabel(week: number, day: number): string {
  return `Week ${week} · Day ${day}`
}

function sessionSortValue(session: RunSession): number {
  return session.completedAt ?? session.startedAt
}

function longestPlannedRunIntervalSec(week: number, day: number): number {
  const session = C25K_PLAN.find(s => s.week === week && s.day === day)
  if (!session) return 0

  return session.intervals.reduce((max, interval) => {
    if (interval.type !== 'run') return max
    return Math.max(max, interval.durationSec)
  }, 0)
}

export function completedRunSessions(sessions: RunSession[]): CompletedRunSession[] {
  return sessions
    .filter((session): session is CompletedRunSession => session.completedAt !== null)
    .sort((a, b) => {
      const byCompletedAt = sessionSortValue(a) - sessionSortValue(b)
      if (byCompletedAt !== 0) return byCompletedAt

      const byStartedAt = a.startedAt - b.startedAt
      if (byStartedAt !== 0) return byStartedAt

      const byWeek = a.week - b.week
      if (byWeek !== 0) return byWeek

      return a.day - b.day
    })
}

export function runSummary(sessions: RunSession[]): RunProgressSummary {
  const completedCount = completedRunSessions(sessions).length
  const nextSession = nextRunSession(completedCount)

  return {
    completedCount,
    totalPlanned: TOTAL_PLANNED_RUNS,
    completionPct: TOTAL_PLANNED_RUNS === 0
      ? 0
      : Math.min(100, Math.round((completedCount / TOTAL_PLANNED_RUNS) * 100)),
    nextSessionLabel: nextSession ? sessionLabel(nextSession.week, nextSession.day) : null,
  }
}

export function totalRunDurationSec(sessions: RunSession[]): number {
  return completedRunSessions(sessions).reduce((sum, session) => {
    return sum + (session.durationSec ?? 0)
  }, 0)
}

export function totalRunDistanceKm(sessions: RunSession[]): number {
  return completedRunSessions(sessions).reduce((sum, session) => {
    return sum + (session.distanceKm ?? 0)
  }, 0)
}

export const totalLoggedDistanceKm = totalRunDistanceKm

export function longestCompletedRunIntervalSec(sessions: RunSession[]): number {
  return completedRunSessions(sessions).reduce((max, session) => {
    return Math.max(max, longestPlannedRunIntervalSec(session.week, session.day))
  }, 0)
}

export function durationTrend(sessions: RunSession[]): RunDurationTrendPoint[] {
  return completedRunSessions(sessions)
    .filter((session): session is CompletedRunSession & { durationSec: number } => session.durationSec != null)
    .map((session, index) => ({
      order: index + 1,
      label: sessionLabel(session.week, session.day),
      value: session.durationSec,
      week: session.week,
      day: session.day,
      completedAt: session.completedAt,
      durationSec: session.durationSec,
    }))
}

export function distanceTrend(sessions: RunSession[]): RunDistanceTrendPoint[] {
  return completedRunSessions(sessions)
    .filter((session): session is CompletedRunSession & { distanceKm: number } => session.distanceKm != null)
    .map((session, index) => ({
      order: index + 1,
      label: sessionLabel(session.week, session.day),
      value: session.distanceKm,
      week: session.week,
      day: session.day,
      completedAt: session.completedAt,
      distanceKm: session.distanceKm,
    }))
}

export function rpeTrend(sessions: RunSession[]): RunRpeTrendPoint[] {
  return completedRunSessions(sessions)
    .filter((session): session is CompletedRunSession & { rpe: number } => session.rpe != null)
    .map((session, index) => ({
      order: index + 1,
      label: sessionLabel(session.week, session.day),
      value: session.rpe,
      week: session.week,
      day: session.day,
      completedAt: session.completedAt,
      rpe: session.rpe,
    }))
}
