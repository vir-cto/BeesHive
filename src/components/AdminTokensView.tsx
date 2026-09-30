import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import { Ticket, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { formatOrderToken } from '../lib/tokenSequence'
import { servingSuffix } from '../lib/servingType'
import { toBusinessDayStr, isSameBusinessDay } from '../lib/businessDay'

const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())
const sameDay = (ts: number, dateStr: string) => isSameBusinessDay(ts, dateStr)

export default function AdminTokensView() {
  const { orders, tables } = useRestaurant()
  const { users } = useAuth()
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [expandedToken, setExpandedToken] = useState<string | null>(null)

  const tokens = orders.filter((o) => o.tokenNumber && sameDay(o.confirmedAt || o.createdAt, selectedDate))
    .sort((a, b) => (b.tokenNumber || 0) - (a.tokenNumber || 0))

  const goToDay = (offset: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + offset)
    setSelectedDate(toDateStr(d))
  }

  const waiterName = (id: string) => users.find((u) => u.id === id)?.name ?? id.slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Token History</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => goToDay(-1)} className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><ChevronLeft size={16} /></button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <button onClick={() => goToDay(1)} className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><ChevronRight size={16} /></button>
          <button onClick={() => setSelectedDate(toDateStr(new Date()))} className="rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700">Today</button>
        </div>
      </div>

      {tokens.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <Ticket className="mx-auto mb-2 text-slate-300" size={32} />
          <p className="text-slate-500">No tokens generated on {selectedDate}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((order) => {
            const table = tables.find((t) => t.id === order.tableId)
            const isExpanded = expandedToken === order.id
            return (
              <div key={order.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                      <Ticket size={18} className="text-orange-600" />
                    </div>
                    <div>
                      {/* Parcel tokens use their own series label: Parcel P-001 vs Token #001 */}
                      <p className="font-bold text-slate-900">{order.orderType === 'parcel' ? 'Parcel' : 'Token'} {formatOrderToken(order)}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(order.confirmedAt || order.createdAt).toLocaleTimeString()} • {table?.name ?? 'Unknown'} • {waiterName(order.waiterId)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.isVip && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">VIP</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${order.status === 'served' ? 'bg-emerald-100 text-emerald-700' : order.status === 'ready' ? 'bg-blue-100 text-blue-700' : order.status === 'preparing' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                      {order.status}
                    </span>
                    <button onClick={() => setExpandedToken(isExpanded ? null : order.id)} className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200">
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold">Items:</span>{' '}
                      {order.items.map((i) => `${i.nameSnapshot}${servingSuffix(i.servingType)} x${i.quantity}`).join(', ')}
                    </div>
                    {order.items.some((i) => i.specialRequests) && (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <span className="font-semibold">Special Instructions:</span>{' '}
                        {order.items.filter((i) => i.specialRequests).map((i) => i.specialRequests).join('; ')}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>Session: {order.sessionId.slice(-8)}</div>
                      <div>Order ID: {order.id.slice(-8)}</div>
                      <div>Prep Time: {order.estimatedPreparationMinutes ?? '—'} min</div>
                      <div>Ready: {order.readyAt ? new Date(order.readyAt).toLocaleTimeString() : '—'}</div>
                      <div>Served: {order.servedAt ? new Date(order.servedAt).toLocaleTimeString() : '—'}</div>
                      <div>Confirmed: {order.confirmedAt ? new Date(order.confirmedAt).toLocaleTimeString() : '—'}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
