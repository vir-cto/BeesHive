/**
 * Bee's Hive — "is this stock increase backed by a recorded purchase?".
 *
 * ONE derivation, shared by the Admin inventory screen AND the Supervisor
 * inventory screen, so both roles always show the SAME statement about the SAME
 * authoritative Firebase record. Nothing is stored per role and no "purchase
 * recorded" flag is duplicated in Firestore:
 *
 *   • the inventory document holds the truth about physical stock
 *     (quantity, minimumThreshold, derived status);
 *   • `stockHistory` holds the stock events that produced that quantity;
 *   • the purchase workflow (markPurchaseRequestPurchased /
 *     recordInventoryPurchase) is the ONLY writer whose reason mentions a
 *     purchase — a manual "remaining stock" save by a supervisor is recorded as
 *     a plain stock change.
 *
 * Therefore an item whose LATEST increase came from a manual quantity update
 * reports `NOT_RECORDED` ("Quantity updated · purchase not recorded") on BOTH
 * screens, and reports `RECORDED` ("Purchase recorded") on both screens as soon
 * as a real purchase is recorded — the purpose being that staff can see stock
 * exists while the corresponding purchase has not been booked yet.
 *
 * No React / Firebase imports: pure functions over the synced history so the
 * module stays testable and cannot create a dependency cycle.
 */

/** The subset of a stock-history entry this module needs (structurally StockUpdate). */
export interface StockChangeLike {
  itemId: string
  timestamp: number
  difference: number
  reason?: string
}

/**
 * Newest stock change per inventory item. `stockHistory` is written newest-first
 * by the app, but a Firestore snapshot order is not guaranteed — pick by time.
 */
export const latestStockChangeByItem = <T extends StockChangeLike>(
  history: readonly T[],
): Map<string, T> => {
  const latest = new Map<string, T>()
  for (const entry of history) {
    const previous = latest.get(entry.itemId)
    if (!previous || entry.timestamp > previous.timestamp) latest.set(entry.itemId, entry)
  }
  return latest
}

/**
 * Reasons written by the purchase workflow:
 *   • `Purchase fulfillment #<requestId>`  (markPurchaseRequestPurchased)
 *   • `Direct Inventory Purchase`          (recordInventoryPurchase)
 * A manual remaining-stock save never matches, so it never claims a purchase.
 */
export const isPurchaseReason = (reason?: string): boolean => /purchase/i.test(reason ?? '')

export type PurchaseStatus = 'RECORDED' | 'NOT_RECORDED'

/**
 * Purchase status of an item's latest stock INCREASE, or `null` when the last
 * change was a decrease / there is no change at all (nothing to report).
 */
export const purchaseStatusFor = (change?: StockChangeLike): PurchaseStatus | null => {
  if (!change || Number(change.difference) <= 0) return null
  return isPurchaseReason(change.reason) ? 'RECORDED' : 'NOT_RECORDED'
}
