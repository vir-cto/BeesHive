/**
 * Bee's Hive — shared serving-variant (Full / Half plate) helpers.
 *
 * ONE consistent, readable format across every screen and 58mm receipt:
 * half plates carry ` (HALF)` and full plates carry ` (FULL)`. Orders stored
 * before `servingType` existed have no serving type at all — those are FULL
 * plates (the only variant that could be ordered then), so they label as
 * ` (FULL)` too and every receipt stays explicitly unambiguous.
 */
export type ServingType = 'full' | 'half'

/**
 * A dish offers a half plate only when a valid non-negative price is
 * configured (`null` / `undefined` / empty means "not configured" and the
 * dish behaves exactly as before: Full plate only).
 */
export const hasHalfPlatePrice = (
  halfPlatePrice: number | null | undefined,
): halfPlatePrice is number =>
  typeof halfPlatePrice === 'number' && Number.isFinite(halfPlatePrice) && halfPlatePrice >= 0

/** `Paneer Tikka` + half → `Paneer Tikka (HALF)`; full / legacy → `Paneer Tikka (FULL)`. */
export const servingSuffix = (servingType?: ServingType): string =>
  servingType === 'half' ? ' (HALF)' : ' (FULL)'
