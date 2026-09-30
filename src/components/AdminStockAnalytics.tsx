import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import { ClipboardList, Package, ShoppingCart, AlertTriangle } from 'lucide-react'
import {
  toBusinessDayStr,
  todayBusinessDayStr,
  businessDayStart,
  businessMonthStart,
  businessYearStart,
} from '../lib/businessDay'

type RangeKey = 'today' | 'week' | 'month' | 'year' | 'all'
const RANGES: { id: RangeKey; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 Days' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]
const r1 = (n: number) => Math.round(n * 100) / 100
const toDateStr = (d: Date) => toBusinessDayStr(d.getTime())
// IST day/month bucket keys (identical bucketing on every device).
const dayKey = (d: Date) => {
  const key = toBusinessDayStr(d.getTime())
  return `${key.slice(0, 4)}-${Number(key.slice(5, 7)) - 1}-${Number(key.slice(8, 10))}`
}
const monKey = (d: Date) => {
  const key = toBusinessDayStr(d.getTime())
  return `${key.slice(0, 4)}-${Number(key.slice(5, 7)) - 1}`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const timestampNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  if (value && typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return value.seconds * 1000
  }
  return 0
}

function bucketFor(ts: number, key: RangeKey): string {
  const d = new Date(ts)
  if (key === 'today') return `${dayKey(d)}-${d.getHours()}`
  if (key === 'week' || key === 'month') return dayKey(d)
  return monKey(d)
}

function rangeStart(key: RangeKey): number | null {
  const today = todayBusinessDayStr()
  if (key === 'today') return businessDayStart(today)
  if (key === 'week') {
    // Rolling 7-day window ending at the start of today (IST).
    const [y, m, d] = today.split('-').map(Number)
    const from = new Date(Date.UTC(y, m - 1, d))
    from.setUTCDate(from.getUTCDate() - 6)
    return businessDayStart(`${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-${String(from.getUTCDate()).padStart(2, '0')}`)
  }
  if (key === 'month') return businessMonthStart(today)
  if (key === 'year') return businessYearStart(today)
  return null
}

const statusChip = (s: string) =>
  ({
    GOOD: 'bg-emerald-100 text-emerald-700',
    LOW: 'bg-amber-100 text-amber-700',
    CRITICAL: 'bg-red-100 text-red-700',
    OUT_OF_STOCK: 'bg-slate-200 text-slate-600',
  }[s] ?? 'bg-slate-100 text-slate-600')
const statusColor = (s: string) =>
  ({ GOOD: '#22c55e', LOW: '#f59e0b', CRITICAL: '#ef4444', OUT_OF_STOCK: '#94a3b8' }[s] ?? '#cbd5e1')

export default function AdminStockAnalytics() {
  const { inventory, inventoryUsage, stockHistory, purchaseRequests, paymentRecords } = useRestaurant()
  const [range, setRange] = useState<RangeKey>('month')
  // Optional exact-day filter: overrides the range buttons when set.
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const from = rangeStart(range)
  const inRange = (t: unknown) => {
    const timestamp = timestampNumber(t)
    return timestamp > 0 && (selectedDate ? toDateStr(new Date(timestamp)) === selectedDate : from == null || timestamp >= from)
  }

  const usage = inventoryUsage.filter((u) => inRange(u.timestamp)).sort((a, b) => timestampNumber(b.timestamp) - timestampNumber(a.timestamp))
  const replUpdates = stockHistory.filter((h) => inRange(h.timestamp) && Number(h.difference) >= 0)
  const conUpdates = stockHistory.filter((h) => inRange(h.timestamp) && Number(h.difference) < 0)
  const purchases = purchaseRequests
    .filter((p) => (p.status === 'PURCHASED' || p.status === 'RECEIVED') && inRange(p.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt)
  const stockUpdates = stockHistory.filter((h) => inRange(h.timestamp)).sort((a, b) => b.timestamp - a.timestamp)

  // Recorded purchase payments (from Requests → Record Purchase / direct purchases).
  const purchasePayments = paymentRecords
    .filter((p) => p.kind === 'purchase' && inRange(p.recordedAt))
    .sort((a, b) => b.recordedAt - a.recordedAt)
  const purchaseSpend = purchasePayments.reduce((s, p) => s + p.amount, 0)

  // Unified consumption feed: recipe-based usage (inventoryUsage) AND manual
  // stock decreases (daily counts / consumption entries) both count as consumed.
  const consumption = [
    ...usage.map((u) => ({ name: u.itemName || u.menuItemName, qty: Number(u.quantity) || 0, unit: u.unit, ts: timestampNumber(u.timestamp) })),
    ...conUpdates.map((h) => ({ name: h.itemName, qty: Math.abs(Number(h.difference) || 0), unit: h.unit, ts: timestampNumber(h.timestamp) })),
  ].sort((a, b) => b.ts - a.ts)

  const sumConsumed = r1(consumption.reduce((s, u) => s + u.qty, 0))
  const sumReplenish = r1(replUpdates.reduce((s, h) => s + (Number(h.difference) || 0), 0))
  const sumPurchased = r1(purchases.reduce((s, p) => s + p.requestedQuantity, 0))
  const low = inventory.filter((i) => i.status === 'LOW').length
  const critical = inventory.filter((i) => i.status === 'CRITICAL').length
  const out = inventory.filter((i) => i.status === 'OUT_OF_STOCK').length

  const now = new Date()
  const bucketRange: RangeKey = selectedDate ? 'today' : range
  const bucketNow = selectedDate ? new Date(`${selectedDate}T12:00:00`) : now
  const rawBuckets: { key: string; label: string }[] = []
  if (bucketRange === 'today') {
    for (let h = 0; h < 24; h++) rawBuckets.push({ key: `${dayKey(bucketNow)}-${h}`, label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p` })
  } else if (bucketRange === 'week' || bucketRange === 'month') {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const start = bucketRange === 'week' ? now.getDate() - 6 : 1
    const end = bucketRange === 'week' ? now.getDate() : last
    for (let dd = start; dd <= end; dd++) {
      const d = new Date(now.getFullYear(), now.getMonth(), dd)
      rawBuckets.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}` })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      rawBuckets.push({ key: monKey(d), label: `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` })
    }
  }
  const buckets = rawBuckets.map((b) => ({
    label: b.label,
    usage: r1(consumption.filter((u) => bucketFor(u.ts, bucketRange) === b.key).reduce((s, u) => s + u.qty, 0)),
    replenish: r1(replUpdates.filter((h) => bucketFor(timestampNumber(h.timestamp), bucketRange) === b.key).reduce((s, h) => s + (Number(h.difference) || 0), 0)),
  }))
  const topMap = new Map<string, { qty: number; unit: string }>()
  for (const u of consumption) {
    const e = topMap.get(u.name) || { qty: 0, unit: u.unit }
    e.qty += u.qty
    e.unit = u.unit
    topMap.set(u.name, e)
  }
  const top = [...topMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stock &amp; Usage Analytics</h2>
          <p className="text-sm text-slate-500">Purchases, daily stock updates and consumption across time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-slate-100 p-1">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => { setRange(r.id); setSelectedDate(null) }} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${range === r.id && !selectedDate ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={selectedDate ?? ''}
            onChange={(e) => setSelectedDate(e.target.value || null)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">
              Clear date
            </button>
          )}
        </div>
      </div>
      <p className="-mt-3 text-xs text-slate-400">
        {selectedDate ? `Showing data for ${selectedDate} only (hourly view)` : `Showing: ${RANGES.find((r) => r.id === range)?.label ?? 'period'} — pick a date above to focus a single day`}
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <BigCard label="Consumed" value={`${sumConsumed}`} sub="units this period" icon={<ClipboardList size={18} />} tone="bg-orange-50 text-orange-600" />
        <BigCard label="Replenished" value={`${sumReplenish}`} sub="units added" icon={<Package size={18} />} tone="bg-emerald-50 text-emerald-600" />
        <BigCard label="Purchased" value={`${sumPurchased}`} sub={`${purchases.length} orders`} icon={<ShoppingCart size={18} />} tone="bg-sky-50 text-sky-600" />
        <BigCard label="Purchase Spend" value={`₹${purchaseSpend.toLocaleString()}`} sub={`${purchasePayments.length} recorded purchase(s)`} icon={<ShoppingCart size={18} />} tone="bg-amber-50 text-amber-600" />
        <BigCard label="Stock Alerts" value={`${low + critical + out}`} sub={`${low} low · ${critical} crit · ${out} out`} icon={<AlertTriangle size={18} />} tone="bg-red-50 text-red-600" />
      </div>
{/* movement chart + top consumed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[20px] border border-orange-100 bg-white p-4 lg:col-span-2">
          <h3 className="mb-2 text-sm font-bold text-slate-900">Consumption vs Replenishment</h3>
          <MovementChart data={buckets} />
          <div className="mt-2 flex items-center gap-4 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Consumed</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Replenished</span>
          </div>
        </div>
        <div className="rounded-[20px] border border-orange-100 bg-white p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-900">Top consumed</h3>
          {top.length === 0 ? (
            <p className="text-sm text-slate-400">No usage in this period.</p>
          ) : (
            <div className="space-y-2">
              {top.map((t) => (
                <div key={t.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{t.name}</span>
                  <span className="font-bold text-orange-600">{r1(t.qty)} {t.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* current stock health */}
      <div className="rounded-[20px] border border-orange-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Current stock health</h3>
        {inventory.length === 0 ? (
          <p className="text-sm text-slate-400">No inventory configured.</p>
        ) : (
          <div className="space-y-2">
            {inventory.map((i) => (
              <div key={i.id} className="flex items-center gap-3">
                <span className="w-44 truncate text-sm text-slate-700">{i.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusChip(i.status)}`}>{i.status}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (i.quantity / Math.max(1, i.minimumThreshold * 2)) * 100)}%`, background: statusColor(i.status) }} />
                </div>
                <span className="w-28 text-right text-xs text-slate-500">{r1(i.quantity)} / {r1(i.minimumThreshold)} {i.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* purchases table */}
      <div className="rounded-[20px] border border-orange-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Purchases ({purchases.length})</h3>
        {purchases.length === 0 ? (
          <p className="text-sm text-slate-400">No purchases in this period.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {purchases.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{p.itemName}</span>
                <span>Qty {p.requestedQuantity} {p.unit}</span>
                {p.purchaseTotalCost != null && <span className="font-bold text-amber-600">₹{p.purchaseTotalCost.toLocaleString()}</span>}
                {p.purchaseVendor && <span>{p.purchaseVendor}</span>}
                <span className="rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-700">{p.status}</span>
                <span>{new Date(p.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* recorded purchase payments with full cost details */}
      <div className="rounded-[20px] border border-orange-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Purchase spend ({purchasePayments.length}) · ₹{purchaseSpend.toLocaleString()}</h3>
        {purchasePayments.length === 0 ? (
          <p className="text-sm text-slate-400">No recorded purchase payments in this period.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {purchasePayments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{p.itemName}</span>
                <span>{p.quantity} {p.unit} × ₹{p.unitCost}</span>
                <span className="font-bold text-amber-600">₹{p.amount.toLocaleString()}</span>
                {p.vendor && <span>{p.vendor}</span>}
                <span className="capitalize">{p.paymentMode.replace(/_/g, ' ').toLowerCase()}</span>
                <span>{new Date(p.recordedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* daily stock updates */}
      <div className="rounded-[20px] border border-orange-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Daily stock updates ({stockUpdates.length})</h3>
        {stockUpdates.length === 0 ? (
          <p className="text-sm text-slate-400">No stock updates in this period.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {stockUpdates.slice(0, 60).map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{h.itemName}</span>
                <span>{r1(h.previousQty)} to {r1(h.newQty)} {h.unit}</span>
                <span className="font-bold text-slate-700">{h.difference >= 0 ? '+' : ''}{r1(h.difference)} {h.unit}</span>
                <span className="capitalize">{h.updatedByName || h.updatedBy}</span>
                <span>{new Date(h.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* usage log */}
      <div className="rounded-[20px] border border-orange-100 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Usage log ({consumption.length})</h3>
        {consumption.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing consumed in this period.</p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {consumption.slice(0, 80).map((u, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{u.name}</span>
                <span className="font-bold text-red-600">-{r1(u.qty)} {u.unit}</span>
                <span>{new Date(u.ts).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
function BigCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-[20px] border border-orange-100/70 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      </div>
      <p className="mt-2 text-[26px] font-black leading-none text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{sub}</p>
    </div>
  )
}

function MovementChart({ data }: { data: { label: string; usage: number; replenish: number }[] }) {
  const W = 640
  const H = 180
  const pad = 22
  const max = Math.max(1, ...data.map((d) => Math.max(d.usage, d.replenish)))
  const step = data.length > 0 ? (W - pad * 2) / data.length : 1
  const bw = 7
  const gap = 2
  const toY = (v: number) => pad + (H - pad * 2) * (1 - v / max)
  const labelEvery = Math.max(1, Math.ceil(data.length / 10))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
      {data.map((d, i) => {
        const cx = pad + i * step + step / 2
        const uY = toY(d.usage)
        const rY = toY(d.replenish)
        return (
          <g key={i}>
            <rect x={cx - bw - gap} y={uY} width={bw} height={Math.max(0, H - pad - uY)} rx={2} fill="#f97316" />
            <rect x={cx} y={rY} width={bw} height={Math.max(0, H - pad - rY)} rx={2} fill="#22c55e" />
            {i % labelEvery === 0 && (
              <text x={cx} y={H - 5} fontSize={9} textAnchor="middle" fill="#94a3b8">
                {d.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}