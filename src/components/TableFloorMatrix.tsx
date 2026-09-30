import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { Users, Sparkles, Utensils, Clock } from 'lucide-react'
import { groupTablesByArea, tableArea } from '../lib/tableAreas'

interface TableFloorMatrixProps {
  onTableSelect: (tableId: string) => void
}

export default function TableFloorMatrix({ onTableSelect }: TableFloorMatrixProps) {
  const { tables, sessions, orders } = useRestaurant()
  const [selectedSection, setSelectedSection] = useState<string>('All')

  const sections = ['All', ...groupTablesByArea(tables).map((group) => group.area)]

  const filteredTables =
    selectedSection === 'All' ? tables : tables.filter((table) => tableArea(table) === selectedSection)

  const getSessionForTable = (tableId: string) =>
    sessions.find((session) => session.tableId === tableId && session.status === 'active')

  const getSessionOrders = (sessionId: string) => orders.filter((o) => o.sessionId === sessionId)

  const getSessionTotal = (sessionId: string) => {
    return getSessionOrders(sessionId).reduce((sum, order) => sum + order.totalAmount, 0)
  }

  return (
    <div className="rounded-3xl border border-orange-100/80 bg-linear-to-b from-white to-orange-50/20 p-4 sm:p-6 shadow-xl shadow-orange-500/5 backdrop-blur-sm">
      {/* Header & Section Navigation */}
      <div className="mb-5 sm:mb-6 space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                Floor Matrix
              </h2>
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
                {filteredTables.length} / {tables.length}
              </span>
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
              Tap any table to punch orders, view live KOTs, or process billing.
            </p>
          </div>
        </div>

        {/* Horizontal Scrollable Filter Chips for Mobile */}
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0 sm:flex-wrap">
          {sections.map((section) => {
            const isActive = selectedSection === section
            return (
              <button
                key={section}
                onClick={() => setSelectedSection(section)}
                className={`shrink-0 touch-manipulation rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-all duration-150 active:scale-95 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-orange-50 hover:text-orange-700'
                }`}
              >
                {section}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tables Grid: 2 columns on mobile for maximum visibility */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {filteredTables.map((table) => {
          const session = getSessionForTable(table.id)
          const isOccupied = table.status === 'occupied'
          const isCleaning = table.status === 'cleaning'
          const isReserved = table.status === 'reserved'

          let cardStyle = 'border-slate-200/80 bg-white hover:border-slate-300'
          let statusBg = 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
          let statusDot = 'bg-emerald-500'
          let statusLabel = 'Available'

          if (isOccupied) {
            cardStyle = 'border-orange-300 bg-linear-to-br from-orange-50/90 to-amber-50/50 hover:border-orange-400 shadow-sm'
            statusBg = 'bg-orange-500/10 text-orange-700 border-orange-200'
            statusDot = 'bg-orange-500'
            statusLabel = 'Occupied'
          } else if (isCleaning) {
            cardStyle = 'border-violet-200 bg-violet-50/40 hover:border-violet-300'
            statusBg = 'bg-violet-500/10 text-violet-700 border-violet-200'
            statusDot = 'bg-violet-500 animate-pulse'
            statusLabel = 'Cleaning'
          } else if (isReserved) {
            cardStyle = 'border-sky-200 bg-sky-50/40 hover:border-sky-300'
            statusBg = 'bg-sky-500/10 text-sky-700 border-sky-200'
            statusDot = 'bg-sky-500'
            statusLabel = 'Reserved'
          }

          const sessionTotal = session ? getSessionTotal(session.id) : 0
          const sessionOrderCount = session ? getSessionOrders(session.id).length : 0

          return (
            <button
              key={table.id}
              onClick={() => onTableSelect(table.id)}
              className={`group relative flex flex-col justify-between rounded-2xl border-2 ${cardStyle} p-3 sm:p-4 text-left transition-all duration-200 touch-manipulation active:scale-[0.98] sm:hover:-translate-y-0.5 sm:hover:shadow-md`}
            >
              {/* Header: Table Name & Status Badge */}
              <div>
                <div className="mb-2 flex items-start justify-between gap-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 group-hover:text-orange-600 transition-colors">
                        {table.name}
                      </h3>
                      {table.isVip && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.2 text-[9px] font-black text-amber-950 shadow-xs">
                          <Sparkles size={10} /> VIP
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 block truncate">
                      {table.area || 'General'}
                    </span>
                  </div>

                  {/* Status Indicator */}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBg}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                    <span className="hidden sm:inline">{statusLabel}</span>
                  </span>
                </div>
              </div>

              {/* Bottom Body: Capacity & Financials */}
              <div className="mt-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-slate-700">
                  <div className="flex items-center gap-1 text-slate-500">
                    <Users size={13} className="shrink-0" />
                    <span className="text-xs font-bold text-slate-700">{table.capacity} Seater</span>
                  </div>

                  {session && (
                    <span className="text-xs font-extrabold text-slate-900 bg-white/80 rounded-md px-1.5 py-0.5 border border-slate-200/60 shadow-2xs">
                      ₹{sessionTotal.toFixed(0)}
                    </span>
                  )}
                </div>

                {session ? (
                  <div className="mt-2 flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-500 bg-white/60 rounded-lg p-1.5 border border-orange-100">
                    <span className="flex items-center gap-1 truncate">
                      <Utensils size={11} className="text-orange-500 shrink-0" />
                      {sessionOrderCount} order{sessionOrderCount === 1 ? '' : 's'}
                    </span>
                    <span className="flex items-center gap-1 shrink-0 font-medium text-slate-400">
                      <Clock size={11} /> {session.guestCount}g
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] font-bold text-slate-400 flex items-center justify-end gap-1">
                    Tap to allocate →
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}