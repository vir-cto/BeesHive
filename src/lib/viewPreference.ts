import { useCallback, useEffect, useState } from 'react'

/**
 * Persisted VIEW preferences ("Small / Medium / Large / List" controls).
 *
 * A view mode is a UI preference, NOT business data: it only decides how the
 * cards of the current screen are laid out. Nothing that belongs to Firebase —
 * sessions, orders, tables, bills, payments, tokens, menu, inventory — is ever
 * stored here (see the note on `readViewPreference`).
 *
 * Why localStorage: the requirement is that the chosen view survives a page
 * navigation AND a browser refresh, and keeps applying until the operator
 * explicitly changes it. That is exactly the pattern the app already uses for
 * other local, non-business helper values (`beeshive_token_counter_*`,
 * `beeshive_analytics_waiterDaily`), so it reuses the approved mechanism instead
 * of introducing a new one.
 *
 * Every screen owns its own key (`README`: stable per-page preference) so
 * switching the Menu to "Small" can never silently re-layout Inventory, and the
 * stored value is validated against the screen's own option list, so a stale or
 * hand-edited value can never produce an unknown view mode.
 */
export const viewPreferenceKeys = {
  /** Waiter → Sessions / Table Floor (`WaiterTableAllocation`). */
  waiterSessions: 'beeshive_view_waiterSessions',
  /** Waiter → Menu tab (`WaiterMenuBrowse`). */
  waiterMenu: 'beeshive_view_waiterMenu',
  /** Waiter → order screen dish list (`WaiterOrderCreation`). */
  waiterOrderMenu: 'beeshive_view_waiterOrderMenu',
  /** Admin → Menu (`AdminMenuManagement`). */
  adminMenu: 'beeshive_view_adminMenu',
  /** Supervisor → Dashboard inventory (`SupervisorDashboard`). */
  supervisorInventory: 'beeshive_view_supervisorInventory',
} as const

export type ViewPreferenceKey = (typeof viewPreferenceKeys)[keyof typeof viewPreferenceKeys]

/**
 * Read a stored view mode. Returns `fallback` when nothing is stored, when the
 * stored value is not one of this screen's options, or when storage is
 * unavailable (private mode / quota). Never throws.
 */
export function readViewPreference<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return allowed.includes(raw as T) ? (raw as T) : fallback
  } catch {
    return fallback
  }
}

/** Persist a view mode (best effort — a failed write is never fatal). */
export function writeViewPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode / quota): the view still applies for
    // this page load, it just cannot be remembered.
  }
}

/**
 * View-mode state for one screen, persisted across navigation, tab switches and
 * browser refreshes. The setter applies the change immediately (no reload) and
 * stores it, so the selection sticks until the operator picks another one.
 */
export function useViewPreference<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readViewPreference(key, fallback, allowed))

  // Re-read when the screen's own key changes (never for unrelated screens).
  useEffect(() => {
    setValue(readViewPreference(key, fallback, allowed))
    // `allowed`/`fallback` are module constants on every screen that uses this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const update = useCallback(
    (next: T) => {
      setValue(next)
      writeViewPreference(key, next)
    },
    [key],
  )

  return [value, update]
}
