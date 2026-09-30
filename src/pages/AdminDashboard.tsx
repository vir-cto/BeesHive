import { useEffect, useRef, useState } from 'react'
import type { PrintJob } from '../services/print/printService'
import { useRestaurant } from '../context/RestaurantContext'
import type { MenuItem, Order, RestaurantSettings } from '../context/RestaurantContext'
import { toSettingsNumber } from '../services/firebase/settingsService'
import { useAuth } from '../context/AuthContext'
import AdminTableManagement from '../components/AdminTableManagement'
import AdminStaffManagement from '../components/AdminStaffManagement'
import AdminInventoryManagement from '../components/AdminInventoryManagement'
import AdminPurchaseRequests from '../components/AdminPurchaseRequests'
import { LayoutDashboard, Table2, UtensilsCrossed, Users, ClipboardList, Package, CreditCard, BarChart3, Settings, Shield, Receipt, Ticket, ChevronLeft, ChevronRight, ShoppingBag, Plus, Minus, X, CheckCircle2, Clock, Search, Printer, ArrowUpDown, Eye } from 'lucide-react'
import AdminAdminManagement from '../components/AdminAdminManagement'
import AdminMenuManagement from '../components/AdminMenuManagement'
import AdminTokensView from '../components/AdminTokensView'
import AdminBillingView from '../components/AdminBillingView'
import AdminStockAnalytics from '../components/AdminStockAnalytics'
import PrintPreview from '../components/PrintPreview'
import AdminParcelBillModal from '../components/AdminParcelBilling'
import AdminWaiterAnalytics from '../components/AdminWaiterAnalytics'
import AdminPurchaseHistory from '../components/AdminPurchaseHistory'
import AdminSessionBilling from '../components/AdminSessionBilling'
import Sidebar from '../components/Sidebar'
import FoodTypeMark from '../components/FoodTypeBadge'
import { countFoodTypes, foodTypeFilters, matchesFoodType, useFoodTypeFilter } from '../lib/menuFilters'
import { formatOrderToken } from '../lib/tokenSequence'
import { hasHalfPlatePrice, servingSuffix } from '../lib/servingType'
import { SPICE_LEVELS, CUSTOMER_NOTE_OPTIONS, buildSpecialRequests } from '../lib/orderCustomization'
import { Component, type ReactNode } from 'react'
import { getPendingOrders } from '../lib/orderMetrics'

type AdminTab = 'dashboard' | 'admins' | 'tables' | 'menu' | 'staff' | 'orders' | 'inventory' | 'inventory-usage' | 'tokens' | 'billing' | 'payments' | 'purchase-requests' | 'analytics' | 'settings'

/**
 * Per-tab crash guard. Without this, any runtime error inside a tab component
 * (e.g. Tables / Menu) unmounts the whole React tree and the user sees a blank
 * white page. The boundary contains the failure to the tab content area and
 * always renders an actionable panel with a reload escape hatch.
 */
class TabErrorBoundary extends Component<{ tab: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) console.error(`[AdminDashboard] Tab "${this.props.tab}" crashed:`, error)
  }

  componentDidUpdate(prev: { tab: string }) {
    // Switching tabs clears the previous failure so the new tab renders.
    if (prev.tab !== this.props.tab && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-bold text-red-700">Something went wrong in "{this.props.tab}"</h2>
          <p className="mt-2 break-all font-mono text-xs text-red-600">{this.state.error.message}</p>
          <p className="mt-3 text-sm text-red-600">Other sections keep working. Try again or reload the page.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => this.setState({ error: null })} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Period helpers — FIXED IST business calendar (see lib/businessDay.ts) ────
// The previous implementation mixed browser-local day keys with Date.UTC
// boundaries, shifting every selected period by 5½ hours on an IST device
// (orders placed 00:00–05:30 IST were dropped from "their own day", and
// 05:30 of the NEXT day was included). All boundaries below are now IST.
import {
  toBusinessDayStr,
  isSameBusinessDay as isSameIstDay,
  todayBusinessDayStr,
  businessDayStart,
  businessDayEnd,
  businessWeekStart,
  businessWeekEnd,
  businessMonthStart,
  businessMonthEnd,
  businessYearStart,
  businessYearEnd,
} from '../lib/businessDay'

const isToday = (ts: number) => isSameIstDay(ts, todayBusinessDayStr())

const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())
const sameDay = (ts: number, dateStr: string) => isSameIstDay(ts, dateStr)

// ─── Period helpers (Mon–Sun week, calendar month, calendar year) ──────────────
export type PeriodType = 'week' | 'month' | 'year' | 'custom'

/** midnight IST of `dateStr` (inclusive start of that business day) */
const startOfDateStr = (dateStr: string): number => businessDayStart(dateStr)

/** end of a business day = IST midnight of the NEXT day minus 1ms (inclusive) */
const endOfDateStr = (dateStr: string): number => businessDayEnd(dateStr)

/** Start of week: Monday 00:00 IST of the week containing `dateStr`. */
const startOfWeek = (dateStr: string): number => businessWeekStart(dateStr)

/** End of week: Sunday 23:59:59.999 IST of the week containing `dateStr`. */
const endOfWeek = (dateStr: string): number => businessWeekEnd(dateStr)

/** Start of calendar month: 00:00 IST of the 1st. */
const startOfMonth = (dateStr: string): number => businessMonthStart(dateStr)
/** End of calendar month: last ms of the month, IST. */
const endOfMonth = (dateStr: string): number => businessMonthEnd(dateStr)

/** Start of calendar year: Jan 1 00:00 IST. */
const startOfYear = (dateStr: string): number => businessYearStart(dateStr)
/** End of calendar year: last ms of Dec 31, IST. */
const endOfYear = (dateStr: string): number => businessYearEnd(dateStr)

/** Label-aware date range. isActive(ts) returns true when `ts` falls within [start, end] (inclusive). */
type DateRange = {
  start: number
  end: number
  label: string
}

const rangeForPeriod = (period: PeriodType, anchorDateStr: string): DateRange => {
  if (period === 'week') {
    const start = startOfWeek(anchorDateStr)
    const end = endOfWeek(anchorDateStr)
    const s = new Date(start)
    const e = new Date(end)
    return {
      start,
      end,
      label: `This Week · ${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    }
  }
  if (period === 'month') {
    const start = startOfMonth(anchorDateStr)
    const end = endOfMonth(anchorDateStr)
    const s = new Date(start)
    return {
      start,
      end,
      label: `This Month · ${s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`,
    }
  }
  if (period === 'year') {
    const start = startOfYear(anchorDateStr)
    const end = endOfYear(anchorDateStr)
    return {
      start,
      end,
      label: `This Year · ${new Date(start).getUTCFullYear()}`,
    }
  }
  // custom: single day selectedDate
  const start = startOfDateStr(anchorDateStr)
  const end = endOfDateStr(anchorDateStr)
  const d = new Date(start)
  return {
    start,
    end,
    label: `Custom · ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`,
  }
}

const inRange = (range: DateRange, ts: number) => ts >= range.start && ts <= range.end

/** Format a UTC timestamp for trend labels. */
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const fmtMonth = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short' })

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
  const [showAllActivity, setShowAllActivity] = useState(false)
  const { user } = useAuth()
  const { tables, menu, sessions, orders, bills, inventory, purchaseRequests, paymentRecords, getRecentActivity } = useRestaurant()

  const recentActivity = getRecentActivity(50)

  const activeTableCount = tables.filter((table) => table.status === 'occupied' && table.active).length
  const availableTableCount = tables.filter((table) => table.status === 'available' && table.active).length
  const activeSessionCount = sessions.filter((s) => s.status === 'active' || s.status === 'payment_pending').length
  const pendingOrders = getPendingOrders(orders, sessions, bills, { includeParcel: true })
  const pendingOrderCount = pendingOrders.length
  // Revenue is based on recorded external payments (not generated bills).
  const todayRevenue = paymentRecords.filter((p) => isToday(p.recordedAt)).reduce((sum, p) => sum + p.amount, 0)
  // Stock status counts — both computed from the SAME authoritative Firebase-
  // backed inventory state (no separate counters anywhere).
  const lowStockCount = inventory.filter((i) => i.status === 'LOW' || i.status === 'CRITICAL').length
  const outOfStockCount = inventory.filter((i) => i.status === 'OUT_OF_STOCK').length
  const pendingRequestCount = purchaseRequests.filter((r) => r.status === 'PENDING').length

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'admins', label: 'Admins', icon: <Shield size={18} /> },
    { id: 'tables', label: 'Tables', icon: <Table2 size={18} /> },
    { id: 'menu', label: 'Menu', icon: <UtensilsCrossed size={18} /> },
    { id: 'staff', label: 'Staff', icon: <Users size={18} /> },
    { id: 'orders', label: 'Orders', icon: <ClipboardList size={18} />, badge: pendingOrderCount },
    { id: 'payments', label: 'Payments', icon: <CreditCard size={18} /> },
    { id: 'inventory', label: 'Inventory', icon: <Package size={18} /> },
    { id: 'inventory-usage', label: 'Stock & Usage', icon: <ClipboardList size={18} /> },
    { id: 'purchase-requests', label: 'Requests', icon: <Package size={18} />, badge: pendingRequestCount },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ]

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar Navigation */}
      <Sidebar
        navItems={navItems}
        activeTab={activeTab}
        panelName="Admin Panel"
        onSelect={(id) => setActiveTab(id as AdminTab)}
      />

      {/* Main Content */}
      <main className="flex-1">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Welcome back, <span className="bg-linear-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">{user?.name || 'Admin'}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">Restaurant overview</p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Active Tables" value={activeTableCount} color="orange" onClick={() => setActiveTab('tables')} />
              <StatCard label="Available" value={availableTableCount} color="emerald" onClick={() => setActiveTab('tables')} />
              <StatCard label="Active Sessions" value={activeSessionCount} color="blue" onClick={() => setActiveTab('tables')} />
              <StatCard label="Pending Orders" value={pendingOrderCount} color="amber" onClick={() => setActiveTab('orders')} />
              <StatCard label="Today's Revenue" value={`₹${todayRevenue.toLocaleString()}`} color="emerald" onClick={() => setActiveTab('payments')} />
              <StatCard label="Out of Stock" value={outOfStockCount} color="red" onClick={() => setActiveTab('inventory')} />
              <StatCard label="Low Stock" value={lowStockCount} color="amber" onClick={() => setActiveTab('inventory')} />
              <StatCard label="Total Items" value={inventory.length} color="violet" onClick={() => setActiveTab('inventory')} />
              <StatCard label="Menu Items" value={menu.length} color="violet" onClick={() => setActiveTab('menu')} />
              <StatCard label="Pending Requests" value={pendingRequestCount} color="amber" onClick={() => setActiveTab('purchase-requests')} />
            </div>

            <div className="rounded-[20px] border border-orange-100 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
                {recentActivity.length > 5 && (
                  <button
                    onClick={() => setShowAllActivity((v) => !v)}
                    className="rounded-lg bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700 hover:bg-orange-200"
                  >
                    {showAllActivity ? 'Show Less' : 'View All'}
                  </button>
                )}
              </div>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500">No recent activity.</p>
              ) : (
                <div className="space-y-2">
                  {(showAllActivity ? recentActivity : recentActivity.slice(0, 5)).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {item.subtitle} · {item.userName} · {new Date(item.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-700">
                        {item.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <TabErrorBoundary tab={activeTab}>
          {activeTab === 'admins' && <AdminAdminManagement />}
          {activeTab === 'tables' && <AdminTableManagement />}
          {activeTab === 'staff' && <AdminStaffManagement />}
          {activeTab === 'inventory' && <AdminInventoryManagement />}
          {activeTab === 'inventory-usage' && <AdminStockAnalytics />}
          {activeTab === 'purchase-requests' && <AdminPurchaseRequests />}
          {activeTab === 'menu' && <AdminMenuManagement />}
          {activeTab === 'orders' && <AdminOrdersView />}
          {activeTab === 'payments' && <AdminPaymentsView />}
          {activeTab === 'analytics' && <AdminAnalyticsView onOpenInventory={() => setActiveTab('inventory')} />}
          {activeTab === 'settings' && <AdminSettingsView />}
        </TabErrorBoundary>
      </main>
    </div>
  )
}

function StatCard({ label, value, color, onClick }: { label: string; value: string | number; color: string; onClick?: () => void }) {
  const styles: Record<string, { bar: string; dot: string; text: string }> = {
    orange: { bar: 'bg-orange-400', dot: 'bg-orange-400', text: 'text-orange-600' },
    emerald: { bar: 'bg-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-600' },
    blue: { bar: 'bg-blue-400', dot: 'bg-blue-400', text: 'text-blue-600' },
    amber: { bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-600' },
    red: { bar: 'bg-red-400', dot: 'bg-red-400', text: 'text-red-600' },
    violet: { bar: 'bg-violet-400', dot: 'bg-violet-400', text: 'text-violet-600' },
  }
  const s = styles[color] || styles.orange

  const header = <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>

  if (!onClick) {
    return (
      <div className="relative overflow-hidden rounded-[22px] border border-orange-100/70 bg-white p-4 shadow-[0_12px_28px_-14px_rgba(120,53,15,0.22)]">
        <span className={`pointer-events-none absolute left-0 top-0 h-full w-1.5 ${s.bar}`} />
        <div className="flex items-center justify-between">
          {header}
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
        </div>
        <p className={`mt-2 text-[26px] font-black leading-none ${s.text}`}>{value}</p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full cursor-pointer overflow-hidden rounded-[22px] border border-orange-100/70 bg-white p-4 text-left shadow-[0_12px_28px_-14px_rgba(120,53,15,0.22)] transition hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_18px_36px_-14px_rgba(120,53,15,0.32)]"
    >
      <span className={`pointer-events-none absolute left-0 top-0 h-full w-1.5 ${s.bar}`} />
      <div className="flex items-center justify-between">
        {header}
        <span className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500">&rarr;</span>
      </div>
      <p className={`mt-2 text-[26px] font-black leading-none ${s.text}`}>{value}</p>
    </button>
  )
}

function AdminOrdersView() {
  return <AdminLiveOrdersBoard />
}

function AdminLiveOrdersBoard() {
  const { orders, tables, sessions, bills, previewOrderToken } = useRestaurant()
  const [showParcel, setShowParcel] = useState(false)
  /** Parcel order currently open in the billing modal (items → bill → payment → receipt). */
  const [billOrderId, setBillOrderId] = useState<string | null>(null)
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null)
  const [billingTarget, setBillingTarget] = useState<{ sessionId: string; tableId: string } | null>(null)
  const live = getPendingOrders(orders, sessions, bills, { includeParcel: true })
  const dineIn = live.filter((o) => o.orderType !== 'parcel')
  const parcels = live.filter((o) => o.orderType === 'parcel')

  /** Open the kitchen token receipt (parcel series -> `P-001`) of an existing order. */
  const openTokenReceipt = (orderId: string) => {
    const job = previewOrderToken(orderId)
    if (job) {
      setPreviewJob(job)
      setPreviewJobId(job.id)
    }
  }

  const byTable = Array.from(
    dineIn.reduce<Map<string, Order[]>>((m, o) => {
      const list = m.get(o.tableId) ?? []
      list.push(o)
      m.set(o.tableId, list)
      return m
    }, new Map<string, Order[]>()).entries()
  )

  const chip = (s: string) =>
    ({
      placed: 'bg-orange-100 text-orange-700',
      confirmed: 'bg-amber-100 text-amber-700',
      preparing: 'bg-blue-100 text-blue-700',
      ready: 'bg-emerald-100 text-emerald-700',
      served: 'bg-slate-100 text-slate-500',
    }[s] ?? 'bg-slate-100 text-slate-600')

  const summaries = [
    { label: 'Live', value: live.length, cls: 'bg-orange-50 text-orange-700' },
    { label: 'Preparing', value: live.filter((o) => o.status === 'preparing').length, cls: 'bg-amber-50 text-amber-700' },
    { label: 'Ready', value: live.filter((o) => o.status === 'ready').length, cls: 'bg-emerald-50 text-emerald-700' },
    { label: 'Parcels', value: parcels.length, cls: 'bg-sky-50 text-sky-700' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Live Orders</h2>
        </div>
        <button
          onClick={() => setShowParcel(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,0.5)] transition hover:from-orange-600 hover:to-amber-600"
        >
          <ShoppingBag size={16} /> Parcel Order
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaries.map((s) => (
          <div key={s.label} className={`rounded-[18px] px-4 py-3 ${s.cls}`}>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{s.label}</p>
            <p className="mt-1 text-2xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      {dineIn.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">No live orders right now. New orders appear here by table.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {byTable.map(([tableId, list]) => {
            const table = tables.find((t) => t.id === tableId)
            const latest = list[list.length - 1]
            return (
              <div key={tableId} className="overflow-hidden rounded-[20px] border border-orange-100 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-orange-100 bg-linear-to-r from-orange-50 to-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Table2 size={16} className="text-orange-600" />
                    <span className="font-black text-slate-900">{table?.name ?? 'Unknown Table'}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${chip(latest.status)}`}>
                    {latest.status.toUpperCase()}
                  </span>
                </div>
                <div className="space-y-2 p-4">
                  {list.map((order) => (
                    <div key={order.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {order.tokenNumber ? `TOKEN ${String(order.tokenNumber).padStart(3, '0')}` : 'DRAFT'}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {order.tokenNumber != null && (
                            <button
                              onClick={() => openTokenReceipt(order.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] font-bold text-orange-700 transition hover:bg-orange-100"
                            >
                              <Printer size={12} /> Token Receipt
                            </button>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chip(order.status)}`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {order.items.map((item) => (
                          <span key={item.id} className="mr-2">
                            {item.nameSnapshot}{servingSuffix(item.servingType)} x{item.quantity}
                          </span>
                        ))}
                      </div>
                      {/* Spice level / anything else the guest asked for */}
                      {order.items.some((item) => item.specialRequests) && (
                        <div className="mt-1 space-y-0.5">
                          {order.items.filter((item) => item.specialRequests).map((item) => (
                            <p key={`note-${item.id}`} className="text-[11px] font-bold text-orange-700">!! {item.specialRequests} !!</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {latest.sessionId && (
                    <button
                      type="button"
                      onClick={() => setBillingTarget({ sessionId: latest.sessionId, tableId })}
                      className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
                    >
                      <Receipt size={16} /> Generate Bill &amp; Take Payment
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {parcels.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-400">Takeaway Parcels</h3>
          <div className="space-y-2">
            {parcels.slice(0, 12).map((order) => (
              <div key={order.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {/* Parcel tokens are their OWN series (P-001) — never a waiter token. */}
                    <p className="font-black text-slate-900">PARCEL {formatOrderToken(order)}</p>
                    <p className="truncate text-xs text-slate-500">{order.items.map((i) => `${i.nameSnapshot}${servingSuffix(i.servingType)} x${i.quantity}`).join(' · ')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(() => {
                      const b = bills.find((bb) => bb.sessionId === order.sessionId)
                      return (
                        <button
                          onClick={() => setBillOrderId(order.id)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ` + (b?.status === 'PAID' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-linear-to-br from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600')}
                        >
                          <Receipt size={12} /> {b?.status === 'PAID' ? 'Bill ✓' : 'Bill'}
                        </button>
                      )
                    })()}
                    <button
                      onClick={() => openTokenReceipt(order.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] font-bold text-orange-700 transition hover:bg-orange-100"
                    >
                      <Printer size={12} /> Token Receipt
                    </button>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${chip(order.status)}`}>
                      {order.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                {order.items.some((i) => i.specialRequests) && (
                  <div className="space-y-0.5">
                    {order.items.filter((i) => i.specialRequests).map((i) => (
                      <p key={`parcel-note-${i.id}`} className="text-[11px] font-bold text-orange-700">!! {i.specialRequests} !!</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showParcel && <AdminParcelModal onClose={() => setShowParcel(false)} onBill={(id) => setBillOrderId(id)} />}
      {billOrderId && <AdminParcelBillModal orderId={billOrderId} onClose={() => setBillOrderId(null)} />}
      {previewJobId && previewJob && <PrintPreview previewJob={previewJob} onCancel={() => { setPreviewJobId(null); setPreviewJob(null) }} />}
      {billingTarget && (
        <AdminSessionBilling
          sessionId={billingTarget.sessionId}
          tableId={billingTarget.tableId}
          viewMode="orders"
          onClose={() => setBillingTarget(null)}
        />
      )}
    </div>
  )
}

function AdminParcelModal({ onClose, onBill }: { onClose: () => void; onBill: (orderId: string) => void }) {
  const { menu, categories, orders, createOrder, confirmOrder, printOrderToken, previewOrderToken } = useRestaurant()
  const { user } = useAuth()
  // Each parcel line carries the guest's spice level and any "customer says"
  // note — both travel with the item onto the parcel token receipt.
  // `servingType` keeps Full and Half variants on SEPARATE cart lines so the
  // order records the exact variant + price the guest chose.
  const [cart, setCart] = useState<{ menuItemId: string; name: string; price: number; quantity: number; spice?: string; note?: string; servingType: 'full' | 'half' }[]>([])
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  const [customer, setCustomer] = useState('')
  const [result, setResult] = useState<{ label: string; orderId: string } | null>(null)
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [previewJob, setPreviewJob] = useState<PrintJob | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Synchronous duplicate-submission guard: React state updates are batched,
  // so two clicks in the same tick could BOTH see `submitting === false`.
  // The ref is checked + flipped synchronously before any await — one parcel
  // can only ever mint one order, one PARCEL token and one print job.
  const submittingRef = useRef(false)
  const [category, setCategory] = useState<string | null>(null)
  const [q, setQ] = useState('')
  // Veg / Non-Veg comes from the dish's own menu `foodType` (the SAME helper and
  // the SAME authoritative menu records the waiter menu uses) — never guessed
  // from the dish name and never a second food-type database.
  const [foodTypeFilter, setFoodTypeFilter] = useFoodTypeFilter()
  const availableItems = menu.filter((m) => m.available && m.active)
  const activeCats = categories.filter((c) => c.active)
  const foodTypeCounts = countFoodTypes(availableItems)
  const items = availableItems.filter(
    (m) =>
      (!category || m.categoryId === category) &&
      matchesFoodType(m, foodTypeFilter) &&
      (!q || m.name.toLowerCase().includes(q.toLowerCase())),
  )
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)

  /** A dish offers a half plate only when a valid half price is configured. */
  const halfAvailable = (m: MenuItem) => hasHalfPlatePrice(m.halfPlatePrice)
  /** Price of one serving variant — the configured half price, never half/2. */
  const variantPrice = (m: MenuItem, serving: 'full' | 'half'): number =>
    serving === 'half' && hasHalfPlatePrice(m.halfPlatePrice) ? m.halfPlatePrice : m.price

  // const addItem = (m: MenuItem, serving: 'full' | 'half' = 'full') => {
  //   const servingType: 'full' | 'half' = serving === 'half' && hasHalfPlatePrice(m.halfPlatePrice) ? 'half' : 'full'
  //   const price = variantPrice(m, servingType)
  //   setCart((prev) => {
  //     const ex = prev.find((x) => x.menuItemId === m.id && x.servingType === servingType)
  //     if (ex) return prev.map((x) => (x.menuItemId === m.id && x.servingType === servingType ? { ...x, quantity: x.quantity + 1 } : x))
  //     return [...prev, { menuItemId: m.id, name: m.name, price, quantity: 1, servingType }]
  //   })
  // }

  const addItem = (m: MenuItem, serving: 'full' | 'half' = 'full') => {
    const servingType: 'full' | 'half' =
      serving === 'half' && hasHalfPlatePrice(m.halfPlatePrice) ? 'half' : 'full'
    const price = variantPrice(m, servingType)
    setCart((prev) => {
      // Already in cart for this serving → do not increase quantity.
      // Quantity is managed only from the cart controls below.
      if (prev.some((x) => x.menuItemId === m.id && x.servingType === servingType)) {
        return prev
      }
      return [
        ...prev,
        { menuItemId: m.id, name: m.name, price, quantity: 1, servingType },
      ]
    })
  }
  const setQty = (menuItemId: string, serving: 'full' | 'half', q: number) =>
    setCart((prev) => prev.map((x) => (x.menuItemId === menuItemId && x.servingType === serving ? { ...x, quantity: Math.max(0, q) } : x)).filter((x) => x.quantity > 0))
  const setSpice = (menuItemId: string, serving: 'full' | 'half', spice: string) =>
    setCart((prev) => prev.map((x) => (x.menuItemId === menuItemId && x.servingType === serving ? { ...x, spice: x.spice === spice ? undefined : spice } : x)))
  const setNote = (menuItemId: string, serving: 'full' | 'half', note: string) =>
    setCart((prev) => prev.map((x) => (x.menuItemId === menuItemId && x.servingType === serving ? { ...x, note } : x)))
  /** Quick-pick chips append/remove their wording from the free-text note. */
  const toggleNoteOption = (menuItemId: string, serving: 'full' | 'half', option: string) =>
    setCart((prev) => prev.map((x) => {
      if (x.menuItemId !== menuItemId || x.servingType !== serving) return x
      const parts = (x.note ?? '').split(' · ').map((s) => s.trim()).filter(Boolean)
      const next = parts.includes(option) ? parts.filter((part) => part !== option) : [...parts, option]
      return { ...x, note: next.join(' · ') }
    }))

  const submit = async () => {
    // Hard duplicate-submission guard (ref is synchronous, state drives the UI).
    if (submittingRef.current) return
    setError('')
    if (cart.length === 0) { setError('Add at least one item.'); return }
    submittingRef.current = true
    setSubmitting(true)
    try {
      // Prevent duplicate parcel creation: check if there's already an unconfirmed
      // parcel order for this session/user. This is a UX safeguard; the token
      // allocation via nextTokenNumber() is already atomic via Firestore transactions.
      const existingParcel = orders.find(o =>
        o.orderType === 'parcel' &&
        o.status === 'placed' &&
        o.waiterId === (user?.id ?? 'admin')
      )
      if (existingParcel) {
        throw new Error('A parcel order is already being created. Please confirm it first.')
      }
      const order = await createOrder('parcel', user?.id ?? 'admin', `parcel-${Date.now()}`, cart.map((i) => ({
        menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity,
        specialRequests: buildSpecialRequests(i.spice, [], i.note),
        servingType: i.servingType,
      })), 'normal', 'parcel')
      // Confirming a parcel mints a PARCEL token (own series). Queue it
      // immediately so the kitchen never depends on a second button click.
      const confirmed = order?.id ? confirmOrder(order.id) : null
      if (!confirmed?.id) throw new Error('Parcel order could not be confirmed')
      printOrderToken(confirmed.id)
      setResult({ label: `PARCEL ${formatOrderToken(confirmed)}`, orderId: confirmed.id })
      setCart([])
      setOptionsFor(null)
    } catch (err) {
      // Error: release the guard so the operator can retry immediately.
      setError(err instanceof Error ? err.message : 'Could not create parcel order')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-linear-to-br from-orange-500 to-amber-500 px-5 py-4 text-white">
          <div><p className="text-[11px] font-bold uppercase tracking-widest text-orange-100">Takeaway</p><h3 className="text-2xl font-black">Parcel Order</h3></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/20" aria-label="Close"><X size={20} /></button>
        </div>

        {result ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={30} /></div>
            <p className="text-4xl font-black tracking-wider text-slate-900">{result.label}</p>
            <p className="mt-1 text-sm text-slate-500">Parcel token receipt sent to the kitchen printer · {customer || 'Walk-in'}</p>
            <p className="mt-1 text-xs text-slate-400">Parcels run on their own token series (P-001 …) — they never share numbers with waiter tokens.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => { const job = previewOrderToken(result.orderId); if (job) { setPreviewJob(job); setPreviewJobId(job.id) } }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-5 py-2.5 text-sm font-bold text-orange-700 hover:bg-orange-100"
              >
                <Printer size={16} /> Parcel Token Receipt
              </button>
              {/* Straight to billing: items → Generate Bill → payment → receipt */}
              <button
                onClick={() => { onBill(result.orderId); onClose() }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-linear-to-br from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:from-orange-600 hover:to-amber-600"
              >
                <Receipt size={16} /> Bill
              </button>
              <button onClick={onClose} className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600">Done</button>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr,300px]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setCategory(null)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!category ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-orange-100'}`}>All</button>
                {activeCats.map((c) => (
                  <button key={c.id} onClick={() => setCategory(c.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${category === c.id ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-orange-100'}`}>{c.name}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {foodTypeFilters.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFoodTypeFilter(f)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      foodTypeFilter === f
                        ? f === 'veg'
                          ? 'bg-emerald-600 text-white'
                          : f === 'non_veg'
                            ? 'bg-red-600 text-white'
                            : 'bg-linear-to-br from-orange-500 to-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-orange-100'
                    }`}
                  >
                    {f === 'all' ? `All (${foodTypeCounts.all})` : f === 'veg' ? `Veg (${foodTypeCounts.veg})` : `Non-Veg (${foodTypeCounts.non_veg})`}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes…" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400" />
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-slate-400">No dishes found.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {items.map((m) => (
                    <div key={m.id} className="flex overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.imageAlt || m.name} className="h-full w-24 shrink-0 object-cover" />
                      ) : (
                        <div className="flex h-full w-24 shrink-0 items-center justify-center bg-linear-to-br from-orange-100 to-amber-100"><UtensilsCrossed size={20} className="text-orange-400" /></div>
                      )}
                      <div className="flex flex-1 flex-col p-2.5">
                        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><FoodTypeMark foodType={m.foodType} isVeg={m.isVeg} size="sm" withLabel /><span className="truncate">{m.name}</span></h3>
                        {m.description && <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{m.description}</p>}
                        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
                          <div>
                            <p className="text-sm font-black text-[#8a1b1b]">₹{m.price}{halfAvailable(m) && <span className="ml-1 text-[10px] font-bold text-emerald-600">HALF ₹{m.halfPlatePrice}</span>}</p>
                            <p className="flex items-center gap-0.5 text-[10px] text-slate-400"><Clock size={10} /> {m.preparationTime}m</p>
                          </div>
                          {/* {halfAvailable(m) ? (
                            <div className="flex gap-1">
                              <button onClick={() => addItem(m, 'full')} className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700"><Plus size={11} /> FULL</button>
                              <button onClick={() => addItem(m, 'half')} className="inline-flex items-center gap-0.5 rounded-lg bg-teal-600 px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-teal-700"><Plus size={11} /> HALF</button>
                            </div>
                          ) : (
                            <button onClick={() => addItem(m)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"><Plus size={12} /> Add</button>
                          )} */}
                          {/* {halfAvailable(m) ? (
                            <div className="flex gap-1">
                              {(() => {
                                const fullInCart = cart.some((x) => x.menuItemId === m.id && x.servingType === 'full')
                                const halfInCart = cart.some((x) => x.menuItemId === m.id && x.servingType === 'half')
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => addItem(m, 'full')}
                                      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white transition ${
                                        fullInCart
                                          ? 'bg-slate-500 hover:bg-slate-600'
                                          : 'bg-emerald-600 hover:bg-emerald-700'
                                      }`}
                                    >
                                      {fullInCart ? (
                                        <><CheckCircle2 size={11} /> Added FULL</>
                                      ) : (
                                        <><Plus size={11} /> FULL</>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addItem(m, 'half')}
                                      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white transition ${
                                        halfInCart
                                          ? 'bg-slate-500 hover:bg-slate-600'
                                          : 'bg-teal-600 hover:bg-teal-700'
                                      }`}
                                    >
                                      {halfInCart ? (
                                        <><CheckCircle2 size={11} /> Added HALF</>
                                      ) : (
                                        <><Plus size={11} /> HALF</>
                                      )}
                                    </button>
                                  </>
                                )
                              })()}
                            </div>
                          ) : (
                            (() => {
                              const inCart = cart.some((x) => x.menuItemId === m.id)
                              return (
                                <button
                                  type="button"
                                  onClick={() => addItem(m)}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white transition ${
                                    inCart
                                      ? 'bg-slate-500 hover:bg-slate-600'
                                      : 'bg-emerald-600 hover:bg-emerald-700'
                                  }`}
                                >
                                  {inCart ? (
                                    <><CheckCircle2 size={12} /> Added</>
                                  ) : (
                                    <><Plus size={12} /> Add</>
                                  )}
                                </button>
                              )
                            })()
                          )} */}

                          {halfAvailable(m) ? (
                            <div className="flex gap-1">
                              {(() => {
                                const fullInCart = cart.some(
                                  (x) => x.menuItemId === m.id && x.servingType === 'full',
                                )
                                const halfInCart = cart.some(
                                  (x) => x.menuItemId === m.id && x.servingType === 'half',
                                )
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!fullInCart) addItem(m, 'full')
                                      }}
                                      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                                        fullInCart
                                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      }`}
                                    >
                                      {fullInCart ? (
                                        <>
                                          <CheckCircle2 size={11} /> Added FULL
                                        </>
                                      ) : (
                                        <>
                                          <Plus size={11} /> FULL
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!halfInCart) addItem(m, 'half')
                                      }}
                                      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                                        halfInCart
                                          ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                                          : 'bg-teal-600 text-white hover:bg-teal-700'
                                      }`}
                                    >
                                      {halfInCart ? (
                                        <>
                                          <CheckCircle2 size={11} /> Added HALF
                                        </>
                                      ) : (
                                        <>
                                          <Plus size={11} /> HALF
                                        </>
                                      )}
                                    </button>
                                  </>
                                )
                              })()}
                            </div>
                          ) : (
                            (() => {
                              const inCart = cart.some((x) => x.menuItemId === m.id)
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!inCart) addItem(m)
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                                    inCart
                                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  }`}
                                >
                                  {inCart ? (
                                    <>
                                      <CheckCircle2 size={12} /> Added
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={12} /> Add
                                    </>
                                  )}
                                </button>
                              )
                            })()
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Cart</p>
                {cart.length === 0 ? <p className="text-sm text-slate-400">No items yet.</p> : (
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {cart.map((i) => (
                      <div key={`${i.menuItemId}:${i.servingType}`} className="rounded-lg bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-slate-800">
                            <FoodTypeMark foodType={menu.find((m) => m.id === i.menuItemId)?.foodType} isVeg={menu.find((m) => m.id === i.menuItemId)?.isVeg} size="sm" />
                            <span className="min-w-0 truncate">{i.name}</span>
                            {i.servingType === 'half' && <span className="shrink-0 rounded bg-teal-100 px-1 text-[10px] font-black text-teal-700">HALF</span>}
                          </span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setQty(i.menuItemId, i.servingType, i.quantity - 1)} className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200"><Minus size={12} /></button>
                            <span className="w-5 text-center text-sm font-bold">{i.quantity}</span>
                            <button onClick={() => setQty(i.menuItemId, i.servingType, i.quantity + 1)} className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-600 hover:bg-slate-200"><Plus size={12} /></button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOptionsFor(optionsFor === `${i.menuItemId}:${i.servingType}` ? null : `${i.menuItemId}:${i.servingType}`)}
                          className="mt-1 block w-full truncate text-left text-[10px] font-bold text-orange-600 hover:text-orange-700"
                        >
                          {i.spice || i.note ? `Spice: ${i.spice ?? '—'}${i.note ? ` · ${i.note}` : ''}` : '+ Spice / customer note'}
                        </button>
                        {optionsFor === `${i.menuItemId}:${i.servingType}` && (
                          <div className="mt-1.5 space-y-1.5 rounded-lg border border-orange-200 bg-white p-2">
                            <div className="flex flex-wrap gap-1">
                              {SPICE_LEVELS.map((level) => (
                                <button
                                  key={level}
                                  type="button"
                                  onClick={() => setSpice(i.menuItemId, i.servingType, level)}
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${i.spice === level ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50'}`}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {CUSTOMER_NOTE_OPTIONS.map((opt) => {
                                const active = (i.note ?? '').split(' · ').map((s) => s.trim()).includes(opt)
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => toggleNoteOption(i.menuItemId, i.servingType, opt)}
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'}`}
                                  >
                                    {opt}
                                  </button>
                                )
                              })}
                            </div>
                            <input
                              value={i.note ?? ''}
                              onChange={(e) => setNote(i.menuItemId, i.servingType, e.target.value)}
                              placeholder="Anything else the customer said…"
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-orange-400"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="flex justify-between text-sm font-semibold text-slate-600"><span>Total</span><span className="text-lg font-black text-slate-900">₹{cartTotal.toFixed(2)}</span></div>
              <button
                onClick={submit}
                disabled={cart.length === 0 || submitting}
                className="w-full rounded-xl bg-linear-to-br from-orange-500 to-amber-500 px-4 py-3 font-bold text-white transition hover:from-orange-600 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Confirming…' : 'Confirm Parcel'}
              </button>
            </div>
          </div>
        )}
      </div>
      {previewJobId && previewJob && <PrintPreview previewJob={previewJob} onCancel={() => { setPreviewJobId(null); setPreviewJob(null) }} />}
    </div>
  )
}

function AdminPaymentsView() {
  const { paymentRecords, tables, sessions, bills } = useRestaurant()
  const { users } = useAuth()
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [sub, setSub] = useState<'payments' | 'purchases' | 'billing' | 'tokens'>('payments')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [detail, setDetail] = useState<typeof paymentRecords[number] | null>(null)

  const subTabs: { id: 'payments' | 'purchases' | 'billing' | 'tokens'; label: string; icon: React.ReactNode }[] = [
    { id: 'payments', label: 'Payments', icon: <CreditCard size={14} /> },
    { id: 'purchases', label: 'Purchase History', icon: <ShoppingBag size={14} /> },
    { id: 'billing', label: 'Billing History', icon: <Receipt size={14} /> },
    { id: 'tokens', label: 'Token History', icon: <Ticket size={14} /> },
  ]

  const filteredRecords = paymentRecords
    .filter((r) => r.kind !== 'purchase' && (showAll || sameDay(r.recordedAt, selectedDate)))
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.recordedAt - b.recordedAt
        case 'amount_high': return b.amount - a.amount
        case 'amount_low': return a.amount - b.amount
        default: return b.recordedAt - a.recordedAt
      }
    })
  const dayTotal = filteredRecords.reduce((sum, r) => sum + r.amount, 0)

  const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d)) }
  const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toDateStr(d)) }
  const goToday = () => setSelectedDate(toDateStr(new Date()))

  const waiterNameOf = (id: string) => {
    const u = users.find((u) => u.id === id)
    if (u) return u.name
    const t = tables.find((t) => t.id === id)
    return t?.name ?? id.slice(0, 8)
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Payments / Billing History / Token History */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-orange-100 bg-white p-1.5 shadow-[0_8px_18px_-10px_rgba(120,53,15,0.3)]">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              sub === t.id
                ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white shadow-[0_2px_8px_-3px_rgba(249,115,22,0.5)]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'purchases' && <AdminPurchaseHistory />}
      {sub === 'billing' && <AdminBillingView />}
      {sub === 'tokens' && <AdminTokensView />}

      {sub === 'payments' && (
        <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">Payment History</h2>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <button onClick={prevDay} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} disabled={showAll} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:opacity-40" />
          <button onClick={nextDay} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <button onClick={goToday} className="rounded-lg bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200">Today</button>
          <button onClick={() => setShowAll(!showAll)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${showAll ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All Time</button>
          {/* Sort dropdown */}
          <div className="relative">
            <button onClick={() => setSortOpen(!sortOpen)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
              <ArrowUpDown size={14} /> Sort
            </button>
            {sortOpen && (
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {([
                  { id: 'newest', label: 'Newest first' },
                  { id: 'oldest', label: 'Oldest first' },
                  { id: 'amount_high', label: 'Amount (high → low)' },
                  { id: 'amount_low', label: 'Amount (low → high)' },
                ] as const).map((opt) => (
                  <button key={opt.id} onClick={() => { setSortBy(opt.id); setSortOpen(false) }} className={`block w-full px-3 py-2 text-left text-xs font-semibold hover:bg-orange-50 ${sortBy === opt.id ? 'text-orange-600' : 'text-slate-600'}`}>
                    {opt.label}{sortBy === opt.id ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-sm text-slate-500">{showAll ? 'All time' : selectedDate} · {filteredRecords.length} payment(s) · ₹{dayTotal.toLocaleString()} total</p>

      {filteredRecords.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No recorded payments on this date.</p>
          <p className="mt-1 text-sm text-slate-400">Waiter-recorded payments appear here.</p>
        </div>
      ) : (
        <div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <table className="min-w-225 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-2">Bill No</th><th>Date/Time</th><th>Table</th><th>Session</th><th>Waiter</th><th>Amount</th><th>Mode</th><th>Status</th><th className="text-right pr-2">Details</th>
              </tr>
              </thead>
            <tbody>
              {filteredRecords.map((r) => {
                const table = tables.find((t) => t.id === r.tableId)
                const session = sessions.find((s) => s.id === r.sessionId)
                const bill = bills.find((b) => b.id === r.billId)
                return (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 font-semibold">{r.billNumber ?? bill?.billNumber ?? '—'}</td>
                    <td>{new Date(r.recordedAt).toLocaleString()}</td>
                    <td>{table?.name ?? r.tableId}</td>
                    <td>{session?.id.slice(0, 8) ?? '-'}</td>
                    <td>{waiterNameOf(r.waiterId)}</td>
                    <td>₹{r.amount.toFixed(2)}</td>
                    <td className="capitalize">{r.paymentMode.replace(/_/g, ' ')}</td>
                    <td><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{r.status}</span></td>
                    <td className="pr-2 text-right"><button onClick={() => setDetail(r)} className="rounded-lg bg-slate-100 p-1.5 text-slate-500 hover:bg-orange-100 hover:text-orange-600"><Eye size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {filteredRecords.map((r) => {
            const table = tables.find((t) => t.id === r.tableId)
            const bill = bills.find((b) => b.id === r.billId)
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{r.billNumber ?? bill?.billNumber ?? 'Bill number unavailable'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{table?.name ?? r.tableId} · {new Date(r.recordedAt).toLocaleString()}</p>
                  </div>
                  <p className="shrink-0 text-base font-black text-slate-900">₹{r.amount.toFixed(2)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="capitalize">{r.paymentMode.replace(/_/g, ' ')}</span>
                  <span>{waiterNameOf(r.waiterId)}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">{r.status}</span>
                  <button onClick={() => setDetail(r)} className="ml-auto inline-flex items-center gap-1 font-bold text-orange-600"><Eye size={14} /> Details</button>
                </div>
              </div>
            )
          })}
        </div>
        </div>
        )}
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Payment Details</h3>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-2 text-sm">
              {([
                ['Bill number', detail.billNumber ?? bills.find((b) => b.id === detail.billId)?.billNumber ?? 'Unavailable'],
                ['Amount', `₹${detail.amount.toFixed(2)}`],
                ['Payment mode', detail.paymentMode.replace(/_/g, ' ')],
                ['Status', detail.status],
                ['Table', tables.find((t) => t.id === detail.tableId)?.name ?? detail.tableId],
                ['Session', sessions.find((s) => s.id === detail.sessionId)?.id ?? detail.sessionId],
                ['Recorded by', waiterNameOf(detail.waiterId)],
                ['Date & time', new Date(detail.recordedAt).toLocaleString()],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-1.5 last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-right font-semibold capitalize text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminAnalyticsView({ onOpenInventory }: { onOpenInventory?: () => void }) {
  const { orders, sessions, paymentRecords, bills, tables, inventory, purchaseRequests } = useRestaurant()

  // Central period state. anchorDateStr is the "focus" date that determines
  // the boundaries of the currently selected week/month/year, or the exact
  // calendar day for Custom.
  const [period, setPeriod] = useState<PeriodType>('week')
  const [anchorDateStr, setAnchorDateStr] = useState(toDateStr(new Date()))

  const range = rangeForPeriod(period, anchorDateStr)
  const inThisRange = (ts: number) => inRange(range, ts)

  const periodOrders = orders.filter((o) => inThisRange(o.createdAt))
  const periodSessions = sessions.filter((s) => inThisRange(s.startTime))
  const periodPayments = paymentRecords.filter((p) => inThisRange(p.recordedAt))
  const periodBills = bills.filter((b) => inThisRange(b.generatedAt))

  // ── Top summary cards (respect the selected period) ─────────────────────────
  const totalRevenue = periodPayments.reduce((sum, p) => sum + p.amount, 0)
  const completedOrders = periodOrders.filter((o) => o.status === 'served').length
  const cancelledOrders = periodOrders.filter((o) => o.status === 'cancelled').length
  const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0

  const totalSessions = periodSessions.length
  const activeSessions = periodSessions.filter((s) => s.status === 'active').length
  const totalGuests = periodSessions.reduce((sum, s) => sum + s.guestCount, 0)
  const avgGuestsPerSession = totalSessions > 0 ? (totalGuests / totalSessions).toFixed(1) : '0'

  const occupiedTables = tables.filter((t) => t.status === 'occupied').length
  const totalTables = tables.filter((t) => t.active).length
  const tableUtilization = totalTables > 0 ? ((occupiedTables / totalTables) * 100).toFixed(0) : '0'

  // ── Top dishes (served/ready orders in the selected period) ──────────────────
  const dishSales: Record<string, { name: string; qty: number; revenue: number }> = {}
  periodOrders.filter((o) => o.status === 'served' || o.status === 'ready').forEach((o) => {
    o.items.forEach((item) => {
      if (!dishSales[item.menuItemId]) dishSales[item.menuItemId] = { name: item.nameSnapshot, qty: 0, revenue: 0 }
      dishSales[item.menuItemId].qty += item.quantity
      dishSales[item.menuItemId].revenue += item.priceSnapshot * item.quantity
    })
  })
  const topDishes = Object.values(dishSales).sort((a, b) => b.qty - a.qty).slice(0, 5)

  // ── Payment modes (selected period only) ──────────────────────────────────────
  const paymentModes: Record<string, number> = {}
  periodPayments.forEach((p) => { paymentModes[p.paymentMode] = (paymentModes[p.paymentMode] || 0) + p.amount })

  // ── Low stock / pending requests — NOT period-filtered (operational now) ──────
  const outOfStockItems = inventory.filter((i) => i.status === 'OUT_OF_STOCK')
  const lowStock = inventory.filter((i) => i.status === 'LOW' || i.status === 'CRITICAL')
  const pendingRequests = purchaseRequests.filter((r) => r.status === 'PENDING')

  // ── Navigation appropriate to the selected period ────────────────────────────
  const navigate = (delta: number) => {
    const d = new Date(anchorDateStr + 'T00:00:00Z')
    if (period === 'week') {
      d.setUTCDate(d.getUTCDate() + delta * 7)
    } else if (period === 'month') {
      d.setUTCMonth(d.getUTCMonth() + delta)
    } else if (period === 'year') {
      d.setUTCFullYear(d.getUTCFullYear() + delta)
    } else {
      d.setUTCDate(d.getUTCDate() + delta)
    }
    setAnchorDateStr(toDateStr(d))
  }

  const goToday = () => {
    setPeriod('custom')
    setAnchorDateStr(toDateStr(new Date()))
  }

  // ── Trend breakdown (respects the selected period) ────────────────────────────
  type TrendRow = { label: string; value: number }
  const revenueTrend: TrendRow[] = []
  if (period === 'week') {
    const weekStart = startOfWeek(anchorDateStr)
    for (let i = 0; i < 7; i++) {
      const dayStart = weekStart + i * 86400000
      const dayEnd = dayStart + 86400000 - 1
      const dayRev = periodPayments
        .filter((p) => p.recordedAt >= dayStart && p.recordedAt <= dayEnd)
        .reduce((s, p) => s + p.amount, 0)
      revenueTrend.push({ label: fmtDate(dayStart), value: dayRev })
    }
  } else if (period === 'month') {
    const monthEnd = endOfMonth(anchorDateStr)
    const daysInMonth = new Date(monthEnd).getUTCDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = Date.UTC(Number(anchorDateStr.slice(0, 4)), Number(anchorDateStr.slice(5, 7)) - 1, d, 0, 0, 0, 0)
      const dayEnd = dayStart + 86400000 - 1
      const dayRev = periodPayments
        .filter((p) => p.recordedAt >= dayStart && p.recordedAt <= dayEnd)
        .reduce((s, p) => s + p.amount, 0)
      revenueTrend.push({ label: fmtDate(dayStart), value: dayRev })
    }
  } else if (period === 'year') {
    for (let m = 0; m < 12; m++) {
      const monthStart = Date.UTC(Number(anchorDateStr.slice(0, 4)), m, 1, 0, 0, 0, 0)
      const monthEnd = new Date(Date.UTC(Number(anchorDateStr.slice(0, 4)), m + 1, 0))
      monthEnd.setUTCHours(23, 59, 59, 999)
      const monthRev = periodPayments
        .filter((p) => p.recordedAt >= monthStart && p.recordedAt <= monthEnd.getTime())
        .reduce((s, p) => s + p.amount, 0)
      revenueTrend.push({ label: fmtMonth(monthStart), value: monthRev })
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Heading + period selector ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Analytics</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['week', 'month', 'year', 'custom'] as PeriodType[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-none border-0 px-3 py-1.5 text-xs font-bold transition ${
                  period === p
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'Custom'}
              </button>
            ))}
          </div>

          {/* Navigation + date/range picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>

            {period === 'custom' ? (
              <input
                type="date"
                value={anchorDateStr}
                onChange={(e) => setAnchorDateStr(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            ) : (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 min-w-35 text-center select-none">
                {period === 'week' && (
                  <>
                    {new Date(startOfWeek(anchorDateStr)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(endOfWeek(anchorDateStr)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </>
                )}
                {period === 'month' && (
                  <>
                    {new Date(startOfMonth(anchorDateStr)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </>
                )}
                {period === 'year' && (
                  <>{new Date(startOfYear(anchorDateStr)).getUTCFullYear()}</>
                )}
              </span>
            )}

            <button
              onClick={() => navigate(1)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>

            <button
              onClick={goToday}
              className="rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-200 transition"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Selected period label */}
      <p className="text-sm font-semibold text-slate-500 pl-1">{range.label}</p>

      {/* Top summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Revenue</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">₹{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bills</p>
          <p className="mt-1 text-2xl font-black text-blue-600">{periodBills.length}</p>
        </div>
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Orders</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{periodOrders.length}</p>
        </div>
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Guests</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{totalGuests}</p>
        </div>
      </div>

      {/* Revenue Trend */}
      {revenueTrend.length > 0 && (
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="mb-3 text-sm font-bold text-slate-700">Revenue Trend</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {revenueTrend.map((row, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-semibold text-slate-900">₹{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="mb-2 text-sm font-bold text-slate-700">Order Summary</p>
          <div className="space-y-1 text-sm text-slate-600">
            <div className="flex justify-between"><span>Completed</span><span className="font-semibold text-emerald-600">{completedOrders}</span></div>
            <div className="flex justify-between"><span>Cancelled</span><span className="font-semibold text-red-600">{cancelledOrders}</span></div>
            <div className="flex justify-between"><span>Avg Order Value</span><span className="font-semibold">₹{avgOrderValue.toFixed(0)}</span></div>
          </div>
        </div>
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="mb-2 text-sm font-bold text-slate-700">Sessions & Tables</p>
          <div className="space-y-1 text-sm text-slate-600">
            <div className="flex justify-between"><span>Total Sessions</span><span className="font-semibold">{totalSessions}</span></div>
            <div className="flex justify-between"><span>Active</span><span className="font-semibold text-blue-600">{activeSessions}</span></div>
            <div className="flex justify-between"><span>Avg Guests/Session</span><span className="font-semibold">{avgGuestsPerSession}</span></div>
            <div className="flex justify-between"><span>Table Utilization</span><span className="font-semibold">{tableUtilization}%</span></div>
          </div>
        </div>
      </div>

      {topDishes.length > 0 && (
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="mb-2 text-sm font-bold text-slate-700">Top Dishes</p>
          <div className="space-y-1">
            {topDishes.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{i + 1}. {d.name}</span>
                <span className="text-slate-500">{d.qty} sold · ₹{d.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(paymentModes).length > 0 && (
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <p className="mb-2 text-sm font-bold text-slate-700">Payment Modes</p>
          <div className="space-y-1">
            {Object.entries(paymentModes).map(([mode, amount]) => (
              <div key={mode} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-700">{mode.replace(/_/g, ' ')}</span>
                <span className="font-semibold text-slate-900">₹{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(outOfStockItems.length > 0 || lowStock.length > 0 || pendingRequests.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {outOfStockItems.length > 0 && (
            <div className="rounded-[20px] border border-slate-300 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-bold text-slate-700">Out of Stock ({outOfStockItems.length})</p>
              <div className="space-y-1">
                {outOfStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-800">{item.name}</span>
                    <span className="font-semibold text-slate-600">OUT OF STOCK</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onOpenInventory?.()}
                className="mt-2 text-xs font-bold text-slate-500 underline hover:text-slate-700"
              >
                Open inventory
              </button>
            </div>
          )}
          {lowStock.length > 0 && (
            <div className="rounded-[20px] border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-bold text-red-700">Low Stock ({lowStock.length})</p>
              <div className="space-y-1">
                {lowStock.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-red-800">{item.name}</span>
                    <span className="font-semibold text-red-600">{item.quantity} {item.unit} / min {item.minimumThreshold}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onOpenInventory?.()}
                className="mt-2 text-xs font-bold text-red-500 underline hover:text-red-700"
              >
                Open inventory
              </button>
            </div>
          )}
          {pendingRequests.length > 0 && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-bold text-amber-700">Pending Requests ({pendingRequests.length})</p>
              <div className="space-y-1">
                {pendingRequests.slice(0, 5).map((req) => (
                  <div key={req.id} className="flex items-center justify-between text-sm">
                    <span className="text-amber-800">{req.itemName}</span>
                    <span className="font-semibold text-amber-600">{req.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AdminWaiterAnalytics dateRange={range} period={period} />
    </div>
  )
}

/** Build the editable form snapshot from persisted settings, with numeric
 * coercion so a legacy string value like "010" is shown as 10 (never "010"). */
const buildSettingsForm = (settings: RestaurantSettings) => ({
  restaurantName: settings.restaurantName,
  address: settings.address,
  phone: settings.phone,
  email: settings.email,
  gstin: settings.gstin,
  fssaiLicenseNumber: settings.fssaiLicenseNumber,
  currency: settings.currency,
  cgst: toSettingsNumber(toSettingsNumber(settings.taxRate) / 2),
  sgst: toSettingsNumber(toSettingsNumber(settings.taxRate) / 2),
  serviceCharge: toSettingsNumber(settings.serviceCharge),
  serviceChargeMode: settings.serviceChargeMode,
  parcelCharge: toSettingsNumber(settings.parcelCharge),
  receiptFooter: settings.receiptFooter,
  tokenFooter: settings.tokenFooter,
  paper58mm: settings.paper58mm,
  prepWarningMinutes: toSettingsNumber(settings.prepWarningMinutes),
  businessHoursStart: settings.businessHoursStart,
  businessHoursEnd: settings.businessHoursEnd,
  tokenPrinterName: settings.tokenPrinterName,
  billPrinterName: settings.billPrinterName,
  kitchenPrintServerUrl: settings.kitchenPrintServerUrl,
  adminPrintServerUrl: settings.adminPrintServerUrl,
  printRetryCount: toSettingsNumber(settings.printRetryCount),
})

function AdminSettingsView() {
  const { settings, updateSettings, resetRestaurantData, settingsHydration } = useRestaurant()
  const [form, setForm] = useState(() => buildSettingsForm(settings))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [resetStage, setResetStage] = useState<'idle' | 'confirm' | 'done'>('idle')
  // Fields the operator has typed into during this edit session. They are the
  // ONLY fields that may not be re-synced from Firestore underneath the form.
  const touchedRef = useRef(new Set<keyof ReturnType<typeof buildSettingsForm>>())

  const updateField = (patch: Partial<ReturnType<typeof buildSettingsForm>>) => {
    Object.keys(patch).forEach((key) =>
      touchedRef.current.add(key as keyof ReturnType<typeof buildSettingsForm>),
    )
    setForm((prev) => ({ ...prev, ...patch }))
  }

  // Persisted snapshot — Save enables only when the form differs from storage.
  const saved = buildSettingsForm(settings)
  const savedJson = JSON.stringify(saved)
  const savedRef = useRef(saved)
  savedRef.current = saved
  const dirty = JSON.stringify(form) !== savedJson

  // Hydration (or another device) changes the stored settings asynchronously.
  // Re-sync every field the operator has NOT edited, otherwise the form would
  // keep showing pre-hydration defaults and a Save would write them back.
  useEffect(() => {
    const next = savedRef.current
    setForm((prev) => {
      let changed = false
      const merged: Record<string, unknown> = { ...prev }
      for (const [key, value] of Object.entries(next)) {
        if (touchedRef.current.has(key as keyof typeof next)) continue
        if (merged[key] !== value) {
          merged[key] = value
          changed = true
        }
      }
      return changed ? (merged as unknown as typeof prev) : prev
    })
  }, [savedJson])

  const handleSave = async () => {
    setMessage(null)
    if (settingsHydration === 'pending') {
      setMessage({ kind: 'error', text: 'Still loading the saved settings from Firestore — try again in a moment.' })
      return
    }
    if (settingsHydration === 'error') {
      setMessage({
        kind: 'error',
        text: 'The saved settings could not be verified with Firestore. Reload the page before saving so nothing is overwritten.',
      })
      return
    }
    if (!form.restaurantName.trim()) {
      setMessage({ kind: 'error', text: 'Restaurant name is required.' })
      return
    }
    if (form.cgst < 0 || form.sgst < 0 || form.cgst + form.sgst > 50) {
      setMessage({ kind: 'error', text: 'CGST + SGST must be between 0 and 50%.' })
      return
    }
    if (form.serviceCharge < 0 || (form.serviceChargeMode === 'percent' && form.serviceCharge > 50)) {
      setMessage({ kind: 'error', text: form.serviceChargeMode === 'percent' ? 'Service charge percent must be between 0 and 50%.' : 'Service charge (₹) cannot be negative.' })
      return
    }
    if (form.parcelCharge < 0) {
      setMessage({ kind: 'error', text: 'Parcel charge cannot be negative.' })
      return
    }
    if (form.printRetryCount < 1 || form.printRetryCount > 10) {
      setMessage({ kind: 'error', text: 'Print retry count must be between 1 and 10.' })
      return
    }
    setSaving(true)
    try {
      await updateSettings({
        restaurantName: form.restaurantName.trim(),
        address: form.address,
        phone: form.phone,
        email: form.email,
        gstin: form.gstin,
        fssaiLicenseNumber: form.fssaiLicenseNumber,
        currency: form.currency,
        taxRate: toSettingsNumber(Math.round((form.cgst + form.sgst) * 100) / 100),
        serviceCharge: toSettingsNumber(form.serviceCharge),
        serviceChargeMode: form.serviceChargeMode,
        parcelCharge: toSettingsNumber(form.parcelCharge),
        receiptFooter: form.receiptFooter,
        tokenFooter: form.tokenFooter,
        paper58mm: form.paper58mm,
        prepWarningMinutes: toSettingsNumber(form.prepWarningMinutes),
        businessHoursStart: form.businessHoursStart,
        businessHoursEnd: form.businessHoursEnd,
        tokenPrinterName: form.tokenPrinterName,
        billPrinterName: form.billPrinterName,
        kitchenPrintServerUrl: form.kitchenPrintServerUrl.trim(),
        adminPrintServerUrl: form.adminPrintServerUrl.trim(),
        printRetryCount: toSettingsNumber(form.printRetryCount),
      })
      // Persisted successfully — subsequent Firestore snapshots may re-sync the form.
      touchedRef.current.clear()
      setMessage({ kind: 'ok', text: 'Settings saved successfully' })
      window.setTimeout(() => {
  setMessage(null)
}, 2000)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save settings' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Settings</h2>
      {message && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${message.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Restaurant Information</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Restaurant Name</label>
            <input value={form.restaurantName} onChange={(e) => updateField({ restaurantName: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
            <input value={form.phone} onChange={(e) => updateField({ phone: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Address</label>
            <input value={form.address} onChange={(e) => updateField({ address: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
            <input value={form.email} onChange={(e) => updateField({ email: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">GSTIN</label>
            <input value={form.gstin} onChange={(e) => updateField({ gstin: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">FSSAI License Number</label>
            <input value={form.fssaiLicenseNumber} onChange={(e) => updateField({ fssaiLicenseNumber: e.target.value })} placeholder="Printed below restaurant name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Billing Configuration</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Currency Symbol</label>
            <input value={form.currency} onChange={(e) => updateField({ currency: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">CGST (%)</label>
            <input type="number" value={form.cgst} onChange={(e) => updateField({ cgst: toSettingsNumber(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">SGST (%)</label>
            <input type="number" value={form.sgst} onChange={(e) => updateField({ sgst: toSettingsNumber(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Service Charge</label>
              <div className="flex overflow-hidden rounded-md border border-slate-200">
                <button
                  type="button"
                  onClick={() => updateField({ serviceChargeMode: 'percent' })}
                  className={`px-2 py-0.5 text-[10px] font-bold transition ${form.serviceChargeMode === 'percent' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => updateField({ serviceChargeMode: 'rupees' })}
                  className={`px-2 py-0.5 text-[10px] font-bold transition ${form.serviceChargeMode === 'rupees' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  ₹
                </button>
              </div>
            </div>
            <input
              type="number"
              value={form.serviceCharge}
              onChange={(e) => updateField({ serviceCharge: toSettingsNumber(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Parcel Charge (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.parcelCharge}
              onChange={(e) => updateField({ parcelCharge: toSettingsNumber(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
            <p className="mt-1 text-[10px] text-slate-400">Applied only to parcel bills.</p>
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Receipt Configuration</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Receipt Footer</label>
            <input value={form.receiptFooter} onChange={(e) => updateField({ receiptFooter: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Token Footer</label>
            <input value={form.tokenFooter} onChange={(e) => updateField({ tokenFooter: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.paper58mm} onChange={(e) => updateField({ paper58mm: e.target.checked })} className="h-4 w-4 accent-orange-500" />
            58mm paper
          </label>
        </div>
      </div>

      <div className="rounded-[20px] border border-orange-100 bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Operations &amp; Printing</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Prep Warning (minutes)</label>
            <input type="number" value={form.prepWarningMinutes} onChange={(e) => updateField({ prepWarningMinutes: toSettingsNumber(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Business Hours Start</label>
            <input type="time" value={form.businessHoursStart} onChange={(e) => updateField({ businessHoursStart: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Business Hours End</label>
            <input type="time" value={form.businessHoursEnd} onChange={(e) => updateField({ businessHoursEnd: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Token Printer Name</label>
            <input value={form.tokenPrinterName} onChange={(e) => updateField({ tokenPrinterName: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Bill Printer Name</label>
            <input value={form.billPrinterName} onChange={(e) => updateField({ billPrinterName: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div className="md:col-span-3">
            <p className="mb-1 text-xs font-semibold text-slate-600">Print relay URLs</p>
            <p className="mb-2 text-[11px] text-slate-400">Run the relay on the device physically connected to each printer. Leave blank only when using a native printer bridge.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Kitchen token relay URL</label>
            <input value={form.kitchenPrintServerUrl} onChange={(e) => updateField({ kitchenPrintServerUrl: e.target.value })} placeholder="http://kitchen-device:9100" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Admin bill relay URL</label>
            <input value={form.adminPrintServerUrl} onChange={(e) => updateField({ adminPrintServerUrl: e.target.value })} placeholder="http://admin-device:9100" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Print Retry Count</label>
            <input type="number" value={form.printRetryCount} onChange={(e) => updateField({ printRetryCount: toSettingsNumber(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </div>
        </div>
      </div>

      {settingsHydration !== 'ready' && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${settingsHydration === 'pending' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {settingsHydration === 'pending'
            ? 'Loading the saved settings from Firestore…'
            : 'The saved settings could not be read from Firestore, so the values below may be defaults. Reload the page before saving.'}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
  onClick={handleSave}
  disabled={saving || !dirty || settingsHydration !== 'ready'}
  className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${
    message?.kind === 'ok'
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed disabled:opacity-50`}
>
  {saving ? (
    'Saving…'
  ) : message?.kind === 'ok' ? (
    <>
      <CheckCircle2 size={16} />
      Saved
    </>
  ) : (
    'Save Settings'
  )}
</button>
        {!dirty && !message && settingsHydration === 'ready' && <span className="text-xs text-slate-400">All changes saved</span>}
      </div>

      <div className="rounded-[20px] border border-red-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-bold text-red-700">Danger Zone</h3>
        <p className="mb-3 text-sm text-slate-600">
          Reset removes ALL restaurant operational data — tables, menu, categories, inventory, recipes, orders,
          tokens, sessions, bills, payments, purchase requests, notifications, stock history, activity and print jobs.
          Restaurant settings and your login account are kept. This cannot be undone.
        </p>
        {resetStage === 'confirm' ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-red-700">Are you sure?</span>
            <button
              onClick={() => { resetRestaurantData(); setResetStage('done'); setMessage({ kind: 'ok', text: 'All restaurant operational data has been reset.' }) }}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600"
            >
              Yes, Reset Everything
            </button>
            <button
              onClick={() => setResetStage('idle')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setResetStage('confirm'); setMessage(null) }}
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100"
          >
            Reset Restaurant Data
          </button>
        )}
      </div>
    </div>
  )
}
