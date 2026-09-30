/**
 * Restaurant settings persistence — the ONLY module allowed to write
 * `settings/restaurant`.
 *
 * SAFETY CONTRACT (this is what makes the settings survive restarts):
 *
 *   • Hydration reads Firestore once at startup and treats the document as the
 *     source of truth. Defaults are used ONLY for fields that genuinely do not
 *     exist in the document — an existing document is never written back.
 *   • The document is created once, and only when it truly does not exist.
 *   • Saves write ONLY the fields the operator edited, with `merge: true`, so
 *     unrelated fields in Firestore are always preserved.
 *   • Nothing on a timer / in the sync engine / at startup ever writes the
 *     whole settings object. A complete local object always contains
 *     application defaults, and `setDoc(..., { merge: true })` happily
 *     overwrites existing Firestore fields with those defaults — that is
 *     exactly how production settings used to reset themselves after a
 *     restart, a logout/login or an overnight session.
 */
import { doc, getDoc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore'
import { getFirestoreNow } from '../../firebase'
import { FIRESTORE_COLLECTIONS } from './dataService'
import type { RestaurantSettings } from '../../context/RestaurantContext'

/** Document id used by the application (`settings/restaurant`). */
export const RESTAURANT_SETTINGS_DOC_ID = 'restaurant'

/**
 * Settings fields that must be stored as numbers. Older documents (and past UI
 * builds) could hold them as strings such as `"010"` / `"05"`, which the
 * Settings form then rendered verbatim. They are coerced on hydration so the
 * UI shows `10` and `5`; the coercion is local-only (it never triggers a write).
 */
export const NUMERIC_SETTINGS_FIELDS = [
  'taxRate',
  'serviceCharge',
  'parcelCharge',
  'prepWarningMinutes',
  'printRetryCount',
] as const

export interface SettingsSnapshot {
  /** true when the document exists in Firestore. */
  exists: boolean
  /** Document fields (null when it does not exist or Firestore is unavailable). */
  data: Record<string, unknown> | null
}

const settingsRef = (id: string) => {
  const database = getFirestoreNow()
  return database ? doc(database, FIRESTORE_COLLECTIONS.settings, id) : null
}

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * `[SETTINGS …]` diagnostics.
 *
 * Deliberately silent: the owner requires a clean browser console, and these
 * calls used to dump the whole settings document. The persistence behaviour is
 * unchanged — the helpers are kept (as no-ops) so every call site stays valid
 * and no settings value is ever written to the console. Real failures are
 * reported through the UI (`settingsHydration === 'error'` / a rejected
 * `updateSettings`) instead of being logged.
 */
export const logSettings = (
  _event: 'INIT' | 'HYDRATED' | 'WRITE' | 'REMOTE' | 'SKIP',
  _detail: string,
): void => {
  void _event
  void _detail
}

export const logSettingsError = (source: string, err: unknown): void => {
  void source
  void err
  void describeError
}


/** Coerce a stored value into a finite number (`"010"` → `10`, `"abc"` → fallback). */
export const toSettingsNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[^0-9.-]/g, '')
    if (!cleaned) return fallback
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback
  }
  return fallback
}

/**
 * Firestore values win; `defaults` only fill fields that are absent (or
 * explicitly `undefined`) in the remote document. Never the other way round.
 */
export const withSettingsDefaults = <T extends object>(
  defaults: T,
  remote: Partial<T> | Record<string, unknown> | null | undefined,
): T => {
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
  if (remote) {
    for (const [key, value] of Object.entries(remote)) {
      if (value === undefined) continue
      merged[key] = value
    }
  }
  return merged as T
}

/** Numeric fields coerced to numbers (display/state normalisation only). */
export const normalizeSettingsNumbers = <T extends object>(settings: T): T => {
  const normalized: Record<string, unknown> = { ...(settings as Record<string, unknown>) }
  for (const field of NUMERIC_SETTINGS_FIELDS) {
    if (field in normalized) normalized[field] = toSettingsNumber(normalized[field], 0)
  }
  return normalized as T
}

/** Drop `undefined` values so a merge patch never erases an existing field. */
export const buildSettingsPatch = (data: Partial<RestaurantSettings>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    patch[key] = (NUMERIC_SETTINGS_FIELDS as readonly string[]).includes(key)
      ? toSettingsNumber(value, 0)
      : value
  }
  return patch
}

/** Read the settings document once (no side effects). */
export const readRestaurantSettings = async (
  id: string = RESTAURANT_SETTINGS_DOC_ID,
): Promise<SettingsSnapshot> => {
  const ref = settingsRef(id)
  if (!ref) return { exists: false, data: null }
  const snap = await getDoc(ref)
  return { exists: snap.exists(), data: snap.exists() ? (snap.data() as Record<string, unknown>) : null }
}


/**
 * Create `settings/<id>` exactly once with the supplied defaults. Returns
 * `created: false` when the document already exists — an existing document is
 * NEVER touched by this function.
 */
export const createRestaurantSettingsIfMissing = async (
  defaults: Partial<RestaurantSettings>,
  id: string = RESTAURANT_SETTINGS_DOC_ID,
): Promise<{ created: boolean; data: Record<string, unknown> | null }> => {
  const ref = settingsRef(id)
  if (!ref) return { created: false, data: null }
  const current = await getDoc(ref)
  if (current.exists()) return { created: false, data: current.data() as Record<string, unknown> }
  const payload = buildSettingsPatch(defaults)
  if (Object.keys(payload).length === 0) return { created: false, data: null }
  await setDoc(ref, payload as DocumentData, { merge: true })
  return { created: true, data: payload }
}

/**
 * Write ONLY the edited fields into `settings/<id>` (`merge: true`). Every other
 * field that already exists in Firestore is left untouched. Rejects when
 * Firestore rejects, so callers never report success for a failed write.
 */
export const writeRestaurantSettingsPatch = async (
  patch: Record<string, unknown>,
  id: string = RESTAURANT_SETTINGS_DOC_ID,
): Promise<void> => {
  const ref = settingsRef(id)
  if (!ref) throw new Error('Firebase Firestore is unavailable.')
  const payload = buildSettingsPatch(patch as Partial<RestaurantSettings>)
  if (Object.keys(payload).length === 0) return
  await setDoc(ref, payload as DocumentData, { merge: true })
}

/**
 * Live, read-only subscription to the settings document. Keeps every open
 * session (admin, supervisor, waiter) in sync with the values that are actually
 * stored — without it a long-running session keeps stale values and can revert
 * another admin's change.
 */
export const watchRestaurantSettings = (
  onChange: (snapshot: SettingsSnapshot) => void,
  id: string = RESTAURANT_SETTINGS_DOC_ID,
): (() => void) => {
  const ref = settingsRef(id)
  if (!ref) return () => {}
  return onSnapshot(
    ref,
    (snap) =>
      onChange({
        exists: snap.exists(),
        data: snap.exists() ? (snap.data() as Record<string, unknown>) : null,
      }),
    (err) => logSettingsError('watchRestaurantSettings', err),
  )
}
