import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { MenuItem } from '../context/RestaurantContext'
import ImageUpload from './ImageUpload'
import { FOOD_TYPE_OPTIONS, type FoodType } from '../lib/menuFilters'
import { dataMode } from '../services/firebase/config'
import { uploadMenuImage, deleteMenuImage, getMenuImagePath, isDurableImageUrl } from '../services/firebase/storageService'
import { saveDoc, deleteEntity, FIRESTORE_COLLECTIONS } from '../services/firebase/dataService'
import { Loader2, Plus, X, Clock, Star, Image as ImageIcon, Edit2 } from 'lucide-react'

export default function SupervisorMenuManagement() {
  const {
    menu,
    categories,
    addCategory,
    addMenuItem,
    updateMenuItemDetails,
    updateMenuItemPrice,
    toggleMenuItemAvailability,
    setMenuItemActive,
    setSpecialDate,
    renameCategory,
    deactivateCategory,
    deleteMenuItem,
  } = useRestaurant()

  const [menuError, setMenuError] = useState('')

  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [itemForm, setItemForm] = useState({
    name: '',
    price: 0,
    halfPlatePrice: '',
    description: '',
    preparationTime: 15,
    categoryId: '',
    imageUrl: '',
    imageAlt: '',
    foodType: 'veg' as FoodType,
  })
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [showSpecialDatePicker, setShowSpecialDatePicker] = useState<string | null>(null)
  const [specialDateValue, setSpecialDateValue] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryName.trim()) return
    try {
      addCategory(categoryName.trim())
      setCategoryName('')
      setShowCategoryForm(false)
      setMenuError('')
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Could not add category')
    }
  }

  /**
   * Create or update a dish.
   *
   * The dish is only reported as saved once BOTH the Firestore menu document and
   * its Firebase Storage image are durable:
   *   • CREATE — the Firestore item is created first (that mint the permanent
   *     document id), then the photo is uploaded to Storage under that id, and
   *     the SAME document is updated with imageUrl + imagePath. If any step
   *     fails the partial item and the uploaded object are removed and the form
   *     stays open with the real error.
   *   • EDIT — ImageUpload uploads the replacement photo under the existing
   *     item id, so the URL handed back here is already a Storage download URL.
   * A browser-local preview (`data:` / `blob:`) is never persisted: it would
   * break on the next reload and on every other device.
   */
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingItem) return
    if (!itemForm.name.trim() || !itemForm.categoryId) {
      setMenuError('Enter a dish name and choose a category.')
      return
    }
    // Optional half plate price: empty → null (full plate only). Never allow
    // NaN/string into the persisted dish record.
    const halfRaw = itemForm.halfPlatePrice.trim()
    let halfPlatePrice: number | null = null
    if (halfRaw !== '') {
      const parsedHalf = parseFloat(halfRaw)
      if (!Number.isFinite(parsedHalf) || parsedHalf < 0) {
        setMenuError('Half plate price must be a non-negative number (or leave it empty).')
        return
      }
      halfPlatePrice = parsedHalf
    }
    const category = categories.find((c) => c.id === itemForm.categoryId)
    setMenuError('')
    setSavingItem(true)
    let created: MenuItem | null = null
    try {
      if (editingItemId) {
        const current = menu.find((m) => m.id === editingItemId)
        // Cleared by the operator → remove it; still a local preview → keep the
        // stored URL; a Storage URL → save it.
        const imageUrl = itemForm.imageUrl === ''
          ? undefined
          : isDurableImageUrl(itemForm.imageUrl) ? itemForm.imageUrl : current?.imageUrl
        const details = {
          name: itemForm.name.trim(),
          description: itemForm.description.trim(),
          preparationTime: itemForm.preparationTime,
          category: category?.name || '',
          categoryId: itemForm.categoryId,
          imageUrl,
          imageAlt: itemForm.imageAlt || itemForm.name.trim(),
          foodType: itemForm.foodType,
          halfPlatePrice,
        }
        // Operational fields (name, description, timing, image) go to details…
        updateMenuItemDetails(editingItemId, details)
        // …price goes through the audited price path. ADMIN + SUPERVISOR both allowed.
        updateMenuItemPrice(editingItemId, itemForm.price)
        if (dataMode === 'firebase') {
          // Write through and wait: the debounced sync push is not the source of
          // truth for an image that must be visible immediately on every device.
          await saveDoc(
            FIRESTORE_COLLECTIONS.menu,
            editingItemId,
            { ...details, updatedAt: Date.now() },
            { merge: true },
          )
        }
      } else {
        created = addMenuItem({
          name: itemForm.name.trim(),
          price: itemForm.price,
          halfPlatePrice,
          description: itemForm.description.trim(),
          preparationTime: itemForm.preparationTime,
          category: category?.name || '',
          categoryId: itemForm.categoryId,
          available: true,
          active: true,
          // Persisted only after the Storage upload below has finished.
          imageUrl: selectedImageFile
            ? undefined
            : isDurableImageUrl(itemForm.imageUrl) ? itemForm.imageUrl : undefined,
          imageAlt: itemForm.imageAlt || itemForm.name.trim(),
          foodType: itemForm.foodType,
        })
        if (dataMode === 'firebase' && selectedImageFile) {
          const uploaded = await uploadMenuImage(
            selectedImageFile,
            import.meta.env.VITE_FIREBASE_PROJECT_ID,
            created.id,
          )
          await saveDoc(
            FIRESTORE_COLLECTIONS.menu,
            created.id,
            {
              ...created,
              imageUrl: uploaded.imageUrl,
              imagePath: uploaded.imagePath,
              updatedAt: Date.now(),
            },
            { merge: true },
          )
          updateMenuItemDetails(created.id, { imageUrl: uploaded.imageUrl, imagePath: uploaded.imagePath })
        }
      }
      // Every step succeeded — only now close and clear the form.
      resetForm()
    } catch (err) {
      if (created) {
        if (dataMode === 'firebase') {
          await deleteEntity(FIRESTORE_COLLECTIONS.menu, created.id).catch(() => {})
          await deleteMenuImage(getMenuImagePath(import.meta.env.VITE_FIREBASE_PROJECT_ID, created.id)).catch(() => {})
        }
        deleteMenuItem(created.id)
      }
      setMenuError(err instanceof Error && err.message
        ? `Dish could not be saved: ${err.message}`
        : 'Dish could not be saved. Please try again.')
    } finally {
      setSavingItem(false)
    }
  }

  const resetForm = () => {
    setItemForm({ name: '', price: 0, halfPlatePrice: '', description: '', preparationTime: 15, categoryId: '', imageUrl: '', imageAlt: '', foodType: 'veg' as FoodType })
    setSelectedImageFile(null)
    setShowItemForm(false)
    setEditingItemId(null)
  }

  const handleEditItem = (itemId: string) => {
    const item = menu.find((m) => m.id === itemId)
    if (!item) return
    setItemForm({
      name: item.name,
      price: item.price,
      halfPlatePrice: item.halfPlatePrice != null && Number.isFinite(item.halfPlatePrice) ? String(item.halfPlatePrice) : '',
      description: item.description,
      preparationTime: item.preparationTime,
      categoryId: item.categoryId,
      imageUrl: item.imageUrl || '',
      imageAlt: item.imageAlt || '',
      foodType: item.foodType || 'veg',
    })
    setEditingItemId(itemId)
    setShowItemForm(true)
  }

  const handleImageSelected = (file: File, previewUrl: string) => {
    setSelectedImageFile(file)
    setItemForm({ ...itemForm, imageUrl: previewUrl })
  }

  const handleImageRemoved = () => {
    setSelectedImageFile(null)
    setItemForm({ ...itemForm, imageUrl: '', imageAlt: '' })
  }

  const handleSetSpecialDate = (itemId: string) => {
    if (specialDateValue) {
      try {
        setSpecialDate(itemId, specialDateValue)
        setMenuError('')
      } catch (err) {
        setMenuError(err instanceof Error ? err.message : 'Could not set special date')
      }
    }
    setShowSpecialDatePicker(null)
    setSpecialDateValue('')
  }

  const handleClearSpecialDate = (itemId: string) => {
    try {
      setSpecialDate(itemId, undefined)
      setMenuError('')
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Could not clear special date')
    }
  }

  const isSpecialToday = (item: { specialDate?: string }) => {
    return item.specialDate === todayStr
  }

  return (
    <div className="space-y-4">
      {menuError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{menuError}</div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Menu Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoryForm(true)}
            className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <Plus size={16} />
            Add Category
          </button>
          <button
            onClick={() => { resetForm(); setShowItemForm(true) }}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            <Plus size={16} />
            Add Dish
          </button>
        </div>
      </div>

      {/* Category Form */}
      {showCategoryForm && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">New Category</h3>
            <button onClick={() => setShowCategoryForm(false)} className="text-slate-500 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Category name (e.g., Starters)"
              required
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
            />
            <button type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">
              Add
            </button>
          </form>
        </div>
      )}

      {/* Item Form (Add/Edit) */}
      {showItemForm && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              {editingItemId ? 'Edit Dish' : 'New Dish'}
            </h3>
            <button onClick={resetForm} className="text-slate-500 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleAddItem} className="space-y-4">
            {/* Image Upload — while editing, the photo uploads straight to
                Firebase Storage under the item's permanent id and the download
                URL comes back here. When creating a new dish the file is kept
                and uploaded right after the item (and its id) is created. */}
            <ImageUpload
              currentImageUrl={itemForm.imageUrl}
              currentImageAlt={itemForm.imageAlt}
              uploadContext={editingItemId && import.meta.env.VITE_FIREBASE_PROJECT_ID
                ? { type: 'menu', restaurantId: import.meta.env.VITE_FIREBASE_PROJECT_ID, menuItemId: editingItemId }
                : undefined}
              onImageSelected={handleImageSelected}
              onImageRemoved={handleImageRemoved}
              disabled={savingItem}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Dish Name *</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="e.g., Paneer Tikka"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Category *</label>
                <select
                  value={itemForm.categoryId}
                  onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                >
                  <option value="">Select category</option>
                  {categories.filter((c) => c.active).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Price (₹) *</label>
                <input
                  type="number"
                  value={itemForm.price}
                  onChange={(e) => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })}
                  min="0"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700" title="Optional — leave empty when the dish has no half plate">Half Plate Price (₹) — Optional</label>
                <input
                  type="number"
                  value={itemForm.halfPlatePrice}
                  onChange={(e) => setItemForm({ ...itemForm, halfPlatePrice: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="Empty = full plate only"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Prep Time (min)</label>
                <input
                  type="number"
                  value={itemForm.preparationTime}
                  onChange={(e) => setItemForm({ ...itemForm, preparationTime: parseInt(e.target.value) || 5 })}
                  min="1"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
                <input
                  type="text"
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Brief description"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-700">Food Type *</label>
                <div className="flex gap-3">
                  {FOOD_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, foodType: opt.value })}
                      className={`flex-1 rounded-xl border-2 px-4 py-3 text-center text-sm font-bold transition ${itemForm.foodType === opt.value ? (opt.value === 'veg' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-rose-500 bg-rose-50 text-rose-700') : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {opt.value === 'veg' ? '🥬 Veg' : '🍗 Non-Veg'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingItem}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingItem && <Loader2 size={14} className="animate-spin" />}
                {savingItem ? 'Saving…' : editingItemId ? 'Update Dish' : 'Add Dish'}
              </button>
              <button type="button" disabled={savingItem} onClick={resetForm} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories and Items */}
      {categories.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No menu categories yet.</p>
          <p className="mt-1 text-sm text-slate-400">Create a category and add dishes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-orange-600">{category.name}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {menu.filter((item) => item.categoryId === category.id).length} items
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    category.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {category.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      const newName = window.prompt('Rename category', category.name)
                      if (newName && newName.trim()) {
                        try {
                          renameCategory(category.id, newName.trim())
                          setMenuError('')
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : 'Could not rename category')
                        }
                      }
                    }}
                    className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Rename
                  </button>
                  {category.active && (
                    <button
                      onClick={() => {
                        try {
                          deactivateCategory(category.id)
                          setMenuError('')
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : 'Could not deactivate category')
                        }
                      }}
                      className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {menu.filter((item) => item.categoryId === category.id).map((item) => {
                  const special = isSpecialToday(item)
                  return (
                    <div key={item.id} className={`flex items-center justify-between rounded-xl p-3 ${special ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3 flex-1">
                        {/* Dish Image Thumbnail */}
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.imageAlt || item.name}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200">
                            <ImageIcon size={20} className="text-slate-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900">{item.name}</p>
                            {special && (
                              <span className="flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                <Star size={8} />
                                Today's Special
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-slate-500 line-clamp-1">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="font-bold text-orange-600">₹{item.price}</span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {item.preparationTime} min
                            </span>
                            {!item.active && (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">DISABLED</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Today's Special Date Picker */}
                        {showSpecialDatePicker === item.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={specialDateValue || item.specialDate || todayStr}
                              onChange={(e) => setSpecialDateValue(e.target.value)}
                              className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                              min={todayStr}
                            />
                            <button
                              onClick={() => handleSetSpecialDate(item.id)}
                              className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-amber-600"
                            >
                              Set
                            </button>
                            <button
                              onClick={() => setShowSpecialDatePicker(null)}
                              className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-300"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setShowSpecialDatePicker(item.id)
                              setSpecialDateValue(item.specialDate || todayStr)
                            }}
                            className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                              special
                                ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                                : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
                            }`}
                            title={item.specialDate ? `Special: ${item.specialDate}` : "Set as Today's Special"}
                          >
                            <Star size={12} className={special ? 'text-amber-600' : ''} />
                          </button>
                        )}
                        {item.specialDate && (
                          <button
                            onClick={() => handleClearSpecialDate(item.id)}
                            className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                            title="Remove special date"
                          >
                            <X size={10} />
                          </button>
                        )}
                        {/* Edit */}
                        <button
                          onClick={() => { setMenuError(''); handleEditItem(item.id) }}
                          className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                        >
                          <Edit2 size={12} />
                        </button>
                        {/* Availability */}
                        <button
                          onClick={() => {
                            try {
                              toggleMenuItemAvailability(item.id, !item.available)
                              setMenuError('')
                            } catch (err) {
                              setMenuError(err instanceof Error ? err.message : 'Could not update availability')
                            }
                          }}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                            item.available
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {item.available ? 'On' : 'Off'}
                        </button>
                        {/* Active/Deactivate */}
                        <button
                          onClick={() => {
                            try {
                              setMenuItemActive(item.id, !item.active)
                              setMenuError('')
                            } catch (err) {
                              setMenuError(err instanceof Error ? err.message : 'Could not toggle dish status')
                            }
                          }}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                            item.active
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'bg-slate-300 text-slate-600 hover:bg-slate-400'
                          }`}
                        >
                          {item.active ? 'Active' : 'Inactive'}
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete "${item.name}" from the menu? This cannot be undone.`)) {
                              try {
                                deleteMenuItem(item.id)
                                setMenuError('')
                              } catch (err) {
                                setMenuError(err instanceof Error ? err.message : 'Could not delete dish')
                              }
                            }
                          }}
                          className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                          title="Delete dish"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {menu.filter((item) => item.categoryId === category.id).length === 0 && (
                  <p className="text-sm text-slate-400">No items in this category.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}