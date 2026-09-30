/**
 * Table area (section) helpers shared by every screen that lists tables.
 *
 * Tables are categorised by their `area` field so that the admin Table
 * Management screen and the waiter table views all show Indoor / Garden /
 * Terrace / ... as separate groups instead of one flat list.
 */
export const TABLE_AREAS = ['Indoor', 'Outdoor', 'Garden', 'Terrace', 'Private Room']

/** Friendly label used when a table has no area assigned. */
export const UNASSIGNED_AREA = 'No Area Assigned'

/** Shared sessionStorage key for the last-selected table area filter. */
export const TABLE_AREA_STORAGE_KEY = 'beeshive_tableAreaFilter'
let storedAreaFilter: string | null = null

/**
 * Read the last-selected table area filter from sessionStorage.
 * Returns null when nothing was stored or storage is unavailable.
 * Scoped to the current browser session (tab) so it resets on browser restart.
 */
export function getStoredAreaFilter(): string | null {
  return storedAreaFilter
}

/** Persist (or clear) the last-selected table area filter to sessionStorage. */
export function setStoredAreaFilter(area: string | null): void {
  storedAreaFilter = area
}

/** Area of a table, falling back to a readable label when it is missing/blank. */
export const tableArea = (table: { area?: string }): string => table.area?.trim() || UNASSIGNED_AREA

export interface TableAreaGroup<T> {
  area: string
  tables: T[]
}

/**
 * Group tables area-wise.
 *
 * Groups follow the configured `TABLE_AREAS` order (Indoor first, then Garden,
 * ...), custom areas added later come next in alphabetical order and tables
 * without an area are always listed last.
 */
export function groupTablesByArea<T extends { area?: string }>(tables: T[]): TableAreaGroup<T>[] {
  const buckets = new Map<string, T[]>()
  tables.forEach((table) => {
    const area = tableArea(table)
    const bucket = buckets.get(area)
    if (bucket) bucket.push(table)
    else buckets.set(area, [table])
  })

  const known = TABLE_AREAS.filter((area) => buckets.has(area))
  const custom = Array.from(buckets.keys())
    .filter((area) => !TABLE_AREAS.includes(area) && area !== UNASSIGNED_AREA)
    .sort((a, b) => a.localeCompare(b))
  const ordered = [...known, ...custom]
  if (buckets.has(UNASSIGNED_AREA)) ordered.push(UNASSIGNED_AREA)

  return ordered.map((area) => ({ area, tables: buckets.get(area) as T[] }))
}
