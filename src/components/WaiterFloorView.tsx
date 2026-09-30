/**
 * Waiter Floor View — Tables tab.
 * Tables are grouped by category (area) like the food menu. Tapping a tile
 * takes the waiter to the Sessions tab to start a new session for that table
 * (or manage its existing session if the table is full).
 *
 * A TableFilterBar (same control as the admin Table Management screen) lets the
 * waiter "fetch the required tables" — area chips, free-text search and a
 * Filters panel with status / minimum seats / VIP plus a sort order. The chosen
 * filter is persisted in sessionStorage so it survives tab switches within the
 * same browser session.
 */
import { useMemo } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { Users, Sparkles, Plus } from 'lucide-react'
import { groupTablesByArea, tableArea } from '../lib/tableAreas'
import { applyTableFilters, useTableFilter } from '../lib/tableFilters'
import TableFilterBar from './TableFilterBar'

interface WaiterFloorViewProps {
  onTableSelect?: (tableId: string) => void
}

export default function WaiterFloorView({ onTableSelect }: WaiterFloorViewProps) {
  const { tables, getActiveSessionsForTable, getTableOccupancy } = useRestaurant()

  const activeTables = tables.filter((t) => t.active && t.status !== 'cleaning')

  const counts = {
    available: activeTables.filter((t) => t.status === 'available').length,
    occupied: activeTables.filter((t) => t.status === 'occupied').length,
  }

  // Shared table filter (area / status / seats / VIP / sort) + search.
  const { filter, updateFilter, resetFilter, search, setSearch } = useTableFilter()

  // Distinct areas present in the current floor, ordered like the admin screen.
  const areaOptions = useMemo(() => {
    const known = ['Indoor', 'Outdoor', 'Garden', 'Terrace', 'Private Room']
    const seen = new Set<string>()
    const ordered = known.filter((a) => {
      if (activeTables.some((t) => tableArea(t) === a)) { seen.add(a); return true }
      return false
    })
    const custom = Array.from(new Set(activeTables.map((t) => tableArea(t))))
      .filter((a) => !known.includes(a) && a !== 'No Area Assigned' && !seen.has(a))
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

  // Tables after applying every filter facet + the search box + the sort order.
  const filteredTables = useMemo(
    () => applyTableFilters(activeTables, filter, search),
    [activeTables, filter, search],
  )

  // Area-wise grouping (same pattern as the food menu): Indoor, Garden, Terrace ...
  // Shared helper keeps the group order identical to the admin Table Management screen.
  const grouped = useMemo(() => groupTablesByArea(filteredTables), [filteredTables])

  return (
    <div className="space-y-4">
      {/* Header section with mobile responsive flex wrap */}
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <h2 className="text-xl font-bold text-slate-900">Floor Status</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
          <span className="flex items-center gap-1 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Available ({counts.available})
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> Occupied ({counts.occupied})
          </span>
        </div>
      </div>

      <p className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
        Tap a table tile to start a session for it (up to the table's remaining seats). Sessions, orders and extend-time live in the <b>Sessions</b> tab. Bills and payments are handled by the admin at the counter.
      </p>

      {/* Shared filter + sort control (area chips, search, Filters panel) */}
      <TableFilterBar
        filter={filter}
        updateFilter={updateFilter}
        resetFilter={resetFilter}
        search={search}
        setSearch={setSearch}
        areaOptions={areaOptions}
        areaCounts={areaCounts}
        matched={filteredTables.length}
        total={activeTables.length}
        placeholder="Table no. / area…"
      />

      {activeTables.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No tables configured yet.</p>
          <p className="mt-1 text-sm text-slate-400">Ask admin to add tables.</p>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No tables match your filter.</p>
          <button
            onClick={() => { resetFilter(); setSearch('') }}
            className="mt-2 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-200"
          >
            Clear filters
          </button>
        </div>
      ) : (
        grouped.map(({ area, tables: areaTables }) => (
          <div key={area} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-500 sm:text-sm">{area}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                {areaTables.length} table{areaTables.length === 1 ? '' : 's'}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Responsive grid: 2 columns on mobile, scaling up cleanly */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 md:grid-cols-4 xl:grid-cols-6">
              {areaTables.map((table) => {
                const occupancy = getTableOccupancy(table.id)
                const tableSessions = getActiveSessionsForTable(table.id)
                const hasFreeSeats = occupancy.available > 0
                const statusClass =
                  table.status === 'available' ? 'border-emerald-200 bg-emerald-50'
                  : table.status === 'cleaning' ? 'border-violet-200 bg-violet-50'
                  : 'border-orange-200 bg-orange-50'
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => onTableSelect?.(table.id)}
                    className={`flex min-h-27.5 flex-col justify-between rounded-[20px] border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${statusClass} ${hasFreeSeats || tableSessions.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-1 sm:mb-2">
                        <h3 className="truncate text-base font-black text-slate-900 sm:text-lg">{table.name}</h3>
                        <div className="flex items-center gap-1">
                          {table.isVip && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-amber-950">VIP</span>}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${table.status === 'cleaning' ? 'bg-violet-100 text-violet-700' : table.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {table.status === 'occupied' ? 'Occupied' : table.status === 'available' ? 'Available' : 'Cleaning'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                        <Users size={13} className="shrink-0" />
                        <span>{occupancy.occupied}/{table.capacity} seated</span>
                        <span className="text-slate-400">· {occupancy.available} free</span>
                      </div>
                    </div>

                    <div>
                      {tableSessions.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-200/60 pt-1.5">
                          {tableSessions.map((s) => (
                            <p key={s.id} className="truncate text-[11px] text-slate-600">
                              <Sparkles size={11} className="mr-1 inline text-orange-400 shrink-0" />
                              {s.customerName || 'Guests'} · {s.guestCount}g{s.status === 'payment_pending' ? ' · bill' : ''}
                            </p>
                          ))}
                        </div>
                      )}
                      {hasFreeSeats && tableSessions.length === 0 && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 sm:text-[11px]">
                          <Plus size={11} /> New Session
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}