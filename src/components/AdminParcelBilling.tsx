/**
 * Bee's Hive — Admin parcel billing modal.
 *
 * Flow: ordered items → "Generate Bill" → bill preview (thermal receipt via
 * PrintPreview) → payment-mode selection (CASH / UPI / PHONE UPI / DEBIT /
 * CREDIT / QR / WALLET) → payment recorded → bill preview AGAIN, now marked
 * PAID with the selected mode. The bill and the payment record are persisted
 * (Firestore collections `bills` and `paymentRecords` when VITE_DATA_MODE=firebase).
 */
import { useState } from 'react'
import { useRestaurant, PAYMENT_MODES } from '../context/RestaurantContext'
import type { Bill, PaymentMode } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import { X, Printer, Receipt } from 'lucide-react'
import PrintPreview from './PrintPreview'
import { createPrintPreviewJob } from '../services/print/printService'
import { formatOrderToken } from '../lib/tokenSequence'
import { servingSuffix } from '../lib/servingType'

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const round2 = (n: number) => Math.round(n * 100) / 100

export default function AdminParcelBillModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { orders, bills, generateParcelBill, recordPayment, settings } = useRestaurant()
  const { user } = useAuth()
  const [mode, setMode] = useState<PaymentMode | null>(null)
  const [error, setError] = useState('')
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [previewJob, setPreviewJob] = useState<import('../services/print/printService').PrintJob | null>(null)

  const order = orders.find(o => o.id === orderId)
  const bill: Bill | undefined = order ? bills.find(b => b.sessionId === order.sessionId) : undefined

  if (!order) return null

  /** Build a display-only bill preview. Nothing is printed here. */
  const openBillPreview = (b: Bill, paid?: PaymentMode) => {
    const now = new Date(b.generatedAt)
    const job = createPrintPreviewJob('bill', 'counter_bill', {
      billNumber: b.billNumber,
      date: toDateStr(now),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      table: 'PARCEL',
      waiter: user?.name ?? 'Counter',
      lines: b.lines.map(l => ({ name: l.nameSnapshot + servingSuffix(l.servingType), quantity: l.quantity, amount: round2(l.priceSnapshot * l.quantity) })),
      subtotal: b.subtotal,
      cgstRate: round2(settings.taxRate / 2),
      cgst: b.cgst,
      sgstRate: round2(settings.taxRate / 2),
      sgst: b.sgst,
      discount: b.discount,
      serviceCharge: b.serviceCharge,
      parcelCharge: b.parcelCharge,
      grandTotal: b.grandTotal,
      paymentStatus: paid ? 'PAID' : 'PENDING',
      paymentMode: paid,
      restaurantName: settings.restaurantName,
      address: settings.address,
      gstin: settings.gstin,
      fssaiLicenseNumber: settings.fssaiLicenseNumber,
    }, b.id)
    setPreviewJob(job)
    setPreviewJobId(job.id)
  }

  const confirmPayment = () => {
    setError('')
    if (!bill || !mode) return
    try {
      recordPayment({
        billId: bill.id,
        sessionId: bill.sessionId,
        tableId: bill.tableId,
        amount: bill.grandTotal,
        paymentMode: mode,
        recordedBy: user?.id ?? 'admin',
      })
      // Re-open the bill preview — now PAID with the selected payment mode.
      openBillPreview(bill, mode)
      setMode(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment')
    }
  }

  const isPaid = bill?.status === 'PAID'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-linear-to-br from-orange-500 to-amber-500 px-5 py-4 text-white">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-100">Takeaway</p>
            <h3 className="text-2xl font-black">Parcel Billing · {formatOrderToken(order)}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/20" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* ── Ordered items ── */}
          <div className="rounded-2xl border border-slate-200">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">Ordered items</p>
            <div className="divide-y divide-slate-100">
              {order.items.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{i.nameSnapshot || i.name}</span>
                  <span className="text-xs font-bold text-slate-400">x{i.quantity}</span>
                  <span className="w-20 text-right text-sm font-bold text-slate-900">₹{(i.price * i.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
              <span className="text-sm font-bold text-slate-600">Item total</span>
              <span className="text-lg font-black text-slate-900">₹{order.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {!bill ? (
            <button
              onClick={() => { try { generateParcelBill(order.id) } catch (err) { setError(err instanceof Error ? err.message : 'Could not generate bill') } }}
              disabled={order.items.length === 0}
              className="w-full rounded-xl bg-linear-to-br from-orange-500 to-amber-500 px-4 py-3 font-bold text-white transition hover:from-orange-600 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Receipt size={16} className="mr-1.5 inline" /> Generate Bill
            </button>
          ) : (
            <>
              {/* ── Bill summary ── */}
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">{bill.billNumber}</p>
                  {isPaid ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">PAID</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">PAYMENT PENDING</span>
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <Row label="Subtotal" value={bill.subtotal} />
                  {(bill.parcelCharge ?? 0) > 0 && <Row label="Parcel charge" value={bill.parcelCharge ?? 0} />}
                  <Row label="CGST" value={bill.cgst} />
                  <Row label="SGST" value={bill.sgst} />
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base font-black text-slate-900">
                    <span>Grand total</span><span>₹{bill.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {!isPaid ? (
                <>
                  <button
                    onClick={() => openBillPreview(bill)}
                    className="w-full rounded-xl border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-100"
                  >
                    <Printer size={15} className="mr-1.5 inline" /> Bill Preview / Print
                  </button>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Payment mode — how is the customer paying?</p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {PAYMENT_MODES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={`rounded-lg px-3 py-2.5 text-xs font-bold capitalize transition ${mode === m ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                        >
                          {m.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={confirmPayment}
                    disabled={!mode}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {mode ? `Payment Done · ₹${bill.grandTotal.toFixed(2)} via ${mode.replace(/_/g, ' ')}` : 'Select payment mode'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => openBillPreview(bill)}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                >
                  <Printer size={15} className="mr-1.5 inline" /> Bill Receipt (paid)
                </button>
              )}
            </>
          )}

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
      </div>
      {previewJobId && previewJob && <PrintPreview previewJob={previewJob} onCancel={() => { setPreviewJobId(null); setPreviewJob(null) }} />}
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between text-slate-600">
    <span>{label}</span><span className="font-semibold text-slate-800">₹{value.toFixed(2)}</span>
  </div>
)
