import { useMemo, useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { InventoryItem, StockStatus } from '../context/RestaurantContext'
import { Plus, Edit2, X, AlertTriangle, LayoutGrid, List, Rows3, CheckCircle2 } from 'lucide-react'
import { latestStockChangeByItem, purchaseStatusFor } from '../lib/inventoryPurchase'
import InventoryEditModal from './InventoryEditModal'

export default function AdminInventoryManagement() {
  const { inventory, addInventoryItem, settings, updateSettings, stockHistory } = useRestaurant()
  const viewMode = settings.inventoryViewMode ?? 'large'
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [addSaved, setAddSaved] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    quantity: 0,
    unit: 'kg',
    minimumThreshold: 5,
    category: 'General',
  })

  const resetForm = () => {
    setFormData({ name: '', quantity: 0, unit: 'kg', minimumThreshold: 5, category: 'General' })
    setShowForm(false)
    setAddSaved(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()

  if (addSaved) return

  addInventoryItem(formData)
  setAddSaved(true)

  window.setTimeout(() => {
    resetForm()
  }, 900)
}

  const getStatusColor = (status: StockStatus) => {
    switch (status) {
      case 'GOOD': return 'bg-emerald-100 text-emerald-700'
      case 'LOW': return 'bg-amber-100 text-amber-700'
      case 'CRITICAL': return 'bg-red-100 text-red-700'
      case 'OUT_OF_STOCK': return 'bg-slate-200 text-slate-700'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const lowStockCount = inventory.filter((item) => item.status === 'LOW' || item.status === 'CRITICAL' || item.status === 'OUT_OF_STOCK').length
  const outOfStockCount = inventory.filter((item) => item.status === 'OUT_OF_STOCK').length
  const lowCount = inventory.filter((item) => item.status === 'LOW' || item.status === 'CRITICAL').length
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low'>('all')

  // Visual priority: OUT OF STOCK first, then LOW, then NORMAL/GOOD — the
  // actual quantity/minimum-stock state decides, never a fabricated order.
  const stockPriority = (status: StockStatus) =>
    status === 'OUT_OF_STOCK' ? 0 : status === 'LOW' || status === 'CRITICAL' ? 1 : 2
  const visibleItems = inventory
    .filter((item) =>
      stockFilter === 'all'
        ? true
        : stockFilter === 'out'
          ? item.status === 'OUT_OF_STOCK'
          : item.status === 'LOW' || item.status === 'CRITICAL',
    )
    .slice()
    .sort((a, b) => stockPriority(a.status) - stockPriority(b.status) || a.name.localeCompare(b.name))

  /**
   * "Quantity updated · purchase not recorded" / "Purchase recorded" — derived
   * from the SAME authoritative Firestore data the Supervisor screen uses (one
   * shared helper, no per-role flag, no duplicate counter), so the admin can see
   * that physical stock exists while its purchase is still unrecorded.
   */
  const latestStockChange = useMemo(() => latestStockChangeByItem(stockHistory), [stockHistory])
  const purchaseCaption = (itemId: string) => {
    const status = purchaseStatusFor(latestStockChange.get(itemId))
    if (!status) return null
    return (
      <p className={`text-[10px] font-bold ${status === 'RECORDED' ? 'text-emerald-600' : 'text-slate-400'}`}>
        {status === 'RECORDED' ? 'Purchase recorded' : 'Quantity updated · purchase not recorded'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight text-slate-900">Inventory Management</h2>
          {lowStockCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-sm text-amber-600">
              <AlertTriangle size={14} />
              {lowStockCount} item(s) need attention
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-1 sm:w-auto sm:justify-start" aria-label="Inventory tile size">
            {([
              ['large', 'Large', <LayoutGrid key="large-icon" size={17} />],
              ['medium', 'Medium', <LayoutGrid key="medium-icon" size={15} />],
              ['small', 'Small', <LayoutGrid key="small-icon" size={13} />],
              ['smaller', 'Smaller', <Rows3 key="smaller-icon" size={14} />],
              ['list', 'List', <List key="list-icon" size={16} />],
            ] as const).map(([mode, label, icon]) => (
              <button
                key={mode}
                onClick={() => {
                  // A display preference is a settings write. A failed write is
                  // non-critical: `updateSettings` reports it through its own
                  // error path (the UI keeps the previous view mode) and it must
                  // never surface as an unhandled rejection.
                  void updateSettings({ inventoryViewMode: mode }).catch(() => {})
                }}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-bold transition sm:flex-none sm:px-2.5 ${viewMode === mode ? 'bg-orange-100 text-orange-700' : 'text-slate-400 hover:text-slate-700'}`}
                title={`${label} view`}
                aria-label={`${label} view`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 sm:w-auto sm:px-4 sm:py-2">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Stock filters — counts are computed from the SAME authoritative
          Firebase-backed inventory state (no separate counters). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['all', `All (${inventory.length})`],
            ['out', `Out of Stock (${outOfStockCount})`],
            ['low', `Low Stock (${lowCount})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setStockFilter(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              stockFilter === id
                ? id === 'out'
                  ? 'bg-slate-700 text-white'
                  : id === 'low'
                    ? 'bg-amber-500 text-white'
                    : 'bg-linear-to-br from-orange-500 to-amber-500 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-orange-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Add Inventory Item</h3>
            <button onClick={resetForm} className="text-slate-500 hover:text-slate-700">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Item Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Cooking Oil"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Dry Goods"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Current Quantity</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.1"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                >
                  <option value="kg">Kilograms (kg)</option>
                  <option value="g">Grams (g)</option>
                  <option value="L">Liters (L)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="boxes">Boxes</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Minimum Threshold</label>
                <input
                  type="number"
                  value={formData.minimumThreshold}
                  onChange={(e) => setFormData({ ...formData, minimumThreshold: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.1"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
  type="submit"
  disabled={addSaved}
  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition ${
    addSaved
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed`}
>
  {addSaved ? (
    <>
      <CheckCircle2 size={16} />
      Added
    </>
  ) : (
    <>
      <Plus size={16} />
      Add Item
    </>
  )}
</button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {inventory.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No inventory items configured.</p>
          <p className="mt-1 text-sm text-slate-400">Click "Add Item" to start tracking inventory.</p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No items match this filter.</p>
        </div>
      ) : (
        <div className={
          viewMode === 'list'
            ? 'space-y-2'
            : viewMode === 'smaller'
              ? 'grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-5'
              : viewMode === 'small'
                ? 'grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4'
                : viewMode === 'medium'
                  ? 'grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4'
                  : 'grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3'
        }>
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className={
                viewMode === 'list'
                  ? 'flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm'
                  : viewMode === 'smaller'
                    ? 'rounded-xl border border-slate-200 bg-white p-2 shadow-sm'
                    : viewMode === 'small'
                      ? 'rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm'
                      : viewMode === 'medium'
                        ? 'rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm'
                        : 'rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm'
              }
            >
              <div className={`flex items-start justify-between ${viewMode === 'smaller' ? 'mb-1.5' : viewMode === 'small' ? 'mb-2' : viewMode === 'list' ? '' : 'mb-3'}`}>
                <div>
                  <h3 className={`font-bold text-slate-900 ${viewMode === 'smaller' ? 'truncate text-xs' : viewMode === 'small' ? 'truncate text-sm' : viewMode === 'medium' ? 'text-base' : 'text-lg'}`}>{item.name}</h3>
                  <p className={`text-slate-500 ${viewMode === 'smaller' ? 'hidden' : viewMode === 'small' ? 'truncate text-[10px]' : 'text-sm'}`}>{item.category}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full font-bold ${viewMode === 'smaller' ? 'px-1.5 py-0.5 text-[8px]' : viewMode === 'small' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${getStatusColor(item.status)}`}>
                    {item.status.replace(/_/g, ' ')}
                  </span>
                  {item.active === false && (
                    <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">Deactivated</span>
                  )}
                </div>
              </div>
              <div className={`${viewMode === 'list' ? 'hidden sm:block' : viewMode === 'smaller' ? 'mb-1.5' : viewMode === 'small' ? 'mb-2' : 'mb-3'}`}>
                <div className="flex items-baseline gap-1">
                  <span className={`font-black text-slate-900 ${viewMode === 'smaller' ? 'text-base' : viewMode === 'small' ? 'text-lg' : viewMode === 'medium' ? 'text-xl' : 'text-2xl'}`}>{item.quantity}</span>
                  <span className={`${viewMode === 'smaller' ? 'text-[9px]' : 'text-sm'} text-slate-500`}>{item.unit}</span>
                </div>
                <p className={`${viewMode === 'smaller' ? 'hidden' : 'text-xs'} text-slate-500`}>Min: {item.minimumThreshold} {item.unit}</p>
                {purchaseCaption(item.id)}
                {item.notes && <p className="mt-1 truncate text-xs text-slate-400">{item.notes}</p>}
              </div>
              <div className={`flex items-center gap-2 ${viewMode === 'list' ? 'ml-auto' : ''}`}>
                <button
                  onClick={() => setEditingItem(item)}
                  className={`flex items-center gap-1 rounded-lg bg-orange-50 font-semibold text-orange-600 transition hover:bg-orange-100 ${viewMode === 'smaller' ? 'p-1.5 text-[9px]' : viewMode === 'small' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
                >
                  <Edit2 size={12} />
                  <span className={viewMode === 'smaller' ? 'hidden' : ''}>Edit</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingItem && (
        <InventoryEditModal item={editingItem} showDangerActions onClose={() => setEditingItem(null)} />
      )}
    </div>
  )
}