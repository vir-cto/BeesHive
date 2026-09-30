import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Users } from 'lucide-react'
import { useRestaurant } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import { loadCollection, saveDoc } from '../services/firebase/dataService'
import { dataMode, isFirebaseConfigured } from '../services/firebase/config'
import { toBusinessDayStr, isSameBusinessDay } from '../lib/businessDay'

const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())
const sameDay = (ts: number, dateStr: string) => isSameBusinessDay(ts, dateStr)
const monthOf = (dateStr: string) => dateStr.slice(0, 7)

// DateRange mirrors the shape passed from AdminAnalyticsView.
type DateRange = { start: number; end: number; label: string }

export type WaiterDayStat = {
  waiterId: string
  name: string
  orders: number
  completed: number
  cancelled: number
  itemsSold: number
  revenue: number
  dineIn: number
  parcel: number
  guests: number
}

type WaiterDailySnapshot = {
  id: string
  date: string
  generatedAt: number
  waiters: WaiterDayStat[]
}

const EMPTY_STAT: Omit<WaiterDayStat, 'waiterId' | 'name'> = {
  orders: 0, completed: 0, cancelled: 0, itemsSold: 0, revenue: 0, dineIn: 0, parcel: 0, guests: 0,
}

/** Compute per-waiter stats for all orders whose createdAt falls on `dateStr`. */
const computeWaiterStats = (
  orders: ReturnType<typeof useRestaurant>['orders'],
  sessions: ReturnType<typeof useRestaurant>['sessions'],
  dateStr: string,
  nameOf: (id: string) => string,
): WaiterDayStat[] => {
  const map = new Map<string, WaiterDayStat>()
  orders
    .filter((o) => sameDay(o.createdAt, dateStr) && o.waiterId)
    .forEach((o) => {
      if (!map.has(o.waiterId)) {
        map.set(o.waiterId, { waiterId: o.waiterId, name: nameOf(o.waiterId), ...EMPTY_STAT })
      }
      const s = map.get(o.waiterId)!
      s.orders += 1
      if (o.status === 'cancelled') s.cancelled += 1
      else {
        if (o.status === 'served') s.completed += 1
        s.itemsSold += o.items.reduce((n, i) => n + i.quantity, 0)
        s.revenue += o.totalAmount || 0
        if (o.orderType === 'parcel') s.parcel += 1
        else s.dineIn += 1
      }
    })
  // Guest counts from sessions opened that day, attributed to the session waiter.
  sessions
    .filter((sess) => sameDay(sess.startTime, dateStr) && sess.waiterId)
    .forEach((sess) => {
      if (!map.has(sess.waiterId)) {
        map.set(sess.waiterId, { waiterId: sess.waiterId, name: nameOf(sess.waiterId), ...EMPTY_STAT })
      }
      map.get(sess.waiterId)!.guests += sess.guestCount || 0
    })
  return [...map.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
}

const readLocalSnapshots = (): WaiterDailySnapshot[] => {
  if (dataMode !== 'mock') return []
  try {
    return JSON.parse(localStorage.getItem('beeshive_analytics_waiterDaily') || '[]') as WaiterDailySnapshot[]
  } catch {
    return []
  }
}

const writeLocalSnapshots = (snapshots: WaiterDailySnapshot[]) => {
  if (dataMode !== 'mock') return
  try {
    localStorage.setItem('beeshive_analytics_waiterDaily', JSON.stringify(snapshots.slice(-400)))
  } catch { /* storage full — non-critical */ }
}

/** One labelled metric inside a mobile waiter card. `wide` spans both columns
 *  (used for Revenue so a long ₹ value can never overflow the card). */
function WaiterCardMetric({ label, value, tone, wide = false }: {
  label: string
  value: ReactNode
  tone: string
  wide?: boolean
}) {
  return (
    <div className={`min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold ${tone} ${wide ? 'wrap-break-word' : ''}`}>{value}</p>
    </div>
  )
}

/** Mobile (<768px) waiter cards. The 10-column table is unusable at 320–414px,
 *  so below md each waiter is rendered as a compact card with the same metrics. */
function MobileWaiterCards({ stats }: { stats: WaiterDayStat[] }) {
  return (
    <div className="space-y-2.5 md:hidden">
      {stats.map((s) => (
        <div key={s.waiterId} className="rounded-xl border border-orange-100 bg-white p-3 shadow-sm">
          <div className="flex min-w-0 items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[11px] font-bold text-orange-600">
              {(s.name || '').trim().charAt(0).toUpperCase() || '?'}
            </span>
            <p className="min-w-0 flex-1 wrap-break-word text-sm font-bold leading-snug text-slate-800">{s.name || 'Unnamed waiter'}</p>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <WaiterCardMetric label="Orders" value={s.orders} tone="text-amber-600" />
            <WaiterCardMetric label="Completed" value={s.completed} tone="text-emerald-600" />
            <WaiterCardMetric label="Cancelled" value={s.cancelled} tone="text-red-500" />
            <WaiterCardMetric label="Items Sold" value={s.itemsSold} tone="text-slate-600" />
            <WaiterCardMetric
              label="Revenue"
              value={`₹${s.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              tone="text-slate-800"
              wide
            />
            <WaiterCardMetric
              label="Avg/Order"
              value={s.completed > 0 ? `₹${(s.revenue / s.completed).toFixed(0)}` : '-'}
              tone="text-slate-500"
            />
            <WaiterCardMetric label="Dine-in" value={s.dineIn} tone="text-slate-500" />
            <WaiterCardMetric label="Parcel" value={s.parcel} tone="text-slate-500" />
            <WaiterCardMetric label="Guests" value={s.guests} tone="text-slate-500" />
          </div>
        </div>
      ))}
      {stats.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
          No waiter activity for this period yet.
        </div>
      )}
    </div>
  )
}

export default function AdminWaiterAnalytics({ dateRange, period }: { dateRange: DateRange; period: string }) {
  const { orders, sessions } = useRestaurant()
  const { users } = useAuth()
  // The global period selector drives what "view" we show.
  const view: 'day' | 'month' | 'all' = period === 'custom' ? 'day' : period === 'month' ? 'month' : 'all'
  const [dayDate, setDayDate] = useState(toDateStr(new Date(dateRange.start)).slice(0, 10))
  const [month, setMonth] = useState(monthOf(toDateStr(new Date(dateRange.start)).slice(0, 10)))
  const [snapshots, setSnapshots] = useState<WaiterDailySnapshot[]>(readLocalSnapshots)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const nameOf = useCallback((id: string) => users.find((u) => u.id === id)?.name ?? `Waiter ${id.slice(0, 6)}`, [users])

  // Keep dayDate/month in sync with the global date range.
  useEffect(() => {
    const s = toDateStr(new Date(dateRange.start)).slice(0, 10)
    setDayDate(s)
    setMonth(monthOf(s))
  }, [dateRange.start])

  // Day stats — always computed live from current order data.
  const dayStats = useMemo(
    () => computeWaiterStats(orders, sessions, dayDate, nameOf),
    [orders, sessions, dayDate, nameOf],
  )

  // Load archived snapshots from Firestore on mount (offline-safe fallback: localStorage).
  useEffect(() => {
    if (!isFirebaseConfigured()) return
    let alive = true
    loadCollection<WaiterDailySnapshot>('analytics').then((docs) => {
      if (!alive) return
      const merged = [...readLocalSnapshots()]
      docs.forEach((d) => {
        const i = merged.findIndex((m) => m.date === d.date)
        if (i >= 0) merged[i] = d
        else merged.push(d)
      })
      merged.sort((a, b) => a.date.localeCompare(b.date))
      setSnapshots(merged)
      writeLocalSnapshots(merged)
    }).catch((err) => { if (import.meta.env.DEV) console.error('analytics load failed:', err) })
    return () => { alive = false }
  }, [])

  // Persist the selected day's snapshot to the database (debounced).
  useEffect(() => {
    if (dayStats.length === 0) return
    const snapshot: WaiterDailySnapshot = {
      id: `waiterDaily_${dayDate}`,
      date: dayDate,
      generatedAt: Date.now(),
      waiters: dayStats,
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSnapshots((prev) => {
        const next = [...prev.filter((s) => s.date !== dayDate), snapshot].sort((a, b) => a.date.localeCompare(b.date))
        writeLocalSnapshots(next)
        return next
      })
      void saveDoc('analytics', snapshot.id, snapshot).catch((err) => {
        if (import.meta.env.DEV) console.error('analytics save failed:', err)
      })
    }, 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [dayStats, dayDate])

  // Aggregation helper: sum archived snapshots for a period, falling back to
  // archived numbers only for days whose orders no longer exist live.
  const aggregate = useCallback((periodFilter: (date: string) => boolean) => {
    const map = new Map<string, WaiterDayStat>()
    const add = (s: WaiterDayStat) => {
      if (!map.has(s.waiterId)) map.set(s.waiterId, { waiterId: s.waiterId, name: s.name, ...EMPTY_STAT })
      const t = map.get(s.waiterId)!
      t.orders += s.orders; t.completed += s.completed; t.cancelled += s.cancelled
      t.itemsSold += s.itemsSold; t.revenue += s.revenue
      t.dineIn += s.dineIn; t.parcel += s.parcel; t.guests += s.guests
      if (s.name && s.name !== t.name) t.name = s.name
    }
    const liveDays = new Set(orders.map((o) => toDateStr(new Date(o.createdAt))).filter(periodFilter))
    const archived = new Map(snapshots.filter((s) => periodFilter(s.date)).map((s) => [s.date, s]))
    const days = new Set<string>([...liveDays, ...archived.keys()])
    days.forEach((d) => {
      const live = computeWaiterStats(orders, sessions, d, nameOf)
      const source = live.length > 0 ? live : (archived.get(d)?.waiters ?? [])
      source.forEach(add)
    })
    return [...map.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
  }, [nameOf, orders, sessions, snapshots])

  // Month stats: sum of every day in the selected month.
  const monthStats = useMemo(
    () => aggregate((d) => d.startsWith(month)),
    [aggregate, month],
  )

  // Per-day order counts per waiter for the month grid.
  const monthGrid = useMemo(() => {
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
    const grid = new Map<string, number[]>() // waiterId -> [count per day 1..N]
    const ensure = (id: string) => {
      if (!grid.has(id)) grid.set(id, new Array(daysInMonth).fill(0))
      return grid.get(id)!
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`
      computeWaiterStats(orders, sessions, dateStr, nameOf).forEach((s) => {
        if (s.orders > 0) ensure(s.waiterId)[d - 1] = s.orders
      })
    }
    return {
      daysInMonth,
      rows: [...grid.entries()]
        .map(([id, counts]) => ({ id, name: nameOf(id), counts, total: counts.reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.total - a.total),
    }
  }, [orders, sessions, month, nameOf])

  // For week/year (view === 'all') we filter to the selected date range,
  // not truly all-time. Re-aggregate with a date-range filter.
  const statsForView = (() => {
    if (view === 'day') return dayStats
    if (view === 'month') return monthStats
    const filtered = aggregate((d) => {
      const p = d.split('-').map(Number)
      const ts = Date.UTC(p[0], p[1] - 1, p[2])
      return ts >= dateRange.start && ts <= dateRange.end
    })
    return filtered
  })()

  return (
    <div className="rounded-[20px] border border-orange-100 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-700"><Users size={16} className="text-orange-500" /> Waiter Performance</p>
        <div className="flex sm:w-auto justify-end">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
            {dateRange.label}
          </span>
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-400">{dateRange.label} — waiter performance</p>

      {/* Full 10-column table — kept for md and up (unchanged desktop layout). */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 text-left">Waiter</th>
              <th className="py-2 text-right">Orders</th>
              <th className="py-2 text-right">Completed</th>
              <th className="py-2 text-right">Cancelled</th>
              <th className="py-2 text-right">Items Sold</th>
              <th className="py-2 text-right">Revenue</th>
              <th className="py-2 text-right">Avg/Order</th>
              <th className="py-2 text-right">Dine-in</th>
              <th className="py-2 text-right">Parcel</th>
              <th className="py-2 text-right pr-2">Guests</th>
            </tr>
          </thead>
          <tbody>
            {statsForView.map((s) => (
              <tr key={s.waiterId} className="border-b border-slate-100 last:border-0">
                <td className="py-2 font-semibold text-slate-800">{s.name}</td>
                <td className="py-2 text-right font-bold text-amber-600">{s.orders}</td>
                <td className="py-2 text-right text-emerald-600">{s.completed}</td>
                <td className="py-2 text-right text-red-500">{s.cancelled}</td>
                <td className="py-2 text-right text-slate-600">{s.itemsSold}</td>
                <td className="py-2 text-right font-semibold text-slate-800">₹{s.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="py-2 text-right text-slate-500">{s.completed > 0 ? `₹${(s.revenue / s.completed).toFixed(0)}` : '-'}</td>
                <td className="py-2 text-right text-slate-500">{s.dineIn}</td>
                <td className="py-2 text-right text-slate-500">{s.parcel}</td>
                <td className="py-2 text-right pr-2 text-slate-500">{s.guests}</td>
              </tr>
            ))}
            {statsForView.length === 0 && (
              <tr><td colSpan={10} className="py-4 text-center text-slate-400">No waiter activity for this period yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Below md the same statsForView rows render as per-waiter cards. */}
      <MobileWaiterCards stats={statsForView} />

      {period === 'month' && monthGrid.rows.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Orders per Day — {month}</p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white py-1 pr-2 text-left text-slate-500">Waiter</th>
                  {Array.from({ length: monthGrid.daysInMonth }, (_, i) => (
                    <th key={i} className="w-7 py-1 text-center text-slate-400">{i + 1}</th>
                  ))}
                  <th className="py-1 pl-2 text-center text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {monthGrid.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 bg-white py-1 pr-2 font-semibold text-slate-700">{r.name}</td>
                    {r.counts.map((c, i) => (
                      <td key={i} className={`py-1 text-center font-semibold ${c > 0 ? 'text-amber-600' : 'text-slate-200'}`}>{c > 0 ? c : '·'}</td>
                    ))}
                    <td className="py-1 pl-2 text-center font-bold text-slate-800">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
