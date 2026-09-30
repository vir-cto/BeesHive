/**
 * Firestore atomic token counter — one document per (series, restaurant day):
 *   counters/tokens_{series}_{YYYY-MM-DD}  →  { value: number }
 *
 * Uses a Firestore transaction so two waiters on two different phones can never
 * receive the same token. Dine-in and parcel run on SEPARATE series, matching the
 * mock-mode numbering (and the `P-###` parcel labels).
 *
 * The document id is deliberately a flat `counters/*` doc: the previous
 * `counters/tokens/{date}` sub-collection path was not reachable by the
 * deployed security rules, so every token mint failed in Firebase mode.
 */
import { runTransaction, doc, getDoc } from 'firebase/firestore'
import { getFirestoreNow } from '../../firebase'
import { isFirebaseConfigured } from './config'

export type TokenSeries = 'dine_in' | 'parcel'

/** Stable Firestore doc id for a series/day pair (also used by the config checker). */
export const tokenCounterId = (series: TokenSeries, dateKey: string): string =>
  `tokens_${series}_${dateKey}`

const counterRef = (series: TokenSeries, dateKey: string) => {
  if (!isFirebaseConfigured()) return null
  const database = getFirestoreNow()
  if (!database) return null
  return doc(database, 'counters', tokenCounterId(series, dateKey))
}

/** Atomic next token for the restaurant day. Throws when Firestore is unavailable. */
export const nextToken = async (dateKey: string, series: TokenSeries = 'dine_in'): Promise<number> => {
  const database = getFirestoreNow()
  const ref = counterRef(series, dateKey)
  if (!database || !ref) throw new Error('Firestore is not configured')
  let assigned = 0
  await runTransaction(database, async (transaction) => {
    const snap = await transaction.get(ref)
    const current = (snap.exists() && Number(snap.data().value)) || 0
    assigned = current + 1
    transaction.set(ref, { value: assigned, series, date: dateKey, updatedAt: Date.now() })
  })
  return assigned
}

/** Read the current token value for a day without incrementing. */
export const currentToken = async (dateKey: string, series: TokenSeries = 'dine_in'): Promise<number> => {
  const ref = counterRef(series, dateKey)
  if (!ref) return 0
  const snap = await getDoc(ref)
  return snap.exists() ? Number(snap.data().value) : 0
}
