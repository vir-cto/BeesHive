/**
 * Bee's Hive — username credentials.
 *
 * The application authenticates with **username + password**. Firebase
 * Authentication is still the ONLY credential authority: every account owns a
 * real Firebase Auth identity whose email is an internal, non-routable address
 * derived from the username. Nothing about the password is ever stored by the
 * application (no hash, no salt, no plaintext — not in Firestore, not in the
 * browser).
 *
 * The internal address exists only so the Firebase Email/Password provider can
 * be used unchanged:
 *
 *      username  ──►  "<username>@beeshive.local"  ──►  Firebase Auth identity
 *
 * `.local` is an RFC-reserved, non-routable domain: no mail is ever delivered
 * there, and it cannot collide with a real user mailbox. When an account's
 * username changes the Auth identity keeps its original internal address — the
 * `usernames/{username}` reservation document carries the mapping, so a rename
 * never requires re-creating the identity (and never breaks sign-in).
 */

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32

/** Internal, non-routable address domain used for Firebase Auth identities. */
export const INTERNAL_ACCOUNT_DOMAIN = 'beeshive.local'

/** Shown to operators in the account forms. */
export const USERNAME_RULE_TEXT =
  '3–32 characters — letters, numbers, dot, dash or underscore (starts with a letter or number)'

/**
 * Normalization applied EVERYWHERE (create, rename, login): trim + lowercase.
 * Whitespace inside the value is rejected rather than silently removed so two
 * different typings can never map onto the same credential by accident.
 */
export const normalizeUsername = (raw: string): string => (raw ?? '').trim().toLowerCase()

/** Letters/numbers, optional single `.`, `-`, `_` separators between them. */
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|[-._](?=[a-z0-9]))*$/

export const isValidUsername = (raw: string): boolean => {
  const username = normalizeUsername(raw)
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return false
  if (/\s/.test(raw ?? '')) return false
  return USERNAME_PATTERN.test(username)
}

/**
 * Internal Auth address for a username (deterministic, opaque to the user).
 * Returns '' for an empty/absent username — a local-part-less address such as
 * "@beeshive.local" is INVALID and must never be minted or stored anywhere.
 */
export const internalEmailForUsername = (raw: string): string => {
  const username = normalizeUsername(raw)
  return username ? `${username}@${INTERNAL_ACCOUNT_DOMAIN}` : ''
}

/**
 * True when a stored identity email is well-formed for authentication: a
 * non-empty local part before the '@'. Guards every read/write of an
 * `authEmail` so a malformed value (e.g. exactly "@beeshive.local") can never
 * be propagated into Firebase Authentication sign-in attempts.
 */
export const isValidAuthEmail = (raw: string | null | undefined): boolean => {
  const value = (raw ?? '').trim()
  if (!value || !value.includes('@')) return false
  return (value.split('@')[0] ?? '').length > 0
}

/** True when the typed credential is an email rather than a username. */
export const looksLikeEmail = (raw: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw ?? '').trim())

/** Optional recovery/contact address validation (never a login credential). */
export const isValidContactEmail = (raw: string): boolean =>
  (raw ?? '').trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw ?? '').trim())

/**
 * Validate username for creation/editing.
 * Returns an error message if invalid, empty string if valid.
 */
export const validateUsername = (raw: string): string => {
  const username = normalizeUsername(raw)
  if (username.length === 0) return 'Username is required.'
  if (username.length < USERNAME_MIN_LENGTH) return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`
  if (username.length > USERNAME_MAX_LENGTH) return `Username must be at most ${USERNAME_MAX_LENGTH} characters.`
  if (!USERNAME_PATTERN.test(username)) return USERNAME_RULE_TEXT
  return ''
}
