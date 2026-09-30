import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { UtensilsCrossed, Clock, Star, Users } from 'lucide-react'
import { useViewPreference, viewPreferenceKeys } from '../lib/viewPreference'
import { hasHalfPlatePrice } from '../lib/servingType'
import ViewModeSelect from './ViewModeSelect'

/** Dish layouts offered by the waiter menu's view control. */
const MENU_VIEW_MODES = ['small', 'medium', 'large', 'list'] as const
type MenuViewMode = (typeof MENU_VIEW_MODES)[number]

const MENU_VIEW_OPTIONS = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'list', label: 'List' },
] as const satisfies readonly { id: MenuViewMode; label: string }[]

interface WaiterMenuBrowseProps {
  onGoToSessions: () => void
  searchQuery?: string
}
/**
 * Read-only menu browser for the waiter Orders/Menu tab.
 * Shows the full menu (with categories & today's specials) so the waiter can
 * answer guest questions — without active order buttons.
 */
export default function WaiterMenuBrowse({
  onGoToSessions,
  searchQuery = '',
}: WaiterMenuBrowseProps) {
  const { menu, categories, getTodaySpecials } = useRestaurant()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  // UI-only preference: survives tab switches, navigation and a page refresh.
  const [viewMode, setViewMode] = useViewPreference<MenuViewMode>(
    viewPreferenceKeys.waiterMenu,
    'medium',
    MENU_VIEW_MODES,
  )

  const availableCategories = categories.filter((c) => c.active)
  const availableMenuItems = menu.filter((item) => item.available && item.active)
  const todaySpecials = getTodaySpecials()

  const normalizedSearch = searchQuery.trim().toLowerCase()

const filteredItems = availableMenuItems.filter((item) => {
  const matchesCategory =
    selectedCategory === null || item.categoryId === selectedCategory

  if (!normalizedSearch) {
    return matchesCategory
  }

  const category = categories.find((c) => c.id === item.categoryId)

  const matchesSearch =
    item.name.toLowerCase().includes(normalizedSearch) ||
    (item.description || '').toLowerCase().includes(normalizedSearch) ||
    (category?.name || '').toLowerCase().includes(normalizedSearch)

  return matchesCategory && matchesSearch
})

  return (
    <div className="space-y-4">
      {/* Info Banner — View Only */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-[20px] border border-orange-100 bg-orange-50/80 p-4 sm:flex-row sm:items-center">
        <div>
  <p className="font-bold text-slate-900">Menu — view only</p>

  <p className="mt-0.5 text-xs text-slate-500">
    Browse items to answer guest questions. To place an order: Sessions → select an occupied table → Menu.
  </p>

  {normalizedSearch && (
    <p className="mt-2 inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-700">
      Global search: “{searchQuery}”
    </p>
  )}
</div>
        <button
          onClick={onGoToSessions}
          className="flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600 active:bg-orange-700 sm:w-auto"
        >
          <Users size={16} />
          Go to Sessions
        </button>
      </div>

      {/* Today's Specials */}
      {todaySpecials.length > 0 && (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
            <Star size={15} className="fill-amber-500 text-amber-500" /> Today's Specials
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {todaySpecials.map((item) => (
              <span key={item.id} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs">
                {item.name} · <strong className="text-orange-600">₹{item.price}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter — Horizontal Scroll on Mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
            selectedCategory === null
              ? 'bg-linear-to-r from-orange-500 to-amber-500 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-orange-50 active:bg-slate-100'
          }`}
        >
          <UtensilsCrossed size={14} /> All Items
        </button>
        {availableCategories.map((category) => {
          const itemCount = menu.filter((m) => m.categoryId === category.id && m.available && m.active).length
          const isSelected = selectedCategory === category.id

          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                isSelected
                  ? 'bg-linear-to-r from-orange-500 to-amber-500 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-orange-50 active:bg-slate-100'
              }`}
            >
              <span>{category.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {itemCount}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        <ViewModeSelect
          value={viewMode}
          options={MENU_VIEW_OPTIONS}
          onChange={setViewMode}
          label="Menu view"
        />
      </div>
      </div>

      {/* Menu Item Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">No items available in this category.</p>
        </div>
      ) : (
        <div className={
          viewMode === 'list'
            ? 'space-y-2'
            : viewMode === 'small'
              ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'
              : viewMode === 'large'
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
        }>
          {filteredItems.map((item) => {
            const isSpecial = todaySpecials.some((s) => s.id === item.id)
            return (
              <div
                key={item.id}
                className={`${viewMode === 'list' ? 'flex items-center gap-3 rounded-xl px-3 py-2.5' : 'relative flex flex-col justify-between rounded-[20px] p-4'} border bg-white shadow-xs transition hover:shadow-md ${
                  isSpecial ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200/80'
                }`}
              >
                <div className={viewMode === 'list' ? 'flex min-w-0 flex-1 items-center gap-3' : ''}>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.imageAlt || item.name}
                      className={viewMode === 'list' ? 'h-12 w-12 shrink-0 rounded-lg object-cover' : viewMode === 'small' ? 'mb-2 h-20 w-full rounded-xl object-cover' : viewMode === 'large' ? 'mb-3 h-36 w-full rounded-xl object-cover' : 'mb-3 h-28 w-full rounded-xl object-cover'}
                    />
                  )}
                  <div className={viewMode === 'list' ? 'min-w-0 flex-1' : 'w-full'}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`${viewMode === 'small' ? 'text-xs' : 'text-sm'} font-bold text-slate-900 ${viewMode === 'list' ? 'truncate' : ''}`}>{item.name}</h3>
                      {isSpecial && <Star size={16} className="shrink-0 fill-amber-400 text-amber-500" />}
                    </div>
                    {viewMode !== 'small' && item.description && (
                      <p className={`${viewMode === 'list' ? 'hidden sm:block line-clamp-1' : 'line-clamp-2'} mt-1 text-xs text-slate-500`}>{item.description}</p>
                    )}
                  </div>
                </div>

                <div className={`${viewMode === 'list' ? 'flex shrink-0 items-center gap-3' : 'mt-4 flex items-center justify-between text-xs sm:text-sm'}`}>
                  <span className={`${viewMode === 'small' ? 'text-sm' : 'text-base'} font-black text-orange-600`}>₹{item.price}{hasHalfPlatePrice(item.halfPlatePrice) && <span className="ml-1 text-[11px] font-bold text-emerald-600">· HALF ₹{item.halfPlatePrice}</span>}</span>
                  <div className="flex items-center gap-2">
                    {item.preparationTime && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock size={12} />
                        {item.preparationTime}m
                      </span>
                    )}
                    {isSpecial && viewMode !== 'small' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Special
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}