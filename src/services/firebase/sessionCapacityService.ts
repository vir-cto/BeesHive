/**
 * Authoritative table-capacity enforcement for dining sessions.
 *
 * A table's `capacity` is the maximum TOTAL number of guests seated across ALL
 * active sessions on that table. One physical table may therefore host several
 * INDEPENDENT sessions (T-01, capacity 4 → session A 2 guests + session B 2
 * guests). `RestaurantContext.getTableOccupancy()` computes that for the UI, but
 * the UI is only UX: two waiters can act at the very same instant.
 *
 * `reserveSession()` is the authoritative check. It runs inside ONE Firestore
 * transaction that:
 *
 *   1. reads the table document (its `capacity`);
 *   2. reads `counters/tableCapacity_<tableId>`, a derived ledger that stores
 *      `occupancy` (sessionId → guest count) for the sessions currently using
 *      the table. Concurrent waiters read AND write this single document, which
 *      makes Firestore serialise them: the loser is retried, re-reads the ledger
 *      and therefore sees the session the winner just committed;
 *   3. re-reads every one of those session documents BY REFERENCE inside the same
 *      transaction, so the verdict comes from the authoritative
 *      `diningSessions` records and any concurrent change to them also forces a
 *      retry. Sessions whose status is `closed` (the application's existing
 *      lifecycle — no new status is introduced) or that no longer exist are
 *      dropped, so completing a session frees its seats immediately;
 *   4. rejects with `SessionCapacityExceededError` when the new session would
 *      push the table over capacity, otherwise writes the session document, the
 *      ledger and the table status in the same atomic commit.
 *
 * `occupancy` is a derived SUMMARY of real session documents, verified on every
 * reservation, so it can never hold a stale verdict: 2 + 2 + 2 guests on a
 * 4-seat table is impossible, and completed sessions never block a new one.
 *
 * Offline behaviour: a Firestore transaction needs the backend. When the device
 * is offline the reservation reports `authoritative: false` and the caller keeps
 * the application's existing offline-first path (local state + sync-engine push
 * on reconnect) — session creation is never blocked by a flaky connection.
 */
import { collection, doc, getDocs, query, runTransaction, where, type DocumentData } from 'firebase/firestore'
import { getFirestoreNow } from '../../firebase'
import { isFirebaseConfigured } from './config'
import { FIRESTORE_COLLECTIONS } from './dataService'
import type { Session } from '../../context/RestaurantContext'

/**
 * Session statuses that no longer occupy a table. Mirrors the existing
 * `SessionStatus` lifecycle (`'active' | 'payment_pending' | 'closed'`) and the
 * `status !== 'closed'` filter used by `getActiveSessionsForTable()`. Completed
 * sessions free their seats again.
 */
const CLOSED_SESSION_STATUS = 'closed'

/** Ledger document id for one physical table (`counters/tableCapacity_<id>`). */
export const tableCapacityLedgerId = (tableId: string): string => `tableCapacity_${tableId}`

/**
 * Raised when a new session would push the combined guest count of a table past
 * its capacity. The message is written for the operator (it is shown as-is in
 * the session dialog).
 */
export class SessionCapacityExceededError extends Error {
  readonly capacity: number
  readonly occupied: number
  readonly requested: number
  readonly available: number

  constructor(capacity: number, occupied: number, requested: number) {
    const available = Math.max(0, capacity - occupied)
    super(
      `Only ${available} of ${capacity} seat(s) left on this table, but ${requested} guest(s) were requested.`,
    )
    this.name = 'SessionCapacityExceededError'
    this.capacity = capacity
    this.occupied = occupied
    this.requested = requested
    this.available = available
  }
}

/** True for genuine connectivity failures (no backend round trip possible). */
export const isOfflineFirestoreError = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code
  return code === 'unavailable' || code === 'deadline-exceeded'
}

export interface SessionReservation {
  /** true when the Firestore transaction ran — capacity was enforced server-side. */
  authoritative: boolean
}

interface StoredSessionShape {
  status?: unknown
  guestCount?: unknown
}

/** sessionId → guest count of the sessions that currently occupy a table. */
type OccupancyMap = Record<string, number>

/** Derived state kept in `counters/tableCapacity_<tableId>`. */
interface CapacityLedger {
  tableId?: unknown
  capacity?: unknown
  occupiedGuests?: unknown
  activeSessions?: unknown
  occupancy?: OccupancyMap
  updatedAt?: unknown
}

const asCount = (value: unknown): number => {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const ledgerOccupancy = (ledger: CapacityLedger | undefined): OccupancyMap =>
  ledger?.occupancy && typeof ledger.occupancy === 'object' ? ledger.occupancy : {}

/**
 * Session ids that MIGHT occupy a table, read once from `diningSessions`.
 *
 * Only used to reconcile records that were created before this ledger existed
 * (or by any other write path): every candidate is then verified by reference
 * inside the transaction, so the verdict itself never depends on this read.
 */
const discoverOccupyingSessionIds = async (
  tableId: string,
  database: import('firebase/firestore').Firestore,
): Promise<string[]> => {
  const snapshot = await getDocs(
    query(collection(database, FIRESTORE_COLLECTIONS.sessions), where('tableId', '==', tableId)),
  )
  return snapshot.docs
    .filter((stored) => (stored.data() as StoredSessionShape).status !== CLOSED_SESSION_STATUS)
    .map((stored) => stored.id)
}

/**
 * Read every candidate session document BY REFERENCE inside the transaction and
 * keep only the ones that still occupy the table.
 *
 * By-reference reads are part of the transaction's read set, so a concurrent
 * change to any of them makes Firestore retry the whole transaction — which is
 * what stops two waiters from overfilling a table together.
 */
const verifyOccupancy = async (
  transaction: import('firebase/firestore').Transaction,
  database: import('firebase/firestore').Firestore,
  candidateIds: string[],
  ledgerMap: OccupancyMap,
): Promise<{ occupancy: OccupancyMap; occupied: number; activeCount: number }> => {
  const ids = Array.from(new Set([...candidateIds, ...Object.keys(ledgerMap)]))
  const occupancy: OccupancyMap = {}
  let occupied = 0
  for (const id of ids) {
    const snapshot = await transaction.get(doc(database, FIRESTORE_COLLECTIONS.sessions, id))
    // A session that is gone no longer occupies the table.
    if (!snapshot.exists()) continue
    const stored = snapshot.data() as StoredSessionShape
    // Completed / cancelled sessions free their seats (existing lifecycle).
    if (stored.status === CLOSED_SESSION_STATUS) continue
    const guests = asCount(stored.guestCount ?? ledgerMap[id])
    occupancy[id] = guests
    occupied += guests
  }
  return { occupancy, occupied, activeCount: Object.keys(occupancy).length }
}

/**
 * Atomically reserve the seats of a new session and persist the session itself.
 *
 * Throws `SessionCapacityExceededError` when the table does not have enough
 * remaining capacity — in that case NOTHING is written, so an invalid session
 * can never reach the database.
 */
export const reserveSession = async (session: Session): Promise<SessionReservation> => {
  if (!isFirebaseConfigured()) return { authoritative: false }
  const database = getFirestoreNow()
  if (!database) return { authoritative: false }

  const guests = asCount(session.guestCount)
  const tableRef = doc(database, FIRESTORE_COLLECTIONS.tables, session.tableId)
  const ledgerRef = doc(database, FIRESTORE_COLLECTIONS.counters, tableCapacityLedgerId(session.tableId))
  const sessionRef = doc(database, FIRESTORE_COLLECTIONS.sessions, session.id)

  let candidateIds: string[]
  try {
    candidateIds = await discoverOccupyingSessionIds(session.tableId, database)
  } catch (err) {
    // Without the backend the transaction below cannot run either; the caller
    // keeps the app's existing offline-first behaviour.
    if (isOfflineFirestoreError(err)) return { authoritative: false }
    throw err
  }

  try {
    await runTransaction(database, async (transaction) => {
      const tableSnap = await transaction.get(tableRef)
      if (!tableSnap.exists()) {
        throw new Error('This table no longer exists — refresh the table list and try again.')
      }
      const capacity = asCount(tableSnap.data().capacity)

      // Read AND write the ledger inside this transaction: it is the shared
      // contention point that serialises two waiters creating sessions for the
      // same table (the loser retries and re-reads everything below).
      const ledgerSnap = await transaction.get(ledgerRef)
      const ledger = (ledgerSnap.exists() ? ledgerSnap.data() : undefined) as CapacityLedger | undefined

      const { occupancy, occupied, activeCount } = await verifyOccupancy(
        transaction,
        database,
        candidateIds,
        ledgerOccupancy(ledger),
      )

      // A capacity of 0 means the legacy document has no usable capacity: the
      // seats cannot be measured, so the existing (uncapped) behaviour is kept
      // rather than hard-blocking a live service.
      if (capacity > 0 && occupied + guests > capacity) {
        throw new SessionCapacityExceededError(capacity, occupied, guests)
      }

      transaction.set(ledgerRef, {
        tableId: session.tableId,
        capacity,
        occupiedGuests: occupied + guests,
        activeSessions: activeCount + 1,
        // Written as a whole map (no merge) so released sessions disappear.
        occupancy: { ...occupancy, [session.id]: guests },
        updatedAt: Date.now(),
      })
      transaction.set(sessionRef, session as unknown as DocumentData)
      // Keeps the physical table marked as in use for every client — the same
      // fields the local state / sync push writes.
      transaction.set(
        tableRef,
        { status: 'occupied', currentSessions: activeCount + 1, updatedAt: Date.now() },
        { merge: true },
      )
    })
    return { authoritative: true }
  } catch (err) {
    if (err instanceof SessionCapacityExceededError) throw err
    if (isOfflineFirestoreError(err)) return { authoritative: false }
    throw err
  }
}

/**
 * Refresh the derived capacity ledger of a table after one of its sessions
 * stopped occupying it (completed / cancelled).
 *
 * The summary is recomputed from the authoritative session documents while
 * ignoring the released session, so it always describes the post-release truth
 * even if the closed status of that session has not reached Firestore yet. It is
 * idempotent and self-healing — it never adds, removes or edits a session.
 */
export const refreshTableCapacityLedger = async (
  tableId: string,
  releasedSessionId: string,
): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const database = getFirestoreNow()
  if (!database) return

  const tableRef = doc(database, FIRESTORE_COLLECTIONS.tables, tableId)
  const ledgerRef = doc(database, FIRESTORE_COLLECTIONS.counters, tableCapacityLedgerId(tableId))

  let candidateIds: string[] = []
  try {
    candidateIds = await discoverOccupyingSessionIds(tableId, database)
  } catch {
    // Offline / unreadable: `reserveSession()` still recomputes the occupancy
    // from the session documents, so this summary may simply stay stale.
    return
  }

  try {
    await runTransaction(database, async (transaction) => {
      // The same document `reserveSession` reads and writes, so a release can
      // never interleave with a concurrent reservation on this table.
      const ledgerSnap = await transaction.get(ledgerRef)
      const tableSnap = await transaction.get(tableRef)
      const capacity = asCount(tableSnap.data()?.capacity)
      const ledger = (ledgerSnap.exists() ? ledgerSnap.data() : undefined) as CapacityLedger | undefined
      const ledgerMap = { ...ledgerOccupancy(ledger) }
      // The released session never occupies the table again — even when its
      // 'closed' status has not reached Firestore yet.
      delete ledgerMap[releasedSessionId]
      const { occupancy, occupied, activeCount } = await verifyOccupancy(
        transaction,
        database,
        candidateIds.filter((id) => id !== releasedSessionId),
        ledgerMap,
      )
      transaction.set(ledgerRef, {
        tableId,
        capacity,
        occupiedGuests: occupied,
        activeSessions: activeCount,
        occupancy,
        updatedAt: Date.now(),
      })
    })
  } catch {
    // Best effort: the ledger is a derived summary and the next reservation
    // recomputes the real occupancy from the session documents.
  }
}
