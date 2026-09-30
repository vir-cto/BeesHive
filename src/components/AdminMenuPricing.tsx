import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { IndianRupee, Clock, Sparkles, CheckCircle2, XCircle, ImageIcon, Pencil, X, ShieldCheck } from 'lucide-react'

/**
 * Phase 9/32 (revised model) — ADMIN MENU = PRICING ONLY.
 *
 * Supervisor owns the catalogue (create/edit categories, dishes, images,
 * availability, Today's Special). Admin does NOT create or edit dishes here —
 * the only permitted action is [Edit Price], backed by the context-level
 * `updateMenuItemPrice` guard (admin + supervisor only; waiter rejected).
 */
export default function AdminMenuPricing() {
  const { categories, menu, getTodaySpecials, updateMenuItemPrice, setSpecialDate } = useRestaurant()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const specialIds = new Set(getTodaySpecials().map((item) => item.id))

  const toggleSpecial = (itemId: string, makeSpecial: boolean) => {
    setError('')
    setSuccess('')
    try {
      const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
      setSpecialDate(itemId, makeSpecial ? todayStr : undefined)
      const item = menu.find((m) => m.id === itemId)
      setSuccess(makeSpecial ? `"${item?.name}" set as Today's Special` : `"${item?.name}" removed from Today's Special`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update special')
    }
  }

  const startEdit = (itemId: string, currentPrice: number) => {
    setEditingId(itemId)
    setPriceInput(String(currentPrice))
    setError('')
    setSuccess('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setPriceInput('')
    setError('')
  }

  const savePrice = async (itemId: string) => {
    const value = parseFloat(priceInput)
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a valid non-negative price')
      return
    }
    setSaving(true)
    setError('')
    try {
      updateMenuItemPrice(itemId, value)
      setSuccess('Price updated')
      setEditingId(null)
      setPriceInput('')
      window.setTimeout(() => setSuccess(''), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update price')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Menu Pricing</h2>
          <p className="mt-1 text-sm text-slate-500">
            The catalogue is created and maintained by the Supervisor. As Admin you have the highest pricing
            authority — you can view every dish and override or correct its price.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">
          <ShieldCheck size={14} /> Price authority: Admin &gt; Supervisor
        </span>
      </div>

      {(error || success) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || success}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold text-slate-700">No categories yet</p>
          <p className="mt-1 text-sm text-slate-500">
            The Supervisor team creates categories and dishes. They will appear here for pricing once added.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {categories.map((category) => {
            const dishes = menu.filter((item) => item.categoryId === category.id)
            return (
              <div key={category.id} className="rounded-[20px] border border-orange-100 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold tracking-wide text-slate-900">{category.name.toUpperCase()}</h3>
                  {!category.active && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                      Category inactive
                    </span>
                  )}
                </div>

                {dishes.length === 0 ? (
                  <p className="text-sm text-slate-500">No dishes in this category yet — added by Supervisor.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dishes.map((item) => {
                      const isEditing = editingId === item.id
                      return (
                        <div
                          key={item.id}
                          className={`flex flex-col overflow-hidden rounded-2xl border ${
                            item.active && item.available ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-80'
                          }`}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.imageAlt || item.name}
                              className="h-36 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-36 w-full items-center justify-center bg-orange-50/60 text-orange-300">
                              <ImageIcon size={36} />
                            </div>
                          )}

                          <div className="flex flex-1 flex-col gap-2 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-slate-900">{item.name}</h4>
                              {specialIds.has(item.id) && (
                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  <Sparkles size={10} /> Today's Special
                                </span>
                              )}
                            </div>

                            {item.description && (
                              <p className="line-clamp-2 text-xs text-slate-500">{item.description}</p>
                            )}

                            <div className="mt-auto flex items-center justify-between pt-2">
                              <span className="flex items-center gap-1 font-black text-slate-900">
                                <IndianRupee size={14} className="text-orange-500" />
                                {item.price.toFixed(2)}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Clock size={12} /> {item.preparationTime} min
                              </span>
                              <span
                                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  item.available && item.active
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-red-100 text-red-600'
                                }`}
                              >
                                {item.available && item.active ? (
                                  <>
                                    <CheckCircle2 size={10} /> Active
                                  </>
                                ) : (
                                  <>
                                    <XCircle size={10} /> Inactive
                                  </>
                                )}
                              </span>
                            </div>

                            {/* The ONLY admin action — price editing */}
                            {isEditing ? (
                              <div className="mt-2 space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-orange-700">
                                  New price (₹)
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    autoFocus
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') void savePrice(item.id)
                                      if (e.key === 'Escape') cancelEdit()
                                    }}
                                    className="w-24 rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm font-bold outline-none focus:border-orange-400"
                                  />
                                  <button
                                    onClick={() => void savePrice(item.id)}
                                    disabled={saving}
                                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
                                  >
                                    {saving ? 'Saving…' : 'Save'}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    disabled={saving}
                                    className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                                  >
                                    <X size={12} /> Cancel
                                  </button>
                                </div>
                                <p className="text-[10px] text-orange-600/80">
                                  Enter = save · Esc = cancel. Change is recorded in Price History.
                                </p>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(item.id, item.price)}
                                  className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-orange-600 transition hover:border-orange-400 hover:bg-orange-50"
                                >
                                  <Pencil size={12} /> Edit Price
                                </button>
                                <button
                                  onClick={() => toggleSpecial(item.id, !specialIds.has(item.id))}
                                  className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                                    specialIds.has(item.id)
                                      ? 'border-amber-300 bg-amber-500 text-white hover:bg-amber-600'
                                      : 'border-amber-200 bg-white text-amber-600 hover:border-amber-400 hover:bg-amber-50'
                                  }`}
                                >
                                  <Sparkles size={12} /> {specialIds.has(item.id) ? "Remove Special" : "Set as Today's Special"}
                                </button>
                              </>
                            )}

                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}