/**
 * Supervisor order prioritization engine — pure, timestamp-driven.
 *
 * Design rules:
 *  - Priority is CALCULATED from stable timestamps; it is never stored and
 *    never replaces the operational order status (PLACED..SERVED).
 *  - Firebase-ready: DB stores timestamps; the client derives urgency, so no
 *    per-second writes are ever needed.
 *  - One shared ticker hook for the whole KDS (no per-card intervals).
 */
import { useEffect, useState } from 'react'

export type KdsPriority = 'VIP_OVERDUE' | 'URGENT' | 'VIP' | 'HIGH' | 'NORMAL'

export interface KdsOrderTiming {
  status: string
  createdAt: number
  acceptedAt?: number | null
  preparingAt?: number | null
  estimatedReadyAt?: number | null
  prepMinutes: number // max(item prep times) — parallel cooking model
  isVip: boolean
  manualPriority?: string | null // 'normal' | 'fast' chosen at order placement
}

export interface KdsPriorityInfo {
  priority: KdsPriority
  isVip: boolean
  isOverdue: boolean
  isDueSoon: boolean
  expectedReadyAt: number | null
  remainingMinutes: number
  overdueMinutes: number
  severity: 'OVERDUE' | 'HIGHLY OVERDUE' | 'CRITICAL DELAY'
  rank: number
}

const MIN = 60_000

/** Longest item prep time wins (dishes cook in parallel, never summed). */
export const maxPrepMinutes = (values: Array<number | null | undefined>): number =>
  values.reduce<number>((acc, v) => (typeof v === 'number' && v > acc ? v : acc), 0)

export const computeKdsPriority = (o: KdsOrderTiming, now: number): KdsPriorityInfo => {
  const active = o.status === 'placed' || o.status === 'confirmed' || o.status === 'accepted' || o.status === 'preparing'
  const prep = Math.max(1, Math.round(o.prepMinutes || 1))

  // Deadline: preparingAt + prep wins. A supervisor ETA overrides ONLY when the
  // supervisor explicitly asked for more time than the prep-based expectation.
  // Fallback chain: preparingAt -> acceptedAt -> createdAt.
  const base = o.preparingAt ?? o.acceptedAt ?? o.createdAt
  const prepBased = base + prep * MIN
  const etaBased = o.estimatedReadyAt ?? 0
  const expectedReadyAt = active ? (etaBased > prepBased + MIN ? etaBased : prepBased) : null
  const remainingMs = expectedReadyAt ? expectedReadyAt - now : 0
  const remainingMinutes = Math.ceil(remainingMs / MIN)
  const overdueMinutes = expectedReadyAt ? Math.max(0, Math.ceil(-remainingMs / MIN)) : 0

  const isOverdue = active && expectedReadyAt !== null && remainingMs < 0

  // Due soon when <= 25% of the prep window remains (relative, not fixed 5 min).
  const dueSoonWindowMs = prep * MIN * 0.25
  const isDueSoon =
    active && !isOverdue && expectedReadyAt !== null && remainingMs <= dueSoonWindowMs

  const vip = o.isVip || o.manualPriority === 'vip'

  let priority: KdsPriority
  if (vip && isOverdue) priority = 'VIP_OVERDUE'
  else if (isOverdue) priority = 'URGENT'
  else if (vip) priority = 'VIP'
  else if (isDueSoon) priority = 'HIGH'
  else priority = 'NORMAL'

  // Manual "fast" can lift a NORMAL order; it can never suppress VIP/overdue.
  if (priority === 'NORMAL' && o.manualPriority === 'fast') priority = 'HIGH'

  const severity: KdsPriorityInfo['severity'] =
    overdueMinutes >= 15 ? 'CRITICAL DELAY' : overdueMinutes >= 5 ? 'HIGHLY OVERDUE' : 'OVERDUE'

  const rankTable: Record<KdsPriority, number> = {
    VIP_OVERDUE: 0,
    URGENT: 1,
    VIP: 2,
    HIGH: 3,
    NORMAL: 4,
  }

  return {
    priority,
    isVip: vip,
    isOverdue,
    isDueSoon,
    expectedReadyAt,
    remainingMinutes: Math.max(0, remainingMinutes),
    overdueMinutes,
    severity,
    rank: rankTable[priority],
  }
}

/** Dynamic KDS sort: priority rank asc, then oldest activity first. */
export const sortKdsByPriority = <T extends { id: string }>(
  list: T[],
  info: (item: T) => KdsPriorityInfo,
  activityTime: (item: T) => number
): T[] =>
  [...list].sort((a, b) => {
    const ra = info(a).rank
    const rb = info(b).rank
    if (ra !== rb) return ra - rb
    const ta = activityTime(a)
    const tb = activityTime(b)
    if (ta !== tb) return ta - tb
    return a.id.localeCompare(b.id)
  })

/** Single shared clock for the whole board — one interval, cleaned up. */
export const useKdsNow = (intervalMs = 20_000): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export const formatCountdown = (p: KdsPriorityInfo): string =>
  p.isOverdue ? 'OVERDUE BY ' + p.overdueMinutes + ' MIN' : 'READY IN ' + p.remainingMinutes + ' MIN'