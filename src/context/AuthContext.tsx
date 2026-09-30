import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
} from 'firebase/auth'
import { dataMode } from '../services/firebase/config'
import { getAuthNow } from '../firebase'
import {
  mapAuthError,
  onAuthStateChange,
  signInWithIdentifier,
  signInWithUsername,
  sendPasswordReset as firebaseSendPasswordReset,
  signOut as firebaseSignOut,
  type AuthUser,
} from '../services/firebase/authService'
import {
  createDirectoryAccount,
  deleteUserDirectoryEntry,
  loadUsersDirectory,
  repairAuthIdentity,
  resolveAuthEmailForIdentifier,
  saveUsersDirectory,
  updateDirectoryAccount,
  watchUsersDirectory,
  isValidPhone,
  isValidContactEmailFormat,
  normalizePhone,
  type DirectoryUser,
} from '../services/firebase/userService'
import { uploadMemberImage } from '../services/firebase/storageService'
import { INTERNAL_ACCOUNT_DOMAIN, looksLikeEmail, normalizeUsername, validateUsername } from '../lib/username'
import { validatePassword } from '../lib/password'

export type UserRole = 'admin' | 'waiter' | 'supervisor'
export const MAX_ADMINS = 3
export const MAX_SUPERVISORS = 2

export interface UserAccount {
  id: string
  name: string
  username: string  // The login username (not email)
  email: string     // Internal Firebase Auth email (username@beeshive.local)
  phone: string
  role: UserRole
  isMainAdmin: boolean
  active: boolean
  avatarUrl?: string
  createdAt: number
  pending?: boolean
}

interface AuthContextType {
  user: UserAccount | null
  isAuthenticated: boolean
  isLoading: boolean
  firebaseMode: boolean
  isMainAdmin: boolean
  login: (identifier: string, password: string) => UserAccount | null
  loginWithFirebase: (identifier: string, password: string) => Promise<UserAccount | null>
  logout: () => void
  listAdmins: () => UserAccount[]
  createAdmin: (data: Omit<UserAccount, 'id' | 'createdAt' | 'role'> & { avatarFile?: File; password: string }) => Promise<UserAccount>
  // updateAdmin: (id: string, data: Partial<UserAccount>) => Promise<void>
  deleteAdmin: (id: string) => Promise<void>
  transferMainAdmin: (id: string) => Promise<void>
  updateMyCredentials: (data: {
    name?: string
    username?: string
    email?: string
    phone?: string
    password?: string
    currentPassword?: string
    avatarUrl?: string
  }) => Promise<void>
    createStaff: (data: Omit<UserAccount, 'id' | 'createdAt' | 'isMainAdmin'> & { password: string; avatarFile?: File | null }) => Promise<UserAccount>
  // updateStaff: (id: string, data: Partial<UserAccount>) => Promise<void>
  updateStaff: (id: string, data: Partial<UserAccount> & { password?: string }) => Promise<void>
  updateAdmin: (id: string, data: Partial<UserAccount> & { password?: string }) => Promise<void>
  deleteStaff: (id: string) => Promise<void>
  listStaff: () => UserAccount[]
  users: UserAccount[]
  sendOtp: (email: string, delivery: 'email' | 'phone') => Promise<boolean>
  verifyOtp: (email: string, otp: string) => Promise<boolean>
  resetPassword: (email: string, password: string, otp?: string) => Promise<boolean>
  /** Firebase-native recovery: emails a signed password-reset link. */
  sendPasswordReset: (email: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | null>(null)
const firebaseMode = dataMode === 'firebase'

/**
 * Map an authenticated profile (Firebase Auth identity + the `users/{uid}`
 * Firestore document) onto the account shape the UI renders. No password is
 * ever carried: Firebase Authentication owns credentials.
 */
const fromAuthUser = (entry: AuthUser): UserAccount => ({
  id: entry.uid,
  name: entry.displayName,
  username: extractUsernameFromEmail(entry.email),
  email: entry.email,
  phone: entry.phone ?? '',
  role: entry.role,
  isMainAdmin: entry.isMainAdmin,
  active: entry.active,
  avatarUrl: entry.avatarUrl,
  createdAt: entry.createdAt ?? Date.now(),
})

/**
 * Extract username from internal email (username@beeshive.local -> username)
 */
const extractUsernameFromEmail = (email: string): string => {
  if (!email) return ''
  const parts = email.split('@')
  return parts[0]?.toLowerCase() || ''
}

/** A raw SDK message must never reach the login screen. */
const looksLikeRawSdkError = (message: string): boolean =>
  /firebase|firestore|identitytoolkit|api[-_ ]?key|AIza|Bearer|https?:\/\//i.test(message)

/**
 * Turn any sign-in failure into a clean, user-facing message.
 * Firebase Auth codes are mapped by authService; Firestore/transport failures
 * are described without echoing a raw Firebase response, token or credential.
 */
const describeSignInFailure = (err: unknown): string => {
  const code = String((err as { code?: string })?.code ?? '')
  if (code.startsWith('auth/')) return mapAuthError(err)
  if (code === 'permission-denied')
    return 'Your account profile could not be read. Ask an administrator to check your access.'
  if (code === 'unavailable' || code === 'deadline-exceeded')
    return 'Network error. Please check your connection and try again.'
  const message = err instanceof Error ? err.message : ''
  return message && !looksLikeRawSdkError(message)
    ? message
    : 'Sign-in could not be completed. Please try again.'
}

const toDirectory = (account: UserAccount): DirectoryUser => ({
  id: account.id,
  name: account.name,
  username: account.username,
  email: account.email,
  phone: account.phone,
  role: account.role,
  isMainAdmin: account.isMainAdmin,
  active: account.active,
  avatarUrl: account.avatarUrl,
  createdAt: account.createdAt,
})

export function fromDirectory(entry: DirectoryUser): UserAccount {
  const email = entry.email || ''
  return {
    id: entry.id,
    name: entry.name ?? '',
    // New documents carry `username` explicitly; legacy documents minted the
    // directory email from the username (username@beeshive.local).
    username: entry.username ?? extractUsernameFromEmail(email),
    email,
    phone: entry.phone ?? '',
    role: entry.role,
    isMainAdmin: entry.isMainAdmin === true,
    active: entry.active !== false,
    avatarUrl: entry.avatarUrl,
    createdAt: entry.createdAt ?? Date.now(),
  }
}

export function mergeDirectory(local: UserAccount[], remote: DirectoryUser[]): UserAccount[] {
  const byId = new Map(local.map((account) => [account.id, account]))
  remote.forEach((entry) => {
    byId.set(entry.id, fromDirectory(entry))
  })
  return Array.from(byId.values())
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [user, setUser] = useState<UserAccount | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── Mock mode (DEVELOPMENT/TESTING ONLY) ──────────────────────────────────
  // Hydrates the local directory so the login screen works and restores the
  // session-scoped signed-in user. Production (firebase mode) never reads a
  // credential from the browser — see the Firebase effects below.
  useEffect(() => {
    if (firebaseMode) return
    let stored: UserAccount[] = []
    try {
      stored = JSON.parse(localStorage.getItem('beeshive_users') || '[]') as UserAccount[]
    } catch {
      stored = []
    }
    const accounts = Array.isArray(stored) ? stored.filter((entry) => entry && entry.id) : []
    setUsers(accounts)
    try {
      const session = JSON.parse(sessionStorage.getItem('beeshive_session') || 'null') as { id?: string } | null
      const sessionUser = session?.id ? accounts.find((entry) => entry.id === session.id) : null
      if (sessionUser) setUser(sessionUser)
    } catch {
      /* no session — stay signed out */
    }
    setIsLoading(false)
  }, [])

  // ── Firebase Auth identity (firebase mode) ────────────────────────────────
  // Firebase Authentication is the single source of identity; the application
  // role/profile is read from `users/{uid}` in Firestore by authService. No
  // account is ever invented locally and no local session is trusted.
  useEffect(() => {
    if (!firebaseMode) return
    const unsubscribe = onAuthStateChange((profile) => {
      setUser(profile ? fromAuthUser(profile) : null)
      setIsLoading(false)
    })
    return unsubscribe
  }, [])

  // ── Staff directory (firebase mode, authenticated operators only) ─────────
  // The directory mirrors `users/*` for the staff-management screens. It is
  // loaded only AFTER sign-in because firestore.rules deny that collection to
  // anonymous clients: a pre-login read would fail (and show a denied request
  // in the browser) instead of simply showing the login screen.
  const signedInUid = user?.id ?? null
  useEffect(() => {
    if (!firebaseMode) return
    if (!signedInUid) {
      setUsers([])
      return
    }
    let cancelled = false
    const apply = (remote: DirectoryUser[]) => {
      if (cancelled) return
      const accounts = remote.map(fromDirectory)
      setUsers((prev) => mergeDirectory(prev, remote))
      // Keep the signed-in account in step with a role/activation change made by
      // an admin on another device (the Auth identity itself is unchanged).
      setUser((current) => {
        if (!current) return current
        const fresh = accounts.find((account) => account.id === current.id)
        return fresh ? fresh : current
      })
    }
    void loadUsersDirectory().then(apply).catch(() => {
      // An unavailable/denied read is covered by the live listener below.
    })
    const unsubscribe = watchUsersDirectory(apply)
    return () => { cancelled = true; unsubscribe() }
  }, [signedInUid])

  /**
   * Production sign-in with username, email or 10-digit phone.
   *
   * The typed identifier is resolved through the login-identifier mappings
   * (`usernames/` | `emails/` | `phones/`) to the account's Firebase Auth
   * identity, then authenticated by Firebase Authentication — the sole
   * credential authority. There is no local password database, no password in
   * localStorage, and no sign-in path that pretends an account exists.
   */
  const loginWithFirebase = useCallback(async (identifier: string, password: string) => {
    try {
      const normalized = identifier.trim().toLowerCase()

      let profile: AuthUser
      if (looksLikeEmail(normalized)) {
        // Resolve through the email mapping (handles updated addresses),
        // falling back to a direct Auth sign-in with the typed address.
        profile = await signInWithIdentifier(normalized, password)
      } else if (/^\d{10}$/.test(normalized)) {
        // 10-digit phone number login
        profile = await signInWithIdentifier(normalized, password)
      } else {
        // Username-based authentication via the username mapping
        profile = await signInWithUsername(normalized, password)
      }

      const account = fromAuthUser(profile)
      setUser(account)
      return account
    } catch (err) {
      // Surface the mapped, user-safe reason (never a raw Firebase error).
      throw new Error(describeSignInFailure(err))
    }
  }, [])

  /**
   * Mock-mode credentials check (DEVELOPMENT/TESTING ONLY). Production always
   * goes through loginWithFirebase; this path never touches Firebase and only
   * matches the local seeded directory.
   * 
   * NOTE: In mock mode, passwords are stored in the local users array for
   * development purposes only. In production (firebase mode), authentication
   * is handled by Firebase Auth.
   */
  const login = useCallback((_identifier: string, _password: string) => {
    if (firebaseMode) return null
    // Mock mode: for development purposes only
    // In mock mode, we just check if user exists and is active
    const normalized = _identifier.trim().toLowerCase()
    const match = users.find(
      (entry) => (entry.email ?? '').trim().toLowerCase() === normalized,
    )
    if (!match || match.active === false) return null
    setUser(match)
    try {
      sessionStorage.setItem('beeshive_session', JSON.stringify({ id: match.id }))
    } catch {
      /* session-scoped convenience only */
    }
    return match
  }, [users])
  const logout = useCallback(() => {
    setUser(null)
    if (firebaseMode) {
      // End the Firebase Auth session; a failed remote sign-out (offline) must
      // not surface as an unhandled rejection — the UI is already signed out.
      void firebaseSignOut().catch(() => {})
    } else {
      try {
        sessionStorage.removeItem('beeshive_session')
      } catch {
        /* ignore */
      }
    }
  }, [])

  // const updateAccount = useCallback(async (id: string, data: Partial<UserAccount>) => {
  //   const target = users.find((entry) => entry.id === id)
  //   if (!target) throw new Error('Account was not found.')
  //   const next = { ...target, ...data }
  //   if (firebaseMode) {
  //     // Identifier changes (username / 10-digit phone / email) are reserved
  //     // transactionally BEFORE the profile document is written, so a failed
  //     // save never leaves a stale login identifier active.
  //     const persisted = await updateDirectoryAccount(id, {
  //       name: next.name,
  //       username: next.username,
  //       email: next.email,
  //       phone: next.phone,
  //       avatarUrl: next.avatarUrl,
  //       active: next.active,
  //     })
  //     const persistedAccount = fromDirectory(persisted)
  //     // Role changes (updateStaff) still flow through the directory save.
  //     if (data.role !== undefined && data.role !== target.role) {
  //       await saveUsersDirectory([toDirectory({ ...persistedAccount, role: next.role })])
  //     }
  //     setUsers((prev) => prev.map((entry) => entry.id === id ? { ...entry, ...persistedAccount, role: next.role } : entry))
  //     setUser((current) => current?.id === id ? { ...current, ...persistedAccount, role: next.role } : current)
  //     return
  //   }
  //   setUsers((prev) => prev.map((entry) => entry.id === id ? next : entry))
  //   setUser((current) => current?.id === id ? next : current)
  // }, [users])

    const updateAccount = useCallback(async (
    id: string,
    data: Partial<UserAccount> & { password?: string },
  ) => {
    const target = users.find((entry) => entry.id === id)
    if (!target) throw new Error('Account was not found.')

    // Never persist password into local/Firestore state — Auth owns credentials.
    const { password, ...profileData } = data
    const next = { ...target, ...profileData }

    if (firebaseMode) {
      // 1) Auth password first (fails loudly if Cloud Function is missing).
      if (password) {
        const check = validatePassword(password)
        if (!check.isValid) {
          throw new Error(`Password is not strong enough: ${check.errors.join('; ')}.`)
        }
        const { updateAuthUserPassword } = await import('../services/firebase/userService')
        await updateAuthUserPassword(id, password)
      }

      // 2) Firestore profile + identifier mappings.
      const persisted = await updateDirectoryAccount(id, {
        name: next.name,
        username: next.username,
        email: next.email,
        phone: next.phone,
        avatarUrl: next.avatarUrl,
        active: next.active,
      })
      const persistedAccount = fromDirectory(persisted)
      if (data.role !== undefined && data.role !== target.role) {
        await saveUsersDirectory([toDirectory({ ...persistedAccount, role: next.role })])
      }
      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, ...persistedAccount, role: next.role } : entry,
        ),
      )
      setUser((current) =>
        current?.id === id ? { ...current, ...persistedAccount, role: next.role } : current,
      )
      return
    }

    // Mock mode: profile only (mock login does not verify passwords).
    setUsers((prev) => prev.map((entry) => (entry.id === id ? next : entry)))
    setUser((current) => (current?.id === id ? next : current))
  }, [users])

  const createAdmin = useCallback(async (data: Omit<UserAccount, "id" | "createdAt" | "role"> & { avatarFile?: File; password: string }) => {
    if (!user?.isMainAdmin) throw new Error("Only the Main Admin can create admins.")
    if (users.filter((entry) => entry.role === "admin").length >= MAX_ADMINS) throw new Error("Maximum admin limit reached.")
    const { avatarFile, password, ...account } = data

    // Frontend pre-checks (the transactional reservations in
    // createDirectoryAccount remain the authoritative enforcement).
    const usernameError = validateUsername(account.username ?? '')
    if (usernameError) throw new Error(usernameError)
    if (!isValidContactEmailFormat(account.email ?? '')) throw new Error('Enter a valid email address.')
    if (!isValidPhone(normalizePhone(account.phone ?? ''))) throw new Error('Phone number must be exactly 10 digits.')
    const normalizedUsername = account.username!.trim().toLowerCase()
    if (users.some((entry) => (entry.username ?? '').toLowerCase() === normalizedUsername)) {
      throw new Error('That username is already taken.')
    }
    if (users.some((entry) => (entry.email ?? '').toLowerCase() === account.email!.trim().toLowerCase())) {
      throw new Error('That email address is already in use.')
    }
    if (users.some((entry) => entry.phone === normalizePhone(account.phone ?? ''))) {
      throw new Error('That phone number is already in use.')
    }

    const result = await createDirectoryAccount({
      name: account.name,
      username: normalizedUsername,
      email: account.email,
      phone: normalizePhone(account.phone ?? ''),
      password,
      role: "admin",
      isMainAdmin: false
    })
    // Preserve the user's real contact email — do NOT use the internal auth email.
    let created: UserAccount = {
      ...account,
      username: normalizedUsername,
      email: account.email!, // User's real contact email, not the internal @beeshive.local
      phone: result.entry.phone,
      id: result.entry.id,
      role: "admin" as const,
      createdAt: result.entry.createdAt,
      isMainAdmin: false,
      active: true,
      pending: false,
    }
    if (avatarFile) {
      // Upload to Storage and persist ONLY the download URL — the form closes
      // only after this has fully succeeded.
      const uploaded = await uploadMemberImage(avatarFile, created.id)
      created = { ...created, avatarUrl: uploaded.imageUrl }
      await updateDirectoryAccount(created.id, { avatarUrl: uploaded.imageUrl })
    }
    setUsers((prev) => [...prev.filter((entry) => entry.id !== created.id), created])
    return created
  }, [user, users])

  /**
   * Save the signed-in account's own credentials.
   *
   * Atomic from the operator's point of view — everything below must succeed
   * before the caller is told the save worked:
   *   1. validate every field (username / email / 10-digit phone / password);
   *   2. Firebase Authentication: re-authenticate, then update the password
   *      and/or the sign-in email where applicable. Credentials NEVER reach
   *      Firestore (no password, no hash, no salt);
   *   3. Firestore: reserve the new login identifiers, release the previous
   *      ones and write the `users/{uid}` profile (see updateDirectoryAccount);
   *   4. the Auth listener + the directory listener refresh the profile, so the
   *      UI shows what is actually persisted.
   * A failure at any step throws with the real reason and nothing is reported as
   * saved.
   */
  const updateMyCredentials = useCallback(async (data: {
    name?: string
    username?: string
    email?: string
    phone?: string
    password?: string
    currentPassword?: string
    avatarUrl?: string
  }) => {
    if (!user) throw new Error('No signed-in user.')
    const auth = getAuthNow()
    const fbUser = auth?.currentUser
    if (!auth || !fbUser || fbUser.uid !== user.id) {
      throw new Error('Your session could not be verified. Please sign in again and retry.')
    }

    // ── 1. Validate exactly what will be persisted ─────────────────────────
    const nextName = data.name === undefined ? undefined : data.name.trim()
    if (nextName !== undefined && !nextName) throw new Error('Name is required.')

    const nextUsername = data.username === undefined ? undefined : normalizeUsername(data.username)
    if (nextUsername !== undefined) {
      const usernameError = validateUsername(nextUsername)
      if (usernameError) throw new Error(usernameError)
    }

    const nextEmail = data.email === undefined ? undefined : data.email.trim().toLowerCase()
    if (nextEmail !== undefined && !isValidContactEmailFormat(nextEmail)) {
      throw new Error('Enter a valid email address.')
    }

    // Exactly 10 digits, digits only: spaces, +91 and other characters are
    // rejected rather than silently stripped.
    const nextPhone = data.phone === undefined ? undefined : normalizePhone(data.phone)
    if (nextPhone !== undefined && !isValidPhone(nextPhone)) {
      throw new Error('Phone number must be exactly 10 digits (digits only).')
    }

    if (data.password) {
      const check = validatePassword(data.password)
      if (!check.isValid) {
        throw new Error(`New password is not strong enough: ${check.errors.join('; ')}.`)
      }
      if (!data.currentPassword) throw new Error('Enter your current password to change it.')
    }

    /**
     * The Firebase Auth identity of an app-created account is the internal,
     * non-routable `<username>@beeshive.local` address. Such an identity must
     * NOT be re-pointed at the operator's real mailbox (the login screen
     * resolves a real address through the `emails/{email}` mapping, and the
     * internal identity must stay stable across username renames). Only accounts
     * whose Auth identity IS a real mailbox (the nominated owner, legacy
     * accounts) have their sign-in email updated in Firebase Authentication.
     */
    const internalIdentity = (fbUser.email ?? '').toLowerCase().endsWith(`@${INTERNAL_ACCOUNT_DOMAIN}`)
    const authEmailChange =
      nextEmail !== undefined &&
      !internalIdentity &&
      nextEmail !== (fbUser.email ?? '').toLowerCase()

    // ── 2. Firebase Authentication (password / sign-in email) ──────────────
    const reauthenticate = async () => {
      if (!data.currentPassword) return
      try {
        const credential = EmailAuthProvider.credential(fbUser.email ?? '', data.currentPassword)
        await reauthenticateWithCredential(fbUser, credential)
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          throw new Error('Your current password is incorrect.')
        }
        throw new Error(mapAuthError(err))
      }
    }

    if (data.password || authEmailChange) {
      if (authEmailChange && !data.currentPassword) {
        throw new Error('Enter your current password to change your sign-in email address.')
      }
      await reauthenticate()
    }

    if (data.password) {
      try {
        await updatePassword(fbUser, data.password)
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (code === 'auth/requires-recent-login') {
          throw new Error('Please enter your current password again to change it.')
        }
        throw new Error(mapAuthError(err))
      }
    }

    if (authEmailChange) {
      try {
        // After this the previous sign-in email can no longer authenticate.
        await updateEmail(fbUser, nextEmail!)
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (code === 'auth/email-already-in-use') {
          throw new Error('That email address is already in use by another account.')
        }
        if (code === 'auth/requires-recent-login') {
          throw new Error('Please enter your current password again to change your sign-in email address.')
        }
        throw new Error(mapAuthError(err))
      }
    }

    // ── 3. Firestore profile + login-identifier mappings ──────────────────
    const profileChanges: Partial<UserAccount> = {}
    if (nextName !== undefined) profileChanges.name = nextName
    if (nextUsername !== undefined) profileChanges.username = nextUsername
    if (nextEmail !== undefined) profileChanges.email = nextEmail
    if (nextPhone !== undefined) profileChanges.phone = nextPhone
    if (data.avatarUrl !== undefined) profileChanges.avatarUrl = data.avatarUrl

    await updateAccount(user.id, profileChanges)

    // Issue 4 — identity-mapping consistency after a real Auth email change.
    // Firebase Authentication accepted the new email, so EVERY authEmail-bearing
    // artifact must be re-pointed at it: `users/{uid}.authEmail` and the
    // username / phone / email identifier mappings this account owns. The UID
    // stays the canonical identity — repairAuthIdentity only rewrites mappings
    // that belong to THIS uid, never creates a second account, and the
    // post-sign-in self-heal in authService.resolveProfile re-runs it on the
    // next login as a second convergence guarantee.
    if (authEmailChange) {
      await repairAuthIdentity(user.id, nextEmail!).catch(() => {
        /* best-effort: the sign-in self-heal re-aligns the mappings on next login */
      })
    }
  }, [user, updateAccount])

  const deleteAccount = useCallback(async (id: string) => {
    if (!user?.isMainAdmin) throw new Error('Only the Main Admin can delete accounts.')
    const target = users.find((entry) => entry.id === id)
    if (!target || target.isMainAdmin) throw new Error('The Main Admin account cannot be deleted.')

    // Deletes the profile document AND releases every login-identifier mapping
    // (username / phone / email) so no stale identifier keeps resolving.
    await deleteUserDirectoryEntry(id)

    setUsers((prev) => prev.filter((entry) => entry.id !== id))
  }, [user, users])

  const value = useMemo<AuthContextType>(() => ({
    user, users, isAuthenticated: !!user, isLoading, firebaseMode,
    isMainAdmin: user?.isMainAdmin === true, login, loginWithFirebase, logout,
    listAdmins: () => users.filter((entry) => entry.role === 'admin'),
    createAdmin, updateAdmin: updateAccount, deleteAdmin: deleteAccount,
    transferMainAdmin: async (id) => {
      if (!user?.isMainAdmin) throw new Error('Only the Main Admin can transfer this title.')
      await saveUsersDirectory(users.filter((entry) => entry.role === 'admin').map((entry) => toDirectory({ ...entry, isMainAdmin: entry.id === id })))
    },
    updateMyCredentials, createStaff: async (data: Omit<UserAccount, "id" | "createdAt" | "isMainAdmin"> & { password: string; avatarFile?: File | null }) => {
      // Staff creation MUST use a real Firebase Auth UID — never local_ IDs.
      // Username / phone / email are validated + reserved transactionally by
      // createDirectoryAccount; any failure throws and the create form stays
      // open with the real error.
      const { password, avatarFile, ...profile } = data
      const normalizedUsername = (profile.username ?? '').trim().toLowerCase()
      const usernameError = validateUsername(normalizedUsername)
      if (usernameError) throw new Error(usernameError)
      if (!isValidContactEmailFormat(profile.email ?? '')) throw new Error('Enter a valid email address.')
      const phone = normalizePhone(profile.phone ?? '')
      if (!isValidPhone(phone)) throw new Error('Phone number must be exactly 10 digits.')

      const result = await createDirectoryAccount({
        name: profile.name,
        username: normalizedUsername,
        email: profile.email,
        phone,
        password,
        role: data.role,
        isMainAdmin: false,
      })
      // Preserve the user's real contact email — do NOT use the internal auth email.
      let created: UserAccount = {
        ...profile,
        avatarUrl: undefined, // a local preview URL is never persisted — Storage is authoritative
        username: normalizedUsername,
        email: profile.email!, // User's real contact email, not the internal @beeshive.local
        phone,
        id: result.entry.id,
        createdAt: result.entry.createdAt,
        isMainAdmin: false,
        active: true,
      }
      if (avatarFile) {
        // Same contract as admin creation: upload to Firebase Storage, persist
        // ONLY the download URL, and complete before the caller closes the form.
        const uploaded = await uploadMemberImage(avatarFile, created.id)
        created = { ...created, avatarUrl: uploaded.imageUrl }
        await updateDirectoryAccount(created.id, { avatarUrl: uploaded.imageUrl })
      }
      return created
    },
    updateStaff: updateAccount, deleteStaff: deleteAccount,
    listStaff: () => users.filter((entry) => entry.role === 'waiter' || entry.role === 'supervisor'),
    sendOtp: async () => false, verifyOtp: async () => false, resetPassword: async () => false,
    /**
     * Production password recovery goes through Firebase Authentication
     * (`sendPasswordResetEmail`). Never throws: the caller only needs to know
     * whether the request was accepted, and no address existence is disclosed.
     *
     * The typed identifier (username OR contact email OR Firebase Auth email)
     * is resolved to the account's Firebase Auth identity through the
     * login-identifier mappings BEFORE the reset is requested, because Firebase
     * emails the reset link to the AUTH address of the account. Accounts whose
     * Auth identity is a real mailbox (the Main Admin, migrated and newly
     * created accounts) therefore receive the link in their actual inbox; an
     * account still on its legacy internal identity keeps the previous
     * behavior. No account existence is ever disclosed either way.
     */
    sendPasswordReset: async (identifier: string) => {
      if (!firebaseMode) return false
      const typed = (identifier ?? '').trim()
      if (!typed) return false
      try {
        let recoveryAddress: string
        const resolved = await resolveAuthEmailForIdentifier(typed)
        const resolvedIsRealMailbox =
          !!resolved && !resolved.toLowerCase().endsWith(`@${INTERNAL_ACCOUNT_DOMAIN}`)
        if (looksLikeEmail(typed)) {
          // Real contact email → emails/ mapping → Firebase Auth identity.
          recoveryAddress = resolvedIsRealMailbox ? resolved! : typed.toLowerCase()
        } else {
          // Username → usernames/ mapping → Firebase Auth identity (legacy
          // fallback unchanged: the internal identity derived from the name).
          const normalized = normalizeUsername(typed)
          recoveryAddress = resolvedIsRealMailbox
            ? resolved!
            : `${normalized}@${INTERNAL_ACCOUNT_DOMAIN}`
        }
        await firebaseSendPasswordReset(recoveryAddress)
        return true
      } catch {
        return false
      }
    },
  }), [user, users, isLoading, login, loginWithFirebase, logout, createAdmin, updateAccount, deleteAccount, updateMyCredentials])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}



