import { useEffect, useState } from 'react'

/**
 * Veg / Non-veg (food type) classification helpers shared by every screen that
 * creates, edits, lists or orders a dish — admin menu, supervisor menu, waiter
 * menu browse and the waiter order screen.
 *
 * `foodType` is the canonical field on `MenuItem`. Records written before the
 * field existed (and the E2E fixtures) only carry the legacy `isVeg` boolean,
 * so every helper falls back to it. A dish with neither flag is "not set": it
 * is labelled as such in the admin UI and deliberately keeps showing under
 * every filter, so an unclassified dish can never silently disappear from the
 * waiter's menu.
 */
export type FoodType = 'veg' | 'non_veg'

/** Anything carrying a food type, incl. the legacy `isVeg` boolean. */
export interface FoodTypeCarrier {
  foodType?: FoodType
  isVeg?: boolean
}

/** Options offered by the dish form's "Food type" select. */
export const FOOD_TYPE_OPTIONS: { value: FoodType; label: string }[] = [
  { value: 'veg', label: 'Veg' },
  { value: 'non_veg', label: 'Non-Veg' },
]

/** Filter values for the Veg / Non-Veg chips (menu screens). */
export const foodTypeFilters = ['all', 'veg', 'non_veg'] as const
export type FoodTypeFilter = (typeof foodTypeFilters)[number]

/** Shared sessionStorage key for the last-selected food type filter. */
export const FOOD_TYPE_FILTER_STORAGE_KEY = 'beeshive_foodTypeFilter'
let storedFoodTypeFilter: FoodTypeFilter = 'all'

/**
 * Resolve a dish's food type, falling back to the legacy `isVeg` boolean.
 * Returns null when the dish has never been classified.
 */
export function resolveFoodType(item: FoodTypeCarrier): FoodType | null {
  if (item.foodType === 'veg' || item.foodType === 'non_veg') return item.foodType
  if (typeof item.isVeg === 'boolean') return item.isVeg ? 'veg' : 'non_veg'
  return null
}

/** Human label for a resolved food type ("Not set" when unclassified). */
export const foodTypeLabel = (type: FoodType | null): string =>
  type === 'veg' ? 'Veg' : type === 'non_veg' ? 'Non-Veg' : 'Not set'

/** Short marker used on compact rows / tiles. */
export const foodTypeShort = (type: FoodType | null): string =>
  type === 'veg' ? 'V' : type === 'non_veg' ? 'N' : '-'

/**
 * Does a dish survive the selected food type filter?
 * Unclassified dishes always match (see the module comment).
 */
export function matchesFoodType(item: FoodTypeCarrier, filter: FoodTypeFilter): boolean {
  if (filter === 'all') return true
  const type = resolveFoodType(item)
  return type === null || type === filter
}

/** Counts per filter value, used by the filter chips. */
export function countFoodTypes(items: FoodTypeCarrier[]): Record<FoodTypeFilter, number> {
  const counts: Record<FoodTypeFilter, number> = { all: items.length, veg: 0, non_veg: 0 }
  items.forEach((item) => {
    const type = resolveFoodType(item)
    if (type) counts[type] += 1
  })
  return counts
}

/** Read the last-selected food type filter (scoped to the browser session). */
export function getStoredFoodTypeFilter(): FoodTypeFilter {
  return storedFoodTypeFilter
}

/** Persist the food type filter to sessionStorage (best effort). */
export function setStoredFoodTypeFilter(filter: FoodTypeFilter): void {
  storedFoodTypeFilter = filter
}

/**
 * Food type filter state that survives tab switches (same sessionStorage
 * pattern as the table area filter). Every menu screen uses this so the waiter
 * does not have to re-pick "Veg" each time they open a table.
 */
export function useFoodTypeFilter(): [FoodTypeFilter, (filter: FoodTypeFilter) => void] {
  const [filter, setFilter] = useState<FoodTypeFilter>(() => getStoredFoodTypeFilter())
  useEffect(() => {
    setStoredFoodTypeFilter(filter)
  }, [filter])
  return [filter, setFilter]
}
