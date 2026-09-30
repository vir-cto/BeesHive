/**
 * Staff / account directory service.
 *
 * Firestore `users/{uid}` is the account directory the app reads for staff
 * management, role routing and login. Rules for what is stored here:
 *
 *   • NO credential material — ever. Firebase Authentication is the only
 *     credential store: `users/{uid}` holds profile data (name, username,
 *     contact email, phone, role, photo URL), never a password, hash or salt.
 *   • Login identifiers (username / 10-digit phone / contact email) are
 *     reserved transactionally in `usernames/{…}`, `phones/{…}` and
 *     `emails/{…}` so uniqueness is enforced by the database, not by the UI.
 *   • `provisionAuthAccount` creates the Auth user through the Identity Toolkit
 *     REST API so the signed-in admin's session is NOT replaced (the browser
 *     SDK's `createUserWithEmailAndPassword` silently signs in as the new user,
 *     which used to log the admin out of their own app mid-shift).
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { getAuthNow, getFirestoreNow } from '../../firebase'
import { isFirebaseConfigured } from './config'
import { validatePassword } from '../../lib/password'
import { isValidAuthEmail, looksLikeEmail, normalizeUsername, internalEmailForUsername, isValidUsername } from '../../lib/username'

/**
 * Verified email of the nominated owner account — DEPLOYMENT-CONFIGURED.
 *
 * Firebase Auth proves the identity; this address is the ONLY account allowed to
 * claim the one-time Main Admin bootstrap on a brand-new project (see
 * `resolveProfile` in authService.ts and the matching guard in firestore.rules,
 * which reads the SAME value from the `config/bootstrap` Firestore document).
 * It is never trusted as a credential — the user must still sign in.
 *
 * The address is deliberately NOT hardcoded in source: it is per-deployment
 * configuration, supplied through the non-secret `VITE_MAIN_ADMIN_EMAIL` env
 * variable (see .env.example). An unset value simply disables the bootstrap
 * path — the Main Admin account in the directory keeps working regardless.
 */
export const DESIGNATED_MAIN_ADMIN_EMAIL = ((import.meta.env.VITE_MAIN_ADMIN_EMAIL ?? '') as string)
  .trim()
  .toLowerCase()

// NOTE: account creation lives in ONE place only — `createDirectoryAccount`
// below. It validates the password policy, provisions the Firebase Auth
// identity, reserves the username/phone/email mappings transactionally and
// writes `users/{uid}`. A second "create a staff account" helper existed here
// and has been removed: two creation paths meant two different uniqueness and
// credential rules (and one of them could leave a device-local id behind).

export type DirectoryRole = 'admin' | 'waiter' | 'supervisor'

/**
 * Ids minted on a single device before Firebase Auth provisioning completes
 * (`admin-001`, `staff-mu83gc2g`, `local_…`, `u_…`).
 *
 * The `users` collection is keyed by the Firebase Auth uid ONLY: a device-local
 * id must never become a Firestore document key, otherwise the collection ends
 * up with orphan/duplicate records that mirror a real Auth uid.
 */
export const isDeviceLocalUserId = (id: string): boolean =>
  /^(admin[-_]|staff[-_]|local_|u_)/.test(id)

export interface DirectoryUser {
  id: string
  name: string
  /** Normalized login username (globally unique via `usernames/{username}`). */
  username?: string
  /** The user's real contact email (globally unique via `emails/{email}`). */
  email: string
  /** Exactly 10 digits (globally unique via `phones/{phone}`). */
  phone: string
  /**
   * The internal Firebase Auth identity email (`<username>@beeshive.local`
   * at account creation; stays stable across username renames so a rename
   * never has to touch the credential store).
   */
  authEmail?: string
  role: DirectoryRole
  isMainAdmin: boolean
  active: boolean
  avatarUrl?: string
  createdAt: number
  updatedAt?: number
}

/** Directory fields that are safe to write to Firestore. */
const toDocument = (user: DirectoryUser): DocumentData => {
  const data: DocumentData = {
    uid: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role,
    isMainAdmin: user.isMainAdmin === true,
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: Date.now(),
  }
  if (user.username) data.username = user.username
  if (user.authEmail) data.authEmail = user.authEmail
  if (user.avatarUrl) data.avatarUrl = user.avatarUrl
  // No credential field is ever written: Firebase Authentication is the only
  // credential store, and `users/{uid}` holds profile data exclusively.
  return data
}

/**
 * Normalize an account object into a directory record before it is persisted.
 * A legacy plaintext password (local/mock accounts) can never survive this step:
 * only the listed profile fields are carried over.
 */
export const toDirectoryEntry = async (
  user: DirectoryUser,
): Promise<DirectoryUser> => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  phone: user.phone,
  authEmail: user.authEmail,
  role: user.role,
  isMainAdmin: user.isMainAdmin,
  active: user.active,
  avatarUrl: user.avatarUrl,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

export const loadUsersDirectory = async (): Promise<DirectoryUser[]> => {
  if (!isFirebaseConfigured()) return []
  const dbInstance = getFirestoreNow()
  if (!dbInstance) return []
  const snap = await getDocs(collection(dbInstance, 'users'))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DirectoryUser)
}

/** Live view of the staff directory (role/activation changes from any device). */
export const watchUsersDirectory = (
  onChange: (users: DirectoryUser[]) => void,
): (() => void) => {
  if (!isFirebaseConfigured()) return () => {}
  const dbInstance = getFirestoreNow()
  if (!dbInstance) return () => {}
  return onSnapshot(
    collection(dbInstance, 'users'),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DirectoryUser)),
    (err) => { if (import.meta.env.DEV) console.error('Firestore users watch failed:', err.message) },
  )
}

/** Upsert directory records; deletes are only ever sent by admins. */
export const saveUsersDirectory = async (
  users: DirectoryUser[],
  deletes: string[] = [],
): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const dbInstance = getFirestoreNow()
  if (!dbInstance) throw new Error('Firebase Firestore is unavailable.')
  // Firestore keys are Firebase Auth uids ONLY — device-local ids are refused
  // here as a last line of defence (see `isDeviceLocalUserId`).
  const safeUsers = users.filter((u) => u.id && !isDeviceLocalUserId(u.id))
  const safeDeletes = deletes.filter((id) => id && !isDeviceLocalUserId(id))
  if (safeUsers.length === 0 && safeDeletes.length === 0) return
  try {
    for (let i = 0; i < safeUsers.length; i += 400) {
      const batch = writeBatch(dbInstance)
      safeUsers.slice(i, i + 400).forEach((u) => batch.set(doc(dbInstance, 'users', u.id), toDocument(u)))
      await batch.commit()
    }
    for (let i = 0; i < safeDeletes.length; i += 400) {
      const batch = writeBatch(dbInstance)
      safeDeletes.slice(i, i + 400).forEach((id) => batch.delete(doc(dbInstance, 'users', id)))
      await batch.commit()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (import.meta.env.DEV) console.error('Firestore users save failed:', message)
    throw err
  }
}

/**
 * One-off cleanup (issue #3): delete `users/*` documents whose id is a
 * device-local mock id (`staff-mu83gc2g`, `admin-001`, `local_…`, `u_…`).
 * Returns the ids that were removed. Best-effort — a missing/denied delete
 * never blocks the app.
 */
export const purgeOrphanDirectoryEntries = async (ids: string[]): Promise<string[]> => {
  const orphans = ids.filter((id) => id && isDeviceLocalUserId(id))
  if (!isFirebaseConfigured() || orphans.length === 0) return []
  const dbInstance = getFirestoreNow()
  if (!dbInstance) return []
  const removed: string[] = []
  for (const id of orphans) {
    try {
      await deleteDoc(doc(dbInstance, 'users', id))
      removed.push(id)
    } catch {
      // Best-effort cleanup: an already-deleted or denied document is ignored.
    }
  }
  return removed
}

export const deleteUserDirectoryEntry = async (id: string): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const dbInstance = getFirestoreNow()
  if (!dbInstance) throw new Error('Firebase Firestore is unavailable.')

  // Read the profile first so every login-identifier mapping (username,
  // 10-digit phone, contact email) is released together with the account —
  // no stale identifier may keep resolving to a deleted uid.
  const snap = await getDoc(doc(dbInstance, 'users', id))
  if (snap.exists()) {
    const entry = snap.data() as DirectoryUser
    const email = entry.email ?? ''
    const username = entry.username ?? extractLegacyUsername(email)
    if (username) await releaseUsername(username).catch(() => {})
    if (isValidPhone(entry.phone ?? '')) await releasePhone(entry.phone!).catch(() => {})
    if (email && !email.endsWith('@beeshive.local')) await releaseEmail(email).catch(() => {})
  }

  // Delete the Firestore profile document.
  await deleteDoc(doc(dbInstance, 'users', id))

  // ALSO delete the Firebase Authentication account so the credentials are
  // permanently removed. Without this, a deleted user can still sign in with
  // their old password. The Auth delete is best-effort: if it fails (e.g.
  // network issue, disabled Auth API), the Firestore record is still gone so
  // the user cannot authenticate through the app (rules require a users/{uid}
  // profile for most operations), but we attempt the Auth deletion for completeness.
    try {
    const auth = getAuthNow()
    if (auth) {
      const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
      if (apiKey && id) {
        try {
          // Look up the Auth user to confirm it exists (the response itself is
          // not needed — the delete endpoint handles unknown ids the same way).
          await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/accounts:lookup?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ localId: id }),
            },
          ).then((r) => r.json())
          // Delete via Identity Toolkit (requires the caller to be signed in
          // with recent credentials). Best-effort: if it fails, the Firestore
          // deletion above already removed the profile and mappings.
          await fetch(
            `https://identitytoolkit.googleapis.com/v1/projects/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/accounts:delete?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ localId: id }),
            },
          ).catch(() => {
            if (import.meta.env.DEV) console.warn(`Failed to delete Auth account ${id} (best-effort)`)
          })
        } catch {
          if (import.meta.env.DEV) console.warn(`Auth deletion request failed for ${id}`)
        }
      }
    }
  } catch {
    // Best-effort: if Auth deletion fails entirely, the Firestore cleanup above
    // still removed the profile and identifier mappings.
    if (import.meta.env.DEV) console.warn('Auth account deletion failed (best-effort)')
  }
}

/** Username of a legacy document whose email was the internal identity email. */
const extractLegacyUsername = (email: string): string => {
  const raw = (email ?? '').trim()
  if (!raw.endsWith('@beeshive.local')) return ''
  const local = raw.slice(0, -'@beeshive.local'.length)
  // Suffix-minted identities (username.abc123@) map back to the base username.
  const base = local.includes('.') ? local.split('.')[0] : local
  return normalizeUsername(base)
}

/** Marks the one-time "first account = Main Admin" bootstrap as claimed. */
export const markBootstrapClaimed = async (uid: string): Promise<void> => {
  const dbInstance = getFirestoreNow()
  if (!dbInstance) return
  try {
    await setDoc(
      doc(dbInstance, 'counters', 'bootstrap'),
      { claimedBy: uid, claimedAt: serverTimestamp() },
      { merge: true },
    )
  } catch {
    /* bootstrap marker is best-effort */
  }
}

/** One-time recovery for the nominated owner account. */
export const ensureDesignatedMainAdmin = async (uid: string, email: string): Promise<void> => {
  if (email.trim().toLowerCase() !== DESIGNATED_MAIN_ADMIN_EMAIL) return
  const dbInstance = getFirestoreNow()
  if (!dbInstance) return
  const recoveryRef = doc(dbInstance, 'counters', 'mainAdminRecovery')
  const recovery = await getDoc(recoveryRef)
  if (recovery.exists() && recovery.data().completed === true && recovery.data().uid === uid) return
  const snapshot = await getDocs(collection(dbInstance, 'users'))
  const designated = snapshot.docs.find((entry) => entry.id === uid)
  if (!designated) return
  const batch = writeBatch(dbInstance)
  snapshot.docs.forEach((entry) => {
    const data = entry.data()
    if (entry.id === uid) {
      batch.set(doc(dbInstance, 'users', entry.id), { ...data, role: 'admin', active: true, isMainAdmin: true, updatedAt: Date.now() })
    } else if (data.role === 'admin' && data.isMainAdmin === true) {
      batch.set(doc(dbInstance, 'users', entry.id), { isMainAdmin: false, updatedAt: Date.now() }, { merge: true })
    }
  })
  await batch.commit()
  await setDoc(recoveryRef, { completed: true, uid, completedAt: serverTimestamp() }, { merge: true })
}

export interface ProvisionResult {
  uid: string | null
  error?: string
  /** true when the Auth account already existed (its password is untouched). */
  alreadyExists?: boolean
}

/**
 * Create the Firebase Auth account through the Identity Toolkit REST API.
 * Runs out-of-band, so the currently signed-in admin keeps their own session.
 */
export const provisionAuthAccount = async (
  email: string,
  password: string,
): Promise<ProvisionResult> => {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  if (!isFirebaseConfigured() || !apiKey) return { uid: null, error: 'Firebase is not configured.' }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      },
    )
    const body = (await res.json()) as { localId?: string; error?: { message?: string } }
    if (res.ok && body.localId) return { uid: body.localId }
    const code = body.error?.message ?? `HTTP ${res.status}`
    if (code === 'EMAIL_EXISTS') {
      const signIn = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: false }),
        },
      )
      const signInBody = (await signIn.json()) as { localId?: string; error?: { message?: string } }
      if (signIn.ok && signInBody.localId) {
        return { uid: signInBody.localId, alreadyExists: true }
      }
      return { uid: null, alreadyExists: true, error: signInBody.error?.message ?? code }
    }
    return { uid: null, error: code }
  } catch (err) {
    return { uid: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Set another user's Firebase Auth password (admin-only).
 *
 * The browser SDK can only change the *currently signed-in* user's password.
 * Changing a waiter/supervisor password requires the Admin SDK, exposed here
 * as a callable Cloud Function `adminSetPassword`.
 *
 * Deploy: functions/src/index.ts → adminSetPassword (see below).
 */
export const updateAuthUserPassword = async (uid: string, newPassword: string): Promise<void> => {
  if (!isFirebaseConfigured()) return

  const passwordCheck = validatePassword(newPassword)
  if (!passwordCheck.isValid) {
    throw new Error(`Password is not strong enough: ${passwordCheck.errors.join('; ')}.`)
  }
  if (!uid || isDeviceLocalUserId(uid)) {
    throw new Error('Cannot update password for an invalid account id.')
  }

  const { getAppNow } = await import('../../firebase')
  const app = getAppNow()
  if (!app) throw new Error('Firebase is not configured.')

  // Dynamic import so mock builds without functions package still load.
  const { getFunctions, httpsCallable } = await import('firebase/functions')
  const functions = getFunctions(app)
  const call = httpsCallable<{ uid: string; password: string }, { ok: boolean }>(
    functions,
    'adminSetPassword',
  )

  try {
    const result = await call({ uid, password: newPassword })
    if (!result.data?.ok) {
      throw new Error('Password could not be updated. Please try again.')
    }
  } catch (err) {
    const code = (err as { code?: string })?.code ?? ''
    const message = err instanceof Error ? err.message : String(err)
    if (code === 'functions/not-found' || /not found|NOT_FOUND/i.test(message)) {
      throw new Error(
        'Password update service is not deployed. Deploy the adminSetPassword Cloud Function, or ask the staff member to use “Forgot password”.',
      )
    }
    if (code === 'functions/permission-denied' || /permission/i.test(message)) {
      throw new Error('Only an administrator can change another account’s password.')
    }
    throw new Error(
      message && !/firebase|functions\//i.test(message)
        ? message
        : 'Password could not be updated. Please try again.',
    )
  }
}

/**
 * Provision the Auth account, reserve every login identifier and write the
 * Firestore directory record in one step.
 *
 * Flow (any failure cleans up what was created and rethrows the real error —
 * the caller must never close a create-form on a failed save):
 *  1. Validate the username, contact email and phone number.
 *  2. Reserve the username transactionally (prevents renaming races from
 *     minting a colliding Auth identity).
 *  3. Create the Firebase Auth account (internal identity email).
 *  4. Reserve phone + contact-email mappings (both carry the authEmail so the
 *     login screen can resolve them pre-auth).
 *  5. Write `users/{uid}` (profile only — never credentials).
 */
export const createDirectoryAccount = async (input: {
  name: string
  /** Login username (NOT the email) — globally unique, case-insensitive. */
  username: string
  /** Real contact email — globally unique, normalized lowercase. */
  email: string
  /** Exactly 10 digits — globally unique, usable as a login identifier. */
  phone: string
  password: string
  role: DirectoryRole
  isMainAdmin: boolean
  avatarUrl?: string
}): Promise<{ entry: DirectoryUser; authError?: string }> => {
  const dbInstance = getFirestoreNow()

  const normalizedUsername = normalizeUsername(input.username)
  if (!isValidUsername(normalizedUsername)) {
    throw new Error('Enter a valid username (3–32 characters: letters, numbers, dot, dash or underscore).')
  }
  // The password policy is enforced here as well as in the form UI: this is the
  // single creation path for every account, so a weaker password can never be
  // provisioned through a different screen.
  const passwordCheck = validatePassword(input.password ?? '')
  if (!passwordCheck.isValid) {
    throw new Error(`Password is not strong enough: ${passwordCheck.errors.join('; ')}.`)
  }
  const normalizedEmail = (input.email ?? '').trim().toLowerCase()
  if (!isValidContactEmailFormat(normalizedEmail)) {
    throw new Error('Enter a valid email address.')
  }
  const phone = normalizePhone(input.phone ?? '')
  if (!isValidPhone(phone)) {
    throw new Error('Phone number must be exactly 10 digits.')
  }

  // Step 1: provision the Firebase Auth account. The account's Auth identity
  // IS the real contact email (so Firebase password reset can deliver to the
  // operator's actual inbox), and the username/phone/email login-identifier
  // mappings resolve to it. If the contact email is claimed by a DIFFERENT
  // Auth account (provisioning reported EMAIL_EXISTS and the supplied password
  // does not sign into it), we NEVER overwrite or merge that account — this
  // account falls back to the internal, non-routable identity for its username
  // (with a unique suffix if even that is stale), keeping creation working.
  let identityEmail = normalizedEmail
  let provision = await provisionAuthAccount(identityEmail, input.password)

  if (!provision.uid && provision.alreadyExists && isFirebaseConfigured()) {
    // The contact email belongs to another Auth account (password mismatch).
    // Safe stop: fall back to the internal identity, never the other account.
    identityEmail = internalEmailForUsername(normalizedUsername)
    provision = await provisionAuthAccount(identityEmail, input.password)

    if (!provision.uid && provision.alreadyExists && isFirebaseConfigured()) {
      // The internal identity is claimed by a stale/other Auth account — a
      // unique suffix keeps the new account creatable.
      identityEmail = internalEmailForUsername(
        `${normalizedUsername}.${Math.random().toString(36).slice(2, 8)}`,
      )
      provision = await provisionAuthAccount(identityEmail, input.password)
    }
  }

  // If Auth provisioning failed and we're in Firebase mode, fail
  if (!provision.uid && isFirebaseConfigured()) {
    throw new Error(provision.error || 'Failed to create Firebase Auth user.')
  }

  const id = provision.uid!
  const undoStack: Array<() => Promise<unknown>> = []
  const tryUndo = async () => {
    for (const undo of undoStack.reverse()) {
      await undo().catch(() => {})
    }
    // Best-effort Auth cleanup — only for an account WE created in this call.
    if (provision.uid && !provision.alreadyExists) await deleteAuthUser(id)
  }

  try {
    // Step 2: reserve username + phone + email atomically (each carries the
    // internal authEmail so pre-auth login resolution works).
    //
    // The three reservations are INDEPENDENT transactions (each enforces its
    // own uniqueness), so they run concurrently instead of three serialized
    // network round-trips — the single largest avoidable latency in account
    // creation. Rollback stays all-or-nothing: every reservation that DID
    // succeed is released if ANY of them fails, and the Auth account we just
    // created is deleted (tryUndo). Transactional uniqueness is unchanged.
    const RELEASES = [
      () => releaseUsername(normalizedUsername),
      () => releasePhone(phone),
      () => releaseEmail(normalizedEmail),
    ] as const
    const FAILURE_MESSAGES = [
      'Username already exists.',
      'That phone number is already in use.',
      'That email address is already in use.',
    ] as const

    const outcomes = await Promise.allSettled([
      reserveUsername(normalizedUsername, id, identityEmail),
      reservePhone(phone, id, identityEmail),
      reserveEmail(normalizedEmail, id, identityEmail),
    ])

    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled' && outcome.value === true) {
        // Reservation succeeded — register its rollback.
        undoStack.push(RELEASES[index])
      }
    })

    const failedIndex = outcomes.findIndex(
      (outcome) => outcome.status === 'rejected' || (outcome.status === 'fulfilled' && !outcome.value),
    )
    if (failedIndex !== -1) {
      const failed = outcomes[failedIndex]
      if (failed.status === 'rejected') {
        throw failed.reason instanceof Error
          ? failed.reason
          : new Error('Account could not be reserved. Please try again.')
      }
      throw new Error(FAILURE_MESSAGES[failedIndex])
    }

    const entry = await toDirectoryEntry({
      id,
      name: input.name,
      username: normalizedUsername,
      email: normalizedEmail,
      phone,
      authEmail: identityEmail,
      role: input.role,
      isMainAdmin: input.isMainAdmin,
      active: true,
      avatarUrl: input.avatarUrl,
      createdAt: Date.now(),
    })

    // A Firestore profile is written ONLY under the exact Firebase Auth uid.
    if (dbInstance && provision.uid) {
      await setDoc(doc(dbInstance, 'users', provision.uid), toDocument(entry))
      if (entry.isMainAdmin) await markBootstrapClaimed(provision.uid)
    } else if (isFirebaseConfigured()) {
      throw new Error('Firebase Firestore is unavailable; the account was not saved.')
    }

    const authError = provision.error && !provision.alreadyExists ? provision.error : undefined
    return { entry, authError }
  } catch (err) {
    await tryUndo()
    throw err
  }
}

/**
 * Delete a Firebase Auth user by UID.
 * This is a best-effort operation - it may fail if the Admin SDK is not available.
 */
export const deleteAuthUser = async (uid: string): Promise<void> => {
  if (!isFirebaseConfigured()) return
  
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  if (!apiKey) return
  
  try {
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/users/${uid}?key=${apiKey}`,
      {
        method: 'DELETE',
      }
    )
  } catch {
    // Best effort - don't throw
  }
}

/**
 * Login-identifier reservation system for atomic uniqueness enforcement.
 *
 * Every login identifier (username, 10-digit phone, contact email) is reserved
 * transactionally so only one account can ever own it, even under concurrent
 * creation. Each mapping document is { uid, authEmail, createdAt }:
 *   • uid       — the Firebase Auth account the identifier belongs to;
 *   • authEmail — the internal Firebase Auth email, so the login screen can
 *                 resolve an identifier BEFORE any user is signed in.
 * A rename releases the old mapping and creates the new one; no mapping is
 * ever updated in place, so stale identifiers cannot survive a change.
 */
export const USERNAME_RESERVATION_COLLECTION = 'usernames'
export const PHONE_RESERVATION_COLLECTION = 'phones'
export const EMAIL_RESERVATION_COLLECTION = 'emails'

export interface IdentifierReservation {
  uid: string
  authEmail: string
  createdAt: number
}

/** Exactly-10-digit phone validation — no +91, no spaces, digits only. */
export const isValidPhone = (raw: string): boolean => /^\d{10}$/.test((raw ?? '').trim())

/** Phone as stored: trimmed digits; +91 / spaces are rejected, never stripped. */
export const normalizePhone = (raw: string): string => (raw ?? '').trim()

/** Basic contact-email format validation. */
export const isValidContactEmailFormat = (raw: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw ?? '').trim())

const reserveIdentifier = async (
  collectionName: string,
  docId: string,
  uid: string,
  authEmail: string,
): Promise<boolean> => {
  if (!isFirebaseConfigured()) return true // Mock mode: skip reservation

  const db = getFirestoreNow()
  if (!db) return true

  const ref = doc(db, collectionName, docId)

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (snap.exists()) {
        throw new Error('Identifier already exists.')
      }
      transaction.set(ref, {
        uid,
        // Never persist a malformed identity (empty local part) into a mapping:
        // the login screen would otherwise try to authenticate against it.
        authEmail: isValidAuthEmail(authEmail) ? authEmail.trim() : '',
        createdAt: Date.now(),
      })
    })
    return true
  } catch (err) {
    if (err instanceof Error && err.message === 'Identifier already exists.') {
      return false
    }
    throw err
  }
}

const releaseIdentifier = async (collectionName: string, docId: string): Promise<boolean> => {
  if (!isFirebaseConfigured()) return true

  const db = getFirestoreNow()
  if (!db) return true

  try {
    await deleteDoc(doc(db, collectionName, docId))
    return true
  } catch {
    return false
  }
}

const isIdentifierAvailable = async (collectionName: string, docId: string): Promise<boolean> => {
  if (!isFirebaseConfigured()) return true

  const db = getFirestoreNow()
  if (!db) return true

  const snap = await getDoc(doc(db, collectionName, docId))
  return !snap.exists()
}

/** Release a mapping ONLY when it still belongs to `uid` (never another account's). */
const releaseIdentifierIfOwned = async (
  collectionName: string,
  docId: string,
  uid: string,
): Promise<boolean> => {
  if (!isFirebaseConfigured()) return true
  const db = getFirestoreNow()
  if (!db) return true
  const ref = doc(db, collectionName, docId)
  const FOREIGN = 'Identifier belongs to another account.'
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) return
      const owner = (snap.data() as Partial<IdentifierReservation>).uid
      if (owner !== uid) throw new Error(FOREIGN)
      transaction.delete(ref)
    })
    return true
  } catch (err) {
    if (err instanceof Error && err.message === FOREIGN) return false
    throw err
  }
}

/**
 * Atomically reserve a username. Returns true if the reservation was created.
 * Returns false if the username is already taken.
 */
export const reserveUsername = async (normalizedUsername: string, uid: string, authEmail = ''): Promise<boolean> =>
  reserveIdentifier(USERNAME_RESERVATION_COLLECTION, normalizedUsername, uid, authEmail)

/** Release a username reservation (account deletion / rename). */
export const releaseUsername = async (normalizedUsername: string): Promise<boolean> =>
  releaseIdentifier(USERNAME_RESERVATION_COLLECTION, normalizedUsername)

/** Best-effort availability check for UI feedback; the transaction decides. */
export const isUsernameAvailable = async (normalizedUsername: string): Promise<boolean> =>
  isIdentifierAvailable(USERNAME_RESERVATION_COLLECTION, normalizedUsername)

/** Atomically reserve a 10-digit phone number. */
export const reservePhone = async (phone: string, uid: string, authEmail: string): Promise<boolean> => {
  if (!isValidPhone(phone)) throw new Error('Phone number must be exactly 10 digits.')
  return reserveIdentifier(PHONE_RESERVATION_COLLECTION, phone, uid, authEmail)
}

/** Release a phone reservation (account deletion / phone change). */
export const releasePhone = async (phone: string): Promise<boolean> =>
  releaseIdentifier(PHONE_RESERVATION_COLLECTION, phone)

export const isPhoneAvailable = async (phone: string): Promise<boolean> =>
  isIdentifierAvailable(PHONE_RESERVATION_COLLECTION, phone)

/** Atomically reserve a contact email (normalized lowercase). */
export const reserveEmail = async (email: string, uid: string, authEmail: string): Promise<boolean> => {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!isValidContactEmailFormat(normalized)) throw new Error('Enter a valid email address.')
  return reserveIdentifier(EMAIL_RESERVATION_COLLECTION, normalized, uid, authEmail)
}

/** Release an email reservation (account deletion / email change). */
export const releaseEmail = async (email: string): Promise<boolean> =>
  releaseIdentifier(EMAIL_RESERVATION_COLLECTION, (email ?? '').trim().toLowerCase())

export const isEmailAvailable = async (email: string): Promise<boolean> =>
  isIdentifierAvailable(EMAIL_RESERVATION_COLLECTION, (email ?? '').trim().toLowerCase())

/**
 * Resolve a login identifier (username | 10-digit phone | email) to the
 * internal Firebase Auth email of the owning account.
 *
 * Runs BEFORE sign-in, so it can only read the mapping documents — never the
 * `users/{uid}` profile (that collection is signed-in-only). The internal
 * authEmail is therefore stored on every mapping document.
 */
export const resolveAuthEmailForIdentifier = async (identifier: string): Promise<string | null> => {
  const raw = (identifier ?? '').trim()
  if (!raw || !isFirebaseConfigured()) return null

  const db = getFirestoreNow()
  if (!db) return null

  const fromMapping = async (collectionName: string, docId: string): Promise<string | null> => {
    const snap = await getDoc(doc(db!, collectionName, docId))
    if (!snap.exists()) return null
    const data = snap.data() as Partial<IdentifierReservation>
    // A malformed mapping value (empty local part, e.g. "@beeshive.local")
    // must be treated as "no mapping" so the deterministic fallback applies.
    return isValidAuthEmail(data.authEmail) ? (data.authEmail as string).trim() : null
  }

  // 10-digit phone → phones/{phone}
  if (isValidPhone(raw)) {
    return fromMapping(PHONE_RESERVATION_COLLECTION, raw)
  }
  // Contact email → emails/{lowercase}
  if (looksLikeEmail(raw)) {
    return fromMapping(EMAIL_RESERVATION_COLLECTION, raw.toLowerCase())
  }
  // Username → usernames/{normalized}; legacy accounts minted their Auth
  // identity email deterministically from the username.
  const normalized = normalizeUsername(raw)
  if (!normalized) return null
  const mapped = await fromMapping(USERNAME_RESERVATION_COLLECTION, normalized)
  return mapped ?? internalEmailForUsername(normalized)
}

/**
 * Post-sign-in self-heal — generic for EVERY account, never hardcoded.
 *
 * Firebase Authentication is the ground truth for the sign-in identity. After a
 * successful sign-in, align the stored `users/{uid}.authEmail` and every
 * login-identifier mapping owned by this account with the ACTUAL Firebase Auth
 * email of the session. This repairs accounts whose profile/mappings were
 * written with a malformed authEmail (e.g. "@beeshive.local", where the
 * username portion was lost by an earlier profile save) without:
 *   • touching credentials (passwords live ONLY in Firebase Authentication);
 *   • creating duplicate mappings, Auth accounts or profile documents;
 *   • ever modifying a mapping that belongs to a DIFFERENT uid.
 *
 * Mappings cannot be updated in place (firestore.rules: `allow update: false` —
 * renames are release + recreate), so a stale mapping is deleted and recreated
 * atomically-enough for this best-effort repair; any failure is swallowed so
 * sign-in never breaks because of it.
 */
export const repairAuthIdentity = async (uid: string, authEmail: string): Promise<void> => {
  if (!isFirebaseConfigured()) return
  const db = getFirestoreNow()
  const email = (authEmail ?? '').trim().toLowerCase()
  if (!db || !uid || !email) return

  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref).catch(() => null)
  if (!snap?.exists()) return
  const data = snap.data() as Partial<DirectoryUser>

  // users/{uid}: the stored authEmail must exactly match the real Auth identity.
  if (data.authEmail !== email) {
    await setDoc(ref, { authEmail: email, updatedAt: Date.now() }, { merge: true }).catch(() => {})
  }

  const candidates: Array<[string, string | undefined]> = [
    [USERNAME_RESERVATION_COLLECTION, data.username ? normalizeUsername(data.username) : undefined],
    [PHONE_RESERVATION_COLLECTION, data.phone && isValidPhone(data.phone) ? data.phone : undefined],
    [EMAIL_RESERVATION_COLLECTION, data.email ? data.email.trim().toLowerCase() : undefined],
  ]
  for (const [collectionName, docId] of candidates) {
    if (!docId) continue
    const mappingRef = doc(db, collectionName, docId)
    try {
      const mapping = await getDoc(mappingRef)
      if (!mapping.exists()) continue
      const mappingData = mapping.data() as Partial<IdentifierReservation>
      if (mappingData.uid !== uid) continue // never touch another account's mapping
      if (mappingData.authEmail === email) continue // already correct
      await deleteDoc(mappingRef)
      await setDoc(mappingRef, { uid, authEmail: email, createdAt: mappingData.createdAt ?? Date.now() })
    } catch {
      /* best-effort repair — sign-in must never depend on this */
    }
  }
}

/**
 * Update an account's profile + login identifiers in one persisted operation.
 *
 * Identifier changes (username / phone / email) reserve the new mapping
 * BEFORE the `users/{uid}` document is written, so a failed save never leaves
 * a stale or duplicate identifier. On any failure the old mappings are
 * restored best-effort and the real error is rethrown — a partial update
 * never reports success.
 */
export const updateDirectoryAccount = async (
  uid: string,
  changes: {
    name?: string
    username?: string
    email?: string
    phone?: string
    avatarUrl?: string
    active?: boolean
  },
): Promise<DirectoryUser> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.')
  const db = getFirestoreNow()
  if (!db) throw new Error('Firebase Firestore is unavailable.')

  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Account profile was not found in the directory.')

  const current = { id: snap.id, ...(snap.data() as object) } as DirectoryUser
  // ROOT-CAUSE GUARD: the internal identity must be derived from the username
  // that is IN EFFECT after this update (the incoming change wins), and a
  // malformed stored value (e.g. "@beeshive.local" — the username portion was
  // lost when a profile without a username was first saved) must be repaired,
  // never re-propagated into the profile or the identifier mappings.
  const effectiveUsername = normalizeUsername(changes.username ?? current.username ?? '')
  const storedAuthEmail = (current.authEmail ?? '').trim()
  const authEmail: string = isValidAuthEmail(storedAuthEmail)
    ? storedAuthEmail
    : internalEmailForUsername(effectiveUsername) || storedAuthEmail

  const next: DirectoryUser = {
    ...current,
    authEmail: authEmail || undefined,
    name: changes.name !== undefined ? changes.name.trim() : current.name,
    username: current.username,
    email: current.email,
    phone: current.phone,
    avatarUrl: current.avatarUrl,
  }

  /** Mappings reserved on the way — undone again if a later step fails. */
  const undoStack: Array<() => Promise<unknown>> = []
  const tryUndo = async () => {
    for (const undo of undoStack.reverse()) {
      await undo().catch(() => {})
    }
  }

  /**
   * Identifier change. The NEW mapping is reserved first, then the OLD mapping
   * is released — while the old one is still available for rollback. A rename is
   * therefore never "create only": once it succeeds the previous username /
   * phone / email can no longer resolve to this account (no stale login
   * identifiers are left behind in Firestore).
   */
  const changeIdentifier = async (options: {
    /** Mapping collection (usernames / phones / emails). */
    collection: string
    /** Already-normalized new identifier. */
    next: string
    /** Current identifier on the profile (may be empty/missing). */
    previous: string
    /** What the operator sees in error messages. */
    label: string
    /** Release the new mapping again (rollback). */
    releaseNew: () => Promise<unknown>
    /** Re-create the previous reservation (rollback). */
    reservePrevious: (previous: string) => Promise<unknown>
  }): Promise<string | null> => {
    const { collection, next, previous, label, releaseNew, reservePrevious } = options
    if (next === previous) return null

    const reserved = await reserveIdentifier(collection, next, uid, authEmail)
    if (!reserved) throw new Error(`That ${label} is already in use.`)
    undoStack.push(releaseNew)

    if (previous) {
      const released = await releaseIdentifierIfOwned(collection, previous, uid)
      if (!released) {
        throw new Error(
          `The previous ${label} (${previous}) belongs to another account and could not be released.`,
        )
      }
      undoStack.push(() => reservePrevious(previous))
    }
    return next
  }

  try {
    // ── Username rename (case-insensitive, globally unique) ────────────────
    if (changes.username !== undefined) {
      const normalized = normalizeUsername(changes.username)
      if (normalized !== (current.username ?? '')) {
        if (!isValidUsername(normalized)) {
          throw new Error('Enter a valid username (3–32 characters: letters, numbers, dot, dash or underscore).')
        }
        const applied = await changeIdentifier({
          collection: USERNAME_RESERVATION_COLLECTION,
          next: normalized,
          previous: current.username ?? '',
          label: 'username',
          releaseNew: () => releaseUsername(normalized),
          reservePrevious: (previous) => reserveUsername(previous, uid, authEmail),
        })
        if (applied) next.username = applied
      }
    }

    // ── Phone change (exactly 10 digits, unique) ───────────────────────────
    if (changes.phone !== undefined) {
      const phone = normalizePhone(changes.phone)
      if (phone !== (current.phone ?? '')) {
        if (!isValidPhone(phone)) throw new Error('Phone number must be exactly 10 digits.')
        const applied = await changeIdentifier({
          collection: PHONE_RESERVATION_COLLECTION,
          next: phone,
          previous: isValidPhone(current.phone ?? '') ? current.phone! : '',
          label: 'phone number',
          releaseNew: () => releasePhone(phone),
          reservePrevious: (previous) => reservePhone(previous, uid, authEmail),
        })
        if (applied) next.phone = applied
      }
    }

    // ── Contact email change (unique) ──────────────────────────────────────
    if (changes.email !== undefined) {
      const normalized = changes.email.trim().toLowerCase()
      if (normalized !== (current.email ?? '').toLowerCase()) {
        if (!isValidContactEmailFormat(normalized)) throw new Error('Enter a valid email address.')
        const applied = await changeIdentifier({
          collection: EMAIL_RESERVATION_COLLECTION,
          next: normalized,
          previous: (current.email ?? '').trim().toLowerCase(),
          label: 'email address',
          releaseNew: () => releaseEmail(normalized),
          reservePrevious: (previous) => reserveEmail(previous, uid, authEmail),
        })
        if (applied) next.email = applied
      }
    }

    if (changes.avatarUrl !== undefined) next.avatarUrl = changes.avatarUrl || undefined
    if (changes.active !== undefined) next.active = changes.active

    // ── Persist the profile document ───────────────────────────────────────
    const payload = toDocument(next)
    if (changes.avatarUrl !== undefined && !changes.avatarUrl) {
      // Explicit photo removal: delete the field instead of writing an empty value.
      payload.avatarUrl = deleteField()
    }
    await setDoc(ref, payload, { merge: true })
    return next
  } catch (err) {
    await tryUndo()
    throw err
  }
}