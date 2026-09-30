import type { Bill, Order, Session } from '../context/RestaurantContext'

const pendingStatuses = new Set<Order['status']>(['placed', 'confirmed', 'preparing'])

const billStatusBySession = (bills: Bill[]) =>
  new Map(
    bills
      .map((bill) => [bill.sessionId, bill.status] as const),
  )

export const getPendingOrders = (
  orders: Order[],
  sessions: Session[],
  bills: Bill[],
  options: { waiterId?: string; includeParcel?: boolean } = {},
): Order[] => {
  const activeSessionIds = new Set(
    sessions
      .filter((session) => session.status === 'active' || session.status === 'payment_pending')
      .map((session) => session.id),
  )
  const billStatuses = billStatusBySession(bills)
  const includeParcel = options.includeParcel ?? false

  return orders.filter((order) => {
    if (!pendingStatuses.has(order.status)) return false
    if (options.waiterId && order.waiterId !== options.waiterId) return false
    const billStatus = billStatuses.get(order.sessionId)
    if (order.orderType === 'parcel') {
      return includeParcel && billStatus !== 'PAID'
    }
    if (billStatus === 'GENERATED' || billStatus === 'PAID') return false
    return activeSessionIds.has(order.sessionId)
  })
}
