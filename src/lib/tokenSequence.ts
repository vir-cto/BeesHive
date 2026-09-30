/**
 * Bee's Hive — Daily sequential token numbering.
 *
 * Requirement (Phase 8 / Firestore readiness):
 *   Tokens are sequential for the restaurant day (TOKEN #001 … #041) and must
 *   NEVER be derived from "orders array length + 1" — records can be
 *   deleted/amended. Each confirmed order owns ONE token for life (a failed
 *   print retries the SAME token; it never produces a duplicate).
 *
 * Mock mode:
 *   A per-day counter persisted to localStorage keeps numbering correct across
 *   page reloads and multi-waiter clients on the same browser. It also keeps a
 *   monotonic "last assigned" value for the day so deletions never reuse a
 *   number.
 *
 * Firebase mode:
 *   `nextToken()` delegates to the Firestore atomic counter
 *   (runTransaction on counters/tokens/{date}) so multiple waiters can never
 *   receive the same token. The bridge below keeps the two implementations
 *   behind one interface.
 */
import { dataMode } from '../services/firebase/config'
import { toBusinessDayStr } from './businessDay'
import { nextToken as nextFirebaseToken } from '../services/firebase/tokenService'

const STORAGE_PREFIX = 'beeshive_token_counter_'

/** Dine-in and parcel tokens are numbered on separate series. */
export type TokenSeries = 'dine_in' | 'parcel'

/** LocalStorage-backed counter (mock). Thread-safe within one browser. */
const mockCounter = {
  read(key: string): number {
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw === null ? null : Number(JSON.parse(raw))
      return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    } catch {
      return 0
    }
  },
  write(key: string, value: number): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable — fall back to in-memory only */
    }
  },
}

/** A monotonic in-memory view so two calls in the same second still increment. */
const memoryNext: Record<string, number> = {}

/** YYYY-MM-DD local key used for a "restaurant day". */
export const restaurantDateKey = (at: number = Date.now()): string => toBusinessDayStr(at)

/**
 * Human-friendly token label, e.g. `#041`.
 *
 * Re-exported from the dependency-free `tokenLabel` module so receipts and the
 * print preview can build parcel (`P-041`) / dine-in (`#041`) labels without
 * pulling the numbering (and Firebase) code in.
 */
export { formatTokenNumber, formatParcelTokenNumber, formatOrderToken } from './tokenLabel'

/**
 * Returns the next token number for the restaurant day.
 *
 * - Firebase mode: delegates to the Firestore atomic counter (separate document
 *   per series), so two waiters on two devices can never receive the same token.
 * - Mock/offline: a per-series localStorage counter that is also monotonic in
 *   memory, so numbering survives reloads and rapid same-second confirmations.
 */
export const nextTokenNumber = async (series: TokenSeries = 'dine_in'): Promise<number> => {
  const dateKey = restaurantDateKey()
  if (dataMode === 'firebase' && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    return nextFirebaseToken(dateKey, series)
  }
  const key = `${STORAGE_PREFIX}${series}_${dateKey}`
  const base = Math.max(mockCounter.read(key), memoryNext[key] ?? 0)
  const next = base + 1
  memoryNext[key] = next
  mockCounter.write(key, next)
  return next
}

/** Last token assigned this day (for displays/logs). */
export const currentTokenNumber = (series: TokenSeries = 'dine_in'): number => {
  const key = `${STORAGE_PREFIX}${series}_${restaurantDateKey()}`
  return Math.max(mockCounter.read(key), memoryNext[key] ?? 0)
}