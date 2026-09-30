/**
 * Bee's Hive — token label helpers (pure, dependency-free).
 *
 * Dine-in orders and parcel (takeaway) orders are numbered in SEPARATE daily
 * series (see `getNextTokenNumber` in RestaurantContext) and are also labelled
 * differently, so the two series can never be confused on screen or on a
 * 58mm kitchen receipt:
 *
 *   • dine-in → TOKEN #001   (receipt banner: `TOKEN 001`)
 *   • parcel  → PARCEL P-001 (receipt banner: `PARCEL P-001`)
 *
 * The plain number stays on `Order.tokenNumber` — only the label differs, so
 * sorting, filters and stored data are untouched.
 */

/** `1` → `001`. */
export const pad3 = (n: number): string => String(n).padStart(3, '0')

/** Dine-in token label, e.g. `#041`. */
export const formatTokenNumber = (n: number): string => `#${pad3(n)}`

/** Parcel token label — its own series, e.g. `P-041`. */
export const formatParcelTokenNumber = (n: number): string => `P-${pad3(n)}`

/** Label honouring the order's series. */
export const formatSeriesToken = (kind: 'dine_in' | 'parcel' | undefined, n: number): string =>
  kind === 'parcel' ? formatParcelTokenNumber(n) : formatTokenNumber(n)

/** Token label for an order (`—` when it has no token yet). */
export const formatOrderToken = (order: { orderType?: 'dine_in' | 'parcel'; tokenNumber?: number }): string =>
  order.tokenNumber == null ? '—' : formatSeriesToken(order.orderType, order.tokenNumber)

/** Thermal-receipt label: `001` for dine-in (no `#`), `P-001` for parcels. */
export const receiptTokenLabel = (n: number, kind?: 'dine_in' | 'parcel'): string =>
  kind === 'parcel' ? formatParcelTokenNumber(n) : pad3(n)
