import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { InventoryItem, PaymentMode, PurchaseRequest } from '../context/RestaurantContext'
import { CheckCircle, XCircle, Clock, Package, ShoppingCart, X, Search, ArrowUpDown, CheckCircle2 } from 'lucide-react'

const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI', 'PHONE_UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'QR_CODE', 'WALLET']

type PurchaseDraft = { quantity: string; unitCost: string; vendor: string; note: string; paymentMode: PaymentMode }
const emptyDraft: PurchaseDraft = { quantity: '', unitCost: '', vendor: '', note: '', paymentMode: 'CASH' }

function RecordPurchaseModal({
  title, itemName, unit, defaultQty, itemId, requireItem, inventory, onSubmit, onClose,
}: {
  title: string
  itemName: string
  unit: string
  defaultQty?: number
  itemId?: string
  requireItem?: boolean
  inventory: InventoryItem[]
  onSubmit: (d: {
  quantity: number
  unitCost: number
  totalCost: number
  vendor: string
  note: string
  paymentMode: PaymentMode
  target?: {
    itemId: string
  } | {
    newItem: {
      name: string
      unit: string
      minimumThreshold: number
      category?: string
    }
  }
}) => boolean
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PurchaseDraft>({ ...emptyDraft, quantity: defaultQty ? String(defaultQty) : '' })
  const [saved, setSaved] = useState(false)
  const [invChoice, setInvChoice] = useState<'none' | 'existing' | 'new'>('none')
  const [invItemId, setInvItemId] = useState('')
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState(unit || 'kg')
  const [newMin, setNewMin] = useState('0')
  const qty = parseFloat(draft.quantity) || 0
  const unitCost = parseFloat(draft.unitCost) || 0
  const totalCost = Math.round(qty * unitCost * 100) / 100
  // Only direct purchases REQUIRE a linked inventory item; request-based
  // purchases can still be saved even when the request has no linked item.
  const valid = qty > 0 && (!requireItem || itemId != null)

  const buildTarget = () => {
    if (requireItem && itemId) return { itemId }
    if (invChoice === 'existing' && invItemId) return { itemId: invItemId }
    if (invChoice === 'new' && newName.trim()) return { newItem: { name: newName.trim(), unit: newUnit, minimumThreshold: parseFloat(newMin) || 0 } }
    return undefined
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{itemName}</span>{unit ? ` · ${unit}` : ''}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            Quantity purchased
            <input type="number" min="0" step="any" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Unit cost (₹)
            <input type="number" min="0" step="any" value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Vendor
            <input value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Payment mode
            <select value={draft.paymentMode} onChange={(e) => setDraft({ ...draft, paymentMode: e.target.value as PaymentMode })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400">
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
            Note
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
          </label>
        </div>
        {/* Add to inventory */}
        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add to inventory</p>
          <div className="mb-2 flex gap-2">
            {(['none', 'existing', 'new'] as const).map((c) => (
              <button key={c} onClick={() => setInvChoice(c)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${invChoice === c ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                {c === 'none' ? 'Only record' : c === 'existing' ? 'Existing item' : 'New item'}
              </button>
            ))}
          </div>
          {invChoice === 'existing' && (
            <select value={invItemId} onChange={(e) => setInvItemId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400">
              <option value="">Choose inventory item…</option>
              {inventory.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit} in stock)</option>
              ))}
            </select>
          )}
          {invChoice === 'new' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Item name (e.g. ${itemName})`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 sm:col-span-3" />
              <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-orange-400">
                {['kg', 'g', 'l', 'ml', 'pcs', 'boxes'].map((u) => <option key={u}>{u}</option>)}
              </select>
              <input type="number" min="0" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="Min threshold"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 sm:col-span-2" />
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            {invChoice === 'none' && 'Purchase is only recorded in payment history — stock is not changed.'}
            {invChoice === 'existing' && 'Purchased quantity will be added to the selected inventory item.'}
            {invChoice === 'new' && 'A new inventory item will be created with the purchased quantity as its starting stock.'}
          </p>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          Total cost: <span className="text-lg font-black text-orange-600">₹{totalCost.toLocaleString()}</span>
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
  type="button"
  disabled={!valid || saved}
  onClick={() => {
    if (saved) return

    const success = onSubmit({
      quantity: qty,
      unitCost,
      totalCost,
      vendor: draft.vendor.trim(),
      note: draft.note.trim(),
      paymentMode: draft.paymentMode,
      target: buildTarget(),
    })

    if (!success) return

    setSaved(true)

    window.setTimeout(() => {
      onClose()
    }, 900)
  }}
  className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition ${
    saved
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  } disabled:cursor-not-allowed disabled:opacity-90`}
>
  {saved ? (
    <>
      <CheckCircle2 size={16} />
      Saved
    </>
  ) : (
    'Save Purchase'
  )}
</button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPurchaseRequests() {
  const { purchaseRequests, updatePurchaseRequestStatus, markPurchaseRequestPurchased, recordInventoryPurchase, inventory } = useRestaurant()
  const [purchasing, setPurchasing] = useState<PurchaseRequest | null>(null)
  const [directPurchase, setDirectPurchase] = useState<InventoryItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority'>('newest')

  const visibleRequests = purchaseRequests
    .filter((r) => r.itemName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'oldest') return a.createdAt - b.createdAt
      if (sortBy === 'priority') {
        const rank = { URGENT: 0, MEDIUM: 1, LOW: 2 }
        return rank[a.priority] - rank[b.priority]
      }
      return b.createdAt - a.createdAt
    })
  const pendingRequests = visibleRequests.filter((r) => r.status === 'PENDING')
  const approvedRequests = visibleRequests.filter((r) => r.status === 'APPROVED')
  const processedRequests = visibleRequests.filter((r) => r.status !== 'PENDING' && r.status !== 'APPROVED')
  const pendingCount = purchaseRequests.filter((r) => r.status === 'PENDING').length

  const getPriorityColor = (priority: PurchaseRequest['priority']) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-100 text-red-700'
      case 'MEDIUM': return 'bg-amber-100 text-amber-700'
      case 'LOW': return 'bg-slate-100 text-slate-600'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const getStatusColor = (status: PurchaseRequest['status']) => {
    switch (status) {
      case 'PENDING': return 'bg-amber-100 text-amber-700'
      case 'APPROVED': return 'bg-emerald-100 text-emerald-700'
      case 'REJECTED': return 'bg-red-100 text-red-700'
      case 'PURCHASED': return 'bg-blue-100 text-blue-700'
      case 'RECEIVED': return 'bg-violet-100 text-violet-700'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  const handleSave = (d: {
  quantity: number
  unitCost: number
  totalCost: number
  vendor: string
  note: string
  paymentMode: PaymentMode
  target?: {
    itemId: string
  } | {
    newItem: {
      name: string
      unit: string
      minimumThreshold: number
      category?: string
    }
  }
}): boolean => {
  setError(null)

  try {
    if (purchasing) {
      markPurchaseRequestPurchased(purchasing.id, {
        quantity: d.quantity,
        unitCost: d.unitCost,
        totalCost: d.totalCost,
        vendor: d.vendor,
        note: d.note,
        paymentMode: d.paymentMode,
        newItem: d.target && 'newItem' in d.target
          ? d.target.newItem
          : undefined,
        targetItemId: d.target && 'itemId' in d.target
          ? d.target.itemId
          : undefined,
      })

      return true
    }

    if (directPurchase) {
      recordInventoryPurchase({
        itemId: directPurchase.id,
        quantity: d.quantity,
        unitCost: d.unitCost,
        totalCost: d.totalCost,
        vendor: d.vendor,
        note: d.note,
        paymentMode: d.paymentMode,
      })

      return true
    }

    return false
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
    return false
  }
}

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-orange-100 bg-linear-to-br from-white to-orange-50/60 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">Purchase Requests</h2>
            <p className="mt-1 text-sm text-slate-500">Review supply requests, record purchases, and keep inventory synchronized.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-700">
          <Clock size={16} className="text-amber-500" />
          <span>{pendingCount} pending</span>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests by item name"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400" />
          </label>
          <label className="relative flex shrink-0 items-center">
            <ArrowUpDown size={14} className="pointer-events-none absolute left-3 text-slate-400" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort purchase requests"
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm font-semibold text-slate-600 outline-none focus:border-orange-400 sm:w-auto">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Priority first</option>
            </select>
          </label>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

      {purchaseRequests.length === 0 && inventory.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <Package className="mx-auto mb-2 text-slate-400" size={32} />
          <p className="text-slate-500">No purchase requests.</p>
          <p className="mt-1 text-sm text-slate-400">Supervisor can create requests for supplies.</p>
        </div>
      ) : (
        <>
          {pendingRequests.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-bold text-amber-600">Pending Approval</h3>
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{request.itemName}</h4>
                        <p className="text-sm text-slate-600">
                          Current: {request.currentQuantity} {request.unit} → Request: {request.requestedQuantity} {request.unit}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getPriorityColor(request.priority)}`}>
                        {request.priority}
                      </span>
                    </div>
                    {request.reason && (
                      <p className="mb-3 text-sm text-slate-600">
                        <span className="font-semibold">Reason:</span> {request.reason}
                      </p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        onClick={() => updatePurchaseRequestStatus(request.id, 'APPROVED')}
                        className="flex items-center gap-1 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600"
                      >
                        <CheckCircle size={14} />
                        Approve
                      </button>
                      <button
                        onClick={() => updatePurchaseRequestStatus(request.id, 'REJECTED')}
                        className="flex items-center gap-1 rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-600"
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {approvedRequests.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-bold text-emerald-600">Approved — Waiting for Purchase</h3>
              <div className="space-y-3">
                {approvedRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{request.itemName}</h4>
                        <p className="text-sm text-slate-600">
                          Request: {request.requestedQuantity} {request.unit}
                          {request.itemId ? ' · linked to inventory' : ''}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusColor(request.status)}`}>{request.status}</span>
                    </div>
                    <button
                      onClick={() => setPurchasing(request)}
                      className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 sm:w-auto"
                    >
                      <ShoppingCart size={14} />
                      Record Purchase
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-bold text-slate-700">Direct Purchase (no request)</h3>
              <select
                value=""
                onChange={(e) => {
                  const item = inventory.find((i) => i.id === e.target.value)
                  if (item) setDirectPurchase(item)
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 sm:w-auto"
              >
                <option value="">+ Record purchase for inventory item…</option>
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit} in stock)</option>
                ))}
              </select>
            </div>
          </div>

          {processedRequests.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-bold text-slate-700">Processed Requests</h3>
              <div className="space-y-2">
                {processedRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{request.itemName}</p>
                        <p className="text-xs text-slate-500">
                          {request.requestedQuantity} {request.unit} • {new Date(request.createdAt).toLocaleDateString()}
                          {request.processedByName ? ` • by ${request.processedByName}` : ''}
                        </p>
                        {request.purchasedQuantity != null && (
                          <p className="mt-1 text-xs text-blue-700">
                            Bought {request.purchasedQuantity} {request.unit} · ₹{request.purchaseUnitCost}/{request.unit} · total ₹{request.purchaseTotalCost?.toLocaleString()}
                            {request.purchaseVendor ? ` · ${request.purchaseVendor}` : ''}{request.purchaseMode ? ` · ${request.purchaseMode.replace(/_/g, ' ')}` : ''}
                          </p>
                        )}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusColor(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {purchasing && (
        <RecordPurchaseModal
          title="Record Purchase"
          itemName={purchasing.itemName}
          unit={purchasing.unit}
          defaultQty={purchasing.requestedQuantity}
          itemId={purchasing.itemId}
          inventory={inventory}
          onSubmit={handleSave}
          onClose={() => { setPurchasing(null); setError(null) }}
        />
      )}
      {directPurchase && (
        <RecordPurchaseModal
          title="Direct Inventory Purchase"
          itemName={directPurchase.name}
          unit={directPurchase.unit}
          itemId={directPurchase.id}
          requireItem
          inventory={inventory}
          onSubmit={handleSave}
          onClose={() => { setDirectPurchase(null); setError(null) }}
        />
      )}
    </div>
  )
}