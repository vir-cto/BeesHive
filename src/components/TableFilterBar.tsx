import { useState } from 'react'
import { ListFilter, Search, X, MapPin, RotateCcw, ArrowUpDown, Crown } from 'lucide-react'
import {
  activeTableFacetCount,
  isTableFilterActive,
  TABLE_STATUS_FILTER_OPTIONS,
  TABLE_CAPACITY_FILTER_OPTIONS,
  TABLE_SORT_OPTIONS,
  type TableFilter,
  type TableStatusFilter,
  type TableSort,
} from '../lib/tableFilters'

interface TableFilterBarProps {
  filter: TableFilter
  updateFilter: (patch: Partial<TableFilter>) => void
  resetFilter: () => void
  search: string
  setSearch: (next: string) => void
  /** Area labels present on the current floor, already ordered. */
  areaOptions: string[]
  /** Optional table count per area label (rendered next to the chip). */
  areaCounts?: Record<string, number>
  /** Tables remaining after filtering — shown as "Showing X of Y". */
  matched: number
  total: number
  placeholder?: string
}

/**
 * Shared "fetch the required tables" control for every table surface:
 * admin Table Management, waiter Tables (Floor Status) and waiter Sessions
 * (Table Floor). Replaces the per-screen area-chip + search row with one
 * identical control that also sorts and can narrow by status, seats and VIP.
 */
export default function TableFilterBar({
  filter,
  updateFilter,
  resetFilter,
  search,
  setSearch,
  areaOptions,
  areaCounts,
  matched,
  total,
  placeholder = 'Search tables…',
}: TableFilterBarProps) {
  const [open, setOpen] = useState(false)
  const facetCount = activeTableFacetCount(filter)
  const filtered = isTableFilterActive(filter)

  const selectClass =
    'w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'

  return (
    <div className="flex flex-col gap-3">
      {/* Top Control Bar */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        
        {/* Area chips — Horizontal scrollable on mobile screens */}
        <div className="no-scrollbar -mx-2 flex items-center gap-1.5 overflow-x-auto px-2 py-0.5 sm:mx-0 sm:px-0 sm:flex-wrap">
          <button
            onClick={() => updateFilter({ area: null })}
            className={`shrink-0 touch-manipulation rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-150 active:scale-95 ${
              filter.area === null
                ? 'bg-linear-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20'
                : 'bg-slate-100 text-slate-600 hover:bg-orange-100/70 hover:text-orange-800'
            }`}
          >
            ALL
          </button>
          
          {areaOptions.map((area) => {
            const isSelected = filter.area === area
            const count = areaCounts?.[area]

            return (
              <button
                key={area}
                onClick={() => updateFilter({ area: isSelected ? null : area })}
                className={`shrink-0 touch-manipulation flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-150 active:scale-95 ${
                  isSelected
                    ? 'bg-linear-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20'
                    : 'bg-slate-100/90 text-slate-600 hover:bg-orange-100/70 hover:text-orange-800'
                }`}
              >
                <MapPin size={11} className={isSelected ? 'text-white' : 'text-slate-400'} />
                <span>{area}</span>
                {count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search Input and Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-60 lg:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-200/90 bg-white py-2 pl-8 pr-8 text-xs font-medium text-slate-800 placeholder-slate-400 shadow-2xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filters Panel Toggle Button */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`touch-manipulation flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${
              open || facetCount > 0
                ? 'border-orange-300 bg-orange-50 text-orange-700 shadow-2xs'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ListFilter size={14} />
            <span className="hidden sm:inline">Filters</span>
            {facetCount > 0 && (
              <span className="rounded-full bg-orange-500 px-1.5 py-0.2 text-[10px] font-black text-white shadow-2xs">
                {facetCount}
              </span>
            )}
          </button>

          {/* Quick Clear All Button */}
          {(filtered || search) && (
            <button
              onClick={() => {
                resetFilter()
                setSearch('')
              }}
              className="touch-manipulation flex items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 active:scale-95"
              title="Clear all table filters"
            >
              <X size={13} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Filter Facets Drawer */}
      {open && (
        <div className="rounded-2xl border border-orange-200/80 bg-linear-to-b from-orange-50/70 to-amber-50/30 p-3.5 shadow-sm backdrop-blur-sm transition-all">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Status
              </span>
              <select
                value={filter.status}
                onChange={(e) => updateFilter({ status: e.target.value as TableStatusFilter })}
                className={selectClass}
              >
                {TABLE_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Seats Capacity
              </span>
              <select
                value={filter.minCapacity === null ? '' : String(filter.minCapacity)}
                onChange={(e) => updateFilter({ minCapacity: e.target.value === '' ? null : Number(e.target.value) })}
                className={selectClass}
              >
                {TABLE_CAPACITY_FILTER_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value === null ? '' : String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Area Section
              </span>
              <select
                value={filter.area ?? ''}
                onChange={(e) => updateFilter({ area: e.target.value === '' ? null : e.target.value })}
                className={selectClass}
              >
                <option value="">All areas</option>
                {areaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <ArrowUpDown size={11} /> Sort by
              </span>
              <select
                value={filter.sort}
                onChange={(e) => updateFilter({ sort: e.target.value as TableSort })}
                className={selectClass}
              >
                {TABLE_SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Bottom Row: Checkbox & Count Summary */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-orange-200/60 pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 touch-manipulation text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={filter.vipOnly}
                onChange={(e) => updateFilter({ vipOnly: e.target.checked })}
                className="h-4 w-4 rounded-md border-slate-300 text-orange-500 accent-orange-500 focus:ring-orange-400"
              />
              <Crown size={14} className="text-amber-500 fill-amber-400/20" />
              <span>VIP tables only</span>
            </label>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold text-slate-500">
                Showing <strong className="font-extrabold text-slate-900">{matched}</strong> of {total}
              </span>
              {filtered && (
                <button
                  onClick={resetFilter}
                  className="touch-manipulation flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-100 active:scale-95 shadow-2xs"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}