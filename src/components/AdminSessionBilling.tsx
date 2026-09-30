/**
 * Bee's Hive — ADMIN session billing modal (used from the Admin dashboard for
 * sessions the waiter created).
 *
 * Flow: session orders → "Generate Bill" → bill preview (thermal receipt via
 * PrintPreview) → payment-mode selection (CASH / UPI / PHONE UPI / DEBIT /
 * CREDIT / QR / WALLET — manual restaurant methods only) → payment recorded →
 * receipt reprinted as PAID. Waiters never see this modal: billing, payment
 * collection and reprints are ADMIN-only (see firestore.rules).
 */
import { useState } from 'react'
import { useRestaurant, PAYMENT_MODES } from '../context/RestaurantContext'
import type { PaymentMode } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import { createPrintPreviewJob } from '../services/print/printService'
import type { BillPrintPayload } from '../services/print/printFormatters'
import PrintPreview from './PrintPreview'
import { servingSuffix } from '../lib/servingType'
import { CheckCircle2, Printer, X, Plus, Minus, UtensilsCrossed } from 'lucide-react'

const round2 = (n: number) => Math.round(n * 100) / 100

type AdminBillingViewMode = 'menu' | 'orders'

interface AdminSessionBillingProps { sessionId: string; tableId: string; onClose: () => void; viewMode?: AdminBillingViewMode }

interface CartItem {
  id: string
  menuItemId: string
  name: string
  price: number
  imageUrl?: string
  quantity: number
}

export default function AdminSessionBilling({ sessionId, tableId, onClose, viewMode = 'menu' }: AdminSessionBillingProps) {
  const { sessions, orders, menu, categories, bills, paymentRecords, settings, tables, generateBill, recordPayment, completeCleaning, closeSession } = useRestaurant()
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [previewJob, setPreviewJob] = useState<import('../services/print/printService').PrintJob | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null)

  const availableMenuItems = menu.filter((item) => item.available && item.active)
  const availableCategories = categories.filter((c) => c.active)
  const filteredMenuItems = selectedCategory
    ? availableMenuItems.filter((item) => item.categoryId === selectedCategory)
    : availableMenuItems
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0)

  const session = sessions.find((s) => s.id === sessionId)
  const sessionOrders = orders.filter((o) => o.sessionId === sessionId)
  const hasOrders = sessionOrders.some((o) => o.status !== 'cancelled' && o.items.length > 0)
  const bill = bills.find((b) => b.sessionId === sessionId)
  const record = paymentRecords.find((p) => p.sessionId === sessionId)

  const subtotal = sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0)
  const gstRate = Math.max(0, Number(settings.taxRate) || 0)
  const cgstRate = round2(gstRate / 2)
  const sgstRate = round2(gstRate / 2)
  const cgst = round2(subtotal * cgstRate / 100)
  const sgst = round2(subtotal * sgstRate / 100)
  const serviceCharge = settings.serviceChargeMode === 'rupees'
    ? round2(Math.max(0, Number(settings.serviceCharge) || 0))
    : round2(subtotal * (Number(settings.serviceCharge) || 0) / 100)
  const total = round2(subtotal + cgst + sgst + serviceCharge)
  const buildBillPrintPayload = (targetBill: typeof bill, status: string, mode?: string): BillPrintPayload | undefined => {
    if (!targetBill) return undefined
    return {
      billNumber: targetBill.billNumber,
      date: new Date(targetBill.generatedAt).toLocaleDateString(),
      time: new Date(targetBill.generatedAt).toLocaleTimeString(),
      table: tables.find((table) => table.id === targetBill.tableId)?.name ?? targetBill.tableId,
      waiter: user?.name ?? '',
      lines: targetBill.lines.map((line) => ({
        name: line.nameSnapshot + servingSuffix(line.servingType),
        quantity: line.quantity,
        amount: line.priceSnapshot,
      })),
      subtotal: targetBill.subtotal,
      cgstRate: gstRate / 2,
      cgst: targetBill.cgst,
      sgstRate: gstRate / 2,
      sgst: targetBill.sgst,
      discount: targetBill.discount,
      serviceCharge: targetBill.serviceCharge,
      parcelCharge: targetBill.parcelCharge,
      grandTotal: targetBill.grandTotal,
      paymentStatus: status,
      paymentMode: mode,
      restaurantName: settings.restaurantName,
      address: settings.address,
      gstin: settings.gstin,
      fssaiLicenseNumber: settings.fssaiLicenseNumber,
    }
  }
  
  const openBillPreview = (targetBill: typeof bill, status: string, mode?: string) => {
    if (!targetBill) return
    const payload = buildBillPrintPayload(targetBill, status, mode)
    if (!payload) return
    const preview = createPrintPreviewJob('bill', 'counter_bill', payload, targetBill.id)
    setPreviewJobId(preview.id)
    setPreviewJob(preview)
  }

  const handleGenerate = () => {
    setError('')
    try {
      const generated = generateBill(sessionId)
      if (!generated?.id) throw new Error('Could not generate bill')
      // Generate Bill NEVER prints. The operator explicitly opens the preview
      // and then presses PRINT if a physical bill is required.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate bill')
    }
  }

  const handleCollectPayment = () => {
    setError('')
    if (!bill) return
    if (!paymentMode) { setError('Please select a payment method'); return }
    if (!user) { setError('Not signed in — cannot record payment'); return }
    try {
      recordPayment({ billId: bill.id, sessionId, tableId, amount: bill.grandTotal, paymentMode, recordedBy: user.id })
      setPaymentMode(null)
      // Payment Done does not print automatically. It opens the updated PAID
      // preview; the operator must press PRINT to send it to the Admin PT-210.
      const payload = buildBillPrintPayload(bill, 'PAID', paymentMode)
      if (payload) {
        const preview = createPrintPreviewJob('bill', 'counter_bill', payload, bill.id)
        setPreviewJobId(preview.id)
        setPreviewJob(preview)
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not record payment') }
  }

  const addToCart = (menuItem: (typeof menu)[0]) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menuItemId === menuItem.id)
      if (existing) {
        return prev.map((item) =>
          item.menuItemId === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, {
        id: `cart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        imageUrl: menuItem.imageUrl,
        quantity: 1,
      }]
    })
  }

  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === cartItemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
      ).filter((item) => item.quantity > 0)
    )
  }

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== cartItemId))
  }

  if (!session) return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 sm:p-4 py-4 sm:py-6 sm:items-center bh-modal-overlay">
      <div className="rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-slate-500">Session not found.</p>
        <button onClick={onClose} className="mt-4 min-h-11 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">Close</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 sm:p-4 py-4 sm:py-6 sm:items-center bh-modal-overlay">
      <div className="relative max-h-[90vh] sm:max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-3.5 sm:p-5 shadow-2xl">
        {/* Close (X) button with generous 44px touch area */}
        {!bill && (
          <button 
            onClick={onClose} 
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95" 
            aria-label="Close"
          >
            <X size={20} />
          </button>
        )}

        {/* Guest review: food items summary */}
        {!bill && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Confirm with guest — food & total</p>
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs sm:text-sm text-slate-700">
              {((() => {
                const agg = new Map<string, { qty: number; amt: number }>()
                sessionOrders.filter((o) => o.status !== 'cancelled').forEach((o) =>
                  o.items.forEach((i) => {
                    // Key includes the serving variant so a HALF and a FULL line
                    // of the same dish are never merged into one row.
                    const key = i.nameSnapshot + servingSuffix(i.servingType)
                    const e = agg.get(key) ?? { qty: 0, amt: 0 }
                    e.qty += i.quantity; e.amt += i.priceSnapshot * i.quantity
                    agg.set(key, e)
                  }))
                const rows = [...agg.entries()]
                return rows.length === 0
                  ? <p className="py-2 text-center text-xs text-slate-400">No food ordered this session.</p>
                  : rows.map(([name, e]) => (
                    <div key={name} className="flex justify-between items-center">
                      <span className="font-medium truncate pr-2">{name} × {e.qty}</span>
                      <span className="font-semibold shrink-0">₹{e.amt.toFixed(2)}</span>
                    </div>
                  ))
              })())}
            </div>
          </div>
        )}

        {/* Menu grid */}
        {viewMode === 'menu' && (
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add items to cart</p>
              {cartCount > 0 && (
                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold text-orange-700">
                  {cartCount} in cart · ₹{cartTotal.toFixed(0)}
                </span>
              )}
            </div>

            {/* Horizontal scrollable category filters */}
            {availableCategories.length > 0 && (
              <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition min-h-9 ${selectedCategory === null ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  All
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition min-h-9 ${selectedCategory === cat.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Menu items list/grid */}
            {filteredMenuItems.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No menu items available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                {filteredMenuItems.map((item) => {
                  const inCart = cart.find((c) => c.menuItemId === item.id)
                  return (
                    <div key={item.id} className="flex items-center gap-2.5 rounded-xl bg-white p-2 shadow-sm border border-slate-100">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                          <UtensilsCrossed size={16} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">{item.name}</p>
                        <p className="text-[11px] font-semibold text-slate-500">₹{item.price.toFixed(0)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500 font-bold text-white transition hover:bg-orange-600 active:scale-95"
                        aria-label={`Add ${item.name}`}
                      >
                        {inCart ? '✓' : <Plus size={16} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Mini cart */}
            {cart.length > 0 && (
              <div className="mt-2.5 space-y-2 rounded-xl border border-orange-100 bg-white p-2.5 shadow-sm">
                <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Cart</span>
                  <span className="text-orange-600">₹{cartTotal.toFixed(2)}</span>
                </p>
                <div className="max-h-28 space-y-1.5 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-500">₹{item.price.toFixed(0)} × {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-100 active:scale-95"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-100 active:scale-95"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500"
                          aria-label="Remove item"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="w-full min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Clear cart
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bill calculation details */}
        <div className="mb-3 space-y-1.5 text-xs sm:text-sm text-slate-700 rounded-xl bg-slate-50 p-2.5 border border-slate-100">
          <div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-500"><span>CGST {cgstRate}%</span><span>₹{cgst.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-500"><span>SGST {sgstRate}%</span><span>₹{sgst.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Service</span><span>₹{serviceCharge.toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900 text-sm sm:text-base">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>

        {bill && (
          <div className="mb-3 rounded-xl bg-orange-50 p-3 text-xs sm:text-sm border border-orange-100">
            <p className="font-bold text-orange-900">BILL NO : {bill.billNumber}</p>
            <p className={`text-xs font-bold mt-0.5 ${record ? 'text-emerald-700' : 'text-orange-700'}`}>
              {record ? `PAID · ${record.paymentMode.replace(/_/g, ' ').toUpperCase()}` : 'PAYMENT PENDING'}
            </p>
            <button
              onClick={() => openBillPreview(bill, record ? 'PAID' : 'PENDING', record?.paymentMode)}
              className="mt-2 flex min-h-8 items-center gap-1.5 text-xs font-bold text-orange-700 hover:underline"
            >
              <Printer size={14} /> Bill Preview / Print
            </button>
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600 border border-red-100">{error}</p>
        )}

        {/* Step Actions */}
        {!bill ? (
          hasOrders ? (
            <button 
              onClick={handleGenerate} 
              className="w-full min-h-12 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white shadow-md transition hover:bg-orange-600 active:scale-[0.98]"
            >
              Generate Bill
            </button>
          ) : (
            <>
              <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2.5 text-center text-xs font-semibold text-amber-700 border border-amber-100">
                There is no order yet — please take the food order first.
              </p>
              <button disabled className="w-full min-h-12 cursor-not-allowed rounded-xl bg-slate-300 px-4 py-3 font-bold text-white">
                Generate Bill
              </button>
            </>
          )
        ) : record ? (
          <>
            <div className="mb-3 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs sm:text-sm font-semibold text-emerald-800 border border-emerald-100">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> Bill settled — session PAID.
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">Guests have paid. Clean the table to close the session and free capacity.</p>
            <button
              onClick={() => {
                setError('')
                try {
                  if (session.status !== 'closed') closeSession(sessionId)
                  completeCleaning(tableId, sessionId)
                  onClose()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not close the session')
                }
              }}
              className="mt-2 w-full min-h-12 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-[0.98]"
            >
              Complete Table Cleaning
            </button>
          </>
        ) : (
          <>
            <div className="mb-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 border border-amber-100">
              Bill generated — select payment method to settle.
            </div>

            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Payment method</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`min-h-11 rounded-xl px-3 py-2 text-xs font-bold capitalize transition ${paymentMode === mode ? 'bg-orange-500 text-white shadow-sm' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                >
                  {mode.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <button
              onClick={handleCollectPayment}
              disabled={!paymentMode}
              className="w-full min-h-12 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {paymentMode ? `Collect ₹${bill.grandTotal.toFixed(2)} · Confirm Payment` : 'Select a payment method'}
            </button>
          </>
        )}

      </div>

      {previewJobId && previewJob && <PrintPreview previewJob={previewJob} onCancel={() => { setPreviewJobId(null); setPreviewJob(null) }} />}
    </div>
  )
}