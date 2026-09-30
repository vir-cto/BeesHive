// import { useMemo, useState } from 'react'
// import { useRestaurant } from '../context/RestaurantContext'
// import type { InventoryItem, PaymentRecord, StockUpdate } from '../context/RestaurantContext'
// import { useAuth } from '../context/AuthContext'
// import InventoryEditModal from '../components/InventoryEditModal'
// import ErrorBoundary from '../components/ErrorBoundary'
// import Sidebar from '../components/Sidebar'
// import { useViewPreference, viewPreferenceKeys } from '../lib/viewPreference'
// import { latestStockChangeByItem, purchaseStatusFor } from '../lib/inventoryPurchase'
// import ViewModeSelect from '../components/ViewModeSelect'
// import {
//   LayoutDashboard,
//   Package,
//   Minus,
//   Plus,
//   Pencil,
//   Check,
//   ShieldAlert,
//   Eye,
//   X,
// } from 'lucide-react'

// type SupervisorTab = 'dashboard' | 'requests'
// type ReportPeriod = 'day' | 'month' | 'year'

// const currentDateParts = () => {
//   const now = new Date()
//   return {
//     day: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
//     month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
//     year: String(now.getFullYear()),
//   }
// }

// function matchesPeriod(timestamp: number | undefined, period: ReportPeriod, day: string, month: string, year: string) {
//   if (!timestamp) return false
//   const date = new Date(timestamp)
//   if (period === 'day') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === day
//   if (period === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === month
//   return String(date.getFullYear()) === year
// }

// function ReportPeriodPicker({
//   period, setPeriod, day, setDay, month, setMonth, year, setYear,
// }: {
//   period: ReportPeriod
//   setPeriod: (value: ReportPeriod) => void
//   day: string
//   setDay: (value: string) => void
//   month: string
//   setMonth: (value: string) => void
//   year: string
//   setYear: (value: string) => void
// }) {
//   return (
//     <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/60 p-2">
//       <span className="text-xs font-black uppercase tracking-wide text-slate-600">Track by</span>
//       <div className="flex rounded-lg bg-white p-1">
//         {(['day', 'month', 'year'] as const).map((value) => (
//           <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-md px-2.5 py-1.5 text-xs font-bold capitalize ${period === value ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-orange-700'}`}>
//             {value === 'day' ? 'Today / Day' : value}
//           </button>
//         ))}
//       </div>
//       {period === 'day' && <input type="date" value={day} onChange={(event) => setDay(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" />}
//       {period === 'month' && <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" />}
//       {period === 'year' && <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" aria-label="Report year" />}
//     </div>
//   )
// }

// export default function SupervisorDashboard() {
//   const [activeTab, setActiveTab] = useState<SupervisorTab>('dashboard')
//   const { user } = useAuth()
//   const { inventory, purchaseRequests } = useRestaurant()

//   const concerningStock = inventory.filter(
//     (i) => i.status === 'LOW' || i.status === 'CRITICAL' || i.status === 'OUT_OF_STOCK'
//   )
//   const pendingRequests = purchaseRequests.filter((r) => r.status === 'PENDING')

//   const navItems: { id: SupervisorTab; label: string; icon: React.ReactNode; badge?: number }[] = [
//     { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, badge: concerningStock.length },
//     { id: 'requests', label: 'Requests', icon: <Package size={18} />, badge: pendingRequests.length },
//   ]

//   return (
//     <div className="flex flex-col gap-6 lg:flex-row">
//       <Sidebar
//         navItems={navItems}
//         activeTab={activeTab}
//         panelName="Supervisor Panel"
//         onSelect={(id) => setActiveTab(id as SupervisorTab)}
//       />

//       <main className="min-w-0 flex-1">
//         <ErrorBoundary label={`supervisor ${activeTab}`} resetKey={activeTab}>
//           {activeTab === 'dashboard' && <SupervisorInventoryView userName={user?.name} />}
//           {activeTab === 'requests' && <SupervisorPurchaseRequests />}
//         </ErrorBoundary>
//       </main>
//     </div>
//   )
// }

// function SupervisorInventoryView({ userName }: { userName?: string }) {
//   const { inventory, setStockRemaining, stockHistory, requestStock } = useRestaurant()
//   // UI-only preference: survives tab switches, navigation and a page refresh.
//   const [view, setView] = useViewPreference<'large' | 'medium' | 'small' | 'smaller' | 'list'>(
//     viewPreferenceKeys.supervisorInventory,
//     'medium',
//     ['large', 'medium', 'small', 'smaller', 'list'],
//   )
//   const [drafts, setDrafts] = useState<Record<string, string>>({})
//   const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
//   const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
//   {outOfStockItem && (
//   <div
//     className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 bh-modal-overlay"
//     onClick={() => setOutOfStockItem(null)}
//   >
//     <div
//       className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
//       onClick={(e) => e.stopPropagation()}
//     >
//       <div className="mb-3 flex items-center justify-between">
//         <h3 className="text-lg font-bold text-slate-900">
//           Confirm Out of Stock
//         </h3>

//         <button
//           type="button"
//           onClick={() => setOutOfStockItem(null)}
//           className="text-slate-400 hover:text-slate-600"
//           aria-label="Close"
//         >
//           <X size={18} />
//         </button>
//       </div>

//       <p className="text-sm leading-6 text-slate-600">
//         Are you sure you want to mark{' '}
//         <span className="font-bold text-slate-900">
//           {outOfStockItem.name}
//         </span>{' '}
//         as out of stock?
//       </p>

//       <p className="mt-2 text-xs text-slate-400">
//         The remaining quantity will be set to 0.
//       </p>

//       <div className="mt-5 flex justify-end gap-2">
//         <button
//           type="button"
//           onClick={() => setOutOfStockItem(null)}
//           className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
//         >
//           Cancel
//         </button>

//         <button
//           type="button"
//           onClick={() => {
//             const itemId = outOfStockItem.id
//             markOut(itemId)
//             setOutOfStockItem(null)
//           }}
//           className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
//         >
//           Yes, Out of Stock
//         </button>
//       </div>
//     </div>
//   </div>
// )}

//   // Temporary UI feedback states
// const [savedItemId, setSavedItemId] = useState<string | null>(null)
// const [outOfStockItem, setOutOfStockItem] = useState<InventoryItem | null>(null)
// const [requestSubmitted, setRequestSubmitted] = useState(false)
//   // One-tap restock request: only the required quantity is asked; item, unit,
//   // current stock, requester and timestamp come from the record/actor.
//   const [requestItem, setRequestItem] = useState<InventoryItem | null>(null)
//   const [requestQty, setRequestQty] = useState('')
//   const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low'>('all')
//   const initialPeriod = currentDateParts()
//   const [period, setPeriod] = useState<ReportPeriod>('day')
//   const [day, setDay] = useState(initialPeriod.day)
//   const [month, setMonth] = useState(initialPeriod.month)
//   const [year, setYear] = useState(initialPeriod.year)

//   const draftOf = (item: { id: string; quantity: number }) => drafts[item.id] ?? String(item.quantity)

//  const save = (itemId: string) => {
//   setStatus(null)

//   const raw = drafts[itemId]
//   if (raw === undefined) return

//   try {
//     setStockRemaining(itemId, parseFloat(raw))

//     setDrafts((prev) => {
//       const next = { ...prev }
//       delete next[itemId]
//       return next
//     })

//     // Show Saved on this specific button for a short time.
//     setSavedItemId(itemId)

//     window.setTimeout(() => {
//       setSavedItemId((current) => (current === itemId ? null : current))
//     }, 1800)

//     // Keep the existing status message/workflow.
//     setStatus({
//       kind: 'ok',
//       text: 'Quantity updated · purchase not recorded (use Purchase to record it).',
//     })
//   } catch (err) {
//     setStatus({
//       kind: 'error',
//       text: err instanceof Error ? err.message : 'Could not update stock',
//     })
//   }
// }

//   const adjust = (item: { id: string; quantity: number }, delta: number) => {
//     const current = parseFloat(draftOf(item)) || 0
//     setDrafts((prev) => ({ ...prev, [item.id]: String(Math.max(0, current + delta)) }))
//   }

//   const markOut = (itemId: string) => {
//     setStatus(null)
//     try {
//       setStockRemaining(itemId, 0)
//       setStatus({ kind: 'ok', text: 'Item marked OUT_OF_STOCK.' })
//     } catch (err) {
//       setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update stock' })
//     }
//   }

//   const total = inventory.length
//   const low = inventory.filter((i) => i.status === 'LOW').length
//   const critical = inventory.filter((i) => i.status === 'CRITICAL').length
//   const out = inventory.filter((i) => i.status === 'OUT_OF_STOCK').length

//   // Priority: OUT OF STOCK first, then LOW, then NORMAL/GOOD — real state only.
//   const stockPriority = (s: InventoryItem['status']) =>
//     s === 'OUT_OF_STOCK' ? 0 : s === 'LOW' || s === 'CRITICAL' ? 1 : 2
//   const visibleItems = inventory
//     .filter((i) =>
//       stockFilter === 'all'
//         ? true
//         : stockFilter === 'out'
//           ? i.status === 'OUT_OF_STOCK'
//           : i.status === 'LOW' || i.status === 'CRITICAL',
//     )
//     .slice()
//     .sort((a, b) => stockPriority(a.status) - stockPriority(b.status) || a.name.localeCompare(b.name))

//   // Latest stock change per item — see lib/inventoryPurchase (the SAME
//   // derivation the Admin inventory screen uses, so both roles read one state).
//   const latestStockChange = useMemo(() => latestStockChangeByItem(stockHistory), [stockHistory])

//   /** Caption distinguishing a manual quantity update from a recorded purchase. */
//   const purchaseCaption = (itemId: string) => {
//     const status = purchaseStatusFor(latestStockChange.get(itemId))
//     if (!status) return null
//     return (
//       <p className={`mt-0.5 text-[10px] font-bold ${status === 'RECORDED' ? 'text-emerald-600' : 'text-slate-400'}`}>
//         {status === 'RECORDED' ? 'Purchase recorded' : 'Quantity updated · purchase not recorded'}
//       </p>
//     )
//   }

//   /** One-tap request — only the quantity is collected from the supervisor. */
//   const submitRequest = () => {
//   if (!requestItem) return

//   setStatus(null)

//   const qty = parseFloat(requestQty)

//   if (!Number.isFinite(qty) || qty <= 0) {
//     setStatus({
//       kind: 'error',
//       text: 'Enter a required quantity greater than zero.',
//     })
//     return
//   }

//   try {
//     requestStock(
//       requestItem.id,
//       requestItem.name,
//       requestItem.quantity,
//       qty,
//       requestItem.unit,
//       'Restock request from inventory screen',
//       requestItem.status === 'OUT_OF_STOCK' ? 'URGENT' : 'MEDIUM',
//     )

//     // Show Submitted on the button before closing the modal.
//     setRequestSubmitted(true)

//     setStatus({
//       kind: 'ok',
//       text: `Requested ${qty} ${requestItem.unit} of ${requestItem.name}.`,
//     })

//     window.setTimeout(() => {
//       setRequestSubmitted(false)
//       setRequestItem(null)
//       setRequestQty('')
//     }, 1600)
//   } catch (err) {
//     setStatus({
//       kind: 'error',
//       text: err instanceof Error ? err.message : 'Could not submit the request',
//     })
//   }
// }

//   const badge = (s: InventoryItem['status']) =>
//     s === 'GOOD'
//       ? 'bg-emerald-100 text-emerald-700'
//       : s === 'LOW'
//         ? 'bg-amber-100 text-amber-700'
//         : s === 'CRITICAL'
//           ? 'bg-red-100 text-red-700'
//           : 'bg-slate-200 text-slate-600'

//   const controls = (item: InventoryItem, dirty: boolean) => (
//     <>
//       <div className="flex items-center gap-1.5">
//         <button
//           onClick={() => adjust(item, -1)}
//           className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
//           aria-label={`Decrease ${item.name}`}
//         >
//           <Minus size={14} />
//         </button>
//         <input
//           type="number"
//           min={0}
//           value={draftOf(item)}
//           onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
//           className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm outline-none focus:border-orange-400"
//           aria-label={`Remaining ${item.name}`}
//         />
//         <button
//           onClick={() => adjust(item, 1)}
//           className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
//           aria-label={`Increase ${item.name}`}
//         >
//           <Plus size={14} />
//         </button>
//       </div>
//       <div className="flex flex-wrap gap-2">
//         <button
//           onClick={() => setEditingItem(item)}
//           className="inline-flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-600 transition hover:bg-orange-100"
//         >
//           <Pencil size={13} /> Edit
//         <button
//   onClick={() => save(item.id)}
//   disabled={!dirty || savedItemId === item.id}
//   className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
//     savedItemId === item.id
//       ? 'bg-emerald-500 hover:bg-emerald-500'
//       : 'bg-orange-500 hover:bg-orange-600'
//   }`}
// >
//   <Check size={13} />
//   {savedItemId === item.id ? 'Saved' : 'Save Remaining'}
// </button>
//         <button
//   onClick={() => setOutOfStockItem(item)}
//   className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
// >
//   <ShieldAlert size={13} /> Out of Stock
// </button>
//         <button
//           onClick={() => { setRequestItem(item); setRequestQty(''); setStatus(null) }}
//           className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100"
//           title="Request stock — only the required quantity is asked"
//         >
//           <Package size={13} /> Request
//         </button>
//       </div>
//     </>
//   )
// return (
//     <div className="space-y-5">
//       {/* Greeting */}
//       <div>
//         <h1 className="text-3xl font-black tracking-tight text-slate-900">
//           Welcome back,{' '}
//           <span className="bg-linear-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
//             {userName || 'Supervisor'}
//           </span>
//         </h1>
//         <p className="mt-1 text-sm text-slate-500">Inventory · daily stock overview</p>
//       </div>

//       {/* Summary */}
//       <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
//         <SummaryChip label="Total Items" value={total} cls="bg-slate-100 text-slate-800" />
//         <SummaryChip label="Low" value={low} cls="bg-amber-50 text-amber-700" />
//         <SummaryChip label="Critical" value={critical} cls="bg-red-50 text-red-700" />
//         <SummaryChip label="Out of Stock" value={out} cls="bg-slate-100 text-slate-700" />
//       </div>

//       {/* Stock filters — counts come from the SAME authoritative inventory state */}
//       <div className="flex flex-wrap items-center gap-1.5">
//         {(
//           [
//             ['all', `All (${inventory.length})`],
//             ['out', `Out of Stock (${out})`],
//             ['low', `Low Stock (${low + critical})`],
//           ] as const
//         ).map(([id, label]) => (
//           <button
//             key={id}
//             onClick={() => setStockFilter(id)}
//             className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
//               stockFilter === id
//                 ? id === 'out'
//                   ? 'bg-slate-700 text-white'
//                   : id === 'low'
//                     ? 'bg-amber-500 text-white'
//                     : 'bg-orange-500 text-white'
//                 : 'bg-slate-100 text-slate-600 hover:bg-orange-100'
//             }`}
//           >
//             {label}
//           </button>
//         ))}
//       </div>

//       {/* Toolbar with view toggle */}
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <h2 className="text-xl font-bold text-slate-900">Inventory · Daily Stock</h2>
//         <ViewModeSelect
//           value={view}
//           onChange={setView}
//           label="Inventory view"
//           options={[
//             { id: 'list', label: 'List' },
//             { id: 'small', label: 'Small' },
//             { id: 'medium', label: 'Medium' },
//             { id: 'large', label: 'Large' },
//             { id: 'smaller', label: 'Smaller' },
//           ]}
//           className=" shrink-0"
//         />
//       </div>

//       {status && (
//         <div
//           className={`rounded-xl border px-3 py-2 text-sm ${
//             status.kind === 'ok'
//               ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
//               : 'border-red-200 bg-red-50 text-red-700'
//           }`}
//         >
//           {status.text}
//         </div>
//       )}

//       {inventory.length === 0 ? (
//         <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-10 text-center">
//           <p className="text-slate-500">No inventory items configured yet.</p>
//         </div>
//       ) : visibleItems.length === 0 ? (
//         <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-10 text-center">
//           <p className="text-slate-500">No items match this filter.</p>
//         </div>
//       ) : view !== 'list' ? (
//         <div className={`grid gap-3 ${view === 'smaller' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5' : view === 'small' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4' : view === 'large' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
//           {visibleItems.map((item) => {
//             const dirty = drafts[item.id] !== undefined && parseFloat(drafts[item.id]) !== item.quantity
//             return (
//               <div
//                 key={item.id}
//                 className={`flex flex-col rounded-[20px] border border-slate-200 bg-white shadow-sm ${view === 'smaller' ? 'gap-1.5 rounded-xl p-2' : view === 'small' ? 'gap-2 p-2.5' : view === 'large' ? 'gap-4 p-5' : 'gap-3 p-4'}`}
//               >
//                 <div className="flex items-center justify-between gap-2">
//                   <h3 className={`${view === 'smaller' ? 'text-xs' : view === 'small' ? 'text-sm' : 'text-base'} font-bold text-slate-900`}>{item.name}</h3>
//                   <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(item.status)}`}>
//                     {item.status}
//                   </span>
//                 </div>
//                 <div>
//                   <p className={`${view === 'smaller' ? 'text-lg' : view === 'small' ? 'text-2xl' : view === 'large' ? 'text-4xl' : 'text-3xl'} font-black text-slate-900`}>
//                     {item.quantity} <span className="text-sm font-semibold text-slate-400">{item.unit}</span>
//                   </p>
//                   <p className={`${view === 'smaller' ? 'text-[10px]' : 'text-xs'} text-slate-500`}>Min: {item.minimumThreshold} {item.unit}</p>
//                   {purchaseCaption(item.id)}
//                 </div>
//                 <div className={`flex flex-col gap-2 ${view === 'smaller' ? 'scale-85 origin-top-left' : view === 'small' ? 'scale-95 origin-top-left' : ''}`}>{controls(item, dirty)}</div>
//               </div>
//             )
//           })}
//         </div>
//       ) : (
//         <div className="space-y-3">
//           {visibleItems.map((item) => {
//             const dirty = drafts[item.id] !== undefined && parseFloat(drafts[item.id]) !== item.quantity
//             return (
//               <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
//                 <div className="flex flex-wrap items-center gap-3">
//                   <div className="min-w-37.5 flex-1">
//                     <div className="flex items-center gap-2">
//                       <h3 className="font-bold text-slate-900">{item.name}</h3>
//                       <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(item.status)}`}>
//                         {item.status}
//                       </span>
//                     </div>
//                     <p className="text-xs text-slate-500">
//                       Current: {item.quantity} {item.unit} · Min: {item.minimumThreshold} {item.unit} ·{' '}
//                       {item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : '—'}
//                     </p>
//                     {purchaseCaption(item.id)}
//                   </div>
//                   {controls(item, dirty)}
//                 </div>
//               </div>
//             )
//           })}
//         </div>
//       )}
//       <ReportPeriodPicker period={period} setPeriod={setPeriod} day={day} setDay={setDay} month={month} setMonth={setMonth} year={year} setYear={setYear} />
//       <StockHistoryList history={stockHistory.filter((entry) => matchesPeriod(entry.timestamp, period, day, month, year))} />
//       {requestItem && (
//         <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4 bh-modal-overlay" onClick={() => setRequestItem(null)}>
//           <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
//             <div className="mb-3 flex items-center justify-between">
//               <h3 className="text-lg font-bold text-slate-900">Request Stock</h3>
//               <button onClick={() => setRequestItem(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
//             </div>
//             <p className="mb-3 text-xs text-slate-500">
//               <span className="font-semibold text-slate-800">{requestItem.name}</span> · Current: {requestItem.quantity} {requestItem.unit} · Min: {requestItem.minimumThreshold} {requestItem.unit}
//             </p>
//             <label className="mb-1 block text-sm font-semibold text-slate-700">Required Quantity ({requestItem.unit})</label>
//             <input
//               type="number"
//               min="0"
//               step="any"
//               autoFocus
//               value={requestQty}
//               onChange={(e) => setRequestQty(e.target.value)}
//               className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
//             />
//             <button
//   onClick={submitRequest}
//   disabled={requestSubmitted}
//   className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed ${
//     requestSubmitted
//       ? 'bg-emerald-500'
//       : 'bg-orange-500 hover:bg-orange-600'
//   }`}
// >
//   {requestSubmitted ? (
//     <>
//       <Check size={15} />
//       Submitted
//     </>
//   ) : (
//     'Submit Request'
//   )}
// </button>
//             <p className="mt-2 text-[11px] text-slate-400">Item, unit and current stock are taken automatically from this inventory record.</p>
//           </div>
//         </div>
//       )}
//       {editingItem && (
//         // No `showDangerActions`: deactivating/deleting a master inventory
//         // record is an authorised-Admin action (Firestore rules agree). Offering
//         // it to a supervisor only produced a local-only delete that the next
//         // Firestore snapshot silently reverted — a false success that looked
//         // exactly like an item appearing/disappearing on its own.
//         <InventoryEditModal item={editingItem} onClose={() => setEditingItem(null)} />
//       )}
//     </div>
//   )
// }

// function SummaryChip({ label, value, cls }: { label: string; value: number; cls: string }) {
//   return (
//     <div className={`rounded-[18px] px-4 py-3 ${cls}`}>
//       <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
//       <p className="mt-1 text-2xl font-black">{value}</p>
//     </div>
//   )
// }

// function StockHistoryList({ history }: { history: StockUpdate[] }) {
//   return (
//     <div className="rounded-[20px] border border-slate-200 bg-white p-4">
//       <h3 className="mb-2 text-sm font-bold text-slate-900">Stock update history</h3>
//       {history.length === 0 ? (
//         <p className="text-xs text-slate-500">No stock updates recorded yet.</p>
//       ) : (
//         <div className="max-h-64 space-y-1.5 overflow-y-auto">
//           {history.slice(0, 40).map((h) => (
//             <div
//               key={h.id}
//               className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
//             >
//               <span className="font-semibold text-slate-800">{h.itemName}</span>
//               <span>
//                 {h.previousQty} to {h.newQty} {h.unit}
//               </span>
//               <span>{h.updatedBy}</span>
//               <span>{new Date(h.timestamp).toLocaleString()}</span>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   )
// }
// function SupervisorPurchaseRequests() {
//   const { inventory, purchaseRequests, paymentRecords, requestStock } = useRestaurant()
//   const [showForm, setShowForm] = useState(false)
//   // The REQUEST flow only asks for what the supervisor actually knows: WHICH
//   // stock item needs restocking (picked from the authoritative Firestore
//   // inventory) and HOW MUCH is required. Item name, unit and current stock are
//   // read from that record — never re-typed, and no duplicate inventory item is
//   // ever created here.
//   const [form, setForm] = useState({
//     itemId: '',
//     requestedQuantity: '',
//     priority: 'MEDIUM' as 'URGENT' | 'MEDIUM' | 'LOW',
//     reason: '',
//   })
//   const [formError, setFormError] = useState('')
//   const selectedItem = inventory.find((item) => item.id === form.itemId)
//   const [detail, setDetail] = useState<PaymentRecord | null>(null)
//   const initialPeriod = currentDateParts()
//   const [period, setPeriod] = useState<ReportPeriod>('day')
//   const [day, setDay] = useState(initialPeriod.day)
//   const [month, setMonth] = useState(initialPeriod.month)
//   const [year, setYear] = useState(initialPeriod.year)

//   const purchaseHistory = paymentRecords
//     .filter((p) => p.kind === 'purchase' && matchesPeriod(p.recordedAt, period, day, month, year))
//     .sort((a, b) => b.recordedAt - a.recordedAt)
//     .slice(0, 30)

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault()
//     setFormError('')
//     if (!selectedItem) {
//       setFormError('Choose the inventory item that needs restocking.')
//       return
//     }
//     const qty = parseFloat(form.requestedQuantity)
//     if (!Number.isFinite(qty) || qty <= 0) {
//       setFormError('Enter a required quantity greater than zero.')
//       return
//     }
//     // The SAME service call as the inventory tile's Request button, so both entry
//     // points create one identical Firebase purchase-request record that carries
//     // the existing inventory item id and its current stock (the admin's purchase
//     // fulfilment then adds stock to THAT item — never to a duplicate).
//     requestStock(
//       selectedItem.id,
//       selectedItem.name,
//       selectedItem.quantity,
//       qty,
//       selectedItem.unit,
//       form.reason.trim() || 'Restock request from Requests screen',
//       form.priority,
//     )
//     setForm({ itemId: '', requestedQuantity: '', priority: 'MEDIUM', reason: '' })
//     setShowForm(false)
//   }

//   // A PENDING request is outstanding WORK, not history: it stays visible on
//   // every day/month/year setting. Hiding a request raised yesterday because the
//   // picker still says "Today" reads exactly like a record that disappeared —
//   // the same rule as the inventory master list, which is never date-filtered.
//   // The period picker therefore only narrows PROCESSED requests.
//   const visibleRequests = purchaseRequests.filter((request) =>
//     request.status === 'PENDING'
//       ? true
//       : matchesPeriod(request.processedAt ?? request.createdAt, period, day, month, year),
//   )

//   return (
//     <div className="space-y-4">
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <div>
//           <h2 className="text-xl font-bold text-slate-900">Purchase Requests</h2>
//           <p className="text-sm text-slate-500">Request stock from the admin</p>
//         </div>
//         <ReportPeriodPicker period={period} setPeriod={setPeriod} day={day} setDay={setDay} month={month} setMonth={setMonth} year={year} setYear={setYear} />
//         <button
//           onClick={() => setShowForm((v) => !v)}
//           className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
//         >
//           {showForm ? 'Cancel' : '+ New Request'}
//         </button>
//       </div>

//       {showForm && (
//         <form onSubmit={handleSubmit} className="space-y-3 rounded-[20px] border border-orange-100 bg-white p-4">
//           <div className="grid gap-3 sm:grid-cols-2">
//             <select
//               value={form.itemId}
//               onChange={(e) => setForm({ ...form, itemId: e.target.value })}
//               required
//               aria-label="Inventory item to restock"
//               className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400"
//             >
//               <option value="">Choose inventory item *</option>
//               {inventory.map((item) => (
//                 <option key={item.id} value={item.id}>
//                   {item.name} ({item.quantity} {item.unit} in stock)
//                 </option>
//               ))}
//             </select>
//             <input
//               type="number"
//               min={0}
//               step="any"
//               value={form.requestedQuantity}
//               onChange={(e) => setForm({ ...form, requestedQuantity: e.target.value })}
//               placeholder={`Required quantity${selectedItem ? ` (${selectedItem.unit})` : ''} *`}
//               required
//               className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
//             />
//             <select
//               value={form.priority}
//               onChange={(e) => setForm({ ...form, priority: e.target.value as typeof form.priority })}
//               aria-label="Request priority"
//               className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
//             >
//               {(['URGENT', 'MEDIUM', 'LOW'] as const).map((p) => (
//                 <option key={p}>{p}</option>
//               ))}
//             </select>
//             <p className="self-center text-[11px] text-slate-500">
//               {selectedItem
//                 ? `Current stock ${selectedItem.quantity} ${selectedItem.unit} · min ${selectedItem.minimumThreshold} ${selectedItem.unit} — taken from the inventory record.`
//                 : 'Item, unit and current stock come from the selected inventory record.'}
//             </p>
//           </div>
//           <textarea
//             value={form.reason}
//             onChange={(e) => setForm({ ...form, reason: e.target.value })}
//             placeholder="Reason (optional)"
//             rows={2}
//             className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
//           />
//           {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{formError}</p>}
//           <button type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">
//             Submit Request
//           </button>
//         </form>
//       )}
// {visibleRequests.length === 0 ? (
//         <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
//           <p className="text-slate-500">Create a new purchase request for supplies.</p>
//         </div>
//       ) : (
//         <div className="space-y-3">
//           {visibleRequests.map((request) => {
//             const statusStyles: Record<string, string> = {
//               PENDING: 'bg-amber-100 text-amber-700',
//               APPROVED: 'bg-emerald-100 text-emerald-700',
//               REJECTED: 'bg-red-100 text-red-700',
//               PURCHASED: 'bg-blue-100 text-blue-700',
//               RECEIVED: 'bg-violet-100 text-violet-700',
//             }
//             const priorityStyles: Record<string, string> = {
//               URGENT: 'bg-red-500 text-white',
//               MEDIUM: 'bg-orange-100 text-orange-700',
//               LOW: 'bg-slate-100 text-slate-600',
//             }
//             return (
//               <div key={request.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
//                 <div className="flex flex-wrap items-center justify-between gap-2">
//                   <div>
//                     <h3 className="font-bold text-slate-900">{request.itemName}</h3>
//                     <p className="text-xs text-slate-500">
//                       Requested {request.requestedQuantity} {request.unit} (current: {request.currentQuantity}{' '}
//                       {request.unit})
//                       {' • '}
//                       {new Date(request.createdAt).toLocaleString()}
//                     </p>
//                     {request.reason && <p className="mt-0.5 text-xs italic text-slate-400">"{request.reason}"</p>}
//                     {request.purchasedQuantity != null && (
//                       <p className="mt-1 text-xs font-semibold text-blue-700">
//                         ✓ Purchased: {request.purchasedQuantity} {request.unit} · ₹{request.purchaseUnitCost}/{request.unit} · total ₹{request.purchaseTotalCost?.toLocaleString()}
//                         {request.purchaseVendor ? ` · ${request.purchaseVendor}` : ''}{request.purchaseMode ? ` · ${request.purchaseMode.replace(/_/g, ' ')}` : ''}
//                       </p>
//                     )}
//                   </div>
//                   <div className="flex flex-wrap items-center gap-1.5">
//                     <span
//                       className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityStyles[request.priority] ?? 'bg-slate-100 text-slate-600'}`}
//                     >
//                       {request.priority}
//                     </span>
//                     <span
//                       className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusStyles[request.status] ?? 'bg-slate-100 text-slate-600'}`}
//                     >
//                       {request.status}
//                     </span>
//                   </div>
//                 </div>
//                 <div className="mt-2 flex flex-wrap gap-4 border-t border-slate-100 pt-2 text-xs text-slate-500">
//                   <span>
//                     By: <span className="font-semibold text-slate-700">{request.requestedByName}</span>
//                   </span>
//                   {request.processedByName && (
//                     <span>
//                       {request.status === 'REJECTED' ? 'Rejected' : 'Processed'} by:{' '}
//                       <span className="font-semibold text-slate-700">{request.processedByName}</span>
//                       {request.processedAt ? ` · ${new Date(request.processedAt).toLocaleString()}` : ''}
//                     </span>
//                   )}
//                 </div>
//               </div>
//             )
//           })}
//         </div>
//       )}

//       {purchaseHistory.length > 0 && (
//         <div>
//           <h3 className="mb-3 text-lg font-bold text-slate-700">Purchase History</h3>
//           <div className="space-y-2">
//             {purchaseHistory.map((p) => (
//               <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
//                 <div className="min-w-0">
//                   <p className="truncate font-semibold text-slate-900">{p.itemName}</p>
//                   <p className="text-xs text-slate-500">
//                     {p.quantity} {p.unit} · ₹{p.amount.toLocaleString()}
//                     {p.vendor ? ` · ${p.vendor}` : ''} · {new Date(p.recordedAt).toLocaleString()}
//                   </p>
//                 </div>
//                 <button
//                   onClick={() => setDetail(p)}
//                   title="View full details"
//                   className="inline-flex items-center rounded-lg bg-slate-100 p-2 text-slate-500 transition hover:bg-orange-100 hover:text-orange-600"
//                 >
//                   <Eye size={15} />
//                 </button>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {detail && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
//           <div className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
//             <div className="mb-4 flex items-center justify-between">
//               <h3 className="text-base font-bold text-slate-900">Purchase Details</h3>
//               <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
//             </div>
//             <p className="mb-3 text-lg font-bold text-slate-800">{detail.itemName}</p>
//             <div className="space-y-2 text-sm">
//               {([
//                 ['Quantity', `${detail.quantity} ${detail.unit}`],
//                 ['Unit cost', `₹${(detail.unitCost ?? 0).toFixed(2)}`],
//                 ['Total cost', `₹${detail.amount.toFixed(2)}`],
//                 ['Vendor', detail.vendor || '-'],
//                 ['Payment mode', detail.paymentMode.replace(/_/g, ' ')],
//                 ['Recorded by', detail.recordedByName || detail.recordedBy],
//                 ['Date & time', new Date(detail.recordedAt).toLocaleString()],
//                 ['Note', detail.notes || '-'],
//               ] as [string, string][]).map(([label, value]) => (
//                 <div key={label} className="flex justify-between border-b border-slate-100 pb-1.5 last:border-0">
//                   <span className="text-slate-500">{label}</span>
//                   <span className="font-semibold text-slate-800">{value}</span>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   )
// }









import { useMemo, useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { InventoryItem, PaymentRecord, StockUpdate } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import InventoryEditModal from '../components/InventoryEditModal'
import ErrorBoundary from '../components/ErrorBoundary'
import Sidebar from '../components/Sidebar'
import { useViewPreference, viewPreferenceKeys } from '../lib/viewPreference'
import { latestStockChangeByItem, purchaseStatusFor } from '../lib/inventoryPurchase'
import ViewModeSelect from '../components/ViewModeSelect'
import {
  LayoutDashboard,
  Package,
  Minus,
  Plus,
  Pencil,
  Check,
  ShieldAlert,
  Eye,
  X,
} from 'lucide-react'

type SupervisorTab = 'dashboard' | 'requests'
type ReportPeriod = 'day' | 'month' | 'year'

const currentDateParts = () => {
  const now = new Date()
  return {
    day: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    year: String(now.getFullYear()),
  }
}

function matchesPeriod(timestamp: number | undefined, period: ReportPeriod, day: string, month: string, year: string) {
  if (!timestamp) return false
  const date = new Date(timestamp)
  if (period === 'day') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === day
  if (period === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === month
  return String(date.getFullYear()) === year
}

function ReportPeriodPicker({
  period, setPeriod, day, setDay, month, setMonth, year, setYear,
}: {
  period: ReportPeriod
  setPeriod: (value: ReportPeriod) => void
  day: string
  setDay: (value: string) => void
  month: string
  setMonth: (value: string) => void
  year: string
  setYear: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/60 p-2">
      <span className="text-xs font-black uppercase tracking-wide text-slate-600">Track by</span>
      <div className="flex rounded-lg bg-white p-1">
        {(['day', 'month', 'year'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-md px-2.5 py-1.5 text-xs font-bold capitalize ${period === value ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-orange-700'}`}>
            {value === 'day' ? 'Today / Day' : value}
          </button>
        ))}
      </div>
      {period === 'day' && <input type="date" value={day} onChange={(event) => setDay(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" />}
      {period === 'month' && <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" />}
      {period === 'year' && <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-orange-400" aria-label="Report year" />}
    </div>
  )
}

export default function SupervisorDashboard() {
  const [activeTab, setActiveTab] = useState<SupervisorTab>('dashboard')
  const { user } = useAuth()
  const { inventory, purchaseRequests } = useRestaurant()

  const concerningStock = inventory.filter(
    (i) => i.status === 'LOW' || i.status === 'CRITICAL' || i.status === 'OUT_OF_STOCK'
  )
  const pendingRequests = purchaseRequests.filter((r) => r.status === 'PENDING')

  const navItems: { id: SupervisorTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, badge: concerningStock.length },
    { id: 'requests', label: 'Requests', icon: <Package size={18} />, badge: pendingRequests.length },
  ]

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Sidebar
        navItems={navItems}
        activeTab={activeTab}
        panelName="Supervisor Panel"
        onSelect={(id) => setActiveTab(id as SupervisorTab)}
      />

      <main className="min-w-0 flex-1">
        <ErrorBoundary label={`supervisor ${activeTab}`} resetKey={activeTab}>
          {activeTab === 'dashboard' && <SupervisorInventoryView userName={user?.name} />}
          {activeTab === 'requests' && <SupervisorPurchaseRequests />}
        </ErrorBoundary>
      </main>
    </div>
  )
}

function SupervisorInventoryView({ userName }: { userName?: string }) {
  const { inventory, setStockRemaining, stockHistory, requestStock } = useRestaurant()
  // UI-only preference: survives tab switches, navigation and a page refresh.
  const [view, setView] = useViewPreference<'large' | 'medium' | 'small' | 'smaller' | 'list'>(
    viewPreferenceKeys.supervisorInventory,
    'medium',
    ['large', 'medium', 'small', 'smaller', 'list'],
  )
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  // Temporary UI feedback states
const [savedItemId, setSavedItemId] = useState<string | null>(null)
const [outOfStockItem, setOutOfStockItem] = useState<InventoryItem | null>(null)
const [requestSubmitted, setRequestSubmitted] = useState(false)
  // One-tap restock request: only the required quantity is asked; item, unit,
  // current stock, requester and timestamp come from the record/actor.
  const [requestItem, setRequestItem] = useState<InventoryItem | null>(null)
  const [requestQty, setRequestQty] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low'>('all')
  const initialPeriod = currentDateParts()
  const [period, setPeriod] = useState<ReportPeriod>('day')
  const [day, setDay] = useState(initialPeriod.day)
  const [month, setMonth] = useState(initialPeriod.month)
  const [year, setYear] = useState(initialPeriod.year)

  const draftOf = (item: { id: string; quantity: number }) => drafts[item.id] ?? String(item.quantity)

 const save = (itemId: string) => {
  setStatus(null)

  const raw = drafts[itemId]
  if (raw === undefined) return

  try {
    setStockRemaining(itemId, parseFloat(raw))

    setDrafts((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })

    // Show Saved on this specific button for a short time.
    setSavedItemId(itemId)

    window.setTimeout(() => {
      setSavedItemId((current) => (current === itemId ? null : current))
    }, 1800)

    // Keep the existing status message/workflow.
    setStatus({
      kind: 'ok',
      text: 'Quantity updated · purchase not recorded (use Purchase to record it).',
    })
  } catch (err) {
    setStatus({
      kind: 'error',
      text: err instanceof Error ? err.message : 'Could not update stock',
    })
  }
}

  const adjust = (item: { id: string; quantity: number }, delta: number) => {
    const current = parseFloat(draftOf(item)) || 0
    setDrafts((prev) => ({ ...prev, [item.id]: String(Math.max(0, current + delta)) }))
  }

  const markOut = (itemId: string) => {
    setStatus(null)
    try {
      setStockRemaining(itemId, 0)
      setStatus({ kind: 'ok', text: 'Item marked OUT_OF_STOCK.' })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not update stock' })
    }
  }

  const total = inventory.length
  const low = inventory.filter((i) => i.status === 'LOW').length
  const critical = inventory.filter((i) => i.status === 'CRITICAL').length
  const out = inventory.filter((i) => i.status === 'OUT_OF_STOCK').length

  // Priority: OUT OF STOCK first, then LOW, then NORMAL/GOOD — real state only.
  const stockPriority = (s: InventoryItem['status']) =>
    s === 'OUT_OF_STOCK' ? 0 : s === 'LOW' || s === 'CRITICAL' ? 1 : 2
  const visibleItems = inventory
    .filter((i) =>
      stockFilter === 'all'
        ? true
        : stockFilter === 'out'
          ? i.status === 'OUT_OF_STOCK'
          : i.status === 'LOW' || i.status === 'CRITICAL',
    )
    .slice()
    .sort((a, b) => stockPriority(a.status) - stockPriority(b.status) || a.name.localeCompare(b.name))

  // Latest stock change per item — see lib/inventoryPurchase (the SAME
  // derivation the Admin inventory screen uses, so both roles read one state).
  const latestStockChange = useMemo(() => latestStockChangeByItem(stockHistory), [stockHistory])

  /** Caption distinguishing a manual quantity update from a recorded purchase. */
  const purchaseCaption = (itemId: string) => {
    const status = purchaseStatusFor(latestStockChange.get(itemId))
    if (!status) return null
    return (
      <p className={`mt-0.5 text-[10px] font-bold ${status === 'RECORDED' ? 'text-emerald-600' : 'text-slate-400'}`}>
        {status === 'RECORDED' ? 'Purchase recorded' : 'Quantity updated · purchase not recorded'}
      </p>
    )
  }

  /** One-tap request — only the quantity is collected from the supervisor. */
  const submitRequest = () => {
  if (!requestItem) return

  setStatus(null)

  const qty = parseFloat(requestQty)

  if (!Number.isFinite(qty) || qty <= 0) {
    setStatus({
      kind: 'error',
      text: 'Enter a required quantity greater than zero.',
    })
    return
  }

  try {
    requestStock(
      requestItem.id,
      requestItem.name,
      requestItem.quantity,
      qty,
      requestItem.unit,
      'Restock request from inventory screen',
      requestItem.status === 'OUT_OF_STOCK' ? 'URGENT' : 'MEDIUM',
    )

    // Show Submitted on the button before closing the modal.
    setRequestSubmitted(true)

    setStatus({
      kind: 'ok',
      text: `Requested ${qty} ${requestItem.unit} of ${requestItem.name}.`,
    })

    window.setTimeout(() => {
      setRequestSubmitted(false)
      setRequestItem(null)
      setRequestQty('')
    }, 1600)
  } catch (err) {
    setStatus({
      kind: 'error',
      text: err instanceof Error ? err.message : 'Could not submit the request',
    })
  }
}

  const badge = (s: InventoryItem['status']) =>
    s === 'GOOD'
      ? 'bg-emerald-100 text-emerald-700'
      : s === 'LOW'
        ? 'bg-amber-100 text-amber-700'
        : s === 'CRITICAL'
          ? 'bg-red-100 text-red-700'
          : 'bg-slate-200 text-slate-600'

  const controls = (item: InventoryItem, dirty: boolean) => (
    <>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => adjust(item, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label={`Decrease ${item.name}`}>
          <Minus size={14} />
        </button>
        <input type="number" min={0} value={draftOf(item)} onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm outline-none focus:border-orange-400" aria-label={`Remaining ${item.name}`} />
        <button type="button" onClick={() => adjust(item, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label={`Increase ${item.name}`}>
          <Plus size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditingItem(item)} className="inline-flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-600 transition hover:bg-orange-100">
          <Pencil size={13} /> Edit
        </button>

        <button type="button" onClick={() => save(item.id)} disabled={!dirty || savedItemId === item.id} className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${savedItemId === item.id ? 'bg-emerald-500 hover:bg-emerald-500' : 'bg-orange-500 hover:bg-orange-600'}`}>
          <Check size={13} />
          {savedItemId === item.id ? 'Saved' : 'Save Remaining'}
        </button>

        <button type="button" onClick={() => setOutOfStockItem(item)} className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100">
          <ShieldAlert size={13} /> Out of Stock
        </button>

        <button type="button" onClick={() => { setRequestItem(item); setRequestQty(''); setRequestSubmitted(false); setStatus(null) }} className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100" title="Request stock — only the required quantity is asked">
          <Package size={13} /> Request
        </button>
      </div>
    </>
  )

return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Welcome back,{' '}
          <span className="bg-linear-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">
            {userName || 'Supervisor'}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Inventory · daily stock overview</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryChip label="Total Items" value={total} cls="bg-slate-100 text-slate-800" />
        <SummaryChip label="Low" value={low} cls="bg-amber-50 text-amber-700" />
        <SummaryChip label="Critical" value={critical} cls="bg-red-50 text-red-700" />
        <SummaryChip label="Out of Stock" value={out} cls="bg-slate-100 text-slate-700" />
      </div>

      {/* Stock filters — counts come from the SAME authoritative inventory state */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['all', `All (${inventory.length})`],
            ['out', `Out of Stock (${out})`],
            ['low', `Low Stock (${low + critical})`],
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
                    : 'bg-orange-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-orange-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar with view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Inventory · Daily Stock</h2>
        <ViewModeSelect
          value={view}
          onChange={setView}
          label="Inventory view"
          options={[
            { id: 'list', label: 'List' },
            { id: 'small', label: 'Small' },
            { id: 'medium', label: 'Medium' },
            { id: 'large', label: 'Large' },
            { id: 'smaller', label: 'Smaller' },
          ]}
          className=" shrink-0"
        />
      </div>

      {status && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            status.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {status.text}
        </div>
      )}

      {inventory.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">No inventory items configured yet.</p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">No items match this filter.</p>
        </div>
      ) : view !== 'list' ? (
        <div className={`grid gap-3 ${view === 'smaller' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5' : view === 'small' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4' : view === 'large' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
          {visibleItems.map((item) => {
            const dirty = drafts[item.id] !== undefined && parseFloat(drafts[item.id]) !== item.quantity
            return (
              <div
                key={item.id}
                className={`flex flex-col rounded-[20px] border border-slate-200 bg-white shadow-sm ${view === 'smaller' ? 'gap-1.5 rounded-xl p-2' : view === 'small' ? 'gap-2 p-2.5' : view === 'large' ? 'gap-4 p-5' : 'gap-3 p-4'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`${view === 'smaller' ? 'text-xs' : view === 'small' ? 'text-sm' : 'text-base'} font-bold text-slate-900`}>{item.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <div>
                  <p className={`${view === 'smaller' ? 'text-lg' : view === 'small' ? 'text-2xl' : view === 'large' ? 'text-4xl' : 'text-3xl'} font-black text-slate-900`}>
                    {item.quantity} <span className="text-sm font-semibold text-slate-400">{item.unit}</span>
                  </p>
                  <p className={`${view === 'smaller' ? 'text-[10px]' : 'text-xs'} text-slate-500`}>Min: {item.minimumThreshold} {item.unit}</p>
                  {purchaseCaption(item.id)}
                </div>
                <div className={`flex flex-col gap-2 ${view === 'smaller' ? 'scale-85 origin-top-left' : view === 'small' ? 'scale-95 origin-top-left' : ''}`}>{controls(item, dirty)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => {
            const dirty = drafts[item.id] !== undefined && parseFloat(drafts[item.id]) !== item.quantity
            return (
              <div key={item.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-37.5 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{item.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Current: {item.quantity} {item.unit} · Min: {item.minimumThreshold} {item.unit} ·{' '}
                      {item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : '—'}
                    </p>
                    {purchaseCaption(item.id)}
                  </div>
                  {controls(item, dirty)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <ReportPeriodPicker period={period} setPeriod={setPeriod} day={day} setDay={setDay} month={month} setMonth={setMonth} year={year} setYear={setYear} />
      <StockHistoryList history={stockHistory.filter((entry) => matchesPeriod(entry.timestamp, period, day, month, year))} />
      {requestItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-4 bh-modal-overlay" onClick={() => setRequestItem(null)}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Request Stock</h3>
              <button onClick={() => setRequestItem(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{requestItem.name}</span> · Current: {requestItem.quantity} {requestItem.unit} · Min: {requestItem.minimumThreshold} {requestItem.unit}
            </p>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Required Quantity ({requestItem.unit})</label>
            <input
              type="number"
              min="0"
              step="any"
              autoFocus
              value={requestQty}
              onChange={(e) => setRequestQty(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
            />
            <button
  onClick={submitRequest}
  disabled={requestSubmitted}
  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed ${
    requestSubmitted
      ? 'bg-emerald-500'
      : 'bg-orange-500 hover:bg-orange-600'
  }`}
>
  {requestSubmitted ? (
    <>
      <Check size={15} />
      Submitted
    </>
  ) : (
    'Submit Request'
  )}
</button>
            <p className="mt-2 text-[11px] text-slate-400">Item, unit and current stock are taken automatically from this inventory record.</p>
          </div>
        </div>
      )}
      {/* Out-of-stock confirmation modal */}
      {outOfStockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 bh-modal-overlay" onClick={() => setOutOfStockItem(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Confirm Out of Stock</h3>
              <button type="button" onClick={() => setOutOfStockItem(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Are you sure you want to mark <span className="font-bold text-slate-900">{outOfStockItem.name}</span> as out of stock?
            </p>
            <p className="mt-2 text-xs text-slate-400">The remaining quantity will be set to 0.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOutOfStockItem(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={() => { const itemId = outOfStockItem.id; markOut(itemId); setOutOfStockItem(null) }} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">
                Yes, Out of Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        // No `showDangerActions`: deactivating/deleting a master inventory
        // record is an authorised-Admin action (Firestore rules agree). Offering
        // it to a supervisor only produced a local-only delete that the next
        // Firestore snapshot silently reverted — a false success that looked
        // exactly like an item appearing/disappearing on its own.
        <InventoryEditModal item={editingItem} onClose={() => setEditingItem(null)} />
      )}
    </div>
  )
}

function SummaryChip({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-[18px] px-4 py-3 ${cls}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  )
}

function StockHistoryList({ history }: { history: StockUpdate[] }) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-bold text-slate-900">Stock update history</h3>
      {history.length === 0 ? (
        <p className="text-xs text-slate-500">No stock updates recorded yet.</p>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {history.slice(0, 40).map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
            >
              <span className="font-semibold text-slate-800">{h.itemName}</span>
              <span>
                {h.previousQty} to {h.newQty} {h.unit}
              </span>
              <span>{h.updatedBy}</span>
              <span>{new Date(h.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
function SupervisorPurchaseRequests() {
  const { inventory, purchaseRequests, paymentRecords, requestStock, createPurchaseRequest } = useRestaurant()
  const [showForm, setShowForm] = useState(false)
  const [requestSubmitted, setRequestSubmitted] = useState(false)

  const [form, setForm] = useState({
    itemId: '',
    newItemName: '',
    newItemUnit: '',
    requestedQuantity: '',
    priority: 'MEDIUM' as 'URGENT' | 'MEDIUM' | 'LOW',
    reason: '',
  })
  const [formError, setFormError] = useState('')
  const selectedItem = inventory.find((item) => item.id === form.itemId)
  const isNewItemRequest = form.itemId === '__new_item__'
  const [detail, setDetail] = useState<PaymentRecord | null>(null)

  const initialPeriod = currentDateParts()
  const [period, setPeriod] = useState<ReportPeriod>('day')
  const [day, setDay] = useState(initialPeriod.day)
  const [month, setMonth] = useState(initialPeriod.month)
  const [year, setYear] = useState(initialPeriod.year)

  const purchaseHistory = paymentRecords
    .filter((p) => p.kind === 'purchase' && matchesPeriod(p.recordedAt, period, day, month, year))
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .slice(0, 30)

  const resetRequestForm = () => {
    setForm({
      itemId: '',
      newItemName: '',
      newItemUnit: '',
      requestedQuantity: '',
      priority: 'MEDIUM',
      reason: '',
    })
    setFormError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (requestSubmitted) return

    setFormError('')
    const qty = parseFloat(form.requestedQuantity)

    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Enter a required quantity greater than zero.')
      return
    }

    try {
      if (isNewItemRequest) {
        const name = form.newItemName.trim()
        const unit = form.newItemUnit.trim()

        if (!name) {
          setFormError('Enter the name of the new item.')
          return
        }
        if (!unit) {
          setFormError('Enter the unit for the new item.')
          return
        }

        createPurchaseRequest({
          itemName: name,
          currentQuantity: 0,
          requestedQuantity: qty,
          unit,
          priority: form.priority,
          reason: form.reason.trim() || 'New item request from Requests screen',
        })
      } else {
        if (!selectedItem) {
          setFormError('Choose the inventory item that needs restocking.')
          return
        }

        requestStock(
          selectedItem.id,
          selectedItem.name,
          selectedItem.quantity,
          qty,
          selectedItem.unit,
          form.reason.trim() || 'Restock request from Requests screen',
          form.priority,
        )
      }

      // Show successful submission before resetting/closing the form.
      setRequestSubmitted(true)

      window.setTimeout(() => {
        setRequestSubmitted(false)
        resetRequestForm()
        setShowForm(false)
      }, 1600)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit the request')
    }
  }

  const visibleRequests = purchaseRequests.filter((request) =>
    request.status === 'PENDING'
      ? true
      : matchesPeriod(request.processedAt ?? request.createdAt, period, day, month, year),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Purchase Requests</h2>
          <p className="text-sm text-slate-500">Request stock from the admin</p>
        </div>

        <ReportPeriodPicker period={period} setPeriod={setPeriod} day={day} setDay={setDay} month={month} setMonth={setMonth} year={year} setYear={setYear} />

        <button
          type="button"
          onClick={() => {
            if (requestSubmitted) return
            if (showForm) resetRequestForm()
            setShowForm((v) => !v)
          }}
          disabled={requestSubmitted}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showForm ? 'Cancel' : '+ New Request'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-[20px] border border-orange-100 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={form.itemId}
              onChange={(e) => {
                const value = e.target.value
                setForm((prev) => ({
                  ...prev,
                  itemId: value,
                  newItemName: value === '__new_item__' ? prev.newItemName : '',
                  newItemUnit: value === '__new_item__' ? prev.newItemUnit : '',
                }))
                setFormError('')
              }}
              required
              disabled={requestSubmitted}
              aria-label="Inventory item to restock"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50"
            >
              <option value="">Choose inventory item *</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.quantity} {item.unit} in stock)
                </option>
              ))}
              <option value="__new_item__">＋ Request New Item</option>
            </select>

            <input
              type="number"
              min={0}
              step="any"
              value={form.requestedQuantity}
              onChange={(e) => setForm((prev) => ({ ...prev, requestedQuantity: e.target.value }))}
              placeholder={`Required quantity${selectedItem ? ` (${selectedItem.unit})` : ' *'}`}
              required
              disabled={requestSubmitted}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50"
            />

            {isNewItemRequest && (
              <>
                <input
                  type="text"
                  value={form.newItemName}
                  onChange={(e) => setForm((prev) => ({ ...prev, newItemName: e.target.value }))}
                  placeholder="New item name *"
                  required
                  autoFocus
                  disabled={requestSubmitted}
                  className="rounded-lg border border-orange-200 bg-orange-50/40 px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50"
                />
                <input
                  type="text"
                  value={form.newItemUnit}
                  onChange={(e) => setForm((prev) => ({ ...prev, newItemUnit: e.target.value }))}
                  placeholder="Unit (kg, L, pcs, etc.) *"
                  required
                  disabled={requestSubmitted}
                  className="rounded-lg border border-orange-200 bg-orange-50/40 px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50"
                />
              </>
            )}

            <select
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as typeof prev.priority }))}
              aria-label="Request priority"
              disabled={requestSubmitted}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50"
            >
              {(['URGENT', 'MEDIUM', 'LOW'] as const).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <p className="self-center text-[11px] text-slate-500">
              {isNewItemRequest
                ? 'This item is not currently in inventory. Admin can create the inventory item when the request is fulfilled.'
                : selectedItem
                  ? `Current stock ${selectedItem.quantity} ${selectedItem.unit} · min ${selectedItem.minimumThreshold} ${selectedItem.unit} — taken from the inventory record.`
                  : 'Item, unit and current stock come from the selected inventory record.'}
            </p>
          </div>

          <textarea
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Reason (optional)"
            rows={2}
            disabled={requestSubmitted}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50"
          />

          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{formError}</p>}

          <button
            type="submit"
            disabled={requestSubmitted}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed ${
              requestSubmitted ? 'bg-emerald-500' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {requestSubmitted ? (
              <>
                <Check size={15} />
                Submitted
              </>
            ) : (
              'Submit Request'
            )}
          </button>
        </form>
      )}

      {visibleRequests.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">Create a new purchase request for supplies.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map((request) => {
            const statusStyles: Record<string, string> = {
              PENDING: 'bg-amber-100 text-amber-700',
              APPROVED: 'bg-emerald-100 text-emerald-700',
              REJECTED: 'bg-red-100 text-red-700',
              PURCHASED: 'bg-blue-100 text-blue-700',
              RECEIVED: 'bg-violet-100 text-violet-700',
            }
            const priorityStyles: Record<string, string> = {
              URGENT: 'bg-red-500 text-white',
              MEDIUM: 'bg-orange-100 text-orange-700',
              LOW: 'bg-slate-100 text-slate-600',
            }

            return (
              <div key={request.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900">{request.itemName}</h3>
                    <p className="text-xs text-slate-500">
                      Requested {request.requestedQuantity} {request.unit} (current: {request.currentQuantity} {request.unit}) {' • '} {new Date(request.createdAt).toLocaleString()}
                    </p>
                    {request.reason && <p className="mt-0.5 text-xs italic text-slate-400">"{request.reason}"</p>}
                    {request.purchasedQuantity != null && (
                      <p className="mt-1 text-xs font-semibold text-blue-700">
                        ✓ Purchased: {request.purchasedQuantity} {request.unit} · ₹{request.purchaseUnitCost}/{request.unit} · total ₹{request.purchaseTotalCost?.toLocaleString()}
                        {request.purchaseVendor ? ` · ${request.purchaseVendor}` : ''}
                        {request.purchaseMode ? ` · ${request.purchaseMode.replace(/_/g, ' ')}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityStyles[request.priority] ?? 'bg-slate-100 text-slate-600'}`}>{request.priority}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusStyles[request.status] ?? 'bg-slate-100 text-slate-600'}`}>{request.status}</span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-4 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span>By: <span className="font-semibold text-slate-700">{request.requestedByName}</span></span>
                  {request.processedByName && (
                    <span>
                      {request.status === 'REJECTED' ? 'Rejected' : 'Processed'} by: <span className="font-semibold text-slate-700">{request.processedByName}</span>
                      {request.processedAt ? ` · ${new Date(request.processedAt).toLocaleString()}` : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {purchaseHistory.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-bold text-slate-700">Purchase History</h3>
          <div className="space-y-2">
            {purchaseHistory.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{p.itemName}</p>
                  <p className="text-xs text-slate-500">
                    {p.quantity} {p.unit} · ₹{p.amount.toLocaleString()}
                    {p.vendor ? ` · ${p.vendor}` : ''} · {new Date(p.recordedAt).toLocaleString()}
                  </p>
                </div>
                <button type="button" onClick={() => setDetail(p)} title="View full details" className="inline-flex items-center rounded-lg bg-slate-100 p-2 text-slate-500 transition hover:bg-orange-100 hover:text-orange-600">
                  <Eye size={15} />
                </button>
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
              <button type="button" onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="mb-3 text-lg font-bold text-slate-800">{detail.itemName}</p>
            <div className="space-y-2 text-sm">
              {([
                ['Quantity', `${detail.quantity} ${detail.unit}`],
                ['Unit cost', `₹${(detail.unitCost ?? 0).toFixed(2)}`],
                ['Total cost', `₹${detail.amount.toFixed(2)}`],
                ['Vendor', detail.vendor || '-'],
                ['Payment mode', detail.paymentMode.replace(/_/g, ' ')],
                ['Recorded by', detail.recordedByName || detail.recordedBy],
                ['Date & time', new Date(detail.recordedAt).toLocaleString()],
                ['Note', detail.notes || '-'],
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
