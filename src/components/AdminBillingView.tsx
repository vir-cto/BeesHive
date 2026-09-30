// import { useState } from 'react'
// import { useRestaurant } from '../context/RestaurantContext'
// import type { Bill, PaymentRecord, Session, Table } from '../context/RestaurantContext'
// import { useAuth } from '../context/AuthContext'
// import { ChevronLeft, ChevronRight, Eye, Receipt, ArrowUpDown, CalendarDays } from 'lucide-react'
// import PrintPreview from './PrintPreview'
// import { createPrintPreviewJob } from '../services/print/printService'
// import type { BillPrintPayload } from '../services/print/printFormatters'
// import { toBusinessDayStr, isSameBusinessDay } from '../lib/businessDay'
// import { servingSuffix } from '../lib/servingType'

// type SortKey = 'newest' | 'oldest' | 'amountHigh' | 'amountLow' | 'billNo'
// const SORT_OPTIONS: { id: SortKey; label: string }[] = [
//   { id: 'newest', label: 'Newest First' },
//   { id: 'oldest', label: 'Oldest First' },
//   { id: 'amountHigh', label: 'Amount: High → Low' },
//   { id: 'amountLow', label: 'Amount: Low → High' },
//   { id: 'billNo', label: 'Bill Number' },
// ]

// const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())
// const sameDay = (ts: number, dateStr: string) => isSameBusinessDay(ts, dateStr)

// /** Label-only tax rate derived from the STORED bill amounts (a bill stores the
//  *  tax amounts, never the rate). No amount is ever recalculated. */
// const rateFromStored = (amount: number, base: number) =>
//   base > 0 ? Number(((amount / base) * 100).toFixed(2)) : 0

// /**
//  * Build the 58mm reprint payload for a HISTORICAL bill.
//  *
//  * Everything money-related comes from the stored bill — `nameSnapshot`,
//  * `quantity`, `priceSnapshot` and the stored subtotal / CGST / SGST / discount /
//  * service charge / parcel charge / grand total. Current menu prices are never
//  * read, so a six-month-old bill still reprints exactly as issued even if a dish
//  * was renamed, repriced, marked unavailable or deleted.
//  *
//  * Table name, guest count and waiter come from the historical table/session;
//  * the payment state comes from the payment record stored against the bill.
//  * Current settings feed the receipt HEADER only (name / address / GSTIN / FSSAI).
//  */
// const buildHistoricalBillPayload = (
//   bill: Bill,
//   historical: { table?: Table; session?: Session; waiterName?: string },
//   payment: PaymentRecord | undefined,
//   header: { restaurantName: string; address: string; gstin: string; fssaiLicenseNumber: string },
// ): BillPrintPayload => ({
//   billNumber: bill.billNumber,
//   // The original bill date/time is the stored generatedAt — not "now".
//   date: new Date(bill.generatedAt).toLocaleDateString(),
//   time: new Date(bill.generatedAt).toLocaleTimeString(),
//   table: historical.table?.name ?? bill.tableId,
//   waiter: historical.waiterName ?? '',
//   lines: bill.lines.map((line) => ({
//     name: line.nameSnapshot + servingSuffix(line.servingType),
//     quantity: line.quantity,
//     amount: line.priceSnapshot,
//   })),
//   subtotal: bill.subtotal,
//   cgstRate: rateFromStored(bill.cgst, bill.subtotal),
//   cgst: bill.cgst,
//   sgstRate: rateFromStored(bill.sgst, bill.subtotal),
//   sgst: bill.sgst,
//   discount: bill.discount,
//   serviceCharge: bill.serviceCharge,
//   parcelCharge: bill.parcelCharge,
//   grandTotal: bill.grandTotal,
//   guests: historical.session?.guestCount,
//   paymentStatus: payment ? 'PAID' : 'PENDING',
//   paymentMode: payment?.paymentMode,
//   restaurantName: header.restaurantName,
//   address: header.address,
//   gstin: header.gstin,
//   fssaiLicenseNumber: header.fssaiLicenseNumber,
// })

// export default function AdminBillingView() {
//   const { bills, tables, sessions, paymentRecords, settings } = useRestaurant()
//   const { users, user } = useAuth()
//   const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
//   const [sortKey, setSortKey] = useState<SortKey>('newest')
//   const [showAllTime, setShowAllTime] = useState(false)
//   const [expandedBill, setExpandedBill] = useState<string | null>(null)
//   const [previewJobId, setPreviewJobId] = useState<string | null>(null)

//   // Reprint is an ADMIN-only capability (this screen only mounts for admins) —
//   // the guard keeps it out of any non-admin render, it never widens a role.
//   const isAdmin = user?.role === 'admin'

//   /** Resolve the historical print context of one billing-history record. */
//   const historicalContextOf = (bill: Bill) => {
//     const session = sessions.find((s) => s.id === bill.sessionId)
//     return {
//       table: tables.find((t) => t.id === bill.tableId),
//       session,
//       waiterName: session?.waiterId ? users.find((u) => u.id === session.waiterId)?.name ?? '' : '',
//       payment: paymentRecords.find((p) => p.billId === bill.id),
//     }
//   }

//   /**
//    * Reprint the exact historical bill to the ADMIN (customer-bill) printer.
//    *
//    * A reprint is always an intentional NEW job: the queue mints a fresh job id
//    * for every call, and the reprint id below makes each explicit click a new
//    * submit that the relay's duplicate-protection ledger accepts (it only
//    * rejects a repeated JOB id). Nothing here mutates the bill or the payment.
//    */
//   const printReceipt = (bill: Bill) => {
//     const ctx = historicalContextOf(bill)
//     const payload = buildHistoricalBillPayload(bill, ctx, ctx.payment, {
//       restaurantName: settings.restaurantName,
//       address: settings.address,
//       gstin: settings.gstin,
//       fssaiLicenseNumber: settings.fssaiLicenseNumber,
//     })
//     const job = enqueueBillPrint(payload, `${bill.id}-reprint-${Date.now()}`)
//     setPreviewJobId(job.id)
//   }

//   const dateFiltered = showAllTime ? bills : bills.filter((b) => sameDay(b.generatedAt, selectedDate))
//   const filteredBills = [...dateFiltered].sort((a, b) => {
//     switch (sortKey) {
//       case 'oldest': return a.generatedAt - b.generatedAt
//       case 'amountHigh': return b.grandTotal - a.grandTotal
//       case 'amountLow': return a.grandTotal - b.grandTotal
//       case 'billNo': return a.billNumber.localeCompare(b.billNumber)
//       default: return b.generatedAt - a.generatedAt
//     }
//   })
//   const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d)) }
//   const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toDateStr(d)) }
//   const goToday = () => setSelectedDate(toDateStr(new Date()))

//   return (
//     <div className="space-y-4">
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <h2 className="text-xl font-bold text-slate-900">Billing History</h2>
//         <div className="flex items-center gap-2">
//           <button onClick={prevDay} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft size={16} /></button>
//           <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400" />
//           <button onClick={nextDay} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight size={16} /></button>
//           <button onClick={goToday} className="rounded-lg bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200">Today</button>
//         </div>
//       </div>
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <p className="text-sm text-slate-500">
//           {showAllTime ? 'All Time' : selectedDate} · {filteredBills.length} bill(s)
//         </p>
//         <div className="flex items-center gap-2">
//           <button
//             onClick={() => setShowAllTime((v) => !v)}
//             className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${showAllTime ? 'border-orange-300 bg-orange-100 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
//           >
//             <CalendarDays size={14} /> All Time
//           </button>
//           <div className="relative flex items-center">
//             <ArrowUpDown size={14} className="pointer-events-none absolute left-2.5 text-slate-400" />
//             <select
//               value={sortKey}
//               onChange={(e) => setSortKey(e.target.value as SortKey)}
//               className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-semibold text-slate-700 outline-none focus:border-orange-400"
//             >
//               {SORT_OPTIONS.map((o) => (
//                 <option key={o.id} value={o.id}>{o.label}</option>
//               ))}
//             </select>
//           </div>
//         </div>
//       </div>

//       {filteredBills.length === 0 ? (
//         <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
//           <p className="text-slate-500">No bills generated on this date.</p>
//         </div>
//       ) : (
//         <div className="space-y-3">
//           {filteredBills.map((bill) => {
//             const table = tables.find((t) => t.id === bill.tableId)
//             const session = sessions.find((s) => s.id === bill.sessionId)
//             const isExpanded = expandedBill === bill.id
//             return (
//               <div key={bill.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
//                 <div className="flex items-center justify-between">
//                   <div className="min-w-0">
//                     <p className="font-bold text-slate-900">{bill.billNumber}</p>
//                     <p className="text-xs text-slate-500">
//                       {table?.name ?? 'Unknown'} · {session?.guestCount ?? 0} guests · {new Date(bill.generatedAt).toLocaleTimeString()}
//                     </p>
//                   </div>
//                   <div className="flex shrink-0 items-center gap-3">
//                     <span className="text-lg font-black text-slate-900">₹{bill.grandTotal.toFixed(2)}</span>
//                     <button onClick={() => setExpandedBill(isExpanded ? null : bill.id)} className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-orange-100 hover:text-orange-600">
//                       <Eye size={14} />
//                     </button>
//                     {isAdmin && (
//                       <button
//                         onClick={() => printReceipt(bill)}
//                         title="Print Receipt"
//                         aria-label="Print Receipt"
//                         className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-orange-100 hover:text-orange-600 sm:min-h-0 sm:min-w-0"
//                       >
//                         <Receipt size={14} />
//                       </button>
//                     )}
//                   </div>
//                 </div>
//                 {isExpanded && (
//                   <div className="mt-3 border-t pt-3">
//                     <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
//                       <div><span className="font-semibold">Subtotal:</span> ₹{bill.subtotal.toFixed(2)}</div>
//                       <div><span className="font-semibold">CGST:</span> ₹{bill.cgst.toFixed(2)}</div>
//                       <div><span className="font-semibold">SGST:</span> ₹{bill.sgst.toFixed(2)}</div>
//                       <div><span className="font-semibold">Service:</span> ₹{bill.serviceCharge.toFixed(2)}</div>
//                       <div><span className="font-semibold">Discount:</span> ₹{bill.discount.toFixed(2)}</div>
//                       <div><span className="font-semibold">Payment:</span> {paymentRecords.find((p) => p.billId === bill.id)?.paymentMode ?? 'Pending'}</div>
//                     </div>
//                     <div className="mt-2">
//                       <p className="text-xs font-semibold text-slate-700">Items:</p>
//                       {bill.lines.map((item, idx: number) => (
//                         <div key={idx} className="flex justify-between text-xs text-slate-600">
//                           <span>{item.nameSnapshot}{servingSuffix(item.servingType)} x{item.quantity}</span>
//                           <span>₹{(item.priceSnapshot * item.quantity).toFixed(2)}</span>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}
//               </div>
//             )
//           })}
//         </div>
//       )}

//       {/* Existing print pipeline: the queued bill job's preview carries the
//           queue status (QUEUED / PRINTING / PRINTED / FAILED), Retry + Print. */}
//       {previewJobId && <PrintPreview jobId={previewJobId} onCancel={() => setPreviewJobId(null)} />}
//     </div>
//   )
// }







import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { Bill, PaymentRecord, Session, Table } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Receipt,
  Download,
  CheckCircle2,
  ArrowUpDown,
  CalendarDays,
} from 'lucide-react'
import PrintPreview from './PrintPreview'
import { createPrintPreviewJob } from '../services/print/printService'
import type { PrintJob } from '../services/print/printService'
import type { BillPrintPayload } from '../services/print/printFormatters'
import { toBusinessDayStr, isSameBusinessDay } from '../lib/businessDay'
import { servingSuffix } from '../lib/servingType'
import { downloadHistoricalBillPdf } from '../services/pdf/billPdfService'

type SortKey = 'newest' | 'oldest' | 'amountHigh' | 'amountLow' | 'billNo'

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'newest', label: 'Newest First' },
  { id: 'oldest', label: 'Oldest First' },
  { id: 'amountHigh', label: 'Amount: High → Low' },
  { id: 'amountLow', label: 'Amount: Low → High' },
  { id: 'billNo', label: 'Bill Number' },
]

const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())

const sameDay = (ts: number, dateStr: string) =>
  isSameBusinessDay(ts, dateStr)

/**
 * Label-only tax rate derived from the STORED bill amounts.
 * No bill amount is recalculated.
 */
const rateFromStored = (amount: number, base: number) =>
  base > 0 ? Number(((amount / base) * 100).toFixed(2)) : 0

/**
 * Build the 58mm reprint payload for a HISTORICAL bill.
 *
 * All money-related values come directly from the stored bill.
 * Current menu prices are never used.
 */
const buildHistoricalBillPayload = (
  bill: Bill,
  historical: {
    table?: Table
    session?: Session
    waiterName?: string
  },
  payment: PaymentRecord | undefined,
  header: {
    restaurantName: string
    address: string
    gstin: string
    fssaiLicenseNumber: string
  },
): BillPrintPayload => ({
  billNumber: bill.billNumber,

  date: new Date(bill.generatedAt).toLocaleDateString(),

  time: new Date(bill.generatedAt).toLocaleTimeString(),

  table: historical.table?.name ?? bill.tableId,

  waiter: historical.waiterName ?? '',

  lines: bill.lines.map((line) => ({
    name: line.nameSnapshot + servingSuffix(line.servingType),
    quantity: line.quantity,
    amount: line.priceSnapshot,
  })),

  subtotal: bill.subtotal,

  cgstRate: rateFromStored(bill.cgst, bill.subtotal),
  cgst: bill.cgst,

  sgstRate: rateFromStored(bill.sgst, bill.subtotal),
  sgst: bill.sgst,

  discount: bill.discount,

  serviceCharge: bill.serviceCharge,

  parcelCharge: bill.parcelCharge,

  grandTotal: bill.grandTotal,

  guests: historical.session?.guestCount,

  paymentStatus: payment ? 'PAID' : 'PENDING',

  paymentMode: payment?.paymentMode,

  restaurantName: header.restaurantName,

  address: header.address,

  gstin: header.gstin,

  fssaiLicenseNumber: header.fssaiLicenseNumber,
})

export default function AdminBillingView() {
  const {
    bills,
    tables,
    sessions,
    paymentRecords,
    settings,
  } = useRestaurant()

  const { users, user } = useAuth()

  const [selectedDate, setSelectedDate] = useState(
    toDateStr(new Date()),
  )

  const [sortKey, setSortKey] =
    useState<SortKey>('newest')

  const [showAllTime, setShowAllTime] =
    useState(false)

  const [expandedBill, setExpandedBill] =
    useState<string | null>(null)

  const [previewJobId, setPreviewJobId] =
    useState<string | null>(null)

  const [previewJob, setPreviewJob] =
    useState<PrintJob | null>(null)

  const [downloadingBillId, setDownloadingBillId] =
    useState<string | null>(null)

  const [downloadedBillId, setDownloadedBillId] =
  useState<string | null>(null)

  // Reprint is an ADMIN-only capability.
  const isAdmin = user?.role === 'admin'

  /**
   * Resolve the historical context of one billing-history record.
   */
  const historicalContextOf = (bill: Bill) => {
    const session = sessions.find(
      (s) => s.id === bill.sessionId,
    )

    return {
      table: tables.find(
        (t) => t.id === bill.tableId,
      ),

      session,

      waiterName: session?.waiterId
        ? users.find(
            (u) => u.id === session.waiterId,
          )?.name ?? ''
        : '',

      payment: paymentRecords.find(
        (p) => p.billId === bill.id,
      ),
    }
  }

  /**
   * Reprint the exact historical bill to the
   * ADMIN customer-bill printer.
   */
  const printReceipt = (bill: Bill) => {
    const ctx = historicalContextOf(bill)

    const payload = buildHistoricalBillPayload(
      bill,
      ctx,
      ctx.payment,
      {
        restaurantName:
          settings.restaurantName,

        address:
          settings.address,

        gstin:
          settings.gstin,

        fssaiLicenseNumber:
          settings.fssaiLicenseNumber,
      },
    )

    const job = createPrintPreviewJob(
      'bill',
      'counter_bill',
      payload,
      bill.id,
    )

    setPreviewJob(job)
    setPreviewJobId(job.id)
  }

  /**
   * Download historical bill as PDF.
   *
   * Nothing is recalculated from current menu data.
   */
  const downloadBill = async (bill: Bill) => {
  if (downloadingBillId) {
    return
  }

  setDownloadedBillId(null)
  setDownloadingBillId(bill.id)

  try {
    const ctx = historicalContextOf(bill)

    await downloadHistoricalBillPdf(
      bill,
      ctx,
      ctx.payment,
      {
        restaurantName:
          settings.restaurantName,

        address:
          settings.address,

        gstin:
          settings.gstin,

        fssaiLicenseNumber:
          settings.fssaiLicenseNumber,
      },
    )

    // PDF generation/download completed successfully.
    setDownloadedBillId(bill.id)

    // Return the button to the normal download icon
    // after a short success indication.
    window.setTimeout(() => {
      setDownloadedBillId((current) =>
        current === bill.id ? null : current,
      )
    }, 2000)
  } catch (error) {
    console.error(
      'Failed to download bill PDF:',
      error,
    )

    window.alert(
      'Unable to generate the bill PDF. Please try again.',
    )
  } finally {
    setDownloadingBillId(null)
  }
}

  const dateFiltered = showAllTime
    ? bills
    : bills.filter((b) =>
        sameDay(
          b.generatedAt,
          selectedDate,
        ),
      )

  const filteredBills = [...dateFiltered].sort(
    (a, b) => {
      switch (sortKey) {
        case 'oldest':
          return (
            a.generatedAt -
            b.generatedAt
          )

        case 'amountHigh':
          return (
            b.grandTotal -
            a.grandTotal
          )

        case 'amountLow':
          return (
            a.grandTotal -
            b.grandTotal
          )

        case 'billNo':
          return a.billNumber.localeCompare(
            b.billNumber,
          )

        default:
          return (
            b.generatedAt -
            a.generatedAt
          )
      }
    },
  )

  const prevDay = () => {
    const d = new Date(selectedDate)

    d.setDate(
      d.getDate() - 1,
    )

    setSelectedDate(
      toDateStr(d),
    )
  }

  const nextDay = () => {
    const d = new Date(selectedDate)

    d.setDate(
      d.getDate() + 1,
    )

    setSelectedDate(
      toDateStr(d),
    )
  }

  const goToday = () =>
    setSelectedDate(
      toDateStr(new Date()),
    )

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        <h2 className="text-xl font-bold text-slate-900">
          Billing History
        </h2>

        <div className="flex items-center gap-2">

          <button
            onClick={prevDay}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Previous Day"
            aria-label="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) =>
              setSelectedDate(
                e.target.value,
              )
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />

          <button
            onClick={nextDay}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Next Day"
            aria-label="Next Day"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={goToday}
            className="rounded-lg bg-orange-100 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-200"
          >
            Today
          </button>

        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        <p className="text-sm text-slate-500">
          {showAllTime
            ? 'All Time'
            : selectedDate}{' '}
          · {filteredBills.length} bill(s)
        </p>

        <div className="flex items-center gap-2">

          <button
            onClick={() =>
              setShowAllTime(
                (v) => !v,
              )
            }
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
              showAllTime
                ? 'border-orange-300 bg-orange-100 text-orange-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CalendarDays size={14} />
            All Time
          </button>

          <div className="relative flex items-center">

            <ArrowUpDown
              size={14}
              className="pointer-events-none absolute left-2.5 text-slate-400"
            />

            <select
              value={sortKey}
              onChange={(e) =>
                setSortKey(
                  e.target.value as SortKey,
                )
              }
              className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-semibold text-slate-700 outline-none focus:border-orange-400"
            >
              {SORT_OPTIONS.map(
                (o) => (
                  <option
                    key={o.id}
                    value={o.id}
                  >
                    {o.label}
                  </option>
                ),
              )}
            </select>

          </div>

        </div>
      </div>

      {/* BILL LIST */}
      {filteredBills.length === 0 ? (

        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">

          <p className="text-slate-500">
            No bills generated on this date.
          </p>

        </div>

      ) : (

        <div className="space-y-3">

          {filteredBills.map(
            (bill) => {

              const table =
                tables.find(
                  (t) =>
                    t.id ===
                    bill.tableId,
                )

              const session =
                sessions.find(
                  (s) =>
                    s.id ===
                    bill.sessionId,
                )

              const isExpanded =
                expandedBill ===
                bill.id

              const isDownloading =
                downloadingBillId ===
                bill.id

              return (
                <div
                  key={bill.id}
                  className="rounded-[20px] border border-slate-200 bg-white p-4"
                >

                  <div className="flex items-center justify-between">

                    {/* BILL INFORMATION */}
                    <div className="min-w-0">

                      <p className="font-bold text-slate-900">
                        {bill.billNumber}
                      </p>

                      <p className="text-xs text-slate-500">
                        {table?.name ??
                          'Unknown'}{' '}
                        ·{' '}
                        {session?.guestCount ??
                          0}{' '}
                        guests ·{' '}
                        {new Date(
                          bill.generatedAt,
                        ).toLocaleTimeString()}
                      </p>

                    </div>

                    {/* ACTIONS */}
                    <div className="flex shrink-0 items-center gap-3">

                      <span className="text-lg font-black text-slate-900">
                        ₹
                        {bill.grandTotal.toFixed(
                          2,
                        )}
                      </span>

                      {/* 1. VIEW */}
                      <button
                        onClick={() =>
                          setExpandedBill(
                            isExpanded
                              ? null
                              : bill.id,
                          )
                        }
                        title="View Bill"
                        aria-label="View Bill"
                        className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-orange-100 hover:text-orange-600"
                      >
                        <Eye size={14} />
                      </button>

                      {/* 2. DOWNLOAD PDF */}
                      {isAdmin && (
  <button
    onClick={() =>
      void downloadBill(bill)
    }
    disabled={
      isDownloading ||
      downloadedBillId === bill.id
    }
    title={
      isDownloading
        ? 'Generating PDF...'
        : downloadedBillId === bill.id
          ? 'Downloaded successfully'
          : 'Download Bill PDF'
    }
    aria-label={
      isDownloading
        ? 'Generating PDF'
        : downloadedBillId === bill.id
          ? 'Downloaded successfully'
          : 'Download Bill PDF'
    }
    className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 transition sm:min-h-0 sm:min-w-0 ${
      downloadedBillId === bill.id
        ? 'bg-emerald-100 text-emerald-600'
        : 'bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-600'
    } ${
      isDownloading
        ? 'cursor-wait opacity-70'
        : ''
    }`}
  >
    {downloadedBillId === bill.id ? (
      <CheckCircle2
        size={15}
        className="animate-in zoom-in"
      />
    ) : (
      <Download
        size={14}
        className={
          isDownloading
            ? 'animate-pulse'
            : ''
        }
      />
    )}
  </button>
)}

                      {/* 3. PRINT RECEIPT */}
                      {isAdmin && (
                        <button
                          onClick={() =>
                            printReceipt(
                              bill,
                            )
                          }
                          title="Print Receipt"
                          aria-label="Print Receipt"
                          className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-orange-100 hover:text-orange-600 sm:min-h-0 sm:min-w-0"
                        >
                          <Receipt size={14} />
                        </button>
                      )}

                    </div>
                  </div>

                  {/* EXPANDED BILL DETAILS */}
                  {isExpanded && (
                    <div className="mt-3 border-t pt-3">

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">

                        <div>
                          <span className="font-semibold">
                            Subtotal:
                          </span>{' '}
                          ₹
                          {bill.subtotal.toFixed(
                            2,
                          )}
                        </div>

                        <div>
                          <span className="font-semibold">
                            CGST:
                          </span>{' '}
                          ₹
                          {bill.cgst.toFixed(
                            2,
                          )}
                        </div>

                        <div>
                          <span className="font-semibold">
                            SGST:
                          </span>{' '}
                          ₹
                          {bill.sgst.toFixed(
                            2,
                          )}
                        </div>

                        <div>
                          <span className="font-semibold">
                            Service:
                          </span>{' '}
                          ₹
                          {bill.serviceCharge.toFixed(
                            2,
                          )}
                        </div>

                        <div>
                          <span className="font-semibold">
                            Discount:
                          </span>{' '}
                          ₹
                          {bill.discount.toFixed(
                            2,
                          )}
                        </div>

                        <div>
                          <span className="font-semibold">
                            Payment:
                          </span>{' '}
                          {paymentRecords.find(
                            (p) =>
                              p.billId ===
                              bill.id,
                          )?.paymentMode ??
                            'Pending'}
                        </div>

                      </div>

                      <div className="mt-2">

                        <p className="text-xs font-semibold text-slate-700">
                          Items:
                        </p>

                        {bill.lines.map(
                          (
                            item,
                            idx: number,
                          ) => (
                            <div
                              key={idx}
                              className="flex justify-between text-xs text-slate-600"
                            >

                              <span>
                                {
                                  item.nameSnapshot
                                }
                                {
                                  servingSuffix(
                                    item.servingType,
                                  )
                                }{' '}
                                x
                                {
                                  item.quantity
                                }
                              </span>

                              <span>
                                ₹
                                {(
                                  item.priceSnapshot *
                                  item.quantity
                                ).toFixed(
                                  2,
                                )}
                              </span>

                            </div>
                          ),
                        )}

                      </div>

                    </div>
                  )}

                </div>
              )
            },
          )}

        </div>
      )}

      {/* EXISTING PRINT PREVIEW */}
      {previewJobId && previewJob && (
        <PrintPreview
          previewJob={previewJob}
          onCancel={() => {
            setPreviewJobId(null)
            setPreviewJob(null)
          }}
        />
      )}

    </div>
  )
}