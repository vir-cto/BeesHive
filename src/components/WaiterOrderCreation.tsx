// import { useEffect, useMemo, useState, type DragEvent } from 'react'
// import { useRestaurant } from '../context/RestaurantContext'
// import { useAuth } from '../context/AuthContext'
// import type { MenuItem, OrderPriority } from '../context/RestaurantContext'
// import { useFoodTypeFilter, foodTypeFilters, countFoodTypes, matchesFoodType } from '../lib/menuFilters'
// import FoodTypeMark from './FoodTypeBadge'
// import { formatTokenNumber } from '../lib/tokenLabel'
// import { hasHalfPlatePrice, servingSuffix, type ServingType } from '../lib/servingType'
// import { SPICE_LEVELS, SPICE_DESCRIPTIONS, CUSTOMER_NOTE_OPTIONS, buildSpecialRequests } from '../lib/orderCustomization'
// import { Plus, Minus, ShoppingCart, Send, X, Clock, Star, Zap, CheckCircle2, Printer, UtensilsCrossed, SlidersHorizontal, Flame, Check, LayoutGrid, List } from 'lucide-react'
// import { usePrintQueue } from '../services/print/printService'
// import PrintPreview from './PrintPreview'

// // Rounds to 2 decimals for money / tax arithmetic.
// const round2 = (n: number) => Math.round(n * 100) / 100

// interface WaiterOrderCreationProps {
//   sessionId: string
//   tableId: string
//   onOrderPlaced: () => void
// }

// interface CartItem {
//   id: string
//   menuItemId: string
//   name: string
//   price: number
//   imageUrl?: string
//   quantity: number
//   specialRequests?: string
//   /** Serving variant of THIS cart line — half and full stay separate lines. */
//   servingType: ServingType
// }

// export default function WaiterOrderCreation({ sessionId, tableId, onOrderPlaced }: WaiterOrderCreationProps) {
//   const { menu, categories, orders, tables, sessions, settings, createOrder, confirmOrder, printOrderToken, getTodaySpecials } = useRestaurant()
//   const { user } = useAuth()
//   const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
//   const [foodTypeFilter, setFoodTypeFilter] = useFoodTypeFilter()
//   const [menuSize, setMenuSize] = useState<'large' | 'small'>('large')
//   const menuSmall = menuSize === 'small'
//   const [cart, setCart] = useState<CartItem[]>([])
//   const [priority, setPriority] = useState<OrderPriority>('normal')
//   const [lastToken, setLastToken] = useState('')
//   const [lastOrderId, setLastOrderId] = useState('')
//   const [submitting, setSubmitting] = useState(false)
//   const [error, setError] = useState('')
//   const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null)
//   const [customNotes, setCustomNotes] = useState('')
//   const [customQty, setCustomQty] = useState(1)
//   const [customSpice, setCustomSpice] = useState<string>('Medium')
//   const [customKitchen, setCustomKitchen] = useState<string[]>([])
//   const [cartDragOver, setCartDragOver] = useState(false)
//   const printJobs = usePrintQueue()
//   const [previewJobId, setPreviewJobId] = useState<string | null>(null)
//   const [tokenPreviewOpen, setTokenPreviewOpen] = useState(false)
//   const lastTokenJob = lastOrderId ? printJobs.find((j) => j.kind === 'token' && j.referenceId === lastOrderId) : undefined

//   useEffect(() => {
//     if (previewJobId) {
//       const t = setTimeout(() => window.print(), 350)
//       return () => clearTimeout(t)
//     }
//   }, [previewJobId])

//   const table = tables.find((t) => t.id === tableId)
//   const nextDineInToken = orders.filter((o) => (o.orderType ?? 'dine_in') === 'dine_in' && o.tokenNumber != null).reduce((m, o) => Math.max(m, o.tokenNumber as number), 0) + 1
//   const tokenPreviewStar = '★ TOKEN ' + receiptTokenLabel(nextDineInToken, 'dine_in') + ' ★'
//   const tokenPreviewLinesLive: string[] = useMemo(() => {
//     const wrap = (text: string, width = 32): string[] => {
//       const words = String(text ?? '').split(/\s+/).filter(Boolean)
//       if (words.length === 0) return ['']
//       const out: string[] = []
//       let cur = ''
//       for (let w of words) {
//         while (w.length > width) {
//           if (cur) { out.push(cur); cur = '' }
//           out.push(w.slice(0, width))
//           w = w.slice(width)
//         }
//         const next = cur ? cur + ' ' + w : w
//         if (next.length > width) { out.push(cur); cur = w }
//         else cur = next
//       }
//       if (cur) out.push(cur)
//       return out
//     }
//     const nn = new Date();
//     const rq = cart.map((c) => c.specialRequests).filter((x) => !!x);
//     return [
//       tokenPreviewStar,
//       'DATE : ' + nn.getFullYear() + '-' + String(nn.getMonth() + 1).padStart(2, '0') + '-' + String(nn.getDate()).padStart(2, '0'),
//       'TIME : ' + nn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
//       'TABLE : ' + (table?.name ?? tableId),
//       '--------------------------------',
//       '',
//       'FOOD',
//       ...cart.flatMap((c) => wrap(c.name.toUpperCase() + servingSuffix(c.servingType) + '  x ' + c.quantity)),
//       '',
//       '--------------------------------',
//       'SPECIAL REQUEST',
//       ...(rq.length > 0 ? rq.flatMap((r) => wrap('!! ' + String(r).toUpperCase() + ' !!')) : ['NONE']),
//     ];
//   }, [cart, table, tableId, tokenPreviewStar])

//   const availableCategories = categories.filter((c) => c.active)
//   const availableMenuItems = menu.filter((item) => item.available && item.active)
//   const todaySpecials = getTodaySpecials()
//   const sessionOrders = orders.filter((o) => o.sessionId === sessionId)

//   const filteredItems = selectedCategory
//     ? availableMenuItems.filter((item) => item.categoryId === selectedCategory && matchesFoodType(item, foodTypeFilter))
//     : availableMenuItems.filter((item) => matchesFoodType(item, foodTypeFilter))

//   /** A dish offers a half plate only when a valid half price is configured. */
//   const halfAvailable = (m: MenuItem) => hasHalfPlatePrice(m.halfPlatePrice)

//   /** Price of one serving variant — the configured half price, never half/2. */
//   const variantPrice = (m: MenuItem, serving: ServingType): number =>
//     serving === 'half' && hasHalfPlatePrice(m.halfPlatePrice) ? m.halfPlatePrice : m.price

//   const addToCart = (menuItem: MenuItem, qty = 1, specialRequests?: string, serving: ServingType = 'full') => {
//     // Half is only a legal variant when the dish actually has a half price.
//     const servingType: ServingType = serving === 'half' && hasHalfPlatePrice(menuItem.halfPlatePrice) ? 'half' : 'full'
//     // Price is captured per variant at add-to-cart time and stored as the
//     // order item's priceSnapshot — a later menu price change never rewrites it.
//     const price = variantPrice(menuItem, servingType)
//     setCart((prev) => {
//       // Same dish in DIFFERENT variants stays on separate cart lines
//       // (Paneer Tikka HALF ×1 + Paneer Tikka FULL ×2 — never merged).
//       const existing = prev.find((item) => item.menuItemId === menuItem.id && item.servingType === servingType)
//       if (existing) {
//         return prev.map((item) =>
//           item.menuItemId === menuItem.id && item.servingType === servingType
//             ? { ...item, quantity: item.quantity + qty, specialRequests: item.specialRequests || specialRequests }
//             : item
//         )
//       }
//       return [
//         ...prev,
//         {
//           id: `cart_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
//           menuItemId: menuItem.id,
//           name: menuItem.name,
//           price,
//           imageUrl: menuItem.imageUrl,
//           quantity: qty,
//           specialRequests,
//           servingType,
//         },
//       ]
//     })
//   }

//   const openCustomize = (menuItem: MenuItem) => {
//     setCustomizingItem(menuItem)
//     setCustomNotes('')
//     setCustomQty(1)
//     setCustomSpice('Medium')
//     setCustomKitchen([])
//   }

//   const handleCustomAdd = () => {
//     if (!customizingItem || !customQty || customQty < 1) return
//     addToCart(customizingItem, customQty, buildSpecialRequests(customSpice, customKitchen, customNotes))
//     setCustomizingItem(null)
//   }

//   const handleMenuDragStart = (event: DragEvent, menuItem: MenuItem) => {
//     event.dataTransfer.effectAllowed = 'copy'
//     event.dataTransfer.setData('application/x-beeshive-menu-item', menuItem.id)
//   }

//   const handleCartDrop = (event: DragEvent) => {
//     event.preventDefault()
//     const menuItemId = event.dataTransfer.getData('application/x-beeshive-menu-item')
//     const menuItem = availableMenuItems.find((item) => item.id === menuItemId)
//     setCartDragOver(false)
//     if (menuItem) addToCart(menuItem)
//   }

//   const cartQtyFor = (menuItemId: string, serving: ServingType = 'full') =>
//     cart.find((c) => c.menuItemId === menuItemId && c.servingType === serving)?.quantity ?? 0
//   const incCart = (menuItem: MenuItem, serving: ServingType = 'full') => addToCart(menuItem, 1, undefined, serving)
//   const decCart = (menuItem: MenuItem, serving: ServingType = 'full') => {
//     setCart((prev) => {
//       const existing = prev.find((i) => i.menuItemId === menuItem.id && i.servingType === serving)
//       if (!existing) return prev
//       if (existing.quantity <= 1) return prev.filter((i) => !(i.menuItemId === menuItem.id && i.servingType === serving))
//       return prev.map((i) => (i.menuItemId === menuItem.id && i.servingType === serving ? { ...i, quantity: i.quantity - 1 } : i))
//     })
//   }

//   const isSpecial = (id: string) => todaySpecials.some((s) => s.id === id)

//   const togglePriority = (next: OrderPriority) => setPriority((p) => (p === next ? 'normal' : next))

//   const submitOrder = async () => {
//     if (cart.length === 0) {
//       setError('Cart is empty')
//       return
//     }
//     if (!user) {
//       setError('Not signed in â€” cannot place order')
//       return
//     }
//     setSubmitting(true)
//     setError('')
//     try {
//       const created = await createOrder(
//         tableId,
//         user.id,
//         sessionId,
//         cart.map((c) => ({
//           menuItemId: c.menuItemId,
//           name: c.name,
//           price: c.price,
//           quantity: c.quantity,
//           specialRequests: c.specialRequests,
//           servingType: c.servingType,
//         })),
//         priority,
//         'dine_in',
//       )
//       const confirmed = created?.id ? confirmOrder(created.id) : null
//       if (!confirmed?.id) throw new Error('Order could not be confirmed')
//       setLastOrderId(confirmed.id)
//       setLastToken(formatTokenNumber(confirmed.tokenNumber ?? 0))
//       try {
//         const job = confirmed.id ? printOrderToken(confirmed.id) : null
//         if (job) setPreviewJobId(job.id)
//       } catch { /* preview stays closed; token still assigned */ }
//       setCart([])
//       onOrderPlaced()
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Could not place order')
//     } finally {
//       setSubmitting(false)
//     }
//   }

//   return (
//     <div className="min-h-[50vh] flex flex-col gap-4">
//       {/* Header: table + session info + priority chips + live token */}
//       <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-linear-to-r from-orange-50 to-amber-50 px-5 py-4">
//         <div className="flex items-center gap-3">
//           <span className="text-sm font-bold uppercase tracking-wider text-orange-600">{tables.find((t) => t.id === tableId)?.name ?? tableId}</span>
//           <span className="text-slate-300">·</span>
//           <span className="text-sm text-slate-500">{sessions.find((s) => s.id === sessionId)?.status === 'active' ? 'Active session' : 'Session'}</span>
//           {user && <span className="text-xs text-slate-400">· {user.name}</span>}
//         </div>
//         <div className="flex items-center gap-2">
//           <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Priority</span>
//           {(['normal', 'fast', 'vip'] as OrderPriority[]).map((p) => (
//             <button
//               key={p}
//               onClick={() => togglePriority(p)}
//               className={`rounded-full px-3 py-1 text-xs font-bold transition ${priority === p ? (p === 'vip' ? 'bg-amber-400 text-amber-900' : p === 'fast' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600') : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
//             >
//               {p === 'normal' ? 'Normal' : p === 'fast' ? 'Fast' : 'VIP'}
//             </button>
//           ))}
//         </div>
//         {lastToken && lastTokenJob && (
//           <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm">
//             <CheckCircle2 size={14} /> Token {lastToken}
//             <button onClick={() => setPreviewJobId(lastTokenJob.id)} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm hover:bg-emerald-100"><Printer size={12} /> Token Receipt</button>
//           </div>
//         )}
//       </div>

//       {/* Error banner */}
//       {error && (
//         <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700">
//           {error}
//         </div>
//       )}

//       {/* Cart summary bar (responsive sticky footer when cart non-empty) */}
//       {cart.length > 0 && (
//         <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:px-5 sm:py-3">
//           <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
//             <ShoppingCart size={18} className="text-slate-500" />
//             <span className="text-slate-500">{cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}</span>
//             <span className="text-slate-300">·</span>
//             <span className="text-base font-bold text-slate-900 sm:text-lg">₹{cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
//           </div>

//           <div className="flex w-full min-w-0 flex-1 items-center justify-end gap-1.5 sm:w-auto sm:flex-initial sm:gap-3">
//             <button
//               type="button"
//               onClick={() => setTokenPreviewOpen(true)}
//               className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-2.5 py-2 text-xs font-bold text-orange-700 transition hover:bg-orange-100 sm:flex-none sm:px-4 sm:py-2.5 sm:text-sm"
//             >
//               <Printer size={16} className="shrink-0" />
//               <span className="whitespace-nowrap">Token Preview</span>
//             </button>
//             <button
//               type="button"
//               onClick={submitOrder}
//               disabled={submitting}
//               className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgba(22,163,74,0.5)] transition hover:bg-emerald-700 disabled:opacity-60 sm:flex-none sm:px-5 sm:py-2.5 sm:text-sm"
//             >
//               {submitting ? (
//                 <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
//               ) : (
//                 <Send size={16} className="shrink-0" />
//               )}
//               <span className="whitespace-nowrap">Place Order</span>
//             </button>
//           </div>
//         </div>
//       )}

//       {/* Work-area grid: menu (left) | table & orders (right) */}
//       <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
//         {/* CENTER â€” category menu bar + specials + dish grid */}
//         <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm sm:p-4 md:col-span-2 md:max-h-[calc(100vh-170px)] md:overflow-y-auto">
//           {/* Veg / Non-veg filter */}
//           <div className="flex flex-wrap items-center gap-2">
//             {foodTypeFilters.map((f) => (
//               <button
//                 key={f}
//                 onClick={() => setFoodTypeFilter(f)}
//                 className={`rounded-full px-3 py-1 text-xs font-bold transition ${foodTypeFilter === f ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
//               >
//                 {f === 'all' ? `All (${countFoodTypes(availableMenuItems).all})` : f === 'veg' ? `Veg (${countFoodTypes(availableMenuItems).veg})` : `Non-Veg (${countFoodTypes(availableMenuItems).non_veg})`}
//               </button>
//             ))}

//             {/* View: menu card size toggle */}
//             <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-slate-100 p-1 text-[11px] font-bold text-slate-500">
//               <button
//                 type="button"
//                 onClick={() => setMenuSize('large')}
//                 title="Large menu cards"
//                 className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${!menuSmall ? 'bg-white text-orange-600 shadow' : 'hover:text-slate-700'}`}
//               >
//                 <LayoutGrid size={12} /> Large
//               </button>
//               <button
//                 type="button"
//                 onClick={() => setMenuSize('small')}
//                 title="Small menu cards â€” fit more dishes"
//                 className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${menuSmall ? 'bg-white text-orange-600 shadow' : 'hover:text-slate-700'}`}
//               >
//                 <List size={12} /> Small
//               </button>
//             </span>
//           </div>

//           {/* Category menu buttons */}
//           <div className="flex items-center gap-2 overflow-x-auto rounded-[20px] border border-orange-100 bg-white p-2 shadow-sm">
//             <button
//               onClick={() => setSelectedCategory(null)}
//               className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${selectedCategory === null ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
//             >
//               <UtensilsCrossed size={14} /> All
//             </button>
//             {availableCategories.map((c) => (
//               <button
//                 key={c.id}
//                 onClick={() => setSelectedCategory(c.id)}
//                 className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${selectedCategory === c.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
//               >
//                 {c.name}
//               </button>
//             ))}
//           </div>
//           <div className="flex items-center gap-2 rounded-xl border border-dashed border-orange-200 bg-orange-50/60 px-3 py-2 text-xs font-semibold text-orange-700">
//             <ShoppingCart size={14} />
//             <span>Quick order: drag any dish to the cart, or tap Add as usual.</span>
//           </div>

//           {todaySpecials.length > 0 && (
//             <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-3">
//               <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800"><Star size={15} /> Today&apos;s Specials</p>
//               <div className="mt-2 flex flex-wrap gap-2">
//                 {todaySpecials.map((s) => (
//                   <span key={s.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm">{s.name} · ₹{round2(s.price).toFixed(2)}</span>
//                 ))}
//               </div>
//             </div>
//           )}

//           {filteredItems.length === 0 ? (
//             <p className="rounded-[20px] border border-dashed bg-white p-8 text-center text-sm">No items.</p>
//           ) : menuSmall ? (
//             <div className="max-h-[32vh] overflow-y-auto pr-1 sm:max-h-[calc(100vh-330px)]">
//             <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
//               {filteredItems.map((item) => {
//                 const qty = cartQtyFor(item.id)
//                 return (
//                   <div key={item.id} draggable onDragStart={(event) => handleMenuDragStart(event, item)} onDragEnd={() => setCartDragOver(false)} className="group flex min-w-0 cursor-grab items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md active:cursor-grabbing">
//                     {item.imageUrl ? (
//                       <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
//                     ) : (
//                       <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-orange-100 to-amber-100"><UtensilsCrossed size={16} className="text-orange-400" /></span>
//                     )}
//                     <span className="min-w-0 flex-1">
//                       <span className="flex items-center gap-1">
//                         <FoodTypeMark foodType={item.foodType} isVeg={item.isVeg} />
//                         <span className="truncate text-[13px] font-bold text-slate-900">{item.name}</span>
//                       </span>
//                       <span className="text-xs font-black text-orange-600">₹{round2(item.price).toFixed(2)}{halfAvailable(item) && <span className="ml-1 text-[10px] font-bold text-emerald-600">HALF ₹{round2(Number(item.halfPlatePrice) || 0).toFixed(0)}</span>}</span>
//                     </span>
//                     {halfAvailable(item) ? (
//                       // Half/Full stays directly usable in the compact menu too:
//                       // each variant keeps its OWN line in the cart (never merged)
//                       // and the price shown is the configured variant price.
//                       <span className="flex shrink-0 flex-col gap-1">
//                         {(['full', 'half'] as const).map((serving) => {
//                           const variantQty = cartQtyFor(item.id, serving)
//                           const label = serving === 'half' ? 'HALF' : 'FULL'
//                           return variantQty === 0 ? (
//                             <button
//                               key={serving}
//                               onClick={() => addToCart(item, 1, undefined, serving)}
//                               className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-white ${serving === 'half' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'}`}
//                             >
//                               <Plus size={11} /> {label} ₹{round2(variantPrice(item, serving)).toFixed(0)}
//                             </button>
//                           ) : (
//                             <span
//                               key={serving}
//                               className={`flex items-center gap-1 rounded-lg px-1 py-0.5 text-white ${serving === 'half' ? 'bg-emerald-600' : 'bg-orange-500'}`}
//                             >
//                               <button onClick={() => decCart(item, serving)} aria-label={`Remove one ${label}`} className="flex h-5 w-5 items-center justify-center rounded bg-white/20 transition hover:bg-white/30"><Minus size={10} /></button>
//                               <span className="text-[10px] font-black">{label} × {variantQty}</span>
//                               <button onClick={() => incCart(item, serving)} aria-label={`Add one ${label}`} className="flex h-5 w-5 items-center justify-center rounded bg-white/20 transition hover:bg-white/30"><Plus size={10} /></button>
//                             </span>
//                           )
//                         })}
//                       </span>
//                     ) : qty === 0 ? (
//                       <button onClick={() => addToCart(item)} className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-600"><Plus size={12} /> Add</button>
//                     ) : (
//                       <span className="flex shrink-0 items-center gap-1">
//                         <button onClick={() => decCart(item)} aria-label="Remove one" className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200"><Minus size={11} /></button>
//                         <span className="w-4 text-center text-[13px] font-black">{qty}</span>
//                         <button onClick={() => incCart(item)} aria-label="Add one" className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600"><Plus size={11} /></button>
//                       </span>
//                     )}
//                     <button onClick={() => openCustomize(item)} title="Customize" className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"><SlidersHorizontal size={12} /></button>
//                   </div>
//                 )
//               })}
//             </div>
//             </div>
//           ) : (
//             <div className="max-h-[32vh] overflow-y-auto pr-1 sm:max-h-[calc(100vh-330px)]">
//             <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
//               {filteredItems.map((item) => {
//                 const special = isSpecial(item.id);
//                 const catName = categories.find((c) => c.id === item.categoryId)?.name ?? item.category;
//                 return (
//                 <div key={item.id} draggable onDragStart={(event) => handleMenuDragStart(event, item)} onDragEnd={() => setCartDragOver(false)} className={`group min-w-0 overflow-hidden rounded-[20px] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing ${special ? 'border-amber-300' : 'border-slate-200'}`}>
//                   {item.imageUrl ? (
//                     <div className="relative">
//                       <img src={item.imageUrl} alt={item.imageAlt || item.name} className="h-32 w-full object-cover" loading="lazy" />
//                       {special && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white shadow"><Star size={10} /> SPECIAL</span>}
//                     </div>
//                   ) : (
//                     <div className="flex h-20 w-full items-center justify-center bg-linear-to-br from-orange-100 to-amber-100">
//                       <UtensilsCrossed size={24} className="text-orange-400" />
//                     </div>
//                   )}
//                   <div className="p-3.5">
//                     <p className="flex items-center gap-1.5 font-bold text-slate-900"><FoodTypeMark foodType={item.foodType} isVeg={item.isVeg} size="sm" /><span className="truncate">{item.name}</span>{special && !item.imageUrl && <Star size={13} className="shrink-0 text-amber-500" />}</p>
//                     {item.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{item.description}</p>}
//                     <p className="mt-1 text-sm font-black text-orange-600">₹{round2(item.price).toFixed(2)}{hasHalfPlatePrice(item.halfPlatePrice) && <span className="ml-1.5 text-[11px] font-bold text-emerald-600">HALF ₹{round2(item.halfPlatePrice).toFixed(2)}</span>}</p>
//                     <p className="flex items-center gap-1 text-[11px] text-slate-500"><Clock size={11} /> {item.preparationTime} min · {catName}</p>
//                     <div className="mt-2.5 flex gap-1.5">
//                       {halfAvailable(item)
//                         ? (['full', 'half'] as const).map((serving) => {
//                             const qty = cartQtyFor(item.id, serving)
//                             const servingLabel = serving === 'half' ? 'HALF' : 'FULL'
//                             return qty === 0 ? (
//                               <button
//                                 key={serving}
//                                 onClick={() => addToCart(item, 1, undefined, serving)}
//                                 className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-bold text-white transition ${serving === 'half' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'}`}
//                               >
//                                 <Plus size={13} /> {servingLabel} ₹{round2(variantPrice(item, serving)).toFixed(0)}
//                               </button>
//                             ) : (
//                               <div key={serving} className={`flex flex-1 items-center justify-between rounded-xl px-1 py-1 text-white ${serving === 'half' ? 'bg-emerald-600' : 'bg-orange-500'}`}>
//                                 <button onClick={() => decCart(item, serving)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 transition hover:bg-white/30" aria-label={`Remove one ${servingLabel}`}><Minus size={13} /></button>
//                                 <span className="truncate px-0.5 text-xs font-black">{servingLabel} × {qty}</span>
//                                 <button onClick={() => incCart(item, serving)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 transition hover:bg-white/30" aria-label={`Add one ${servingLabel}`}><Plus size={13} /></button>
//                               </div>
//                             )
//                           })
//                         : cartQtyFor(item.id) === 0 ? (
//                           <button onClick={() => incCart(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-500 px-2.5 py-2 text-xs font-bold text-white transition hover:bg-orange-600"><Plus size={13} /> Add</button>
//                         ) : (
//                           <div className="flex flex-1 items-center justify-between rounded-xl bg-orange-500 px-1 py-1 text-white">
//                             <button onClick={() => decCart(item)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 transition hover:bg-white/30" aria-label="Remove one"><Minus size={13} /></button>
//                             <span className="text-sm font-black">{cartQtyFor(item.id)}</span>
//                             <button onClick={() => incCart(item)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 transition hover:bg-white/30" aria-label="Add one"><Plus size={13} /></button>
//                           </div>
//                         )}
//                       <button onClick={() => openCustomize(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"><SlidersHorizontal size={13} /> Customize</button>
//                     </div>
//                   </div>
//                 </div>
//                 );
//               })}
//             </div>
//             </div>
//           )}
//         </div>

//         {/* RIGHT SIDEBAR â€” cart summary + session info */}
//         <div className="space-y-4 md:sticky md:top-4">
//           <div
//             onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setCartDragOver(true) }}
//           onDragLeave={(event) => {
//             if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCartDragOver(false)
//           }}
//             onDrop={handleCartDrop}
//             className={`rounded-3xl border-2 p-4 shadow-sm transition ${cartDragOver ? 'border-orange-500 bg-orange-50 shadow-lg shadow-orange-100' : 'border-slate-200 bg-white'}`}
//           >
//             <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
//               <div>
//                 <p className="flex items-center gap-1.5 text-base font-black text-slate-900"><ShoppingCart size={17} className={cartDragOver ? 'text-orange-500' : 'text-slate-500'} /> New order draft</p>
//                 <p className="mt-0.5 text-[11px] text-slate-500">Drag dishes here to build the next order</p>
//               </div>
//               <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-700">{cart.reduce((s, i) => s + i.quantity, 0)} items</span>
//             </div>
//             <div className="mb-2 flex items-center justify-end gap-2">
//               <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${cartDragOver ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
//                 {cartDragOver ? 'Drop here' : 'Drag food here'}
//               </span>
//             </div>
//             {cart.length === 0 ? (
//               <div className="flex min-h-37.5 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 text-center">
//                 <span className="mb-2 text-3xl text-slate-300">🍽️</span>
//                 <p className="text-sm font-semibold text-slate-500">Your order is empty</p>
//                 <p className="mt-1 text-xs text-slate-400">Select a dish or drag one from the menu.</p>
//               </div>
//             ) : cart.map((c) => (
//               <div key={c.id} className="flex items-center justify-between gap-2 py-1 text-xs">
//                 <span className="font-semibold">{c.name}{servingSuffix(c.servingType)} x{c.quantity}{c.specialRequests ? ` - ${c.specialRequests}` : ''}</span>
//                 <span className="flex items-center gap-1">
//                   <button onClick={() => setCart((prev) => prev.map((i) => (i.id === c.id ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0))} className="rounded bg-slate-100 px-1.5 py-0.5"><Minus size={11} /></button>
//                   <button onClick={() => setCart((prev) => prev.map((i) => (i.id === c.id ? { ...i, quantity: i.quantity + 1 } : i)))} className="rounded bg-slate-100 px-1.5 py-0.5"><Plus size={11} /></button>
//                   <button onClick={() => setCart((prev) => prev.filter((i) => i.id !== c.id))} className="rounded bg-slate-100 px-1.5 py-0.5"><X size={11} /></button>
//                 </span>
//               </div>
//             ))}
//             <div className="mt-3 border-t border-slate-100 pt-3">
//               <div className="flex justify-between text-xs text-slate-500"><span>Items subtotal</span><span>₹{round2(cart.reduce((s, i) => s + i.price * i.quantity, 0)).toFixed(2)}</span></div>
//               <p className="mt-1 flex justify-between text-base font-black text-slate-900"><span>New order total</span><span>₹{round2(cart.reduce((s, i) => s + i.price * i.quantity, 0)).toFixed(2)}</span></p>
//               <p className="mt-0.5 text-[10px] text-slate-400">GST {Number(settings.taxRate) || 0}% applied at billing</p>
//             </div>
//           </div>
//           <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
//             <p className="mb-2 flex items-center justify-between text-sm font-black text-slate-900"><span>Live session orders</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{sessionOrders.length}</span></p>
//             {sessionOrders.map((o) => <p key={o.id} className="text-xs">{o.items.reduce((s, i) => s + i.quantity, 0)} items - ₹{round2(o.totalAmount).toFixed(2)}</p>)}
//           </div>
//           {lastTokenJob && <div className="flex items-center gap-1 text-sm">Token {lastToken}<button onClick={() => setPreviewJobId(lastTokenJob.id)} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1"><Printer size={12} /> Preview</button></div>}
//           <p className="flex items-center gap-1 text-xs"><Zap size={12} /> Fast<Flame size={12} /> Spice</p>
//         </div>
//       </div>

//       {/* Modal: Item Customization */}
//       {customizingItem && (
//         <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/65 p-3 py-5 backdrop-blur-sm sm:items-center sm:p-5 bh-modal-overlay">
//           <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/50 bg-white shadow-[0_24px_80px_-20px_rgba(127,29,29,0.65)]">
//             <div className="relative overflow-hidden bg-linear-to-br from-orange-600 via-red-600 to-rose-700 px-5 py-5 text-white">
//               <div className="pointer-events-none absolute -right-5 -top-8 text-[92px] opacity-20">🌶️</div>
//               <div className="relative flex items-center gap-3">
//                 {customizingItem.imageUrl ? (
//                   <img src={customizingItem.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl border-2 border-white/40 object-cover shadow-lg" />
//                 ) : (
//                   <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl shadow-lg">🌶️</div>
//                 )}
//                 <div className="min-w-0">
//                 <p className="text-[11px] font-bold uppercase tracking-widest text-orange-100">Customize</p>
//                 <h3 className="truncate text-xl font-black">{customizingItem.name}</h3>
//                 <p className="text-xs text-orange-100">₹{round2(customizingItem.price).toFixed(2)} · {categories.find((c) => c.id === customizingItem.categoryId)?.name ?? customizingItem.category}</p>
//                 </div>
//               </div>
//               <button onClick={() => setCustomizingItem(null)} className="absolute right-3 top-3 rounded-xl p-2 text-white/80 hover:bg-white/20" aria-label="Close"><X size={20} /></button>
//             </div>
//             <div className="max-h-[72vh] space-y-5 overflow-y-auto bg-linear-to-b from-orange-50/50 to-white p-4 sm:p-5">
//               <div className="rounded-2xl border border-red-100 bg-white p-3.5 shadow-sm">
//                 <div className="mb-3 flex items-center justify-between gap-2">
//                   <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700"><span className="text-lg">🌶️</span> Heat meter</p>
//                   <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-600">{customSpice} heat</span>
//                 </div>
//                 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
//                   {SPICE_LEVELS.map((level) => (
//                     (() => {
//                       const heat = SPICE_LEVELS.indexOf(level)
//                       const active = customSpice === level
//                       const colors = [
//                         'border-emerald-200 bg-emerald-50 text-emerald-700',
//                         'border-yellow-200 bg-yellow-50 text-yellow-700',
//                         'border-orange-200 bg-orange-50 text-orange-700',
//                         'border-red-300 bg-red-50 text-red-700',
//                       ]
//                       return (
//                     <button
//                       key={level}
//                       title={SPICE_DESCRIPTIONS[level] ?? level}
//                       onClick={() => setCustomSpice(level)}
//                       className={`relative flex min-h-17 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-xs font-black transition ${active ? 'scale-[1.03] border-red-600 bg-red-600 text-white shadow-lg shadow-red-200' : `${colors[heat]} hover:-translate-y-0.5 hover:shadow-sm`}`}
//                     >
//                       <span className={`flex gap-0.5 text-base ${active ? 'grayscale-0' : 'grayscale-[0.15]'}`}>
//                         {Array.from({ length: heat + 1 }, (_, index) => <span key={index}>🌶️</span>)}
//                       </span>
//                       <span>{active && <Check size={11} className="mr-0.5 inline" />}{level}</span>
//                     </button>
//                       )
//                     })()
//                   ))}
//                 </div>
//                 {customSpice && <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">{SPICE_DESCRIPTIONS[customSpice]}</p>}
//               </div>
//               <div>
//                 <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700"><Flame size={14} className="text-orange-500" /> Kitchen notes</p>
//                 <div className="flex flex-wrap gap-1.5">
//                   {CUSTOMER_NOTE_OPTIONS.map((opt) => {
//                     const active = customKitchen.includes(opt)
//                     return (
//                       <button
//                         key={opt}
//                         onClick={() => setCustomKitchen((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]))}
//                         className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${active ? 'border-emerald-600 bg-emerald-600 text-white shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'}`}
//                       >
//                         {opt}
//                       </button>
//                     )
//                   })}
//                 </div>
//               </div>
//               <div>
//                 <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Anything else the guest said…</p>
//                 <input value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} placeholder="e.g. less salt, no onion…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
//               </div>
//               <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-3 py-2.5">
//                 <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Qty</span>
//                 <span className="flex items-center gap-2">
//                   <button onClick={() => setCustomQty((q) => Math.max(1, q - 1))} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm hover:bg-slate-100"><Minus size={13} /></button>
//                   <span className="w-6 text-center text-sm font-black">{customQty}</span>
//                   <button onClick={() => setCustomQty((q) => q + 1)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm hover:bg-orange-600"><Plus size={13} /></button>
//                 </span>
//               </div>
//               <div className="flex gap-2">
//                 <button onClick={() => setCustomizingItem(null)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
//                 <button onClick={handleCustomAdd} className="flex flex-2 items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-orange-500 to-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:from-orange-600 hover:to-red-700"><Plus size={15} /> Add {customQty > 1 ? `${customQty} ` : ''}to Order</button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {previewJobId && <PrintPreview jobId={previewJobId} onCancel={()=>setPreviewJobId(null)} />}
//       {tokenPreviewOpen && (<TokenDraftPreview onClose={()=>setTokenPreviewOpen(false)} lines={tokenPreviewLinesLive} tokenNo={tokenPreviewNumber} empty={cart.length===0} />)}
//     </div>
//   )
// }

// function TokenDraftPreview({ onClose, lines, tokenNo, empty }: { onClose: () => void; lines: string[]; tokenNo: string; empty: boolean }) {
//   // The PAPER output must carry the token banner itself: the big on-screen
//   // banner above is `print:hidden`, and the draft lines' own star line is
//   // filtered out here to avoid printing it twice — WITHOUT prepending the
//   // banner, the printed receipt started at DATE / TIME / TABLE and the token
//   // number was lost from the physical output.
//   const body = [`★ TOKEN ${tokenNo} ★`, '', ...lines.filter((l) => l.indexOf('TOKEN') === -1)].join('\n').replace(/^\n+/, '');
//   return (
//     <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay">
//       <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
//         <div className="mb-3 flex items-center justify-between">
//           <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Printer size={18} className="text-orange-500" />Token Preview</h2>
//           <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
//         </div>
//         <div className="print:hidden mb-3 rounded-xl border-2 border-orange-200 bg-linear-to-br from-orange-50 to-amber-50 py-3 text-center">
//           <p className="text-[10px] font-black uppercase tracking-[0.35em] text-orange-500">Token</p>
//           <p className="mt-0.5 text-4xl font-black tracking-wider text-slate-900">TOKEN {tokenNo}</p>
//         </div>
//         <div id="receipt-print-area">
//           <pre className="receipt-screen max-h-80 overflow-auto rounded-xl border border-slate-200 bg-[#fffdf9] p-3 text-[10px] leading-tight text-slate-700">{lines.join("\n")}</pre>
//           <pre className="receipt-paper whitespace-pre-wrap font-mono text-[13px] leading-normal text-black">{body}</pre>
//         </div>
//         {empty && <p className="mt-2 text-xs text-slate-400">Add dishes to fill this token.</p>}
//         <div className="mt-3 flex gap-2">
//           <div className="flex-1 rounded-xl bg-orange-50 px-4 py-2 text-center text-xs font-bold text-orange-700">Token prints automatically when the order is placed</div>
//           <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">Close</button>
//         </div>
//       </div>
//     </div>
//   );
// }










import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { useAuth } from '../context/AuthContext'
import type { MenuItem, OrderPriority } from '../context/RestaurantContext'
import { useFoodTypeFilter, foodTypeFilters, countFoodTypes, matchesFoodType } from '../lib/menuFilters'
import FoodTypeMark from './FoodTypeBadge'
import { formatTokenNumber } from '../lib/tokenLabel'
import { hasHalfPlatePrice, servingSuffix, type ServingType } from '../lib/servingType'
import { SPICE_LEVELS, SPICE_DESCRIPTIONS, CUSTOMER_NOTE_OPTIONS, buildSpecialRequests } from '../lib/orderCustomization'
import { Plus, Minus, ShoppingCart, Send, X, Clock, Star, Zap, CheckCircle2, Printer, UtensilsCrossed, SlidersHorizontal, Flame, Check, LayoutGrid, List } from 'lucide-react'
import { usePrintQueue } from '../services/print/printService'
import PrintPreview from './PrintPreview'

// Rounds to 2 decimals for money / tax arithmetic.
const round2 = (n: number) => Math.round(n * 100) / 100

interface WaiterOrderCreationProps {
  sessionId: string
  tableId: string
  onOrderPlaced: () => void
}

interface CartItem {
  id: string
  menuItemId: string
  name: string
  price: number
  imageUrl?: string
  quantity: number
  specialRequests?: string
  /** Serving variant of THIS cart line — half and full stay separate lines. */
  servingType: ServingType
}

export default function WaiterOrderCreation({ sessionId, tableId, onOrderPlaced }: WaiterOrderCreationProps) {
  const { menu, categories, orders, tables, sessions, settings, createOrder, confirmOrder, printOrderToken, getTodaySpecials } = useRestaurant()
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [foodTypeFilter, setFoodTypeFilter] = useFoodTypeFilter()
  const [menuSize, setMenuSize] = useState<'large' | 'small'>('large')
  const menuSmall = menuSize === 'small'
  const [cart, setCart] = useState<CartItem[]>([])
  const [priority, setPriority] = useState<OrderPriority>('normal')
  const [lastToken, setLastToken] = useState('')
  const [lastOrderId, setLastOrderId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState('')
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null)
  const [customNotes, setCustomNotes] = useState('')
  const [customQty, setCustomQty] = useState(1)
  const [customSpice, setCustomSpice] = useState<string>('Medium')
  const [customKitchen, setCustomKitchen] = useState<string[]>([])
  const [cartDragOver, setCartDragOver] = useState(false)
  const printJobs = usePrintQueue()
  const [previewJobId, setPreviewJobId] = useState<string | null>(null)
  const [tokenPreviewOpen, setTokenPreviewOpen] = useState(false)
  const lastTokenJob = lastOrderId ? printJobs.find((j) => j.kind === 'token' && j.referenceId === lastOrderId) : undefined

  const table = tables.find((t) => t.id === tableId)
  // A token is assigned atomically only when the order is created. Never
  // predict a number from the current orders array because another waiter may
  // receive the next number first.
  const tokenPreviewNumber = lastToken || '—'
  const tokenPreviewStar = '★ TOKEN ' + tokenPreviewNumber + ' ★'
  const tokenPreviewLinesLive: string[] = useMemo(() => {
    const wrap = (text: string, width = 32): string[] => {
      const words = String(text ?? '').split(/\s+/).filter(Boolean)
      if (words.length === 0) return ['']
      const out: string[] = []
      let cur = ''
      for (let w of words) {
        while (w.length > width) {
          if (cur) { out.push(cur); cur = '' }
          out.push(w.slice(0, width))
          w = w.slice(width)
        }
        const next = cur ? cur + ' ' + w : w
        if (next.length > width) { out.push(cur); cur = w }
        else cur = next
      }
      if (cur) out.push(cur)
      return out
    }
    const nn = new Date();
    const rq = cart.map((c) => c.specialRequests).filter((x) => !!x);
    return [
      tokenPreviewStar,
      'DATE : ' + nn.getFullYear() + '-' + String(nn.getMonth() + 1).padStart(2, '0') + '-' + String(nn.getDate()).padStart(2, '0'),
      'TIME : ' + nn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      'TABLE : ' + (table?.name ?? tableId),
      ...(priority !== 'normal' ? ['PRIORITY : ' + (priority === 'fast' ? 'FAST' : 'VIP')] : []),
      '--------------------------------',
      '',
      'FOOD',
      ...cart.flatMap((c) => wrap(c.name.toUpperCase() + servingSuffix(c.servingType) + '  x ' + c.quantity)),
      '',
      '--------------------------------',
      'SPECIAL REQUEST',
      ...(rq.length > 0 ? rq.flatMap((r) => wrap('!! ' + String(r).toUpperCase() + ' !!')) : ['NONE']),
    ];
  }, [cart, table, tableId, tokenPreviewStar, priority])

  const availableCategories = categories.filter((c) => c.active)
  const availableMenuItems = menu.filter((item) => item.available && item.active)
  const todaySpecials = getTodaySpecials()
  const sessionOrders = orders.filter((o) => o.sessionId === sessionId)

  const filteredItems = selectedCategory
    ? availableMenuItems.filter((item) => item.categoryId === selectedCategory && matchesFoodType(item, foodTypeFilter))
    : availableMenuItems.filter((item) => matchesFoodType(item, foodTypeFilter))

  /** A dish offers a half plate only when a valid half price is configured. */
  const halfAvailable = (m: MenuItem) => hasHalfPlatePrice(m.halfPlatePrice)

  /** Price of one serving variant — the configured half price, never half/2. */
  const variantPrice = (m: MenuItem, serving: ServingType): number =>
    serving === 'half' && hasHalfPlatePrice(m.halfPlatePrice) ? m.halfPlatePrice : m.price

  const addToCart = (menuItem: MenuItem, qty = 1, specialRequests?: string, serving: ServingType = 'full') => {
    // Half is only a legal variant when the dish actually has a half price.
    const servingType: ServingType = serving === 'half' && hasHalfPlatePrice(menuItem.halfPlatePrice) ? 'half' : 'full'
    // Price is captured per variant at add-to-cart time and stored as the
    // order item's priceSnapshot — a later menu price change never rewrites it.
    const price = variantPrice(menuItem, servingType)
    setCart((prev) => {
      // Same dish in DIFFERENT variants stays on separate cart lines
      // (Paneer Tikka HALF ×1 + Paneer Tikka FULL ×2 — never merged).
      const existing = prev.find((item) => item.menuItemId === menuItem.id && item.servingType === servingType)
      if (existing) {
        return prev.map((item) =>
          item.menuItemId === menuItem.id && item.servingType === servingType
            ? { ...item, quantity: item.quantity + qty, specialRequests: item.specialRequests || specialRequests }
            : item
        )
      }
      return [
        ...prev,
        {
          id: `cart_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
          menuItemId: menuItem.id,
          name: menuItem.name,
          price,
          imageUrl: menuItem.imageUrl,
          quantity: qty,
          specialRequests,
          servingType,
        },
      ]
    })
  }

  const openCustomize = (menuItem: MenuItem) => {
    setCustomizingItem(menuItem)
    setCustomNotes('')
    setCustomQty(1)
    setCustomSpice('Medium')
    setCustomKitchen([])
  }

  const handleCustomAdd = () => {
    if (!customizingItem || !customQty || customQty < 1) return
    addToCart(customizingItem, customQty, buildSpecialRequests(customSpice, customKitchen, customNotes))
    setCustomizingItem(null)
  }

  const handleMenuDragStart = (event: DragEvent, menuItem: MenuItem) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-beeshive-menu-item', menuItem.id)
  }

  const handleCartDrop = (event: DragEvent) => {
    event.preventDefault()
    const menuItemId = event.dataTransfer.getData('application/x-beeshive-menu-item')
    const menuItem = availableMenuItems.find((item) => item.id === menuItemId)
    setCartDragOver(false)
    if (menuItem) addToCart(menuItem)
  }

  const cartQtyFor = (menuItemId: string, serving: ServingType = 'full') =>
    cart.find((c) => c.menuItemId === menuItemId && c.servingType === serving)?.quantity ?? 0
  const incCart = (menuItem: MenuItem, serving: ServingType = 'full') => addToCart(menuItem, 1, undefined, serving)
  

  const isSpecial = (id: string) => todaySpecials.some((s) => s.id === id)

  const togglePriority = (next: OrderPriority) => setPriority((p) => (p === next ? 'normal' : next))

  const submitOrder = async () => {
    if (submittingRef.current) return
    if (cart.length === 0) {
      setError('Cart is empty')
      return
    }
    if (!user) {
      setError('Not signed in â€” cannot place order')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const created = await createOrder(
        tableId,
        user.id,
        sessionId,
        cart.map((c) => ({
          menuItemId: c.menuItemId,
          name: c.name,
          price: c.price,
          quantity: c.quantity,
          specialRequests: c.specialRequests,
          servingType: c.servingType,
        })),
        priority,
        'dine_in',
      )
      const confirmed = created?.id ? confirmOrder(created.id) : null
      if (!confirmed?.id) throw new Error('Order could not be confirmed')
      setLastOrderId(confirmed.id)
      setLastToken(formatTokenNumber(confirmed.tokenNumber ?? 0))
      // The kitchen token prints automatically exactly once. No preview is
      // opened here; the Token Receipt action below is an explicit reprint path.
      try { printOrderToken(confirmed.id) } catch { /* order/token remain valid */ }
      setCart([])
      onOrderPlaced()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place order')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[50vh] flex flex-col gap-4">
      {/* Header: table + session info + priority chips + live token */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-linear-to-r from-orange-50 to-amber-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold uppercase tracking-wider text-orange-600">{tables.find((t) => t.id === tableId)?.name ?? tableId}</span>
          <span className="text-slate-300">·</span>
          <span className="text-sm text-slate-500">{sessions.find((s) => s.id === sessionId)?.status === 'active' ? 'Active session' : 'Session'}</span>
          {user && <span className="text-xs text-slate-400">· {user.name}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Priority</span>
          {(['normal', 'fast', 'vip'] as OrderPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${priority === p ? (p === 'vip' ? 'bg-amber-400 text-amber-900' : p === 'fast' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600') : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              {p === 'normal' ? 'Normal' : p === 'fast' ? 'Fast' : 'VIP'}
            </button>
          ))}
        </div>
        {lastToken && lastTokenJob && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm">
            <CheckCircle2 size={14} /> Token {lastToken}
            <button onClick={() => setPreviewJobId(lastTokenJob.id)} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm hover:bg-emerald-100"><Printer size={12} /> Token Receipt</button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Cart summary bar (responsive sticky footer when cart non-empty) */}
      {cart.length > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:px-5 sm:py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ShoppingCart size={18} className="text-slate-500" />
            <span className="text-slate-500">{cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}</span>
            <span className="text-slate-300">·</span>
            <span className="text-base font-bold text-slate-900 sm:text-lg">₹{cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}</span>
          </div>

          <div className="flex w-full min-w-0 flex-1 items-center justify-end gap-1.5 sm:w-auto sm:flex-initial sm:gap-3">
            <button
              type="button"
              onClick={() => setTokenPreviewOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-2.5 py-2 text-xs font-bold text-orange-700 transition hover:bg-orange-100 sm:flex-none sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Printer size={16} className="shrink-0" />
              <span className="whitespace-nowrap">Token Preview</span>
            </button>
            <button
              type="button"
              onClick={submitOrder}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgba(22,163,74,0.5)] transition hover:bg-emerald-700 disabled:opacity-60 sm:flex-none sm:px-5 sm:py-2.5 sm:text-sm"
            >
              {submitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send size={16} className="shrink-0" />
              )}
              <span className="whitespace-nowrap">Place Order</span>
            </button>
          </div>
        </div>
      )}

      {/* Work-area grid: menu (left) | table & orders (right) */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        {/* CENTER â€” category menu bar + specials + dish grid */}
        <div className="min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm sm:p-4 md:col-span-2 md:max-h-[calc(100vh-170px)] md:overflow-y-auto">
          {/* Veg / Non-veg filter */}
          <div className="flex flex-wrap items-center gap-2">
            {foodTypeFilters.map((f) => (
              <button
                key={f}
                onClick={() => setFoodTypeFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${foodTypeFilter === f ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f === 'all' ? `All (${countFoodTypes(availableMenuItems).all})` : f === 'veg' ? `Veg (${countFoodTypes(availableMenuItems).veg})` : `Non-Veg (${countFoodTypes(availableMenuItems).non_veg})`}
              </button>
            ))}

            {/* View: menu card size toggle */}
            <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-slate-100 p-1 text-[11px] font-bold text-slate-500">
              <button
                type="button"
                onClick={() => setMenuSize('large')}
                title="Large menu cards"
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${!menuSmall ? 'bg-white text-orange-600 shadow' : 'hover:text-slate-700'}`}
              >
                <LayoutGrid size={12} /> Large
              </button>
              <button
                type="button"
                onClick={() => setMenuSize('small')}
                title="Small menu cards â€” fit more dishes"
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${menuSmall ? 'bg-white text-orange-600 shadow' : 'hover:text-slate-700'}`}
              >
                <List size={12} /> Small
              </button>
            </span>
          </div>

          {/* Category menu buttons */}
          <div className="flex items-center gap-2 overflow-x-auto rounded-[20px] border border-orange-100 bg-white p-2 shadow-sm">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${selectedCategory === null ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <UtensilsCrossed size={14} /> All
            </button>
            {availableCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${selectedCategory === c.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-orange-200 bg-orange-50/60 px-3 py-2 text-xs font-semibold text-orange-700">
            <ShoppingCart size={14} />
            <span>Quick order: drag any dish to the cart, or tap Add as usual.</span>
          </div>

          {todaySpecials.length > 0 && (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800"><Star size={15} /> Today&apos;s Specials</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {todaySpecials.map((s) => (
                  <span key={s.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm">{s.name} · ₹{round2(s.price).toFixed(2)}</span>
                ))}
              </div>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <p className="rounded-[20px] border border-dashed bg-white p-8 text-center text-sm">No items.</p>
          ) : menuSmall ? (
            <div className="max-h-[32vh] overflow-y-auto pr-1 sm:max-h-[calc(100vh-330px)]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filteredItems.map((item) => {
                const qty = cartQtyFor(item.id)
                return (
                  <div key={item.id} draggable onDragStart={(event) => handleMenuDragStart(event, item)} onDragEnd={() => setCartDragOver(false)} className="group flex min-w-0 cursor-grab items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md active:cursor-grabbing">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-orange-100 to-amber-100"><UtensilsCrossed size={16} className="text-orange-400" /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <FoodTypeMark foodType={item.foodType} isVeg={item.isVeg} />
                        <span className="truncate text-[13px] font-bold text-slate-900">{item.name}</span>
                      </span>
                      <span className="text-xs font-black text-orange-600">₹{round2(item.price).toFixed(2)}{halfAvailable(item) && <span className="ml-1 text-[10px] font-bold text-emerald-600">HALF ₹{round2(Number(item.halfPlatePrice) || 0).toFixed(0)}</span>}</span>
                    </span>
                    {halfAvailable(item) ? (
                      // Half/Full stays directly usable in the compact menu too:
                      // each variant keeps its OWN line in the cart (never merged)
                      // and the price shown is the configured variant price.
                      <span className="flex shrink-0 flex-col gap-1">
                        {(['full', 'half'] as const).map((serving) => {
                          const variantQty = cartQtyFor(item.id, serving)
                          const label = serving === 'half' ? 'HALF' : 'FULL'
                          return variantQty === 0 ? (
                            <button
                              key={serving}
                              onClick={() => addToCart(item, 1, undefined, serving)}
                              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-white ${serving === 'half' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                            >
                              <Plus size={11} /> {label} ₹{round2(variantPrice(item, serving)).toFixed(0)}
                            </button>
                           ) : (
                             <span
                               key={serving}
                               className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ${serving === 'half' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-orange-200 bg-orange-50 text-orange-700'}`}
                             >
                               <CheckCircle2 size={11} />
                               Added {label}
                             </span>
                           )
                        })}
                      </span>
                     ) : qty === 0 ? (
                       <button onClick={() => addToCart(item)} className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-600"><Plus size={12} /> Add</button>
                     ) : (
                       <span className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700">
                         <CheckCircle2 size={12} /> Added
                       </span>
                     )}
                    <button onClick={() => openCustomize(item)} title="Customize" className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"><SlidersHorizontal size={12} /></button>
                  </div>
                )
              })}
            </div>
            </div>
          ) : (
            <div className="max-h-[32vh] overflow-y-auto pr-1 sm:max-h-[calc(100vh-330px)]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredItems.map((item) => {
                const special = isSpecial(item.id);
                const catName = categories.find((c) => c.id === item.categoryId)?.name ?? item.category;
                return (
                <div key={item.id} draggable onDragStart={(event) => handleMenuDragStart(event, item)} onDragEnd={() => setCartDragOver(false)} className={`group min-w-0 overflow-hidden rounded-[20px] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing ${special ? 'border-amber-300' : 'border-slate-200'}`}>
                  {item.imageUrl ? (
                    <div className="relative">
                      <img src={item.imageUrl} alt={item.imageAlt || item.name} className="h-32 w-full object-cover" loading="lazy" />
                      {special && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white shadow"><Star size={10} /> SPECIAL</span>}
                    </div>
                  ) : (
                    <div className="flex h-20 w-full items-center justify-center bg-linear-to-br from-orange-100 to-amber-100">
                      <UtensilsCrossed size={24} className="text-orange-400" />
                    </div>
                  )}
                  <div className="p-3.5">
                    <p className="flex items-center gap-1.5 font-bold text-slate-900"><FoodTypeMark foodType={item.foodType} isVeg={item.isVeg} size="sm" /><span className="truncate">{item.name}</span>{special && !item.imageUrl && <Star size={13} className="shrink-0 text-amber-500" />}</p>
                    {item.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{item.description}</p>}
                    <p className="mt-1 text-sm font-black text-orange-600">₹{round2(item.price).toFixed(2)}{hasHalfPlatePrice(item.halfPlatePrice) && <span className="ml-1.5 text-[11px] font-bold text-emerald-600">HALF ₹{round2(item.halfPlatePrice).toFixed(2)}</span>}</p>
                    <p className="flex items-center gap-1 text-[11px] text-slate-500"><Clock size={11} /> {item.preparationTime} min · {catName}</p>
                    <div className="mt-2.5 flex gap-1.5">
                      {halfAvailable(item)
                        ? (['full', 'half'] as const).map((serving) => {
                            const qty = cartQtyFor(item.id, serving)
                            const servingLabel = serving === 'half' ? 'HALF' : 'FULL'
                            return qty === 0 ? (
                              <button
                                key={serving}
                                onClick={() => addToCart(item, 1, undefined, serving)}
                                className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-bold text-white transition ${serving === 'half' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                              >
                                <Plus size={13} /> {servingLabel} ₹{round2(variantPrice(item, serving)).toFixed(0)}
                              </button>
                             ) : (
                               <span key={serving} className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-black ${serving === 'half' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-orange-200 bg-orange-50 text-orange-700'}`}>
                                 <CheckCircle2 size={13} /> Added {servingLabel}
                               </span>
                             )
                          })
                         : cartQtyFor(item.id) === 0 ? (
                           <button onClick={() => incCart(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-500 px-2.5 py-2 text-xs font-bold text-white transition hover:bg-orange-600"><Plus size={13} /> Add</button>
                         ) : (
                           <span className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-black text-emerald-700">
                             <CheckCircle2 size={13} /> Added
                           </span>
                         )}
                      <button onClick={() => openCustomize(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"><SlidersHorizontal size={13} /> Customize</button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR â€” cart summary + session info */}
        <div className="space-y-4 md:sticky md:top-4">
          <div
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setCartDragOver(true) }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCartDragOver(false)
          }}
            onDrop={handleCartDrop}
            className={`rounded-3xl border-2 p-4 shadow-sm transition ${cartDragOver ? 'border-orange-500 bg-orange-50 shadow-lg shadow-orange-100' : 'border-slate-200 bg-white'}`}
          >
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <p className="flex items-center gap-1.5 text-base font-black text-slate-900"><ShoppingCart size={17} className={cartDragOver ? 'text-orange-500' : 'text-slate-500'} /> New order draft</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Drag dishes here to build the next order</p>
              </div>
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-700">{cart.reduce((s, i) => s + i.quantity, 0)} items</span>
            </div>
            <div className="mb-2 flex items-center justify-end gap-2">
              <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${cartDragOver ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {cartDragOver ? 'Drop here' : 'Drag food here'}
              </span>
            </div>
            {cart.length === 0 ? (
              <div className="flex min-h-37.5 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 text-center">
                <span className="mb-2 text-3xl text-slate-300">🍽️</span>
                <p className="text-sm font-semibold text-slate-500">Your order is empty</p>
                <p className="mt-1 text-xs text-slate-400">Select a dish or drag one from the menu.</p>
              </div>
            ) : cart.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-1 text-xs">
                <span className="font-semibold">{c.name}{servingSuffix(c.servingType)} x{c.quantity}{c.specialRequests ? ` - ${c.specialRequests}` : ''}</span>
                <span className="flex items-center gap-1">
                  <button onClick={() => setCart((prev) => prev.map((i) => (i.id === c.id ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0))} className="rounded bg-slate-100 px-1.5 py-0.5"><Minus size={11} /></button>
                  <button onClick={() => setCart((prev) => prev.map((i) => (i.id === c.id ? { ...i, quantity: i.quantity + 1 } : i)))} className="rounded bg-slate-100 px-1.5 py-0.5"><Plus size={11} /></button>
                  <button onClick={() => setCart((prev) => prev.filter((i) => i.id !== c.id))} className="rounded bg-slate-100 px-1.5 py-0.5"><X size={11} /></button>
                </span>
              </div>
            ))}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="flex justify-between text-xs text-slate-500"><span>Items subtotal</span><span>₹{round2(cart.reduce((s, i) => s + i.price * i.quantity, 0)).toFixed(2)}</span></div>
              <p className="mt-1 flex justify-between text-base font-black text-slate-900"><span>New order total</span><span>₹{round2(cart.reduce((s, i) => s + i.price * i.quantity, 0)).toFixed(2)}</span></p>
              <p className="mt-0.5 text-[10px] text-slate-400">GST {Number(settings.taxRate) || 0}% applied at billing</p>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 flex items-center justify-between text-sm font-black text-slate-900"><span>Live session orders</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{sessionOrders.length}</span></p>
            {sessionOrders.map((o) => <p key={o.id} className="text-xs">{o.items.reduce((s, i) => s + i.quantity, 0)} items - ₹{round2(o.totalAmount).toFixed(2)}</p>)}
          </div>
          {lastTokenJob && <div className="flex items-center gap-1 text-sm">Token {lastToken}<button onClick={() => setPreviewJobId(lastTokenJob.id)} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1"><Printer size={12} /> Preview</button></div>}
          <p className="flex items-center gap-1 text-xs"><Zap size={12} /> Fast<Flame size={12} /> Spice</p>
        </div>
      </div>

      {/* Modal: Item Customization */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/65 p-3 py-5 backdrop-blur-sm sm:items-center sm:p-5 bh-modal-overlay">
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/50 bg-white shadow-[0_24px_80px_-20px_rgba(127,29,29,0.65)]">
            <div className="relative overflow-hidden bg-linear-to-br from-orange-600 via-red-600 to-rose-700 px-5 py-5 text-white">
              <div className="pointer-events-none absolute -right-5 -top-8 text-[92px] opacity-20">🌶️</div>
              <div className="relative flex items-center gap-3">
                {customizingItem.imageUrl ? (
                  <img src={customizingItem.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl border-2 border-white/40 object-cover shadow-lg" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl shadow-lg">🌶️</div>
                )}
                <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-orange-100">Customize</p>
                <h3 className="truncate text-xl font-black">{customizingItem.name}</h3>
                <p className="text-xs text-orange-100">₹{round2(customizingItem.price).toFixed(2)} · {categories.find((c) => c.id === customizingItem.categoryId)?.name ?? customizingItem.category}</p>
                </div>
              </div>
              <button onClick={() => setCustomizingItem(null)} className="absolute right-3 top-3 rounded-xl p-2 text-white/80 hover:bg-white/20" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="max-h-[72vh] space-y-5 overflow-y-auto bg-linear-to-b from-orange-50/50 to-white p-4 sm:p-5">
              <div className="rounded-2xl border border-red-100 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700"><span className="text-lg">🌶️</span> Heat meter</p>
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-600">{customSpice} heat</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SPICE_LEVELS.map((level) => (
                    (() => {
                      const heat = SPICE_LEVELS.indexOf(level)
                      const active = customSpice === level
                      const colors = [
                        'border-emerald-200 bg-emerald-50 text-emerald-700',
                        'border-yellow-200 bg-yellow-50 text-yellow-700',
                        'border-orange-200 bg-orange-50 text-orange-700',
                        'border-red-300 bg-red-50 text-red-700',
                      ]
                      return (
                    <button
                      key={level}
                      title={SPICE_DESCRIPTIONS[level] ?? level}
                      onClick={() => setCustomSpice(level)}
                      className={`relative flex min-h-17 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-xs font-black transition ${active ? 'scale-[1.03] border-red-600 bg-red-600 text-white shadow-lg shadow-red-200' : `${colors[heat]} hover:-translate-y-0.5 hover:shadow-sm`}`}
                    >
                      <span className={`flex gap-0.5 text-base ${active ? 'grayscale-0' : 'grayscale-[0.15]'}`}>
                        {Array.from({ length: heat + 1 }, (_, index) => <span key={index}>🌶️</span>)}
                      </span>
                      <span>{active && <Check size={11} className="mr-0.5 inline" />}{level}</span>
                    </button>
                      )
                    })()
                  ))}
                </div>
                {customSpice && <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">{SPICE_DESCRIPTIONS[customSpice]}</p>}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700"><Flame size={14} className="text-orange-500" /> Kitchen notes</p>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOMER_NOTE_OPTIONS.map((opt) => {
                    const active = customKitchen.includes(opt)
                    return (
                      <button
                        key={opt}
                        onClick={() => setCustomKitchen((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]))}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${active ? 'border-emerald-600 bg-emerald-600 text-white shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'}`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Anything else the guest said…</p>
                <input value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} placeholder="e.g. less salt, no onion…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-3 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Qty</span>
                <span className="flex items-center gap-2">
                  <button onClick={() => setCustomQty((q) => Math.max(1, q - 1))} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm hover:bg-slate-100"><Minus size={13} /></button>
                  <span className="w-6 text-center text-sm font-black">{customQty}</span>
                  <button onClick={() => setCustomQty((q) => q + 1)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm hover:bg-orange-600"><Plus size={13} /></button>
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCustomizingItem(null)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handleCustomAdd} className="flex flex-2 items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-orange-500 to-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:from-orange-600 hover:to-red-700"><Plus size={15} /> Add {customQty > 1 ? `${customQty} ` : ''}to Order</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewJobId && <PrintPreview jobId={previewJobId} onCancel={()=>setPreviewJobId(null)} />}
      {tokenPreviewOpen && (<TokenDraftPreview onClose={()=>setTokenPreviewOpen(false)} lines={tokenPreviewLinesLive} tokenNo={tokenPreviewNumber} empty={cart.length===0} />)}
    </div>
  )
}

function TokenDraftPreview({ onClose, lines, tokenNo, empty }: { onClose: () => void; lines: string[]; tokenNo: string; empty: boolean }) {
  // The PAPER output must carry the token banner itself: the big on-screen
  // banner above is `print:hidden`, and the draft lines' own star line is
  // filtered out here to avoid printing it twice — WITHOUT prepending the
  // banner, the printed receipt started at DATE / TIME / TABLE and the token
  // number was lost from the physical output.
  const body = [`★ TOKEN ${tokenNo} ★`, '', ...lines.filter((l) => l.indexOf('TOKEN') === -1)].join('\n').replace(/^\n+/, '');
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 py-6 sm:items-center bh-modal-overlay">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Printer size={18} className="text-orange-500" />Token Preview</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="print:hidden mb-3 rounded-xl border-2 border-orange-200 bg-linear-to-br from-orange-50 to-amber-50 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-orange-500">Token</p>
          <p className="mt-0.5 text-4xl font-black tracking-wider text-slate-900">TOKEN {tokenNo}</p>
        </div>
        <div id="receipt-print-area">
          <pre className="receipt-screen max-h-80 overflow-auto rounded-xl border border-slate-200 bg-[#fffdf9] p-3 text-[10px] leading-tight text-slate-700">{lines.join("\n")}</pre>
          <pre className="receipt-paper whitespace-pre-wrap font-mono text-[13px] leading-normal text-black">{body}</pre>
        </div>
        {empty && <p className="mt-2 text-xs text-slate-400">Add dishes to fill this token.</p>}
        <div className="mt-3 flex gap-2">
          <div className="flex-1 rounded-xl bg-orange-50 px-4 py-2 text-center text-xs font-bold text-orange-700">Token prints automatically when the order is placed</div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">Close</button>
        </div>
      </div>
    </div>
  );
}