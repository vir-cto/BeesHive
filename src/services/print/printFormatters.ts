// /**
//  * Bee's Hive — 58mm thermal receipt formatters.
//  * Pure functions with no I/O. Formatters keep output compact and readable and
//  * never embed large raster images (dish photos are text-only on tokens).
//  */
// import { receiptTokenLabel } from '../../lib/tokenLabel'
// import { servingSuffix } from '../../lib/servingType'

// export interface TokenPrintPayload {
//   tokenNumber: number
//   date: string
//   time: string
//   table: string
//   guests: number
//   waiter: string
//   items: { name: string; quantity: number; servingType?: 'full' | 'half' }[]
//   specialRequests: string[]
//   prepTimeMinutes: number
//   priority: string
//   isVip: boolean
//   orderId: string
//   // Kitchen token kind — parcels print as PARCEL instead of TOKEN.
//   kind?: 'dine_in' | 'parcel'
//   // Restaurant identity from Admin settings — printed on the receipt header.
//   restaurantName?: string
//   address?: string
//   gstin?: string
//   fssaiLicenseNumber?: string
// }

// export interface BillPrintPayload {
//   billNumber: string
//   date: string
//   time: string
//   table: string
//   waiter: string
//   lines: { name: string; quantity: number; amount: number }[]
//   subtotal: number
//   cgstRate: number
//   cgst: number
//   sgstRate: number
//   sgst: number
//   discount: number
//   serviceCharge: number
//   parcelCharge?: number
//   grandTotal: number
//   paymentStatus: string
//   paymentMode?: string
//   /** Guest count from the historical session — printed only when provided. */
//   guests?: number
//   // Restaurant identity from Admin settings — printed on the receipt header.
//   restaurantName?: string
//   address?: string
//   gstin?: string
//   fssaiLicenseNumber?: string
// }

// export interface SessionReceiptPayload {
//   sessionId: string
//   date: string
//   time: string
//   table: string
//   guests: number
//   waiter: string
//   items: { name: string; servingType?: 'full' | 'half'; quantity: number; price: number }[]
//   subtotal: number
//   /** Per-half GST rate (taxRate / 2), matching the Bill receipt payload. */
//   cgstRate?: number
//   cgst: number
//   sgst: number
//   total: number
//   // Restaurant identity from Admin settings — printed on the receipt header.
//   restaurantName?: string
//   address?: string
//   gstin?: string
//   fssaiLicenseNumber?: string
// }

// /**
//  * Format a session receipt for 58mm thermal paper.
//  *
//  * This is a SESSION SUMMARY — NOT a paid bill. It shows:
//  *   - Restaurant header (from settings)
//  *   - "SESSION RECEIPT" title
//  *   - Table, guests, waiter, date, time
//  *   - All items with their serving type (full/half) and prices
//  *   - Subtotal, GST, and total
//  *
//  * It does NOT show payment status, payment mode, or any "PAID" marking.
//  */
// export const formatSessionReceipt58mm = (p: SessionReceiptPayload): string[] => {
//   const rows: string[] = [
//     ...header58(p),
//     center('SESSION RECEIPT'),
//     '',
//     'TABLE   : ' + p.table,
//     'GUESTS  : ' + p.guests,
//     'WAITER  : ' + p.waiter,
//     'DATE    : ' + p.date,
//     'TIME    : ' + p.time,
//     RULE,
//     '',
//     center('ITEMS'),
//   ]

//   // Format each item with serving type. A name wider than the item column is
//   // printed in full (word-wrapped) instead of being truncated, so the serving
//   // marker (`(HALF)` / `(FULL)`) can never be cut off the session summary.
//   // Short names keep the exact line layout they have always had.
//   const ITEM_COL = 24
//   for (const item of p.items) {
//     // Same `(HALF)` / `(FULL)` marker as every other Bee's Hive surface, so a
//     // half plate is never mistaken for a full one on the session summary.
//     const itemName = `${item.name}${servingSuffix(item.servingType)}`.toUpperCase()
//     const itemTotal = item.price * item.quantity
//     const columns = `${padRight('x ' + item.quantity, 6)}${padRight(money(itemTotal).trimStart(), 8)}`
//     rows.push(...wrap32(itemName.length > ITEM_COL ? `${itemName} ${columns}` : padRight(itemName, ITEM_COL) + columns))
//   }

//   rows.push('', RULE)
//   rows.push(`${padRight('SUBTOTAL', 22)}${padRight(money(p.subtotal).trimStart(), 8)}`)
//   rows.push(`${padRight(`GST (${(p.cgstRate ?? 0)}%)`, 22)}${padRight(money(p.cgst + p.sgst).trimStart(), 8)}`)
//   rows.push(RULE)
//   rows.push(`${padRight('TOTAL', 22)}${padRight(money(p.total).trimStart(), 8)}`)
//   rows.push(WIDE)
//   rows.push('')
//   // Keep every line inside the 32-col paper width — this footer used to be a
//   // single 41-char line and physically wrapped mid-word on 58mm paper.
//   rows.push(...wrap32('THIS IS A SESSION SUMMARY — NOT A PAID BILL').map((l) => center(l)))
//   rows.push(center(p.restaurantName || 'THANK YOU FOR VISITING!'))

//   return rows
// }

// const RULE = '--------------------------------'
// const WIDE = '================================'

// const padRight = (text: string, width: number): string => {
//   const t = String(text ?? '')
//   return t.length >= width ? t.substring(0, width) : t + ' '.repeat(width - t.length)
// }

// const center = (text: string, width = 32): string =>
//   padRight('', Math.max(0, Math.floor((width - text.length) / 2))) + text

// const money = (n: number): string => `₹${Number(n).toFixed(2)}`

// /**
//  * Right-pad name; left-align quantity/amount columns.
//  *
//  * A name that no longer fits the item column (very long dish names, or a name
//  * carrying its ` (HALF)` / ` (FULL)` serving marker) is printed in FULL on its
//  * own line(s) instead of being silently truncated — the truncation is what used
//  * to swallow the serving type from the customer bill. Short names keep the
//  * exact single-line output they have always had.
//  */
// const itemLine = (name: string, quantity: number, amount: number | null, width = 30): string[] => {
//   const qty = amount === null ? (quantity > 0 ? `x ${quantity}` : '') : String(quantity)
//   const qtyW = 8
//   const amtW = 8
//   const avail = Math.max(width - qtyW - amtW, 4)
//   const amt = amount === null ? '' : money(amount)
//   // Fits the item column: byte-for-byte the historical single line.
//   if (name.length <= avail) return [padRight(name, avail) + `${padRight(qty, qtyW)}${padRight(amt, amtW)}`]
//   // Too wide for the item column (a long dish name, or the ` (HALF)` / ` (FULL)`
//   // marker pushed it over): print the name in FULL and let qty/amount follow on
//   // the same wrapped line. Truncating here is what silently swallowed the
//   // serving type from the customer bill.
//   return wrap32(`${name} ${qty} ${amt}`.trimEnd(), 32)
// }

// /** Truncate + centre a line for 58mm receipts. */
// const centerT = (text: string, width = 32): string =>
//   center(text.length > width ? text.slice(0, width) : text, width)

// /** Word-wrap a line to the 32-col paper width (5cm thermal paper). */
// const wrap32 = (text: string, width = 32): string[] => {
//   const words = String(text ?? '').split(/\s+/).filter(Boolean)
//   if (words.length === 0) return ['']
//   const lines: string[] = []
//   let cur = ''
//   for (const w of words) {
//     // Hard-split an over-long single word (e.g. a long note with no spaces).
//     let word = w
//     while (word.length > width) {
//       if (cur) { lines.push(cur); cur = '' }
//       lines.push(word.slice(0, width))
//       word = word.slice(width)
//     }
//     const next = cur ? cur + ' ' + word : word
//     if (next.length > width) { lines.push(cur); cur = word }
//     else cur = next
//   }
//   if (cur) lines.push(cur)
//   return lines
// }

// /** Receipt header fed by Admin settings (restaurant name / address / GSTIN). */
// export const header58 = (p: { restaurantName?: string; address?: string; gstin?: string; fssaiLicenseNumber?: string } = {}): string[] => {
//   const lines: string[] = [WIDE]
//   lines.push(centerT((p.restaurantName || "BEE'S HIVE").toUpperCase()))
//   const addr = (p.address || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
//   if (addr.length > 0) {
//     addr.flatMap((part) => wrap32(part)).forEach((line) => lines.push(centerT(line)))
//   }
//   else lines.push(center('RESTAURANT'))
//   if (p.fssaiLicenseNumber) lines.push('FSSAI : ' + p.fssaiLicenseNumber)
//   if (p.gstin) lines.push('GSTIN : ' + p.gstin)
//   lines.push(WIDE)
//   return lines
// }

// /**
//  * Token receipt — only shows the guest/kitchen essentials:
//  *   • Token number (the most important — printed extra-large in the preview)
//  *   • Date & time
//  *   • Table number
//  *   • Food list
//  *   • Special requests
//  * Everything else (restaurant header, guests, waiter, prep time, priority,
//  * SUPERVISOR COPY footer) is intentionally omitted.
//  */
// export const formatToken58mm = (p: TokenPrintPayload): string[] => [
//   // Dine-in tokens print as `TOKEN 001`, parcels as `PARCEL P-001` — two
//   // independent series, so the numbers can never collide on the pass.
//   center(`★ ${p.kind === 'parcel' ? 'PARCEL' : 'TOKEN'} ${receiptTokenLabel(p.tokenNumber, p.kind)} ★`),
//   '',
//   'DATE : ' + p.date,
//   'TIME : ' + p.time,
//   'TABLE : ' + (p.kind === 'parcel' ? 'PARCEL' : p.table),
//   RULE,
//   '',
//   center('FOOD'),
//   ...p.items.flatMap((i) => wrap32(`${i.name.toUpperCase()}${servingSuffix(i.servingType)}  x ${i.quantity}`)),
//   '',
//   RULE,
//   'SPECIAL REQUEST',
//   ...(p.specialRequests.length > 0
//     ? p.specialRequests.flatMap((s) => wrap32(`!! ${s.toUpperCase()} !!`))
//     : ['NONE']),
// ]

// export const formatBill58mm = (p: BillPrintPayload): string[] => {
//   const rows: string[] = [
//     ...header58(p),
//     'BILL NO : ' + p.billNumber,
//     'DATE    : ' + p.date,
//     'TIME    : ' + p.time,
//     '',
//     'TABLE   : ' + p.table,
//     'WAITER  : ' + p.waiter,
//     // Historical reprints carry the guest count of the original session; every
//     // other caller omits it, so their receipts are byte-for-byte unchanged.
//     ...(typeof p.guests === 'number' ? ['GUESTS  : ' + p.guests] : []),
//     RULE,
//     `${padRight('ITEM', 14)}${padRight('QTY', 8)}${padRight('AMT', 8)}`,
//     ...p.lines.flatMap((l) => itemLine(l.name.toUpperCase(), l.quantity, l.amount, 30)),
//     RULE,
//     `${padRight('SUBTOTAL', 22)}${padRight(money(p.subtotal).trimStart(), 8)}`,
//   ]
//   if (p.discount > 0) rows.push(`${padRight('DISCOUNT', 22)}${padRight('-' + money(p.discount).trimStart(), 8)}`)
//   if (p.serviceCharge > 0) rows.push(`${padRight('SERVICE', 22)}${padRight(money(p.serviceCharge).trimStart(), 8)}`)
//   if ((p.parcelCharge ?? 0) > 0) rows.push(`${padRight('PARCEL CHARGE', 22)}${padRight(money(p.parcelCharge ?? 0).trimStart(), 8)}`)
//   rows.push(
//     `${padRight(`CGST ${p.cgstRate}%`, 22)}${padRight(money(p.cgst).trimStart(), 8)}`,
//     `${padRight(`SGST ${p.sgstRate}%`, 22)}${padRight(money(p.sgst).trimStart(), 8)}`,
//     RULE,
//     `${padRight('TOTAL', 22)}${padRight(money(p.grandTotal).trimStart(), 8)}`,
//     WIDE,
//     '',
//     'PAYMENT : ' + p.paymentStatus + (p.paymentMode ? ` (${p.paymentMode.replace(/_/g, ' ').toUpperCase()})` : ''),
//     RULE,
//     '',
//     center('THANK YOU!'),
//     center('HAPPY TO HAVE YOU VISIT'),
//     center('AGAIN!'),
//     WIDE,
//   )
//   return rows
// }









// ============================================================

/**
 * Bee's Hive — 58mm thermal receipt formatters.
 * Pure functions with no I/O. Formatters keep output compact and readable and
 * never embed large raster images (dish photos are text-only on tokens).
 */
import { receiptTokenLabel } from '../../lib/tokenLabel'
import { servingSuffix } from '../../lib/servingType'

export interface TokenPrintPayload {
  tokenNumber: number
  date: string
  time: string
  table: string
  guests: number
  waiter: string
  items: { name: string; quantity: number; servingType?: 'full' | 'half' }[]
  specialRequests: string[]
  prepTimeMinutes: number
  priority: string
  isVip: boolean
  orderId: string
  // Kitchen token kind — parcels print as PARCEL instead of TOKEN.
  kind?: 'dine_in' | 'parcel'
  // Restaurant identity from Admin settings — printed on the receipt header.
  restaurantName?: string
  address?: string
  gstin?: string
  fssaiLicenseNumber?: string
}

export interface BillPrintPayload {
  billNumber: string
  date: string
  time: string
  table: string
  waiter: string
  lines: { name: string; quantity: number; amount: number }[]
  subtotal: number
  cgstRate: number
  cgst: number
  sgstRate: number
  sgst: number
  discount: number
  serviceCharge: number
  parcelCharge?: number
  grandTotal: number
  paymentStatus: string
  paymentMode?: string
  /** Guest count from the historical session — printed only when provided. */
  guests?: number
  // Restaurant identity from Admin settings — printed on the receipt header.
  restaurantName?: string
  address?: string
  gstin?: string
  fssaiLicenseNumber?: string
}

export interface SessionReceiptPayload {
  sessionId: string
  date: string
  time: string
  table: string
  guests: number
  waiter: string
  items: { name: string; servingType?: 'full' | 'half'; quantity: number; price: number }[]
  subtotal: number
  /** Per-half GST rate (taxRate / 2), matching the Bill receipt payload. */
  cgstRate?: number
  cgst: number
  sgst: number
  total: number
  // Restaurant identity from Admin settings — printed on the receipt header.
  restaurantName?: string
  address?: string
  gstin?: string
  fssaiLicenseNumber?: string
}

/**
 * Format a session receipt for 58mm thermal paper.
 *
 * This is a SESSION SUMMARY — NOT a paid bill. It shows:
 *   - Restaurant header (from settings)
 *   - "SESSION RECEIPT" title
 *   - Table, guests, waiter, date, time
 *   - All items with their serving type (full/half) and prices
 *   - Subtotal, GST, and total
 *
 * It does NOT show payment status, payment mode, or any "PAID" marking.
 */
export const formatSessionReceipt58mm = (p: SessionReceiptPayload): string[] => {
  const rows: string[] = [
    ...header58(p),
    center('SESSION RECEIPT'),
    '',
    'TABLE   : ' + p.table,
    'GUESTS  : ' + p.guests,
    'WAITER  : ' + p.waiter,
    'DATE    : ' + p.date,
    'TIME    : ' + p.time,
    RULE,
    '',
    center('ITEMS'),
  ]

  // Format each item with serving type. A name wider than the item column is
  // printed in full (word-wrapped) instead of being truncated, so the serving
  // marker (`(HALF)` / `(FULL)`) can never be cut off the session summary.
  // Short names keep the exact line layout they have always had.
  const ITEM_COL = 24
  for (const item of p.items) {
    // Same `(HALF)` / `(FULL)` marker as every other Bee's Hive surface, so a
    // half plate is never mistaken for a full one on the session summary.
    const itemName = `${item.name}${servingSuffix(item.servingType)}`.toUpperCase()
    const itemTotal = item.price * item.quantity
    const columns = `${padRight('x ' + item.quantity, 6)}${padRight(money(itemTotal).trimStart(), 8)}`
    rows.push(...wrap32(itemName.length > ITEM_COL ? `${itemName} ${columns}` : padRight(itemName, ITEM_COL) + columns))
  }

  rows.push('', RULE)
  rows.push(`${padRight('SUBTOTAL', 22)}${padRight(money(p.subtotal).trimStart(), 8)}`)
  rows.push(`${padRight(`GST (${(p.cgstRate ?? 0)}%)`, 22)}${padRight(money(p.cgst + p.sgst).trimStart(), 8)}`)
  rows.push(RULE)
  rows.push(`${padRight('TOTAL', 22)}${padRight(money(p.total).trimStart(), 8)}`)
  rows.push(WIDE)
  rows.push('')
  // Keep every line inside the 32-col paper width — this footer used to be a
  // single 41-char line and physically wrapped mid-word on 58mm paper.
  rows.push(...wrap32('THIS IS A SESSION SUMMARY — NOT A PAID BILL').map((l) => center(l)))
  rows.push(center(p.restaurantName || 'THANK YOU FOR VISITING!'))

  return rows
}

const RULE = '--------------------------------'
const WIDE = '================================'

const padRight = (text: string, width: number): string => {
  const t = String(text ?? '')
  return t.length >= width ? t.substring(0, width) : t + ' '.repeat(width - t.length)
}

const center = (text: string, width = 32): string =>
  padRight('', Math.max(0, Math.floor((width - text.length) / 2))) + text

const money = (n: number): string => `₹${Number(n).toFixed(2)}`

/**
 * Right-pad name; left-align quantity/amount columns.
 *
 * A name that no longer fits the item column (very long dish names, or a name
 * carrying its ` (HALF)` / ` (FULL)` serving marker) is printed in FULL on its
 * own line(s) instead of being silently truncated — the truncation is what used
 * to swallow the serving type from the customer bill. Short names keep the
 * exact single-line output they have always had.
 */
const itemLine = (name: string, quantity: number, amount: number | null, width = 30): string[] => {
  const qty = amount === null ? (quantity > 0 ? `x ${quantity}` : '') : String(quantity)
  const qtyW = 8
  const amtW = 8
  const avail = Math.max(width - qtyW - amtW, 4)
  const amt = amount === null ? '' : money(amount)
  // Fits the item column: byte-for-byte the historical single line.
  if (name.length <= avail) return [padRight(name, avail) + `${padRight(qty, qtyW)}${padRight(amt, amtW)}`]
  // Too wide for the item column (a long dish name, or the ` (HALF)` / ` (FULL)`
  // marker pushed it over): print the name in FULL and let qty/amount follow on
  // the same wrapped line. Truncating here is what silently swallowed the
  // serving type from the customer bill.
  return wrap32(`${name} ${qty} ${amt}`.trimEnd(), 32)
}

/** Truncate + centre a line for 58mm receipts. */
const centerT = (text: string, width = 32): string =>
  center(text.length > width ? text.slice(0, width) : text, width)

/** Word-wrap a line to the 32-col paper width (5cm thermal paper). */
const wrap32 = (text: string, width = 32): string[] => {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    // Hard-split an over-long single word (e.g. a long note with no spaces).
    let word = w
    while (word.length > width) {
      if (cur) { lines.push(cur); cur = '' }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    const next = cur ? cur + ' ' + word : word
    if (next.length > width) { lines.push(cur); cur = word }
    else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/** Receipt header fed by Admin settings (restaurant name / address / GSTIN). */
export const header58 = (p: { restaurantName?: string; address?: string; gstin?: string; fssaiLicenseNumber?: string } = {}): string[] => {
  const lines: string[] = [WIDE]
  lines.push(centerT((p.restaurantName || "BEE'S HIVE").toUpperCase()))
  const addr = (p.address || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
  if (addr.length > 0) {
    addr.flatMap((part) => wrap32(part)).forEach((line) => lines.push(centerT(line)))
  }
  else lines.push(center('RESTAURANT'))
  if (p.fssaiLicenseNumber) lines.push('FSSAI : ' + p.fssaiLicenseNumber)
  if (p.gstin) lines.push('GSTIN : ' + p.gstin)
  lines.push(WIDE)
  return lines
}

/**
 * Token receipt — only shows the guest/kitchen essentials:
 *   • Token number (the most important — printed extra-large in the preview)
 *   • Date & time
 *   • Table number
 *   • Food list
 *   • Special requests
 * Everything else (restaurant header, guests, waiter, prep time, priority,
 * SUPERVISOR COPY footer) is intentionally omitted.
 */
export const formatToken58mm = (p: TokenPrintPayload): string[] => {
  // Normal orders intentionally have no priority line. Fast/VIP are printed
  // explicitly so the kitchen token carries the same priority selected by the waiter.
  const priorityLabel =
    p.isVip || p.priority === 'vip'
      ? 'VIP'
      : p.priority === 'fast'
        ? 'FAST'
        : ''

  return [
    // Dine-in tokens print as `TOKEN 001`, parcels as `PARCEL P-001` — two
    // independent series, so the numbers can never collide on the pass.
    center(`★ ${p.kind === 'parcel' ? 'PARCEL' : 'TOKEN'} ${receiptTokenLabel(p.tokenNumber, p.kind)} ★`),
    '',
    'DATE : ' + p.date,
    'TIME : ' + p.time,
    'TABLE : ' + (p.kind === 'parcel' ? 'PARCEL' : p.table),
    ...(priorityLabel ? ['PRIORITY : ' + priorityLabel] : []),
    RULE,
    '',
    center('FOOD'),
    ...p.items.flatMap((i) => wrap32(`${i.name.toUpperCase()}${servingSuffix(i.servingType)}  x ${i.quantity}`)),
    '',
    RULE,
    'SPECIAL REQUEST',
    ...(p.specialRequests.length > 0
      ? p.specialRequests.flatMap((s) => wrap32(`!! ${s.toUpperCase()} !!`))
      : ['NONE']),
  ]
}

export const formatBill58mm = (p: BillPrintPayload): string[] => {
  const rows: string[] = [
    ...header58(p),
    'BILL NO : ' + p.billNumber,
    'DATE    : ' + p.date,
    'TIME    : ' + p.time,
    '',
    'TABLE   : ' + p.table,
    'WAITER  : ' + p.waiter,
    // Historical reprints carry the guest count of the original session; every
    // other caller omits it, so their receipts are byte-for-byte unchanged.
    ...(typeof p.guests === 'number' ? ['GUESTS  : ' + p.guests] : []),
    RULE,
    `${padRight('ITEM', 14)}${padRight('QTY', 8)}${padRight('AMT', 8)}`,
    ...p.lines.flatMap((l) => itemLine(l.name.toUpperCase(), l.quantity, l.amount, 30)),
    RULE,
    `${padRight('SUBTOTAL', 22)}${padRight(money(p.subtotal).trimStart(), 8)}`,
  ]
  if (p.discount > 0) rows.push(`${padRight('DISCOUNT', 22)}${padRight('-' + money(p.discount).trimStart(), 8)}`)
  if (p.serviceCharge > 0) rows.push(`${padRight('SERVICE', 22)}${padRight(money(p.serviceCharge).trimStart(), 8)}`)
  if ((p.parcelCharge ?? 0) > 0) rows.push(`${padRight('PARCEL CHARGE', 22)}${padRight(money(p.parcelCharge ?? 0).trimStart(), 8)}`)
  rows.push(
    `${padRight(`CGST ${p.cgstRate}%`, 22)}${padRight(money(p.cgst).trimStart(), 8)}`,
    `${padRight(`SGST ${p.sgstRate}%`, 22)}${padRight(money(p.sgst).trimStart(), 8)}`,
    RULE,
    `${padRight('TOTAL', 22)}${padRight(money(p.grandTotal).trimStart(), 8)}`,
    WIDE,
    '',
    'PAYMENT : ' + p.paymentStatus + (p.paymentMode ? ` (${p.paymentMode.replace(/_/g, ' ').toUpperCase()})` : ''),
    RULE,
    '',
    center('THANK YOU!'),
    center('HAPPY TO HAVE YOU VISIT'),
    center('AGAIN!'),
    WIDE,
  )
  return rows
}
