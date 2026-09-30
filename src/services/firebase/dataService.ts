/**
 * Firestore data service — persistence for RestaurantContext + AuthContext.
 *
 * Every collection stores one document per entity (doc id = entity id).
 * Writes are BATCHED and CHUNKED (Firestore allows max 500 operations per
 * batch — a busy restaurant day can easily exceed that, so an unchunked batch
 * would start throwing mid-service). The context layer diffs its state and
 * sends only the entities that actually changed, so no full-collection read is
 * needed before a write.
 *
 * All functions are safe no-ops when Firebase is not configured (mock mode).
 */
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  deleteDoc,
  onSnapshot,
  getDoc,
  setDoc,
  type DocumentData,
  type WriteBatch,
} from 'firebase/firestore'
import { getFirestoreNow } from '../../firebase'
import { isFirebaseConfigured } from './config'

const BATCH_LIMIT = 500

const db = () => getFirestoreNow()

const dangerousFields = ['__proto__', 'prototype', 'constructor']

export interface StoredEntity {
  id: string
}

export interface SaveOptions {
  /** Batch-delete remote docs missing from `items`. Firestore rules only let
   * admins delete most collections, so waiter/supervisor clients must pass
   * false (upsert only). */
  allowDeletes?: boolean
}

/**
 * Canonical Firestore collection names — keep in sync with firestore.rules.
 * Notes:
 *  • dining sessions live in "diningSessions" (that is the rules name);
 *  • menu categories live in "menuCategories" (restaurant-scoped);
 *  • settings is a single "settings/restaurant" document;
 *  • users is the staff/credential directory (passwords are never stored
 *    plaintext — see services/firebase/userService.ts).
 */
export const FIRESTORE_COLLECTIONS = {
  orders: 'orders',
  sessions: 'diningSessions',
  tables: 'tables',
  menu: 'menu',
  categories: 'menuCategories',
  bills: 'bills',
  paymentRecords: 'paymentRecords',
  notifications: 'notifications',
  inventory: 'inventory',
  stockHistory: 'stockHistory',
  inventoryUsage: 'inventoryUsage',
  purchaseRequests: 'purchaseRequests',
  recipes: 'recipes',
  activityLog: 'activityLog',
  users: 'users',
  settings: 'settings',
  printJobs: 'printJobs',
  counters: 'counters',
  analytics: 'analytics',
} as const

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS]

/**
 * Recursively remove everything Firestore rejects in a document payload:
 *   • `undefined` properties (any depth) — "Unsupported field value: undefined"
 *   • `undefined` entries inside arrays (Firestore cannot store a hole)
 *   • functions / symbols (unsupported value types)
 *   • prototype-pollution keys (`__proto__`, `prototype`, `constructor`)
 * BigInt values are normalised to Number because Firestore has no BigInt type.
 * Dates and plain primitives are passed through untouched.
 */
/**
 * Firestore SDK value objects (Timestamp, FieldValue sentinels such as
 * serverTimestamp()/increment()/arrayUnion(), DocumentReference, GeoPoint,
 * Bytes) are class instances. Rebuilding them as plain objects would silently
 * corrupt the field — a Timestamp would be stored as `{seconds, nanoseconds}`
 * — so only genuine plain objects are walked; every other object passes
 * through untouched.
 */
const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const strip = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(strip)
  }
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value
  // Firestore sentinels / SDK classes / custom class instances — keep as-is
  // instead of flattening them into a plain object.
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (dangerousFields.includes(k) || v === undefined) continue
    if (typeof v === 'function' || typeof v === 'symbol') continue
    out[k] = typeof v === 'bigint' ? Number(v) : strip(v)
  }
  return out
}

/** A document payload is only writable when it is a plain object with a valid id. */
const writableEntity = (item: unknown): item is StoredEntity =>
  typeof item === 'object' && item !== null && typeof (item as StoredEntity).id === 'string' && (item as StoredEntity).id.length > 0

/** Commits write operations in Firestore-sized chunks (max 500 ops per batch). */
const commitInChunks = async (
  operations: { write: (batch: WriteBatch) => void }[],
): Promise<void> => {
  const database = db()
  if (!database) return
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const batch = writeBatch(database)
    operations.slice(i, i + BATCH_LIMIT).forEach((op) => op.write(batch))
    await batch.commit()
  }
}

/**
 * Write only the entities that changed and (optionally) delete ids that
 * disappeared. Returns the number of documents written.
 */
export const saveEntities = async <T extends StoredEntity>(
  name: string,
  upserts: T[],
  deletes: string[] = [],
): Promise<number> => {
  if (!isFirebaseConfigured()) return 0
  const database = db()
  if (!database) return 0
  if (upserts.length === 0 && deletes.length === 0) return 0

  const col = collection(database, name)
  // `doc(col, undefined)` throws before Firestore can sanitise anything, so drop
  // any entity without a usable id first — the payload itself is always passed
  // through `strip()` so no `undefined` ever reaches the SDK.
  const safeUpserts = upserts.filter(writableEntity)
  const safeDeletes = deletes.filter((id) => typeof id === 'string' && id.length > 0)
  const ops = [
    ...safeUpserts.map((item) => ({
      write: (batch: WriteBatch) => batch.set(doc(col, item.id), (strip(item) ?? {}) as DocumentData),
    })),
    ...safeDeletes.map((id) => ({
      write: (batch: WriteBatch) => batch.delete(doc(col, id)),
    })),
  ]

  try {
    await commitInChunks(ops)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (import.meta.env.DEV) console.error(`Firestore save failed on "${name}":`, message)
    throw err
  }
  return safeUpserts.length + safeDeletes.length
}

/**
 * Replace the full contents of a collection with `items`.
 * Kept for compatibility; the live app uses `saveEntities` with a local diff so
 * it never needs the read below.
 */
export const saveCollection = async <T extends StoredEntity>(
  name: string,
  items: T[],
  options: SaveOptions = {},
): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const database = db()
  if (!database) return
  const { allowDeletes = true } = options
  let deletes: string[] = []
  if (allowDeletes) {
    const existing = await getDocs(collection(database, name))
    const keep = new Set(items.map((i) => i.id))
    deletes = existing.docs.filter((d) => !keep.has(d.id)).map((d) => d.id)
  }
  await saveEntities(name, items, deletes)
}

export const loadCollection = async <T extends StoredEntity>(name: string): Promise<T[]> => {
  if (!isFirebaseConfigured()) return []
  const database = db()
  if (!database) return []
  const snap = await getDocs(collection(database, name))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T)
}

/**
 * Live subscription to a collection — fires immediately with the current remote
 * contents and again on every change from ANY device. Returns an unsubscribe
 * function (no-op when Firebase is not configured).
 */
export const watchCollection = <T extends StoredEntity>(
  name: string,
  onChange: (items: T[]) => void,
): (() => void) => {
  if (!isFirebaseConfigured()) return () => {}
  const database = db()
  if (!database) return () => {}
  return onSnapshot(
    collection(database, name),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T)),
    (err) => {
      if (import.meta.env.DEV) console.error(`Firestore watch failed on "${name}":`, err.message)
    },
  )
}

export const deleteEntity = async (name: string, id: string): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const database = db()
  if (!database) return
  await deleteDoc(doc(collection(database, name), id))
}

/** Single-document read/write (settings live in `settings/restaurant`). */
export const loadDoc = async <T>(name: string, id: string): Promise<T | null> => {
  if (!isFirebaseConfigured()) return null
  const database = db()
  if (!database) return null
  const snap = await getDoc(doc(database, name, id))
  return snap.exists() ? (snap.data() as T) : null
}

export const saveDoc = async (name: string, id: string, data: unknown, options: { merge?: boolean } = {}): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const database = db()
  if (!database) return
  try {
    const sanitized = strip(data)
    const payload = (sanitized && typeof sanitized === 'object' ? sanitized : {}) as DocumentData
    await setDoc(doc(database, name, id), payload, options)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (import.meta.env.DEV) console.error(`Firestore doc save failed on "${name}/${id}":`, message)
    throw err
  }
}
