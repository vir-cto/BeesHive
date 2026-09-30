import { useEffect, useState } from 'react'
import { tableArea } from './tableAreas'

/**
 * Table filtering + sorting helpers shared by the admin Table Management
 * screen and the waiter table views (Floor Status / Sessions).
 *
 * The area chips that used to live in each screen are now one control here,
 * extended with status, minimum capacity, VIP and a sort order so staff can
 * "fetch the required tables" instead of scanning the whole floor.
 */
export const tableStatusFilters = ['all', 'available', 'occupied', 'reserved', 'cleaning'] as const
export type TableStatusFilter = (typeof tableStatusFilters)[number]

export const tableSorts = ['name_asc', 'name_desc', 'capacity_desc', 'capacity_asc', 'status'] as const
export type TableSort = (typeof tableSorts)[number]

export interface TableFilter {
  /** null = every area. */
  area: string | null
  status: TableStatusFilter
  /** null = any capacity; otherwise tables seating at least this many guests. */
  minCapacity: number | null
  vipOnly: boolean
  sort: TableSort
}

export const DEFAULT_TABLE_FILTER: TableFilter = {
  area: null,
  status: 'all',
  minCapacity: null,
  vipOnly: false,
  sort: 'name_asc',
}

export const TABLE_STATUS_FILTER_OPTIONS: { value: TableStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'cleaning', label: 'Cleaning' },
]

export const TABLE_CAPACITY_FILTER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any size' },
  { value: 2, label: '2+ seats' },
  { value: 4, label: '4+ seats' },
  { value: 6, label: '6+ seats' },
  { value: 8, label: '8+ seats' },
]

export const TABLE_SORT_OPTIONS: { value: TableSort; label: string }[] = [
  { value: 'name_asc', label: 'Table no. (A→Z)' },
  { value: 'name_desc', label: 'Table no. (Z→A)' },
  { value: 'capacity_desc', label: 'Seats (high → low)' },
  { value: 'capacity_asc', label: 'Seats (low → high)' },
  { value: 'status', label: 'Status (free first)' },
]

/** Shared sessionStorage key for the last-selected table filter. */
export const TABLE_FILTER_STORAGE_KEY = 'beeshive_tableFilter'

interface FilterableTable {
  name: string
  capacity?: number
  status?: string
  area?: string
  isVip?: boolean
  active?: boolean
}

const STATUS_ORDER: Record<string, number> = {
  available: 0,
  reserved: 1,
  occupied: 2,
  cleaning: 3,
}

export const isTableFilterActive = (filter: TableFilter): boolean =>
  filter.area !== null || filter.status !== 'all' || filter.minCapacity !== null || filter.vipOnly

/** How many facets are currently narrowing the list (used on the Filter badge). */
export const activeTableFacetCount = (filter: TableFilter): number =>
  (filter.status !== 'all' ? 1 : 0) +
  (filter.minCapacity !== null ? 1 : 0) +
  (filter.vipOnly ? 1 : 0) +
  (filter.area !== null ? 1 : 0)

/**
 * Apply the filter + free-text search and return the sorted list.
 * Tables without a status default to `available` so they stay filterable.
 */
export function applyTableFilters<T extends FilterableTable>(
  tables: T[],
  filter: TableFilter,
  search = '',
): T[] {
  const needle = search.trim().toLowerCase()
  const filtered = tables.filter((table) => {
    if (filter.area !== null && tableArea(table) !== filter.area) return false
    if (filter.status !== 'all' && (table.status ?? 'available') !== filter.status) return false
    if (filter.minCapacity !== null && (table.capacity ?? 0) < filter.minCapacity) return false
    if (filter.vipOnly && !table.isVip) return false
    if (!needle) return true
    return (
      table.name.toLowerCase().includes(needle) ||
      (table.area ?? '').toLowerCase().includes(needle) ||
      String(table.capacity ?? '').includes(needle)
    )
  })

  const byName = (a: FilterableTable, b: FilterableTable) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })

  switch (filter.sort) {
    case 'name_desc':
      return [...filtered].sort((a, b) => byName(b, a))
    case 'capacity_desc':
      return [...filtered].sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0) || byName(a, b))
    case 'capacity_asc':
      return [...filtered].sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0) || byName(a, b))
    case 'status':
      return [...filtered].sort(
        (a, b) =>
          (STATUS_ORDER[a.status ?? 'available'] ?? 9) - (STATUS_ORDER[b.status ?? 'available'] ?? 9) ||
          byName(a, b),
      )
    default:
      return [...filtered].sort(byName)
  }
}

/** Read the persisted table filter (session-scoped). */
let storedTableFilter: TableFilter = DEFAULT_TABLE_FILTER

export function getStoredTableFilter(): TableFilter {
  return storedTableFilter
}

/** Persist (or clear) the table filter. */
export function setStoredTableFilter(filter: TableFilter): void {
  storedTableFilter = filter
}

/**
 * Table filter state + free-text search, persisted across tab switches so the
 * chosen "sort by seats" / "only available" view sticks while the waiter moves
 * between the Tables and Sessions tabs.
 */
export function useTableFilter(): {
  filter: TableFilter
  setFilter: (next: TableFilter) => void
  updateFilter: (patch: Partial<TableFilter>) => void
  resetFilter: () => void
  search: string
  setSearch: (next: string) => void
} {
  const [filter, setFilter] = useState<TableFilter>(() => getStoredTableFilter())
  const [search, setSearch] = useState('')
  useEffect(() => {
    setStoredTableFilter(filter)
  }, [filter])

  return {
    filter,
    setFilter,
    updateFilter: (patch: Partial<TableFilter>) => setFilter((prev) => ({ ...prev, ...patch })),
    resetFilter: () => setFilter(DEFAULT_TABLE_FILTER),
    search,
    setSearch,
  }
}
