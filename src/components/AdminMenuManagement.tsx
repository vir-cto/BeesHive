import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { MenuItem } from '../context/RestaurantContext'
import { Plus, Trash2, Sparkles, Clock, UtensilsCrossed, AlertTriangle, IndianRupee, Search, Edit2, AlertCircle, Loader2, CheckCircle } from 'lucide-react'
import ImageUpload from './ImageUpload'
import FoodTypeMark from './FoodTypeBadge'
import { matchesFoodType, useFoodTypeFilter, foodTypeFilters, countFoodTypes } from '../lib/menuFilters'
import { FOOD_TYPE_OPTIONS } from '../lib/menuFilters'
import type { FoodType } from '../lib/menuFilters'
import { dataMode } from '../services/firebase/config'
import { uploadMenuImage, deleteMenuImage, getMenuImagePath, isDurableImageUrl } from '../services/firebase/storageService'
import { saveDoc, deleteEntity, FIRESTORE_COLLECTIONS } from '../services/firebase/dataService'
import { useViewPreference, viewPreferenceKeys } from '../lib/viewPreference'
import ViewModeSelect from './ViewModeSelect'

/** Dish layouts offered by the admin menu view control. */
const MENU_VIEW_MODES = ['list', 'small', 'large'] as const
type ViewMode = (typeof MENU_VIEW_MODES)[number]

const MENU_VIEW_OPTIONS = [
  { id: 'list', label: 'List' },
  { id: 'small', label: 'Small Tiles' },
  { id: 'large', label: 'Large Tiles' },
] as const satisfies readonly { id: ViewMode; label: string }[]

/** Admin-only menu catalogue: browse dishes as list rows, small tiles or large tiles. */
export default function AdminMenuManagement() {
  const {
    categories, menu, addCategory, addMenuItem, updateMenuItemDetails, updateMenuItemPrice,
    toggleMenuItemAvailability, setSpecialDate, deleteMenuItem, deleteCategory, getTodaySpecials,
  } = useRestaurant()

  const activeCategories = categories.filter((c) => c.active)
  const specialIds = new Set(getTodaySpecials().map((s) => s.id))

  const [newCat, setNewCat] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [newDishFor, setNewDishFor] = useState<string | null>(null)
  const [dishForm, setDishForm] = useState({ name: '', price: '', halfPlatePrice: '', preparationTime: '15', description: '', imageUrl: '', imageAlt: '', foodType: 'veg' as FoodType })
  const [dishImageFile, setDishImageFile] = useState<File | null>(null)
  const [dishSaving, setDishSaving] = useState(false)
  const [dishError, setDishError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
const [editSaved, setEditSaved] = useState(false)
const [editError, setEditError] = useState('')
  const [editPrice, setEditPrice] = useState<{ id: string; value: string } | null>(null)
    const [confirmCat, setConfirmCat] = useState<{ id: string; name: string; count: number } | null>(null)
  const [confirmItem, setConfirmItem] = useState<MenuItem | null>(null)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  // UI-only preference: survives tab switches, navigation and a page refresh.
  const [viewMode, setViewMode] = useViewPreference<ViewMode>(
    viewPreferenceKeys.adminMenu,
    'list',
    MENU_VIEW_MODES,
  )

    // When true the screen shows ALL active dishes across every category in a
  // single combined list (instead of one panel per category).
  const [showAll, setShowAll] = useState(false)
  // When set, only the dishes of that single category are shown within the
  // combined list above the per-category panels. null == "all categories".
  const [category, setCategory] = useState<string | null>(null)
  const [menuSearch, setMenuSearch] = useState('')
  // Veg / Non-Veg filter chips — shared state that survives tab switches.
  const [foodTypeFilter, setFoodTypeFilter] = useFoodTypeFilter()

      // Active dishes across all categories, used by the "ALL" view + live search.
  const allActiveItems = menu.filter((m) => m.active)
  // Per-filter dish counts for the Veg / Non-Veg chips.
  const foodTypeCounts = countFoodTypes(allActiveItems)
  const searchedItems = allActiveItems.filter((m) => {
    if (category) return m.categoryId === category
    return true
  }).filter((m) => matchesFoodType(m, foodTypeFilter)).filter((m) => {
    if (!menuSearch.trim()) return true
    const needle = menuSearch.toLowerCase()
    return m.name.toLowerCase().includes(needle) || (m.description ?? '').toLowerCase().includes(needle) || (m.category ?? '').toLowerCase().includes(needle)
  })

  const todayStr = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCat.trim()) return
    addCategory(newCat)
    setNewCat('')
    setAddingCat(false)
  }

  const handleAddDish = async (e: React.FormEvent, categoryId: string) => {
    e.preventDefault()
    if (dishSaving) return
    setDishError('')
    const price = parseFloat(dishForm.price)
    if (!dishForm.name.trim() || !Number.isFinite(price) || price < 0) {
      setDishError('Enter a dish name and a valid price.')
      return
    }
    // Half plate price is OPTIONAL: empty means "full plate only" (stored as
    // null so existing dishes behave exactly as before). When present it must
    // be a valid non-negative amount — never NaN/string reaches Firestore.
    const halfRaw = dishForm.halfPlatePrice.trim()
    let halfPlatePrice: number | null = null
    if (halfRaw !== '') {
      const parsedHalf = parseFloat(halfRaw)
      if (!Number.isFinite(parsedHalf) || parsedHalf < 0) {
        setDishError('Half plate price must be a non-negative number (or leave it empty).')
        return
      }
      halfPlatePrice = parsedHalf
    }
    const cat = categories.find((c) => c.id === categoryId)
    setDishSaving(true)
    let created: MenuItem | null = null
    try {
      created = addMenuItem({
        name: dishForm.name.trim(),
        price,
        halfPlatePrice,
        description: dishForm.description.trim(),
        preparationTime: parseInt(dishForm.preparationTime) || 15,
        category: cat?.name ?? '',
        categoryId,
        available: true,
        active: true,
        // The permanent image URL is written only after the Storage upload has
        // finished (below); a browser-local preview is never persisted.
        imageUrl: dishImageFile
          ? undefined
          : isDurableImageUrl(dishForm.imageUrl) ? dishForm.imageUrl : undefined,
        imageAlt: dishForm.imageAlt || dishForm.name.trim(),
        foodType: dishForm.foodType,
      })
      if (dataMode === 'firebase') {
        if (dishImageFile) {
          // 1) Upload to Firebase Storage under the PERMANENT menu-item id.
          const uploaded = await uploadMenuImage(
            dishImageFile,
            import.meta.env.VITE_FIREBASE_PROJECT_ID,
            created.id,
          )
          // 2) Persist imageUrl + imagePath on the SAME Firestore menu item and
          //    wait for the write to complete — the sync engine's debounced push
          //    is not the source of truth here.
          await saveDoc(FIRESTORE_COLLECTIONS.menu, created.id, {
            ...created,
            imageUrl: uploaded.imageUrl,
            imagePath: uploaded.imagePath,
            updatedAt: Date.now(),
          }, { merge: true })
          // 3) Mirror into local state (the live snapshot will agree).
          updateMenuItemDetails(created.id, { imageUrl: uploaded.imageUrl, imagePath: uploaded.imagePath })
        } else {
          // No image file: just persist the menu item to Firestore.
          await saveDoc(FIRESTORE_COLLECTIONS.menu, created.id, created, { merge: true })
        }
      }
      // Only after ALL steps succeeded: close the form, clear it, show success.
      setNewDishFor(null)
      setDishImageFile(null)
      setDishForm({ name: '', price: '', halfPlatePrice: '', preparationTime: '15', description: '', imageUrl: '', imageAlt: '', foodType: 'veg' })
    } catch (err) {
      // Never leave a menu item with a broken/missing image behind: remove the
      // partially created document and any uploaded Storage object, then keep
      // the form open with the real error.
      if (created) {
        if (dataMode === 'firebase') {
          await deleteEntity(FIRESTORE_COLLECTIONS.menu, created.id).catch(() => {})
          await deleteMenuImage(getMenuImagePath(import.meta.env.VITE_FIREBASE_PROJECT_ID, created.id)).catch(() => {})
        }
        deleteMenuItem(created.id)
      }
      setDishError(
        err instanceof Error && err.message
          ? `Dish could not be saved: ${err.message}`
          : 'Dish could not be saved. Please try again.',
      )
    } finally {
      setDishSaving(false)
    }
  }

  const savePrice = (itemId: string) => {
    if (!editPrice) return
    const v = parseFloat(editPrice.value)
    if (Number.isFinite(v) && v >= 0) updateMenuItemPrice(itemId, v)
    setEditPrice(null)
  }

  const toggleSpecial = (itemId: string, make: boolean) => {
    setSpecialDate(itemId, make ? todayStr() : undefined)
  }

  const openEdit = (item: MenuItem) => {
  setEditingItem(item)
  setEditSaving(false)
  setEditSaved(false)
  setEditError('')

  setDishForm({
    name: item.name,
    price: String(item.price),
    halfPlatePrice:
      item.halfPlatePrice != null && Number.isFinite(item.halfPlatePrice)
        ? String(item.halfPlatePrice)
        : '',
    preparationTime: String(item.preparationTime),
    description: item.description ?? '',
    imageUrl: item.imageUrl ?? '',
    imageAlt: item.imageAlt ?? item.name,
    foodType: item.foodType ?? (item.isVeg === false ? 'non_veg' : 'veg'),
  })
}

  const saveEdit = async (event: React.FormEvent) => {
  event.preventDefault()

  if (!editingItem || editSaving) return

  setEditError('')
  setEditSaved(false)

  const price = Number(dishForm.price)
  const preparationTime = Number(dishForm.preparationTime)

  const halfRaw = dishForm.halfPlatePrice.trim()

  let halfPlatePrice: number | null = null

  if (halfRaw !== '') {
    const parsedHalf = parseFloat(halfRaw)

    if (!Number.isFinite(parsedHalf) || parsedHalf < 0) {
      setEditError('Half plate price must be a non-negative number or left empty.')
      return
    }

    halfPlatePrice = parsedHalf
  }

  if (!dishForm.name.trim()) {
    setEditError('Dish name is required.')
    return
  }

  if (!Number.isFinite(price) || price < 0) {
    setEditError('Please enter a valid price.')
    return
  }

  if (!Number.isFinite(preparationTime) || preparationTime < 1) {
    setEditError('Preparation time must be at least 1 minute.')
    return
  }

  const cat = categories.find(
    (entry) => entry.id === editingItem.categoryId,
  )

  const details: Partial<MenuItem> = {
    name: dishForm.name.trim(),
    description: dishForm.description.trim(),
    preparationTime,
    halfPlatePrice,
    category: cat?.name ?? editingItem.category,

    imageUrl:
      dishForm.imageUrl === ''
        ? undefined
        : isDurableImageUrl(dishForm.imageUrl)
          ? dishForm.imageUrl
          : editingItem.imageUrl,

    imageAlt:
      dishForm.imageAlt.trim() || dishForm.name.trim(),

    foodType: dishForm.foodType,
  }

  try {
    setEditSaving(true)

    // Update application state.
    updateMenuItemDetails(editingItem.id, details)

    // Price uses the existing audited price update path.
    updateMenuItemPrice(editingItem.id, price)

    // In Firebase mode, write the edited dish details immediately.
    // The normal sync engine will also persist the price update.
    if (dataMode === 'firebase') {
      await saveDoc(
        FIRESTORE_COLLECTIONS.menu,
        editingItem.id,
        {
          ...details,
          price,
          updatedAt: Date.now(),
        },
        { merge: true },
      )
    }

    // Show successful save.
    setEditSaved(true)
    setEditSaving(false)
  } catch (err) {
    setEditSaving(false)

    setEditError(
      err instanceof Error && err.message
        ? `Dish could not be saved: ${err.message}`
        : 'Dish could not be saved. Please try again.',
    )
  }
}

  /** Shared per-dish action controls, reused across all view modes. */
  const itemActions = (item: MenuItem) => (
    <>
      <button onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700 hover:bg-orange-100" title="Edit dish"><Edit2 size={11} /> <span className="hidden sm:inline">Edit</span></button>
      {editPrice?.id === item.id ? (
        <input autoFocus type="number" min="0" step="0.01" value={editPrice.value} onChange={(e) => setEditPrice({ id: item.id, value: e.target.value })} onBlur={() => savePrice(item.id)} onKeyDown={(e) => { if (e.key === 'Enter') savePrice(item.id) }} className="w-20 rounded border border-orange-300 px-2 py-1 text-sm outline-none" />
      ) : (
        <button onClick={() => setEditPrice({ id: item.id, value: String(item.price) })} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100" title="Edit price"><IndianRupee size={11} /> {item.price}</button>
      )}
      <button onClick={() => toggleSpecial(item.id, !specialIds.has(item.id))} className={`rounded-md px-2 py-1 text-[10px] font-bold ${specialIds.has(item.id) ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{specialIds.has(item.id) ? '★ Special' : 'Special'}</button>
      <button onClick={() => toggleMenuItemAvailability(item.id, !item.available)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${item.available ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>{item.available ? 'Available' : 'Unavailable'}</button>
      <button onClick={() => setConfirmItem(item)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete dish"><Trash2 size={14} /></button>
    </>
  )

  const renderItems = (items: MenuItem[]) => {
    if (items.length === 0) return <p className="py-4 text-center text-xs text-slate-400">No dishes in this category yet.</p>

    // ── LIST VIEW — compact rows with thumbnail ──────────────────────────────
    if (viewMode === 'list') {
      return (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:border-slate-200 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.imageAlt || item.name}                   className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover sm:h-11 sm:w-11" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-orange-100 to-amber-100"><UtensilsCrossed size={16} className="text-orange-400" /></span>
                )}
                <span className="truncate text-sm font-semibold text-slate-800">{item.name}</span>
                <FoodTypeMark foodType={item.foodType} isVeg={item.isVeg} size="sm" />
                {item.description && <span className="hidden truncate text-xs text-slate-400 sm:block">— {item.description}</span>}
                {specialIds.has(item.id) && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Sparkles size={10} /> Special</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock size={12} /> {item.preparationTime}m</span>
                {itemActions(item)}
              </div>
            </div>
          ))}
        </div>
      )
    }

    // ── SMALL TILES — dense image cards ──────────────────────────────────────
    if (viewMode === 'small') {
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <div key={item.id} className={`overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${specialIds.has(item.id) ? 'border-amber-300' : 'border-slate-200'}`}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.imageAlt || item.name} className="h-20 w-full object-cover" />
              ) : (
                <span className="flex h-20 w-full items-center justify-center bg-linear-to-br from-orange-100 to-amber-100"><UtensilsCrossed size={22} className="text-orange-400" /></span>
              )}
              <div className="p-2">
                <div className="flex items-center gap-1">
                  <h4 className="line-clamp-1 flex-1 text-xs font-bold text-slate-800">{item.name}</h4>
                  {specialIds.has(item.id) && <Sparkles size={11} className="shrink-0 text-amber-500" />}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-emerald-700">₹{item.price}</span>
                  <span className="flex items-center gap-0.5 text-slate-400"><Clock size={10} /> {item.preparationTime}m</span>
                </div>
                <div className={`mt-1 text-[10px] font-bold ${item.available ? 'text-emerald-600' : 'text-rose-500'}`}>{item.available ? '● Available' : '● Unavailable'}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">{itemActions(item)}</div>
              </div>
            </div>
          ))}
        </div>
      )
    }

    // ── LARGE TILES — big photo cards ────────────────────────────────────────
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${specialIds.has(item.id) ? 'border-amber-300' : 'border-slate-200'}`}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.imageAlt || item.name} className="h-44 w-full object-cover" />
            ) : (
              <span className="flex h-44 w-full items-center justify-center bg-linear-to-br from-orange-100 to-amber-100"><UtensilsCrossed size={40} className="text-orange-400" /></span>
            )}
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                {specialIds.has(item.id) && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Sparkles size={10} /> Special</span>}
              </div>
              {item.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="text-sm font-black text-emerald-700">₹{item.price}</span>
                <span className="flex items-center gap-1"><Clock size={12} /> {item.preparationTime}m</span>
                <span className={`ml-auto font-bold ${item.available ? 'text-emerald-600' : 'text-rose-500'}`}>{item.available ? 'Available' : 'Unavailable'}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">{itemActions(item)}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

    return (
    <div className="space-y-5">
      {/* header + add category */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Menu Management</h2>
          <p className="text-sm text-slate-500">Categories &amp; dishes that appear on the waiter / order screens</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* ALL / category filter chips + live search */}
                    <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setShowAll(true); setCategory(null) }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${showAll && category === null ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-orange-100'}`}
            >
              ALL
            </button>
            {activeCategories.map((c) => {
              const cnt = menu.filter((m) => m.categoryId === c.id && m.active).length
              return (
                <button
                  key={c.id}
                  onClick={() => { setShowAll(true); setCategory(c.id) }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${category === c.id && showAll ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-orange-100'}`}
                >
                  {c.name} ({cnt})
                </button>
              )
            })}
          </div>
          {/* Veg / Non-Veg filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {foodTypeFilters.map((f) => (
              <button
                key={f}
                onClick={() => setFoodTypeFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${foodTypeFilter === f ? 'text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-orange-100'} ${
                  foodTypeFilter === f
                    ? f === 'veg'
                      ? 'bg-emerald-500'
                      : f === 'non_veg'
                        ? 'bg-rose-500'
                        : 'bg-linear-to-br from-orange-500 to-amber-500'
                    : ''
                }`}
                title={f === 'all' ? 'Show all dishes' : f === 'veg' ? 'Show only veg dishes' : 'Show only non-veg dishes'}
              >
                {f === 'all' ? 'All' : f === 'veg' ? '🟢 Veg' : '🔴 Non-Veg'} ({foodTypeCounts[f]})
              </button>
            ))}
          </div>
          <div className="relative w-full min-w-56 max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search dishes…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-orange-400"
            />
          </div>
          {/* View control — list / small tiles / large tiles (persisted) */}
          <ViewModeSelect
            value={viewMode}
            options={MENU_VIEW_OPTIONS}
            onChange={setViewMode}
            label="Menu view"
          />
          {!addingCat ? (
          <button
            onClick={() => setAddingCat(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,0.5)] hover:from-orange-600 hover:to-amber-600"
          >
            <Plus size={16} /> Add Category
          </button>
        ) : (
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              autoFocus
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Category name"
              className="w-48 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
            <button type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">
              Save
            </button>
            <button type="button" onClick={() => setAddingCat(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </form>
        )}
        </div>
            </div>
      {/* ALL view — single combined dish list across every category */}
      {showAll && (
        <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900">All Dishes</h3>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-700">
              {searchedItems.length} dish{searchedItems.length === 1 ? '' : 'es'}
                        </span>
          </div>
          {searchedItems.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">
              {menuSearch ? 'No dishes match your search.' : 'No active dishes.'}
            </p>
          ) : (
            renderItems(searchedItems)
          )}
        </div>
      )}
      {!showAll && (
        <div className="space-y-4">
          {activeCategories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <UtensilsCrossed className="mx-auto mb-3 text-slate-300" size={40} />
            <p className="text-sm font-semibold text-slate-500">No categories yet</p>
            <p className="text-xs text-slate-400">Click "Add Category" to create your first menu category.</p>
          </div>
        ) : activeCategories.map((cat) => {
          const items = menu.filter((m) => m.categoryId === cat.id && m.active && matchesFoodType(m, foodTypeFilter))
          const isAddingDish = newDishFor === cat.id
          return (
            <div key={cat.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-linear-to-r from-slate-50 to-white px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-orange-500 to-amber-500 text-sm font-bold text-white shadow">{items.length}</span>
                  <div><h3 className="text-base font-bold text-slate-900">{cat.name}</h3><p className="text-xs text-slate-400">{items.length} dish{items.length === 1 ? '' : 'es'}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setNewDishFor(cat.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"><Plus size={14} /> Add Dish</button>
                  <button onClick={() => setConfirmCat({ id: cat.id, name: cat.name, count: items.length })} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100" title="Delete category"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
              {isAddingDish && (
                <form onSubmit={(e) => handleAddDish(e, cat.id)} className="border-b border-slate-100 bg-amber-50/50 p-4">
                  {dishError && (
                    <p className="mb-3 flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      <AlertCircle size={13} /> {dishError}
                    </p>
                  )}
                  <div className="flex flex-col gap-4 lg:flex-row">
                    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                      <input autoFocus value={dishForm.name} onChange={(e) => setDishForm({ ...dishForm, name: e.target.value })} placeholder="Dish name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
                      <input value={dishForm.description} onChange={(e) => setDishForm({ ...dishForm, description: e.target.value })} placeholder="Description" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
                      <div className="flex gap-2">
                        <input type="number" min="0" step="0.01" value={dishForm.price} onChange={(e) => setDishForm({ ...dishForm, price: e.target.value })} placeholder="Price" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
                        <input type="number" min="1" value={dishForm.preparationTime} onChange={(e) => setDishForm({ ...dishForm, preparationTime: e.target.value })} placeholder="Min" className="w-20 rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-orange-400" />
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={dishForm.halfPlatePrice}
                        onChange={(e) => setDishForm({ ...dishForm, halfPlatePrice: e.target.value })}
                        placeholder="Half plate price (optional)"
                        title="Optional — leave empty when the dish has no half plate"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                      />
                      <select value={dishForm.foodType} onChange={(e) => setDishForm({ ...dishForm, foodType: e.target.value as FoodType })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-orange-400" title="Veg or Non-Veg (asked only here in admin)">
                        {FOOD_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <div className="flex items-end">
                        <p className="text-xs text-slate-400">Add a photo of the dish — any image format (JPG, PNG, WEBP, GIF, SVG…) up to 5&nbsp;MB. It will appear on the waiter / order screens.</p>
                      </div>
                    </div>
                    <div className="w-full shrink-0 lg:w-64">
                      <ImageUpload
                        currentImageUrl={dishForm.imageUrl || undefined}
                        currentImageAlt={dishForm.imageAlt || undefined}
                        onImageSelected={(file, url) => { setDishImageFile(file); setDishForm((f) => ({ ...f, imageUrl: url, imageAlt: f.imageAlt || f.name.trim() })) }}
                        onImageRemoved={() => { setDishImageFile(null); setDishForm((f) => ({ ...f, imageUrl: '', imageAlt: '' })) }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="submit"
                      disabled={dishSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {dishSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add'}
                    </button>
                    <button type="button" disabled={dishSaving} onClick={() => { setNewDishFor(null); setDishImageFile(null); setDishForm({ name: '', price: '', halfPlatePrice: '', preparationTime: '15', description: '', imageUrl: '', imageAlt: '', foodType: 'veg' }) }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  </div>
                </form>
              )}
              <div className="p-4">
                {renderItems(items)}
              </div>
            </div>
          )
        })}
            </div>
      )}
      {editingItem && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/40 p-3 sm:p-4"
    onClick={() => {
      if (!editSaving) {
        setEditingItem(null)
      }
    }}
  >
    <form
      onSubmit={saveEdit}
      onClick={(event) => event.stopPropagation()}
      className="flex w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Edit Dish
          </h3>

          <p className="text-xs text-slate-500">
            Update the name, price, image, category details and preparation time.
          </p>
        </div>

        <button
          type="button"
          disabled={editSaving}
          onClick={() => setEditingItem(null)}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Scrollable form content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {editError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
            <AlertCircle size={16} />
            <span>{editError}</span>
          </div>
        )}

        {editSaved && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
            <CheckCircle size={16} />
            <span>Dish saved successfully.</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Dish name

            <input
              required
              disabled={editSaving}
              value={dishForm.name}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  name: e.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Category

            <select
              value={editingItem.categoryId}
              disabled
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal"
            >
              <option value={editingItem.categoryId}>
                {editingItem.category}
              </option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Price (₹)

            <input
              required
              disabled={editSaving}
              type="number"
              min="0"
              step="0.01"
              value={dishForm.price}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  price: e.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            />
          </label>

          <label
            className="text-sm font-semibold text-slate-700"
            title="Optional — leave empty when the dish has no half plate"
          >
            Half plate price (₹) — optional

            <input
              type="number"
              min="0"
              step="0.01"
              disabled={editSaving}
              value={dishForm.halfPlatePrice}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  halfPlatePrice: e.target.value,
                })
              }
              placeholder="Empty = full plate only"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Preparation time (minutes)

            <input
              required
              disabled={editSaving}
              type="number"
              min="1"
              value={dishForm.preparationTime}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  preparationTime: e.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            Description

            <textarea
              disabled={editSaving}
              value={dishForm.description}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  description: e.target.value,
                })
              }
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Food type

            <select
              disabled={editSaving}
              value={dishForm.foodType}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  foodType: e.target.value as FoodType,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            >
              {FOOD_TYPE_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Image alt text

            <input
              disabled={editSaving}
              value={dishForm.imageAlt}
              onChange={(e) =>
                setDishForm({
                  ...dishForm,
                  imageAlt: e.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-orange-400 disabled:bg-slate-50"
            />
          </label>

          <div className="sm:col-span-2">
            <ImageUpload
              currentImageUrl={dishForm.imageUrl || undefined}
              currentImageAlt={dishForm.imageAlt || undefined}
              disabled={editSaving}
              uploadContext={{
                type: 'menu',
                restaurantId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
                menuItemId: editingItem.id,
              }}
              onImageSelected={(_file, url) =>
                setDishForm((form) => ({
                  ...form,
                  imageUrl: url,
                }))
              }
              onImageRemoved={() =>
                setDishForm((form) => ({
                  ...form,
                  imageUrl: '',
                  imageAlt: '',
                }))
              }
            />
          </div>
        </div>
      </div>

      {/* Fixed footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4">
        <div className="min-w-0">
          {editSaved && (
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
              <CheckCircle size={16} />
              Saved
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={editSaving}
            onClick={() => setEditingItem(null)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={editSaving || editSaved}
            className={`inline-flex min-w-32.5 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition ${
              editSaved
                ? 'bg-emerald-500'
                : 'bg-orange-500 hover:bg-orange-600'
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            {editSaving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Saving...
              </>
            ) : editSaved ? (
              <>
                <CheckCircle size={15} />
                Saved
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </form>
  </div>
)}
      {confirmCat && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay" onClick={() => setConfirmCat(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100"><AlertTriangle className="text-rose-600" size={24} /></div>
            <h3 className="text-lg font-bold text-slate-900">Delete "{confirmCat.name}"?</h3>
            <p className="mt-1 text-sm text-slate-500">{confirmCat.count > 0 ? `This will permanently remove the category and its ${confirmCat.count} dish${confirmCat.count === 1 ? '' : 'es'}. This cannot be undone.` : 'This will permanently remove this empty category.'}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmCat(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { deleteCategory(confirmCat.id); setConfirmCat(null) }} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">Delete Category</button>
            </div>
          </div>
        </div>
      )}
      {confirmItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay" onClick={() => setConfirmItem(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100"><AlertTriangle className="text-rose-600" size={24} /></div>
            <h3 className="text-lg font-bold text-slate-900">Delete "{confirmItem.name}"?</h3>
            <p className="mt-1 text-sm text-slate-500">This will permanently remove the dish from the menu.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmItem(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { deleteMenuItem(confirmItem.id); setConfirmItem(null) }} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">Delete Dish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}