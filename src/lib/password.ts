/**
 * Bee's Hive — password policy.
 *
 * Firebase Authentication is the ONLY credential store: no password, hash or
 * salt is ever computed or persisted by this application (not in Firestore, not
 * in the browser). This module therefore contains the shared password-strength
 * policy used by every account form (create admin, create/edit staff, change my
 * password, reset password) so the same rules are enforced everywhere.
 */

// src/lib/password.ts
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = []

  if (password.length < 8) errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('One uppercase letter (A-Z)')
  if (!/[a-z]/.test(password)) errors.push('One lowercase letter (a-z)')
  if (!/[0-9]/.test(password)) errors.push('One number (0-9)')
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('One special character (!@#$...)')

  return { isValid: errors.length === 0, errors }
}
