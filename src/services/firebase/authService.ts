// Firebase Authentication service (real implementation).
// Login/accounts/roles are owned by Firebase Auth + the `users` Firestore doc.
//
// Important: the SDK handles are resolved LAZILY. The previous version called
// `getAuthNow()!` at module scope, which is null whenever Firebase is not
// configured — any import in mock mode then crashed at load time.
import { signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged, sendPasswordResetEmail, updateEmail as fbUpdateEmail, type User } from 'firebase/auth'
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { getAuthNow, getFirestoreNow } from '../../firebase'
import { isFirebaseConfigured } from './config'
import {
  DESIGNATED_MAIN_ADMIN_EMAIL,
  ensureDesignatedMainAdmin,
  markBootstrapClaimed,
  repairAuthIdentity,
  resolveAuthEmailForIdentifier,
  isValidContactEmailFormat,
} from './userService'
import { looksLikeEmail, normalizeUsername, internalEmailForUsername, INTERNAL_ACCOUNT_DOMAIN } from '../../lib/username'

// Password recovery is owned by Firebase Authentication: the SDK emails a signed
// reset link. This application never mints, stores or verifies its own reset
// codes, and it never sees the new password.

/**
 * Ask Firebase Authentication to email a password-reset link.
 * Resolves for any well-formed address (Firebase does not disclose whether an
 * account exists); rejects with a mapped message for invalid address / quota /
 * network failures.
 */
export const sendPasswordReset = async (email: string): Promise<void> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.')
  try {
    await sendPasswordResetEmail(requireAuth(), email.trim().toLowerCase())
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code && String(code).startsWith('auth/')) throw new Error(mapAuthError(err))
    throw new Error('Password reset email could not be sent. Please try again.')
  }
}

export type Role = 'admin' | 'waiter' | 'supervisor'

export interface AuthUser {
  uid: string
  email: string
  displayName: string
  role: Role
  phone?: string
  avatarUrl?: string
  active: boolean
  /** Only the Main Admin can manage other admins / the whole directory. */
  isMainAdmin: boolean
  /** From the `users/{uid}` document (falls back to "now" when unavailable). */
  createdAt?: number
}

const requireAuth = () => {
  const auth = getAuthNow()
  if (!auth) throw new Error('Firebase is not configured. Use mock mode for development.')
  return auth
}

const toAuthUser = (data: {
  uid: string
  email?: string
  name?: string
  role?: string
  phone?: string
  avatarUrl?: string
  active?: boolean
  isMainAdmin?: boolean
  createdAt?: number
}): AuthUser => ({
  uid: data.uid,
  email: data.email ?? '',
  displayName: data.name ?? '',
  role: (data.role as Role) ?? 'waiter',
  phone: data.phone,
  avatarUrl: data.avatarUrl,
  active: data.active ?? true,
  isMainAdmin: data.isMainAdmin === true,
  createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
})

/**
 * Resolve the profile for a freshly signed-in Auth user:
 *  1. the `users/{uid}` document when it exists (normal path);
 *  2. otherwise adopt the matching email record from the directory — this heals
 *     accounts whose profile was created under a device-local id;
 *  3. otherwise self-provision a `waiter` profile — and ONLY for the nominated
 *     owner email, on a genuinely empty project, claim the one-time Main Admin
 *     bootstrap (see firestore.rules: `isDesignatedOwner` + `bootstrapUnclaimed`).
 */
const resolveProfile = async (
  uid: string,
  email: string,
  displayName?: string,
): Promise<AuthUser> => {
  const db = getFirestoreNow()
  if (!db) return toAuthUser({ uid, email, name: displayName })
  // One-time recovery for the nominated owner account. Best-effort: the account
  // must never fail to sign in because a recovery write was not permitted.
  await ensureDesignatedMainAdmin(uid, email).catch(() => {})

  // Best-effort self-heal: align the stored authEmail (users/{uid} + the
  // username/phone/email mappings this account owns) with the REAL Firebase
  // Auth identity that just authenticated. Repairs accounts whose stored
  // identity was malformed (e.g. "@beeshive.local") so username/phone login
  // resolves to the SAME Auth account as real-email login. Never touches
  // credentials and never depends on succeeding.
  await repairAuthIdentity(uid, email).catch(() => {})

  const own = await getDoc(doc(db, 'users', uid))
  if (own.exists()) {
    const d = own.data()
    return toAuthUser({
      uid,
      email: d.email ?? email,
      name: d.name ?? displayName ?? '',
      role: d.role,
      phone: d.phone,
      avatarUrl: d.avatarUrl,
      active: d.active,
      isMainAdmin: d.isMainAdmin === true,
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : undefined,
    })
  }

  const fallback: Record<string, unknown> = {
    name: displayName || email.split('@')[0] || 'User',
    email,
    role: 'waiter',
    isMainAdmin: false,
    active: true,
    createdAt: Date.now(),
  }

  try {
    const all = await getDocs(collection(db, 'users'))
    const match = all.docs.find(
      (d) => String(d.data().email ?? '').toLowerCase() === email.toLowerCase(),
    )
    let profile: Record<string, unknown>
    if (match) {
      profile = { ...match.data() }
    } else {
      // First sign-in of an account that has no `users/{uid}` document.
      //
      // Only the nominated OWNER email may claim the one-time Main Admin
      // bootstrap, and only while the collection is genuinely empty —
      // firestore.rules grants that single guarded path (see the
      // `counters/bootstrap` claim there). Every other account self-provisions
      // as a `waiter`, which is the only role the rules let a user give
      // themselves, so whoever signs in first on a fresh project can never
      // promote themselves to admin.
      const canBootstrap =
        all.empty && email.trim().toLowerCase() === DESIGNATED_MAIN_ADMIN_EMAIL
      profile = {
        ...fallback,
        role: canBootstrap ? 'admin' : 'waiter',
        isMainAdmin: canBootstrap,
      }
    }
    // `uid` is written explicitly (the document id IS the Auth uid) and always
    // wins over any legacy value copied from the directory record above.
    await setDoc(doc(db, 'users', uid), { ...profile, uid, updatedAt: Date.now() }, { merge: true })
    if (profile.isMainAdmin === true) await markBootstrapClaimed(uid)
    return toAuthUser({
      uid,
      email,
      name: String(profile.name ?? fallback.name),
      role: String(profile.role ?? 'waiter'),
      phone: profile.phone as string | undefined,
      avatarUrl: profile.avatarUrl as string | undefined,
      active: profile.active !== false,
      isMainAdmin: profile.isMainAdmin === true,
      createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : undefined,
    })
  } catch {
    // The Auth identity is valid even when the profile document could not be
    // read/written (offline, rules). Never dump the raw Firebase error: fall
    // back to a minimal waiter profile and let the caller decide.
    return toAuthUser({ uid, email, name: String(fallback.name) })
  }
}

/**
 * Maps Firebase Auth error codes to clean user-facing messages.
 * Only handles `auth/*` codes; the default fallback covers everything else.
 * No secrets, tokens, or raw Firebase responses are ever exposed.
 */
export const mapAuthError = (error: unknown): string => {
  const code = (error as { code?: string })?.code
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid username or password.'
    case 'auth/invalid-email':
      return 'Please enter a valid username.'
    case 'auth/missing-password':
      return 'Please enter your password.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact an administrator.'
    case 'auth/operation-not-allowed':
      return 'Username/password sign-in is not enabled for this project. Ask an administrator to enable it in Firebase Console → Authentication → Sign-in method.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.'
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'This app is not configured for the Firebase project. Ask an administrator to check the Firebase configuration.'
    case 'auth/quota-exceeded':
    case 'auth/internal-error':
      return 'Sign-in is temporarily unavailable. Please try again.'
    default:
      return 'Sign-in could not be completed. Please try again.'
  }
}

/** Sign in with email + password; returns the role stamped on the users doc. */
export const signInWithEmail = async (email: string, password: string): Promise<AuthUser> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured. Use mock mode for development.')
  try {
    const credential = await signInWithEmailAndPassword(requireAuth(), email, password)
    const profile = await resolveProfile(
      credential.user.uid,
      credential.user.email ?? email,
      credential.user.displayName ?? undefined,
    )
    if (!profile.active) throw new Error('This account is deactivated. Ask an admin to re-enable it.')
    return profile
  } catch (err) {
    // Only map Firebase Auth error codes; pass through application errors as-is.
    const code = (err as { code?: string })?.code
    if (code && String(code).startsWith('auth/')) {
      throw new Error(mapAuthError(err))
    }
    throw err
  }
}

/**
 * Sign in with username + password.
 *
 * The application authenticates with username + password. Firebase Authentication
 * is still the credential authority: every account owns a real Firebase Auth
 * identity whose email is an internal, non-routable address minted at account
 * creation (username@beeshive.local) and kept stable across renames.
 *
 * The typed username resolves through the `usernames/{username}` mapping to
 * the account's internal auth email — so a renamed username stops working and
 * the new one becomes valid immediately. Firebase Auth proves the identity;
 * the users/{uid} Firestore document supplies the application profile and role.
 */
export const signInWithUsername = async (username: string, password: string): Promise<AuthUser> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured. Use mock mode for development.')

  const normalized = normalizeUsername(username)
  const authEmail = await resolveAuthEmailForIdentifier(normalized)
  return signInWithEmail(authEmail ?? internalEmailForUsername(normalized), password)
}

/**
 * Sign in with ANY supported login identifier:
 *   • username         → usernames/{normalized} mapping;
 *   • contact email    → emails/{lowercase} mapping;
 *   • 10-digit phone   → phones/{phone} mapping.
 * The mapping carries the account's internal auth email; accounts with no
 * mapping (e.g. the nominated owner, whose Auth identity is a real mailbox)
 * fall back to a direct Auth sign-in with the typed email address.
 */
export const signInWithIdentifier = async (identifier: string, password: string): Promise<AuthUser> => {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured. Use mock mode for development.')

  const raw = (identifier ?? '').trim()
  if (!raw) throw new Error('Enter your username, email or phone number.')

  const authEmail = await resolveAuthEmailForIdentifier(raw)
  if (authEmail) return signInWithEmail(authEmail, password)

  // No mapping exists for this identifier. Legacy/nominated accounts whose
  // Auth identity IS the typed email can still sign in directly; everything
  // else must fail with an honest error (never a guessed account).
  if (looksLikeEmail(raw)) return signInWithEmail(raw.toLowerCase(), password)
  throw new Error('No account matches that username, email or phone number.')
}

export const signOut = async (): Promise<void> => {
  if (!isFirebaseConfigured()) return
  await fbSignOut(requireAuth())
}

export const getCurrentUser = (): AuthUser | null => {
  const auth = getAuthNow()
  const fbUser = auth?.currentUser
  if (!fbUser) return null
  return toAuthUser({ uid: fbUser.uid, email: fbUser.email ?? '', name: fbUser.displayName ?? '' })
}

export const onAuthStateChange = (callback: (user: AuthUser | null) => void): (() => void) => {
  if (!isFirebaseConfigured()) return () => {}
  const auth = getAuthNow()
  if (!auth) return () => {}
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      callback(null)
      return
    }
    try {
      callback(await resolveProfile(fbUser.uid, fbUser.email ?? '', fbUser.displayName ?? undefined))
    } catch {
      callback(toAuthUser({ uid: fbUser.uid, email: fbUser.email ?? '', name: fbUser.displayName ?? '' }))
    }
    // One-time identity migration (Issue 5): an account still carrying the
    // legacy internal `username@beeshive.local` Auth identity is re-pointed at
    // its real contact email right after a fresh sign-in, so Firebase's native
    // password reset (which emails the AUTH address) delivers to the operator's
    // actual inbox. Best-effort and never fatal: a fresh sign-in is recent, so
    // `updateEmail` is permitted; failures (contact email already claimed by
    // another Auth account, session too old) leave the account untouched and
    // are retried at the next sign-in. UID, username and phone login are
    // unchanged — the identifier mappings are re-pointed by repairAuthIdentity.
    void migrateInternalAuthIdentity(fbUser).catch(() => {})
  })
}

/**
 * Re-point a legacy internal Auth identity (`<username>@beeshive.local`) at the
 * account's real contact email. Same Firebase Auth user (same UID, no new
 * account), so username/phone/email login keep resolving to it — the
 * identifier mappings and `users/{uid}.authEmail` are re-pointed right after.
 *
 * Safety rules:
 *   • The contact email is read from the account's own `users/{uid}` profile.
 *   • If the contact email is already claimed by a DIFFERENT Auth account
 *     (`auth/email-already-in-use`), the migration is stopped WITHOUT
 *     overwriting or merging anything, and the conflict is recorded on the
 *     profile (`contactEmailConflict`) for the Main Admin to resolve.
 *   • Any other failure (e.g. `auth/requires-recent-login` on a restored
 *     session) is silently retried at the next fresh sign-in.
 */
const migrateInternalAuthIdentity = async (fbUser: User): Promise<void> => {
  const uid = fbUser.uid
  const current = (fbUser.email ?? '').trim().toLowerCase()
  if (!current.endsWith(`@${INTERNAL_ACCOUNT_DOMAIN}`)) return // already a real mailbox
  const db = getFirestoreNow()
  if (!db) return

  const snap = await getDoc(doc(db, 'users', uid)).catch(() => null)
  const contact = (((snap?.data() as { email?: string } | undefined)?.email ?? '') as string)
    .trim()
    .toLowerCase()
  if (!isValidContactEmailFormat(contact) || contact.endsWith(`@${INTERNAL_ACCOUNT_DOMAIN}`)) return

  try {
    await fbUpdateEmail(fbUser, contact)
    // The Auth email changed: align `users/{uid}.authEmail` and every
    // identifier mapping owned by THIS uid with the new Auth identity.
    await repairAuthIdentity(uid, contact)
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'auth/email-already-in-use' && snap?.exists()) {
      // Conflict: that contact email belongs to another Auth account. Never
      // overwrite or merge — stop this migration and surface the conflict.
      await setDoc(
        doc(db, 'users', uid),
        { contactEmailConflict: contact, updatedAt: Date.now() },
        { merge: true },
      ).catch(() => {})
    }
    // Anything else (requires-recent-login, network) — retried next sign-in.
  }
}

/** Read all users (roles) for admin staff management. */
export const listFirebaseUsers = async (): Promise<AuthUser[]> => {
  if (!isFirebaseConfigured()) return []
  const db = getFirestoreNow()
  if (!db) return []
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => toAuthUser({ uid: d.id, ...(d.data() as object) }))
}
