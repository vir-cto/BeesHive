import { useRestaurant } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import WaiterTableAllocation from '../components/WaiterTableAllocation'
import WaiterFloorView from '../components/WaiterFloorView'
import WaiterOrderCreation from '../components/WaiterOrderCreation'
import WaiterMenuBrowse from '../components/WaiterMenuBrowse'
import Avatar from '../components/Avatar'
import RestaurantInfoCard from '../components/RestaurantInfoCard'
import Sidebar from '../components/Sidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import { roleLabel } from '../lib/roleLabel'
import { LayoutDashboard, Table2, ClipboardList, Users, UserCircle, X } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../services/firebase/config'

import { getPendingOrders } from '../lib/orderMetrics'

export { db as firestore }

type WaiterTab = 'dashboard' | 'tables' | 'menu' | 'sessions' | 'profile'

export default function WaiterDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<WaiterTab>(() => {
    const tab = searchParams.get('tab')
    return tab === 'menu' ? 'menu' : 'dashboard'
  })

 const globalSearchQuery = searchParams.get('search')?.trim() || ''

  useEffect(() => {
    const tab = searchParams.get('tab')

    if (tab === 'menu') {
      setActiveTab('menu')
    }
  }, [searchParams])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [pendingSessionTableId, setPendingSessionTableId] = useState<string | null>(null)
  const { user } = useAuth()
  const { tables, sessions, orders, bills } = useRestaurant()

  const activeSessions = sessions.filter((s) => (s.status === 'active' || s.status === 'payment_pending') && s.waiterId === user?.id)
  const availableTables = tables.filter((t) => t.status === 'available' && t.active)
  const waiterOrders = getPendingOrders(orders, sessions, bills, { waiterId: user?.id })
  const pendingOrders = waiterOrders.filter((o) => ['placed', 'confirmed', 'preparing'].includes(o.status))
  const readyOrders = waiterOrders.filter((o) => o.status === 'ready')

  const getTable = (tableId: string) => tables.find((t) => t.id === tableId)
  const getSessionOrders = (sessionId: string) => orders.filter((o) => o.sessionId === sessionId)
  const getSessionTotal = (sessionId: string) => getSessionOrders(sessionId).reduce((sum, o) => sum + o.totalAmount, 0)

  const navItems: { id: WaiterTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'tables', label: 'Tables', icon: <Table2 size={18} /> },
    { id: 'menu', label: 'Menu', icon: <ClipboardList size={18} /> },
    { id: 'sessions', label: 'Sessions', icon: <Users size={18} />, badge: activeSessions.length },
    { id: 'profile', label: 'Profile', icon: <UserCircle size={18} /> },
  ]

  const [summaryPeriod, setSummaryPeriod] = useState<'day' | 'month' | 'year'>('day')
  const [summaryDate, setSummaryDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [summaryMonth, setSummaryMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [summaryYear, setSummaryYear] = useState(() => String(new Date().getFullYear()))

  const summaryStats = useMemo(() => {
    const [year, month, day] = summaryDate.split('-').map(Number)
    const [monthYear, monthNumber] = summaryMonth.split('-').map(Number)
    const selectedYear = summaryPeriod === 'day' ? year : summaryPeriod === 'month' ? monthYear : Number(summaryYear)
    const selectedMonth = summaryPeriod === 'day' ? month : summaryPeriod === 'month' ? monthNumber : 0
    const selectedDay = summaryPeriod === 'day' ? day : 0
    const mine = orders.filter((order) => {
      if (order.waiterId !== user?.id) return false
      const created = new Date(order.createdAt)
      return created.getFullYear() === selectedYear
        && (selectedMonth === 0 || created.getMonth() + 1 === selectedMonth)
        && (selectedDay === 0 || created.getDate() === selectedDay)
    })
    const activeSales = mine.filter((order) => order.status !== 'cancelled')
    return {
      orders: activeSales.length,
      completed: activeSales.filter((order) => order.status === 'served').length,
      itemsSold: activeSales.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
    }
  }, [orders, summaryDate, summaryMonth, summaryPeriod, summaryYear, user?.id])

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Navigation */}
        <Sidebar
          navItems={navItems}
          activeTab={activeTab}
          panelName="Waiter Panel"
          onSelect={(id) => {
            setSearchParams({})
            setActiveTab(id as WaiterTab)
            setSelectedSessionId(null)
            setSelectedTableId(null)
          }}
        />

        {/* Main Content */}
        <main className="min-w-0 flex-1 pb-16 lg:pb-0">
          <ErrorBoundary label={`waiter ${activeTab}`} resetKey={activeTab}>
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                    Welcome back, <span className="bg-linear-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">{user?.name || 'Waiter'}</span>
                  </h1>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">Station overview</p>
                </div>

                {/* Sales summary */}
                <div className="rounded-[20px] border border-orange-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {summaryPeriod === 'day' ? 'Daily Summary' : summaryPeriod === 'month' ? 'Monthly Summary' : 'Yearly Summary'}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">Live data from orders stored in the database</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex rounded-lg bg-slate-100 p-1">
                        {(['day', 'month', 'year'] as const).map((period) => (
                          <button
                            key={period}
                            type="button"
                            onClick={() => setSummaryPeriod(period)}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-bold capitalize transition ${summaryPeriod === period ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            {period}
                          </button>
                        ))}
                      </div>
                      {summaryPeriod === 'day' && (
                        <input type="date" value={summaryDate} onChange={(event) => setSummaryDate(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" />
                      )}
                      {summaryPeriod === 'month' && (
                        <input type="month" value={summaryMonth} onChange={(event) => setSummaryMonth(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" />
                      )}
                      {summaryPeriod === 'year' && (
                        <input type="number" min="2000" max="2100" value={summaryYear} onChange={(event) => setSummaryYear(event.target.value)} className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" aria-label="Summary year" />
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-slate-800">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <span className="block text-xs font-medium text-slate-500">Orders</span>
                      <strong className="text-lg font-bold text-slate-900">{summaryStats.orders}</strong>
                    </div>
                    <div className="rounded-xl bg-emerald-50/60 p-2.5">
                      <span className="block text-xs font-medium text-emerald-700">Completed</span>
                      <strong className="text-lg font-bold text-emerald-600">{summaryStats.completed}</strong>
                    </div>
                    <div className="rounded-xl bg-orange-50/60 p-2.5">
                      <span className="block text-xs font-medium text-orange-700">Items Sold</span>
                      <strong className="text-lg font-bold text-orange-600">{summaryStats.itemsSold}</strong>
                    </div>
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                  <StatCard label="Active Sessions" value={activeSessions.length} color="orange" onClick={() => setActiveTab('sessions')} />
                  <StatCard label="Available Tables" value={availableTables.length} color="emerald" onClick={() => setActiveTab('tables')} />
                  <StatCard label="Pending Orders" value={pendingOrders.length} color="amber" onClick={() => setActiveTab('sessions')} />
                  <StatCard label="Ready to Serve" value={readyOrders.length} color="blue" onClick={() => setActiveTab('sessions')} />
                </div>

                {/* Ready Orders Alert */}
                {readyOrders.length > 0 && (
                  <div className="rounded-[20px] border border-blue-200 bg-blue-50 p-4">
                    <h3 className="mb-2 text-sm font-bold text-blue-800 sm:text-base">Orders Ready for Service</h3>
                    <div className="space-y-2">
                      {readyOrders.map((order) => {
                        const table = getTable(order.tableId)
                        return (
                          <div key={order.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs">
                            <div>
                              <p className="text-sm font-bold text-slate-900">Order #{order.id.slice(-6)}</p>
                              <p className="text-xs text-slate-500">Table {table?.name ?? 'Unknown'}</p>
                            </div>
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">
                              READY
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Active Sessions */}
                <div className="rounded-[20px] border border-orange-100 bg-white p-4 sm:p-5">
                  <h2 className="mb-3 text-base font-bold text-slate-900 sm:text-lg">Active Sessions</h2>
                  {activeSessions.length === 0 ? (
                    <p className="text-sm text-slate-500">No active sessions. Allocate a table to start.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {activeSessions.map((session) => {
                        const table = getTable(session.tableId)
                        const sessionOrders = getSessionOrders(session.id)
                        const total = getSessionTotal(session.id)
                        return (
                          <div key={session.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <h3 className="font-bold text-slate-900">Table {table?.name ?? 'Unknown'}</h3>
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  Active
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 sm:text-sm">{session.guestCount} guests • {sessionOrders.length} orders</p>
                              <p className="mt-1 font-bold text-slate-900">₹{total.toFixed(0)}</p>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
                              <button
                                onClick={() => {
                                  setSelectedSessionId(session.id)
                                  setSelectedTableId(session.tableId)
                                  setActiveTab('menu')
                                }}
                                className="min-h-11 rounded-lg bg-orange-100 px-2 py-2 text-center text-xs font-semibold text-orange-700 hover:bg-orange-200 active:bg-orange-300"
                              >
                                Add Order
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tables' && (
              <WaiterFloorView
                onTableSelect={(tableId) => {
                  setSelectedSessionId(null)
                  setSelectedTableId(null)
                  setPendingSessionTableId(tableId)
                  setActiveTab('sessions')
                }}
              />
            )}

            {activeTab === 'sessions' && (
              <WaiterTableAllocation
                pendingTableId={pendingSessionTableId}
                onConsumedPendingTable={() => setPendingSessionTableId(null)}
                onSessionCreated={(_sid, _tid) => setActiveTab('sessions')}
                onOpenSession={(sessionId, tableId) => {
                  if (!sessionId || !tableId) return
                  setSelectedSessionId(sessionId); setSelectedTableId(tableId); setShowOrderModal(true)
                }}
              />
            )}

            {activeTab === 'menu' && (
              selectedSessionId && selectedTableId ? (
                <WaiterOrderCreation
                  sessionId={selectedSessionId}
                  tableId={selectedTableId}
                  onOrderPlaced={() => { setSelectedSessionId(null); setSelectedTableId(null); setActiveTab('sessions') }}
                />
              ) : (
                <WaiterMenuBrowse
  onGoToSessions={() => {
    setSearchParams({})
    setActiveTab('sessions')
  }}
  searchQuery={globalSearchQuery}
/>
              )
            )}

            {activeTab === 'profile' && user && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900">Profile</h2>
                <div className="rounded-[20px] border border-orange-100 bg-white p-5">
                  <div className="flex items-center gap-4">
                    <Avatar name={user.name} src={user.avatarUrl} role={user.role} className="h-16 w-16 text-2xl" />
                    <div>
                      <p className="text-xl font-bold text-slate-900">{user.name}</p>
                      <p className="text-sm capitalize text-slate-500">{roleLabel(user.role)}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </div>
                <RestaurantInfoCard />
              </div>
            )}
          </ErrorBoundary>
        </main>

        {/* Order Creation Modal */}
        {showOrderModal && selectedSessionId && selectedTableId && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/50 p-1.5 sm:items-center sm:p-4">
            <div className="relative flex max-h-[calc(100dvh-0.75rem)] w-full min-w-0 max-w-7xl flex-col overflow-y-auto rounded-t-3xl bg-white p-2 shadow-2xl sm:max-h-[96vh] sm:rounded-3xl sm:p-6">
              <button
                onClick={() => { setShowOrderModal(false); setSelectedSessionId(null); setSelectedTableId(null); setActiveTab('sessions') }}
                className="absolute right-3 top-3 z-10 min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300"
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <WaiterOrderCreation
                sessionId={selectedSessionId}
                tableId={selectedTableId}
                onOrderPlaced={() => { setShowOrderModal(false); setSelectedSessionId(null); setSelectedTableId(null); setActiveTab('sessions') }}
              />
            </div>
          </div>
        )}

      </div>
    </>
  )
}

function StatCard({ label, value, color, onClick }: { label: string; value: string | number; color: string; onClick?: () => void }) {
  const styles: Record<string, { bar: string; dot: string; text: string }> = {
    orange: { bar: 'bg-orange-400', dot: 'bg-orange-400', text: 'text-orange-600' },
    emerald: { bar: 'bg-emerald-400', dot: 'bg-emerald-400', text: 'text-emerald-600' },
    blue: { bar: 'bg-blue-400', dot: 'bg-blue-400', text: 'text-blue-600' },
    amber: { bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-600' },
    red: { bar: 'bg-red-400', dot: 'bg-red-400', text: 'text-red-600' },
  }
  const s = styles[color] || styles.orange

  const header = <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:text-[11px] sm:tracking-[0.14em]">{label}</p>

  if (!onClick) {
    return (
      <div className="relative min-h-22 overflow-hidden rounded-[22px] border border-orange-100/70 bg-white p-3.5 shadow-[0_12px_28px_-14px_rgba(120,53,15,0.22)] sm:p-4">
        <span className={`pointer-events-none absolute left-0 top-0 h-full w-1.5 ${s.bar}`} />
        <div className="flex items-center justify-between">
          {header}
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
        </div>
        <p className={`mt-2 text-2xl font-black leading-none sm:text-[26px] ${s.text}`}>{value}</p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-h-22 w-full cursor-pointer overflow-hidden rounded-[22px] border border-orange-100/70 bg-white p-3.5 text-left shadow-[0_12px_28px_-14px_rgba(120,53,15,0.22)] transition hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_18px_36px_-14px_rgba(120,53,15,0.32)] active:scale-[0.98] sm:p-4"
    >
      <span className={`pointer-events-none absolute left-0 top-0 h-full w-1.5 ${s.bar}`} />
      <div className="flex items-center justify-between">
        {header}
        <span className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-orange-500">&rarr;</span>
      </div>
      <p className={`mt-2 text-2xl font-black leading-none sm:text-[26px] ${s.text}`}>{value}</p>
    </button>
  )
}