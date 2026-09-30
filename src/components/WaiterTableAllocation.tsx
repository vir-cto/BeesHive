import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import { Users, X, BellRing, Plus, Timer, Ban, DoorOpen, Clock, UtensilsCrossed, MapPin, Receipt } from 'lucide-react'
import { groupTablesByArea, tableArea, UNASSIGNED_AREA } from '../lib/tableAreas'
import { applyTableFilters, useTableFilter } from '../lib/tableFilters'
import { useViewPreference, viewPreferenceKeys } from '../lib/viewPreference'
import { SessionCapacityExceededError } from '../services/firebase/sessionCapacityService'
import TableFilterBar from './TableFilterBar'
import ViewModeSelect from './ViewModeSelect'
import PrintPreview from './PrintPreview'

/** Session tile layouts (the existing Small / Medium / Large / List designs). */
const SESSION_VIEW_MODES = ['small', 'medium', 'large', 'list'] as const
type SessionViewMode = (typeof SESSION_VIEW_MODES)[number]

const SESSION_VIEW_OPTIONS = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'list', label: 'List' },
] as const satisfies readonly { id: SessionViewMode; label: string }[]

interface WaiterTableAllocationProps {
  onSessionCreated: (sessionId: string, tableId: string) => void
  onOpenSession: (sessionId: string, tableId: string) => void
  /** TableId arriving from the Tables tab tile tap — auto-opens the session dialog */
  pendingTableId?: string | null
  onConsumedPendingTable?: () => void
}

export default function WaiterTableAllocation({
  onSessionCreated,
  onOpenSession,
  pendingTableId,
  onConsumedPendingTable,
}: WaiterTableAllocationProps) {
  const {
    tables,
    orders,
    sessions,
    createSession,
    getActiveSessionsForTable,
    getTableOccupancy,
    requestService,
    cancelSession,
    extendSession,
    closeSession,
    completeCleaning,
    printSessionReceipt,
  } = useRestaurant()
  const { user } = useAuth()
  const activeTables = tables.filter((t) => t.active && t.status !== 'cleaning')
  const [showDialog, setShowDialog] = useState(false)
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [guestCount, setGuestCount] = useState(2)
  const [customerName, setCustomerName] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [stayMinutes, setStayMinutes] = useState(60)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'free'
    sessionId: string
    tableId: string
    tableName: string
  } | null>(null)
  const [extendAction, setExtendAction] = useState<{ sessionId: string; tableName: string } | null>(null)
  const [sessionMenu, setSessionMenu] = useState<{ sessionId: string; tableId: string; tableName: string } | null>(null)
  const [extendMinutes, setExtendMinutes] = useState(60)
  // Compute current session's orders when the session menu is open.
  const sessionOrders = sessionMenu ? orders.filter((o) => o.sessionId === sessionMenu.sessionId && o.status !== 'cancelled') : []
  // UI-only preference: survives tab switches, navigation and a page refresh.
  const [viewMode, setViewMode] = useViewPreference<SessionViewMode>(
    viewPreferenceKeys.waiterSessions,
    'medium',
    SESSION_VIEW_MODES,
  )
  // Active Sessions honours the SAME view preference as the table floor so the
  // section stays compact and usable (especially on smaller screens) instead
  // of always rendering oversized cards.
  const activeSessionsGridClass =
    viewMode === 'list'
      ? 'space-y-2'
      : viewMode === 'small'
        ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        : viewMode === 'large'
          ? 'grid grid-cols-1 gap-4 lg:grid-cols-2'
          : 'grid grid-cols-1 gap-3 lg:grid-cols-2'
  const [submitting, setSubmitting] = useState(false)
  // Queued session-receipt job whose preview is open on screen.
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null)

  // Shared table filter + sort + free-text search (area, status, seats, VIP, order).
  const { filter, updateFilter, resetFilter, search, setSearch } = useTableFilter()

  // Distinct areas currently in the floor
  const floorAreaOptions = useMemo(() => {
    const known = ['Indoor', 'Outdoor', 'Garden', 'Terrace', 'Private Room']
    const seen = new Set<string>()
    const ordered = known.filter((a) => {
      if (activeTables.some((t) => tableArea(t) === a)) {
        seen.add(a)
        return true
      }
      return false
    })
    const custom = Array.from(new Set(activeTables.map((t) => tableArea(t))))
      .filter((a) => !known.includes(a) && a !== UNASSIGNED_AREA && !seen.has(a))
      .sort((a, b) => a.localeCompare(b))
    return [...ordered, ...custom]
  }, [activeTables])

  const areaCounts = useMemo(() => {
    const countsByArea: Record<string, number> = {}
    activeTables.forEach((t) => {
      const area = tableArea(t)
      countsByArea[area] = (countsByArea[area] ?? 0) + 1
    })
    return countsByArea
  }, [activeTables])

  // Tables shown on the floor after applying every filter facet + search + sort.
  const activeSessionEntries = useMemo(() => sessions
    .filter((session) => (session.status === 'active' || session.status === 'payment_pending') && session.waiterId === user?.id)
    .map((session) => ({
      session,
      table: tables.find((table) => table.id === session.tableId),
    }))
    .filter((entry): entry is { session: typeof sessions[number]; table: typeof tables[number] } => Boolean(entry.table))
    .sort((a, b) => b.session.startTime - a.session.startTime), [sessions, tables, user?.id])

  const activeSessionTableIds = useMemo(() => new Set(activeSessionEntries.map((entry) => entry.table.id)), [activeSessionEntries])
  const floorTables = useMemo(
    () => applyTableFilters(activeTables.filter((table) => !activeSessionTableIds.has(table.id)), filter, search),
    [activeTables, activeSessionTableIds, filter, search]
  )

  // Tick every 15s so stay-time countdowns stay current
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [])

  // Auto-close the session popup if its session is gone
  useEffect(() => {
    if (sessionMenu && !sessions.some((x) => x.id === sessionMenu.sessionId)) setSessionMenu(null)
  }, [sessions, sessionMenu])

  // Handle pending table auto-open
  useEffect(() => {
    if (!pendingTableId) return
    const table = tables.find((t) => t.id === pendingTableId)
    if (!table?.id) {
      onConsumedPendingTable?.()
      return
    }
    const occupancy = getTableOccupancy(table.id)
    const tableSessions = getActiveSessionsForTable(table.id)
    const firstSession = tableSessions[0]
    if (firstSession?.id) {
      // Manage the existing session — its popup offers "Create Session" while
      // the table still has free seats for an independent second session.
      setSessionMenu({ sessionId: firstSession.id, tableId: table.id, tableName: table.name })
    } else if (occupancy.available > 0) {
      openCreateSessionFlow(table.id)
    } else {
      setError(`${table.name} is at full capacity — no seats available for a new session.`)
    }
    onConsumedPendingTable?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTableId])

  const remainingMs = (expiresAt?: number) => (expiresAt ? expiresAt - now : null)

  const formatRemaining = (ms: number) => {
    const totalMin = Math.floor(ms / 60000)
    if (totalMin >= 60) return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
    return `${totalMin}m`
  }

  const sessionTotal = (sessionId: string) =>
    orders.filter((o) => o.sessionId === sessionId).reduce((sum, o) => sum + o.totalAmount, 0)

  const handleStartSession = async () => {
    if (!selectedTableId || !user || submitting) return
    const table = tables.find((t) => t.id === selectedTableId)
    // Capacity is re-read from the live state on submit (not when the dialog was
    // opened): another waiter may have seated guests in the meantime.
    const occupancy = getTableOccupancy(selectedTableId)
    if (guestCount < 1) {
      setError('At least 1 guest required')
      return
    }
    if (occupancy.available <= 0) {
      setError(
        `${table?.name ?? 'This table'} is at full capacity (${occupancy.occupied}/${occupancy.capacity} seated) — no seats available for a new session.`,
      )
      return
    }
    if (guestCount > occupancy.available) {
      setError(
        `Only ${occupancy.available} seat(s) available on ${table?.name ?? 'this table'} — reduce the guest count to continue.`,
      )
      return
    }
    if (stayMinutes < 15) {
      setError('Stay duration must be at least 15 minutes')
      return
    }
    setSubmitting(true)
    try {
      const tableId = selectedTableId
      // `createSession` re-checks capacity against Firestore inside a
      // transaction and rejects without writing anything when the table is full.
      const session = await createSession(
        tableId,
        guestCount,
        user.id,
        customerName || undefined,
        customerContact || undefined,
        stayMinutes
      )
      const sessionId = session?.id
      if (!sessionId) {
        setError('Could not start the session — please try again.')
        return
      }
      setShowDialog(false)
      setSelectedTableId(null)
      setGuestCount(2)
      setCustomerName('')
      setCustomerContact('')
      setStayMinutes(60)
      setError('')
      onSessionCreated(sessionId, tableId)
    } catch (err) {
      // The table filled up (another waiter, or a retried transaction): the
      // dialog stays open with the freshly calculated capacity so the operator
      // can retry with fewer guests or pick another table.
      if (err instanceof SessionCapacityExceededError) {
        setError(`${table?.name ?? 'This table'} is full — ${err.message} The table capacity has been refreshed.`)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create session')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelSession = (sessionId: string) => {
    setActionError('')
    try {
      cancelSession(sessionId)
      setConfirmAction(null)
    } catch (err) {
      setConfirmAction(null)
      setActionError(err instanceof Error ? err.message : 'Failed to cancel session')
    }
  }

  const handleFreeTable = (sessionId: string, tableId: string) => {
    setActionError('')
    try {
      closeSession(sessionId)
      completeCleaning(tableId, sessionId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to free table')
    }
    setConfirmAction(null)
  }

  const handleExtend = async () => {
    if (!extendAction) return
    setActionError('')
    try {
      await extendSession(extendAction.sessionId, extendMinutes)
      setExtendAction(null)
      setExtendMinutes(60)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to extend stay')
    }
  }

  /**
   * Open the normal "Start Dining Session" flow for a table that still has free
   * seats — used by the table tiles, the active-session cards and the
   * Manage Session popup, so a second (independent) session can be created for
   * the remaining seats without touching the session already running.
   */
  const openCreateSessionFlow = useCallback(
    (tableId: string) => {
      const occupancy = getTableOccupancy(tableId)
      if (occupancy.available <= 0) {
        const table = tables.find((t) => t.id === tableId)
        setActionError(
          `${table?.name ?? 'This table'} is at full capacity (${occupancy.occupied}/${occupancy.capacity} seated).`,
        )
        return
      }
      setSessionMenu(null)
      setSelectedTableId(tableId)
      setGuestCount(Math.min(2, occupancy.available))
      setStayMinutes(60)
      setError('')
      setShowDialog(true)
    },
    [getTableOccupancy, tables],
  )

  return (
    <div className="space-y-4 pb-8 sm:pb-0">
      {/* Header & Status Indicators */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-900">Table Floor</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500"></span> Occupied
          </span>
        </div>
      </div>

      {/* Shared filter + sort control */}
      <TableFilterBar
        filter={filter}
        updateFilter={updateFilter}
        resetFilter={resetFilter}
        search={search}
        setSearch={setSearch}
        areaOptions={floorAreaOptions}
        areaCounts={areaCounts}
        matched={floorTables.length}
        total={activeTables.length}
        placeholder="Table no. / area…"
      />
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white p-2 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-700">Session view</p>
          <p className="hidden text-[11px] text-slate-400 sm:block">Active sessions appear first</p>
        </div>
        <ViewModeSelect
          value={viewMode}
          options={SESSION_VIEW_OPTIONS}
          onChange={setViewMode}
          label="Session view"
        />
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {actionError}
        </div>
      )}

      {activeSessionEntries.length > 0 && (
        <section className="rounded-3x1 border border-orange-200 bg-linear-to-br from-orange-50 via-white to-amber-50 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                Active Sessions
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">Manage open tables before starting a new session.</p>
            </div>
            <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-white">{activeSessionEntries.length} live</span>
          </div>
          <div className={activeSessionsGridClass}>
            {activeSessionEntries.map(({ session, table }) => {
              const total = sessionTotal(session.id)
              const remaining = remainingMs(session.expiresAt)
              const expired = remaining !== null && remaining <= 0
              // Live occupancy of the physical table across ALL of its sessions:
              // a table may host several independent sessions while its combined
              // guest count stays within capacity.
              const occupancy = getTableOccupancy(table.id)
              return (
                <div key={session.id} className={`border border-orange-200 bg-white shadow-sm ${viewMode === 'list' || viewMode === 'small' ? 'rounded-xl p-2.5' : 'rounded-2xl p-3 sm:p-4'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`${viewMode === 'list' || viewMode === 'small' ? 'text-sm' : 'text-lg'} font-black text-slate-900`}>{table.name}</p>
                      <p className="text-xs text-slate-500">
                        {session.customerName || `${session.guestCount} guests`} · {orders.filter((order) => order.sessionId === session.id).length} order(s)
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${expired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {expired ? 'Time over' : 'Live'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500">
                    <span>{occupancy.capacity} capacity</span>
                    <span className="text-slate-300">·</span>
                    <span>{occupancy.occupied} occupied</span>
                    <span className="text-slate-300">·</span>
                    <span className={occupancy.available > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {occupancy.available} available
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
                    <div><span className="block text-slate-400">Current total</span><strong className="text-base text-slate-900">₹{total.toFixed(0)}</strong></div>
                    <div><span className="block text-slate-400">Stay time</span><strong className={expired ? 'text-red-600' : 'text-slate-900'}>{remaining === null ? '—' : expired ? 'Expired' : `${formatRemaining(remaining)} left`}</strong></div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => setSessionMenu({ sessionId: session.id, tableId: table.id, tableName: table.name })} className="flex-1 rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-black text-white transition hover:bg-orange-600">
                      <UtensilsCrossed size={14} className="mr-1 inline" /> Manage Session
                    </button>
                    {occupancy.available > 0 && (
                      <button
                        type="button"
                        onClick={() => openCreateSessionFlow(table.id)}
                        className="flex-1 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <Plus size={14} className="mr-1 inline" /> Create Session · {occupancy.available}{' '}
                        {occupancy.available === 1 ? 'seat' : 'seats'} available
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {tables.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-6 sm:p-8 text-center">
          <p className="text-slate-500">No tables configured yet.</p>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">Ask admin to add tables.</p>
        </div>
      ) : floorTables.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-6 sm:p-8 text-center">
          <p className="text-slate-500">No tables match your filter.</p>
          <button
            onClick={() => {
              resetFilter()
              setSearch('')
            }}
            className="mt-3 rounded-lg bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200 active:scale-95 transition"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupTablesByArea(floorTables).map(({ area, tables: areaTables }) => (
            <section key={area} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin size={16} className="shrink-0 text-orange-500" />
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-500">{area}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {areaTables.length} table{areaTables.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {areaTables.filter((t) => getTableOccupancy(t.id).available > 0).length} free
                </span>
                <div className="hidden sm:block h-px flex-1 bg-slate-200" />
              </div>

              <div className={
                viewMode === 'list'
                  ? 'space-y-2'
                  : viewMode === 'small'
                    ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'
                    : viewMode === 'large'
                      ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                      : 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3'
              }>
                {areaTables.map((table) => {
                  const tableSessions = getActiveSessionsForTable(table.id)
                  const occupancy = getTableOccupancy(table.id)
                  const canHost = occupancy.available > 0
                  return (
                    <div
                      key={table.id}
                      onClick={() => {
                        const active = tableSessions[0]
                        if (active?.id) {
                          setSessionMenu({ sessionId: active.id, tableId: table.id, tableName: table.name })
                        } else if (canHost) {
                          openCreateSessionFlow(table.id)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`${viewMode === 'list' ? 'rounded-xl p-3' : 'rounded-[20px] p-3.5 sm:p-4'} border-2 text-left transition touch-manipulation active:scale-[0.99] ${
                        canHost || tableSessions.length > 0
                          ? 'cursor-pointer border-orange-200 bg-orange-50/60 hover:border-orange-400 hover:shadow-md'
                          : 'cursor-default border-orange-100 bg-orange-100/50'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base sm:text-lg font-black text-slate-900">{table.name}</h3>
                          {table.isVip && (
                            <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-amber-950">
                              VIP
                            </span>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            table.status === 'cleaning'
                              ? 'bg-violet-100 text-violet-700'
                              : table.status === 'available'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {table.status === 'occupied' ? 'Occupied' : table.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600">
                        <span className="flex items-center gap-1 font-medium">
                          <Users size={14} className="shrink-0" />
                          {occupancy.occupied}/{table.capacity} seated
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{occupancy.available} free</span>
                      </div>

                      {table.features && table.features.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {table.features.map((f) => (
                            <span
                              key={f}
                              className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-600 border border-slate-200"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}

                      {tableSessions.map((session) => {
                        const total = sessionTotal(session.id)
                        const remaining = remainingMs(session.expiresAt)
                        const expired = remaining !== null && remaining <= 0
                        return (
                          <div
                            key={session.id}
                            className={`mt-2.5 rounded-xl p-2.5 text-xs ${
                              expired ? 'border border-red-300 bg-red-50' : 'bg-white shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800 truncate">
                                {session.customerName ? session.customerName : `${session.guestCount} guests`}
                                {session.customerName && (
                                  <span className="ml-1 font-normal text-slate-500">· {session.guestCount}g</span>
                                )}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                  expired ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {session.status}
                              </span>
                            </div>

                            <div className="mt-1 flex items-center justify-between text-slate-500">
                              <span>
                                {orders.filter((o) => o.sessionId === session.id).length} order(s)
                              </span>
                              <span className="font-bold text-slate-900">₹{total.toFixed(0)}</span>
                            </div>

                            {session.expiresAt &&
                              (expired ? (
                                <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 font-bold text-red-700 text-[11px]">
                                  <Clock size={12} className="shrink-0" />
                                  <span>Stay time over — tap to extend or free</span>
                                </div>
                              ) : (
                                <div
                                  className={`mt-1 flex items-center gap-1 font-semibold text-[11px] ${
                                    remaining !== null && remaining < 10 * 60000 ? 'text-red-600' : 'text-slate-500'
                                  }`}
                                >
                                  <Timer size={12} className="shrink-0" />
                                  <span>
                                    {formatRemaining(remaining!)} left
                                    {session.extendedCount ? ` · +${session.extendedCount}x` : ''}
                                  </span>
                                </div>
                              ))}

                            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
                              <span className="text-[10px] font-semibold text-slate-400">Tap to manage</span>
                              <span className="flex items-center gap-1 text-[11px] font-bold text-orange-600">
                                <UtensilsCrossed size={12} /> Manage
                              </span>
                            </div>
                          </div>
                        )
                      })}

                      {canHost ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openCreateSessionFlow(table.id)
                          }}
                          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-xs sm:text-sm font-black text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.98]"
                        >
                          <Plus size={16} />
                          Create Session
                          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                            {occupancy.available} {occupancy.available === 1 ? 'seat' : 'seats'} available
                          </span>
                        </button>
                      ) : (
                        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-2.5 py-2 text-center text-xs font-bold text-red-600">
                          Full capacity — {occupancy.occupied}/{table.capacity}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Allocation Dialog — Bottom Sheet on Mobile, Centered Modal on Desktop */}
      {showDialog && selectedTableId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 bh-modal-overlay">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Start Dining Session</h3>
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-orange-50 p-3">
              <p className="text-sm text-slate-700">
                Table: <span className="font-bold text-slate-900">{tables.find((t) => t.id === selectedTableId)?.name}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {(() => {
                  const occ = getTableOccupancy(selectedTableId)
                  return `${occ.capacity} capacity · ${occ.occupied} occupied · ${occ.available} seat(s) available`
                })()}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-orange-700">
                This creates a NEW session for the remaining seats — existing sessions stay unchanged.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Number of Guests *</label>
                <input
                  type="number"
                  value={guestCount}
                  onChange={(e) => {
                    // Never let the input exceed the seats this table still has.
                    const available = getTableOccupancy(selectedTableId).available
                    const next = parseInt(e.target.value) || 1
                    setGuestCount(Math.min(Math.max(1, next), Math.max(1, available)))
                  }}
                  min="1"
                  max={Math.max(1, getTableOccupancy(selectedTableId).available)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Timer size={14} /> Stay duration (minutes) *
                </label>
                <input
                  type="number"
                  value={stayMinutes}
                  onChange={(e) => setStayMinutes(parseInt(e.target.value) || 0)}
                  min="15"
                  step="15"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[30, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setStayMinutes(m)}
                      className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                        stayMinutes === m ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Customer Name (optional)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Guest name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Contact (optional)</label>
                <input
                  type="tel"
                  value={customerContact}
                  onChange={(e) => setCustomerContact(e.target.value)}
                  placeholder="Phone number"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">{error}</div>}

              <button
                onClick={() => void handleStartSession()}
                disabled={submitting}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white transition hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={18} /> {submitting ? 'Starting…' : 'Start Dining Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Actions Popup — Bottom Sheet on Mobile */}
      {sessionMenu &&
        (() => {
          const s = sessions.find((x) => x.id === sessionMenu.sessionId)
          const menuOrderCount = orders.filter((o) => o.sessionId === sessionMenu.sessionId).length
          if (!s) return null
          // Capacity of the PHYSICAL table across all of its active sessions —
          // the remaining seats belong to the table, not to a single session.
          const occupancy = getTableOccupancy(sessionMenu.tableId)
          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 bh-modal-overlay">
              <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">{sessionMenu.tableName}</h3>
                    <p className="text-xs text-slate-500">
                      {s.customerName ? `${s.customerName} · ${s.guestCount} guests` : `${s.guestCount} guests`} · {menuOrderCount} orders · ₹{sessionTotal(s.id).toFixed(0)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSessionMenu(null)}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                  <span>{occupancy.capacity} capacity</span>
                  <span className="text-slate-300">·</span>
                  <span>{occupancy.occupied} occupied</span>
                  <span className="text-slate-300">·</span>
                  <span className={occupancy.available > 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {occupancy.available} available
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      setSessionMenu(null)
                      onOpenSession(sessionMenu.sessionId, sessionMenu.tableId)
                    }}
                    className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-orange-100 px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-orange-200 active:scale-98"
                  >
                    <UtensilsCrossed size={18} /> Menu / Order
                  </button>

                  {occupancy.available > 0 && (
                    <button
                      onClick={() => openCreateSessionFlow(sessionMenu.tableId)}
                      className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-200 active:scale-98"
                    >
                      <Plus size={18} /> Create Session · {occupancy.available}{' '}
                      {occupancy.available === 1 ? 'seat' : 'seats'} available
                    </button>
                  )}

                  {s.serviceRequested ? (
                    <span className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white">
                      <BellRing size={18} /> Service Requested
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        requestService(sessionMenu.sessionId, sessionMenu.tableId, user?.id ?? '')
                        setSessionMenu(null)
                      }}
                      className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 active:scale-98"
                    >
                      <BellRing size={18} /> Call Service
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setExtendAction({ sessionId: sessionMenu.sessionId, tableName: sessionMenu.tableName })
                      setExtendMinutes(30)
                      setSessionMenu(null)
                    }}
                    className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-200 active:scale-98"
                  >
                    <Timer size={18} /> Extend Stay
                  </button>

                  {/* Session Receipt button — waiter can view/print current session summary.
                      This is NOT a payment/billing action. It does NOT record payment,
                      mark anything as PAID, or create a Bill document. Payment authority
                      remains with Admin only. */}
                  {sessionOrders.length > 0 && (
                    <button
                      onClick={() => {
                        const job = printSessionReceipt(sessionMenu.sessionId)
                        if (job) {
                          // Open the on-screen preview of the REAL payload —
                          // enqueueing alone displayed nothing, which read as a
                          // blank receipt. The queued job still flows to the
                          // print queue/relay unchanged.
                          setReceiptJobId(job.id)
                          setSessionMenu(null)
                        }
                      }}
                      className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-purple-100 px-4 py-3 text-sm font-semibold text-purple-700 hover:bg-purple-200 active:scale-98"
                    >
                      <Receipt size={18} /> Session Receipt
                    </button>
                  )}

                  {menuOrderCount === 0 && (
                    <button
                      onClick={() => {
                        setConfirmAction({
                          type: 'cancel',
                          sessionId: sessionMenu.sessionId,
                          tableId: sessionMenu.tableId,
                          tableName: sessionMenu.tableName,
                        })
                        setSessionMenu(null)
                      }}
                      className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-200 active:scale-98"
                    >
                      <Ban size={18} /> Cancel Session
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: 'free',
                        sessionId: sessionMenu.sessionId,
                        tableId: sessionMenu.tableId,
                        tableName: sessionMenu.tableName,
                      })
                      setSessionMenu(null)
                    }}
                    className="flex min-h-11 items-center justify-center sm:justify-start gap-2.5 rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-300 active:scale-98"
                  >
                    <DoorOpen size={18} /> Table Free
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 bh-modal-overlay">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              {confirmAction.type === 'cancel' ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <Ban size={20} />
                </span>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <DoorOpen size={20} />
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-900">
                {confirmAction.type === 'cancel' ? 'Cancel Session?' : 'Free the Table?'}
              </h3>
            </div>

            {confirmAction.type === 'cancel' ? (
              <p className="text-xs sm:text-sm text-slate-600">
                This will cancel the session on <span className="font-bold">{confirmAction.tableName}</span> and make the seats available again.
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-slate-600">
                This will end the guest's stay on <span className="font-bold">{confirmAction.tableName}</span> and mark the table free.
                {sessionTotal(confirmAction.sessionId) > 0 && (
                  <span className="mt-1.5 block font-semibold text-red-600">
                    Warning: Unbilled orders worth ₹{sessionTotal(confirmAction.sessionId).toFixed(0)} exist.
                  </span>
                )}
              </p>
            )}

            {actionError && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{actionError}</div>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 min-h-11 rounded-xl bg-slate-100 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition"
              >
                Back
              </button>
              <button
                onClick={() =>
                  confirmAction.type === 'cancel'
                    ? handleCancelSession(confirmAction.sessionId)
                    : handleFreeTable(confirmAction.sessionId, confirmAction.tableId)
                }
                className={`flex-1 min-h-11 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition active:scale-95 ${
                  confirmAction.type === 'cancel' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {confirmAction.type === 'cancel' ? 'Yes, Cancel' : 'Yes, Free Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Stay Modal */}
      {extendAction && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 bh-modal-overlay">
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <Timer size={20} />
              </span>
              <h3 className="text-lg font-bold text-slate-900">Extend Stay Duration</h3>
            </div>
            <p className="mb-3 text-xs sm:text-sm text-slate-600">
              Set additional time for <span className="font-bold">{extendAction.tableName}</span>. Time is added from now.
            </p>

            <input
              type="number"
              value={extendMinutes}
              onChange={(e) => setExtendMinutes(parseInt(e.target.value) || 0)}
              min="15"
              step="15"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400"
            />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[30, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setExtendMinutes(m)}
                  className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                    extendMinutes === m ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  +{m} min
                </button>
              ))}
            </div>

            {actionError && <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{actionError}</div>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setExtendAction(null)
                  setActionError('')
                }}
                className="flex-1 min-h-11 rounded-xl bg-slate-100 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition"
              >
                Back
              </button>
              <button
                onClick={handleExtend}
                className="flex-1 min-h-11 rounded-xl bg-sky-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition hover:bg-sky-600 active:scale-95"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session-receipt preview — shows the actual queued payload (restaurant
          header, table/guests/waiter, items with serving type, totals). */}
      {receiptJobId && <PrintPreview jobId={receiptJobId} onCancel={() => setReceiptJobId(null)} />}
    </div>
  )
}