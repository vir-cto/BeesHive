import { useMemo, useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { useKdsNow, computeKdsPriority, formatCountdown, sortKdsByPriority } from '../lib/orderPriority'
import { usePrintQueue, retryPrint } from '../services/print/printService'
import { formatOrderToken } from '../lib/tokenSequence'
import { servingSuffix } from '../lib/servingType'
import { Flame, CheckCircle2, Printer, RotateCcw } from 'lucide-react'

type Filter = 'ALL' | 'INCOMING' | 'PREPARING' | 'READY' | 'OVERDUE' | 'VIP'
const FILTERS: Filter[] = ['ALL', 'INCOMING', 'PREPARING', 'READY', 'OVERDUE', 'VIP']

const maxPrep = (order: { items: { menuItemId: string }[] }, prep: Map<string, number>): number =>
  order.items.reduce((acc, i) => Math.max(acc, prep.get(i.menuItemId) ?? 0), 1)

export default function SupervisorOrderBoard() {
  const { orders, tables, sessions, menu, updateOrderStatus, setOrderReady } = useRestaurant()
  const [filter, setFilter] = useState<Filter>('ALL')
  const now = useKdsNow(15_000)
  const printJobs = usePrintQueue()
  const prepById = useMemo(() => new Map(menu.map((m) => [m.id, Number(m.preparationTime) || 0])), [menu])

  const activeOrders = orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing' || o.status === 'ready')
  const enriched = activeOrders.map((order) => {
    const isVip = order.isVip ?? tables.find((t) => t.id === order.tableId)?.isVip ?? false
    const info = computeKdsPriority(
      { status: order.status, createdAt: order.createdAt, preparingAt: order.preparingAt ?? order.preparationStartedAt ?? null,
        estimatedReadyAt: order.estimatedReadyAt ?? null, prepMinutes: maxPrep(order, prepById), isVip, manualPriority: order.priority },
      now
    )
    return { id: order.id, order, info, isVip }
  })

  const match = (e: (typeof enriched)[number]): boolean => {
    if (filter === 'INCOMING') return e.order.status === 'confirmed'
    if (filter === 'PREPARING') return e.order.status === 'preparing'
    if (filter === 'READY') return e.order.status === 'ready'
    if (filter === 'OVERDUE') return e.info.isOverdue
    if (filter === 'VIP') return e.isVip
    return true
  }
  const sorted = sortKdsByPriority(enriched.filter(match), (e) => e.info, (e) => e.order.createdAt)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === f ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}>
            {f}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-slate-500">No matching orders.</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map(({ order, info, isVip }) => {
            const table = tables.find((t) => t.id === order.tableId)
            const session = sessions.find((s) => s.id === order.sessionId)
            return (
              <div key={order.id} className={`rounded-[20px] border p-4 shadow-sm ${info.isOverdue ? 'border-red-400 bg-red-50 animate-pulse' : 'border-orange-100 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-black text-slate-900">{order.tokenNumber ? `${order.orderType === 'parcel' ? 'PARCEL' : 'TOKEN'} ${formatOrderToken(order)}` : 'DRAFT'}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${order.status === 'confirmed' ? 'bg-orange-100 text-orange-700' : order.status === 'preparing' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {order.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500">Table {table?.name ?? 'Unknown'} · {session?.guestCount ?? 0} guests</p>
                {order.items.map((item) => (
                  <div key={item.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm">
                    <span className="font-semibold text-slate-800">{item.nameSnapshot}{servingSuffix(item.servingType)}</span>
                    <span className="text-slate-500"> × {item.quantity}</span>
                    {item.specialRequests && <div className="text-[11px] font-bold text-orange-700">!! {item.specialRequests} !!</div>}
                  </div>
                ))}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {info.isOverdue ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">{isVip ? '⭐ VIP · ' : '🔴 '}OVERDUE BY {info.overdueMinutes} MIN</span>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isVip ? 'bg-violet-100 text-violet-700' : info.isDueSoon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {isVip ? '⭐ VIP' : info.isDueSoon ? `DUE SOON · ${formatCountdown(info)}` : 'NORMAL'}
                    </span>
                  )}
                </div>
                {order.status === 'confirmed' && (
                  <button onClick={() => updateOrderStatus(order.id, 'preparing')} className="mt-3 w-full rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-orange-600"><Flame size={15} className="mr-1.5" /> Start Preparing</button>
                )}
                {order.status === 'preparing' && (
                  <button onClick={() => setOrderReady(order.id)} className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-600"><CheckCircle2 size={15} className="mr-1.5" /> Mark Ready</button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Print queue */}
      <div className="rounded-[20px] border border-slate-200 bg-white p-4">
        <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-800"><Printer size={16} className="text-orange-500" /> Print Queue</h3>
        {printJobs.length === 0 ? (
          <p className="text-xs text-slate-400">No print jobs.</p>
        ) : (
          <div className="space-y-1.5">
            {printJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                <span>{job.kind === 'token' ? `Token · ${job.referenceId.slice(-6)}` : 'Bill'}</span>
                <span className={`font-bold ${job.status === 'FAILED' ? 'text-red-600' : job.status === 'PRINTED' ? 'text-emerald-600' : 'text-amber-600'}`}>{job.status}</span>
                {job.status === 'FAILED' && (
                  <button onClick={() => retryPrint(job.id)} className="flex items-center gap-1 text-orange-600"><RotateCcw size={12} /> Retry</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}