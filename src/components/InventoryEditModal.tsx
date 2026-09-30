import { useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useRestaurant } from '../context/RestaurantContext'
import type { InventoryItem } from '../context/RestaurantContext'

interface Props {
  item: InventoryItem
  onClose: () => void
  /** Additional actions rendered in the footer (e.g., deactivate/delete for admins). */
  showDangerActions?: boolean
}

/**
 * Shared inventory edit form used by both Admin and Supervisor inventory screens.
 * Stock changes made here are recorded as STOCK_ADJUSTMENT entries (audit trail);
 * minimum-threshold changes are recorded as "Minimum Stock Changed" activity.
 */
export default function InventoryEditModal({
  item,
  onClose,
  showDangerActions = false,
}: Props) {
  const { updateInventoryItem } = useRestaurant()

  const [form, setForm] = useState({
    name: item.name,
    category: item.category,
    unit: item.unit,
    quantity: String(item.quantity),
    minimumThreshold: String(item.minimumThreshold),
    notes: item.notes ?? '',
    active: item.active !== false,
  })

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = (e: React.FormEvent) => {
  e.preventDefault()

  setError(null)
  setSaved(false)

  const quantity = parseFloat(form.quantity)
  const minimumThreshold = parseFloat(form.minimumThreshold)

  if (!form.name.trim()) {
    return setError('Item name is required')
  }

  if (!form.category.trim()) {
    return setError('Category is required')
  }

  if (!form.unit.trim()) {
    return setError('Unit is required')
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    return setError(
      'Current quantity must be a non-negative number'
    )
  }

  if (
    !Number.isFinite(minimumThreshold) ||
    minimumThreshold < 0
  ) {
    return setError(
      'Minimum quantity must be a non-negative number'
    )
  }

  try {
    updateInventoryItem(item.id, {
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit.trim(),
      quantity,
      minimumThreshold,
      notes: form.notes.trim() || undefined,
      active: form.active,
    })

    setSaved(true)
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Could not save changes'
    )
  }
}

  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400'
  const label = 'mb-1 block text-sm font-semibold text-slate-700'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/40 p-4 py-6 sm:items-center bh-modal-overlay">
      <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Edit Inventory Item</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={20} /></button>
        </div>
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
       
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Item Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={field} />
            </div>
            <div>
              <label className={label}>Category</label>
              <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required className={field} />
            </div>
            <div>
              <label className={label}>Unit</label>
              <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required className={field} />
            </div>
            <div>
              <label className={label}>Current Quantity</label>
              <input type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required className={field} />
            </div>
            <div>
              <label className={label}>Minimum / Reorder Quantity</label>
              <input type="number" min={0} step="any" value={form.minimumThreshold} onChange={(e) => setForm({ ...form, minimumThreshold: e.target.value })} required className={field} />
            </div>
            <div>
              <label className={label}>Availability</label>
              <select value={form.active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })} className={field}>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={field} />
          </div>
          <ModalFooter onClose={onClose} showDangerActions={showDangerActions} item={item} onError={setError} saved={saved}/>
        </form>
      </div>
    </div>
  )
}

function ModalFooter({
  onClose,
  showDangerActions,
  item,
  onError,
  saved,
}: {
  onClose: () => void
  showDangerActions: boolean
  item: InventoryItem
  onError: (msg: string) => void
  saved: boolean
}) {
  const { updateInventoryItem, deleteInventoryItem } = useRestaurant()
  // A master inventory record is PERMANENT stock: deleting it is the only
  // irreversible action on this screen, so it is a deliberate two-step
  // confirmation instead of a single mis-tap that removes the record everywhere.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deactivate = () => {
    try { updateInventoryItem(item.id, { active: false }); onClose() } catch (err) { onError(err instanceof Error ? err.message : 'Could not deactivate item') }
  }
  const remove = () => {
    try { deleteInventoryItem(item.id); onClose() } catch (err) { onError(err instanceof Error ? err.message : 'Could not delete item') }
  }
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button
  type="submit"
  disabled={saved}
  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-bold text-white transition ${
    saved
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed`}
>
  {saved ? (
    <>
      <CheckCircle2 size={16} />
      Saved
    </>
  ) : (
    'Save Changes'
  )}
</button>
      <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
        Cancel
      </button>
      {showDangerActions && item.active !== false && (
        <button type="button" onClick={deactivate} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100">
          Deactivate
        </button>
      )}
      {showDangerActions && (confirmDelete ? (
        <span className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <span className="text-xs font-semibold text-red-700">Delete “{item.name}” permanently?</span>
          <button type="button" onClick={remove} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700">
            Yes, delete
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            Keep
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100">
          Delete
        </button>
      ))}
    </div>
  )
}
