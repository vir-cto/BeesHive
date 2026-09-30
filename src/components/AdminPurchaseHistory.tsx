import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { PaymentRecord } from '../context/RestaurantContext'
import { ShoppingCart, ChevronLeft, ChevronRight, Eye, X, ArrowUpDown } from 'lucide-react'
import { toBusinessDayStr, isSameBusinessDay } from '../lib/businessDay'

type PurchaseSort = 'newest' | 'oldest' | 'amountHigh' | 'amountLow' | 'item'

const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())
const sameDay = (ts: number, dateStr: string) => isSameBusinessDay(ts, dateStr)

export default function AdminPurchaseHistory() {
  const { paymentRecords } = useRestaurant()
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [showAll, setShowAll] = useState(false)
  const [detail, setDetail] = useState<PaymentRecord | null>(null)
  const [sortBy, setSortBy] = useState<PurchaseSort>('newest')

  const purchases = paymentRecords
    .filter((p) => p.kind === 'purchase' && (showAll || sameDay(p.recordedAt, selectedDate)))
    .sort((a, b) => {
      if (sortBy === 'oldest') return a.recordedAt - b.recordedAt
      if (sortBy === 'amountHigh') return b.amount - a.amount
      if (sortBy === 'amountLow') return a.amount - b.amount
      if (sortBy === 'item') return (a.itemName ?? '').localeCompare(b.itemName ?? '')
      return b.recordedAt - a.recordedAt
    })
  const totalSpend = purchases.reduce((s, p) => s + p.amount, 0)

  const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d)) }
  const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toDateStr(d)) }
  const goToday = () => setSelectedDate(toDateStr(new Date()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Purchase History</h2>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <button onClick={prevDay} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} disabled={showAll}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:opacity-40" />
          <button onClick={nextDay} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <button onClick={goToday} className="rounded-lg bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200">Today</button>
          <button onClick={() => setShowAll(!showAll)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${showAll ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All Time</button>
          <label className="relative flex shrink-0 items-center">
            <ArrowUpDown size={14} className="pointer-events-none absolute left-2.5 text-slate-400" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as PurchaseSort)} aria-label="Sort purchases"
              className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-bold text-slate-600 outline-none focus:border-orange-400">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amountHigh">Amount: high to low</option>
              <option value="amountLow">Amount: low to high</option>
              <option value="item">Item name</option>
            </select>
          </label>
        </div>
      </div>
      <p className="text-sm text-slate-500">{showAll ? 'All time' : selectedDate} · {purchases.length} purchase(s) · ₹{totalSpend.toLocaleString()} spent</p>

      {purchases.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <ShoppingCart className="mx-auto mb-2 text-slate-400" size={32} />
          <p className="text-slate-500">No purchases recorded for this period.</p>
          <p className="mt-1 text-sm text-slate-400">Record one from Requests → approve a request → Record Purchase, or the direct purchase picker.</p>
        </div>
      ) : (
        <div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <table className="min-w-245 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <th className="py-2">Purchase Ref</th><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total Cost</th><th>Vendor</th><th>Paid By</th><th>Recorded By</th><th>Date/Time</th><th className="pr-2 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 font-semibold text-slate-700">{p.billId.replace(/^purchase(_direct)?_/, 'PUR-')}</td>
                  <td className="py-2 font-semibold text-slate-800">{p.itemName}</td>
                  <td>{p.quantity} {p.unit}</td>
                  <td>₹{(p.unitCost ?? 0).toFixed(2)}</td>
                  <td className="font-bold text-orange-600">₹{p.amount.toFixed(2)}</td>
                  <td>{p.vendor || '-'}</td>
                  <td className="capitalize">{p.paymentMode.replace(/_/g, ' ').toLowerCase()}</td>
                  <td>{p.recordedByName || p.recordedBy}</td>
                  <td>{new Date(p.recordedAt).toLocaleString()}</td>
                  <td className="pr-2 text-right">
                    <button onClick={() => setDetail(p)} title="View full details" className="inline-flex items-center rounded-lg bg-slate-100 p-1.5 text-slate-500 transition hover:bg-orange-100 hover:text-orange-600">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {purchases.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{p.itemName}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{p.billId.replace(/^purchase(_direct)?_/, 'PUR-')} · {new Date(p.recordedAt).toLocaleString()}</p>
                </div>
                <p className="shrink-0 text-base font-black text-orange-600">₹{p.amount.toFixed(2)}</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>Qty: <b>{p.quantity} {p.unit}</b></span>
                <span>Unit: <b>₹{(p.unitCost ?? 0).toFixed(2)}</b></span>
                <span>Vendor: <b>{p.vendor || '-'}</b></span>
                <span>Paid by: <b className="capitalize">{p.paymentMode.replace(/_/g, ' ')}</b></span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                <span className="text-slate-500">Recorded by {p.recordedByName || p.recordedBy}</span>
                <button onClick={() => setDetail(p)} className="inline-flex items-center gap-1 font-bold text-orange-600"><Eye size={14} /> Details</button>
              </div>
            </div>
          ))}
        </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Purchase Details</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="mb-3 text-lg font-bold text-slate-800">{detail.itemName}</p>
            <div className="space-y-2 text-sm">
              {([
                ['Quantity', `${detail.quantity} ${detail.unit}`],
                ['Unit cost', `₹${(detail.unitCost ?? 0).toFixed(2)}`],
                ['Total cost', `₹${detail.amount.toFixed(2)}`],
                ['Vendor', detail.vendor || '-'],
                ['Payment mode', detail.paymentMode.replace(/_/g, ' ')],
                ['Status', detail.status],
                ['Recorded by', detail.recordedByName || detail.recordedBy],
                ['Date & time', new Date(detail.recordedAt).toLocaleString()],
                ['Note', detail.notes || '-'],
                ...(detail.purchaseRequestId ? [['Request ID', detail.purchaseRequestId] as [string, string]] : []),
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-1.5 last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}