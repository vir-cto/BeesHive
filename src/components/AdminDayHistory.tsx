import { useState } from 'react'
import { useRestaurant } from '../context/RestaurantContext'
import type { DailySummary } from '../context/RestaurantContext'
import { CalendarDays, Receipt, Ticket, TrendingUp, Users } from 'lucide-react'

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const prettyDate = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  const parsed = new Date(y, (m ?? 1) - 1, d ?? 1)
  return parsed.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const RANGES: { value: 7 | 30 | 90; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
]

/**
 * Day-wise history of everything that was recorded — revenue, orders, tokens,
 * guests and bills for each business day. Totals are derived from the persisted
 * records (orders / sessions / bills / payments), so past days stay reviewable
 * even after the registers were reset or the device was replaced.
 */
export default function AdminDayHistory() {
  const { getDailyHistory } = useRestaurant()
  const [range, setRange] = useState<7 | 30 | 90>(30)
  const [expanded, setExpanded] = useState<string | null>(null)

  const days = getDailyHistory(range)
  const totals = days.reduce(
    (acc, day) => ({
      collected: acc.collected + day.collectedRevenue,
      billed: acc.billed + day.billedRevenue,
      orders: acc.orders + day.orders,
      guests: acc.guests + day.guests,
    }),
    { collected: 0, billed: 0, orders: 0, guests: 0 },
  )
  const best = days.reduce<DailySummary | null>(
    (top, day) => (top === null || day.collectedRevenue > top.collectedRevenue ? day : top),
    null,
  )
  const expandedDay = expanded ? days.find((d) => d.date === expanded) : undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Day History</h2>
          <p className="mt-0.5 text-xs text-slate-500">Every day with recorded activity — newest first.</p>
        </div>
        <div className="bh-scroll-x flex items-center gap-1.5 rounded-xl border border-orange-100 bg-white p-1.5">
          {RANGES.map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                range === option.value
                  ? 'bg-linear-to-br from-orange-500 to-amber-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryTile icon={<TrendingUp size={15} />} label="Collected" value={money(totals.collected)} tone="text-emerald-600" />
        <SummaryTile icon={<Receipt size={15} />} label="Billed" value={money(totals.billed)} tone="text-orange-600" />
        <SummaryTile icon={<Ticket size={15} />} label="Orders" value={String(totals.orders)} tone="text-slate-800" />
        <SummaryTile icon={<Users size={15} />} label="Guests" value={String(totals.guests)} tone="text-blue-600" />
        <SummaryTile
          icon={<CalendarDays size={15} />}
          label="Best day"
          value={best ? money(best.collectedRevenue) : '—'}
          hint={best ? best.date : undefined}
          tone="text-violet-600"
        />
      </div>

      {days.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-500">No recorded activity in this period yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Orders, bills and payments appear here as soon as the floor starts working.
          </p>
        </div>
      ) : (
        <>
          <MobileDayCards days={days} />
          <DesktopDayTable days={days} expanded={expanded} onToggle={setExpanded} />
          {expandedDay && (
            <div className="hidden rounded-[20px] border border-orange-100 bg-white p-4 md:block">
              <p className="text-sm font-bold text-slate-800">Payment split · {prettyDate(expandedDay.date)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(expandedDay.byMode).length === 0 ? (
                  <p className="text-sm text-slate-500">No payments recorded.</p>
                ) : (
                  Object.entries(expandedDay.byMode).map(([mode, amount]) => (
                    <span
                      key={mode}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {mode.replace(/_/g, ' ')} · {money(Number(amount))}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone: string
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 truncate text-base font-extrabold text-slate-900 sm:text-lg">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}

function MobileDayCards({ days }: { days: DailySummary[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {days.map((day) => (
        <div key={day.date} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">{prettyDate(day.date)}</p>
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
              {money(day.collectedRevenue)}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Orders</p>
              <p className="text-sm font-bold text-slate-800">{day.orders}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Guests</p>
              <p className="text-sm font-bold text-slate-800">{day.guests}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Billed</p>
              <p className="text-sm font-bold text-slate-800">{money(day.billedRevenue)}</p>
            </div>
          </div>
          {Object.entries(day.byMode).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(day.byMode).map(([mode, amount]) => (
                <span key={mode} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {mode.replace(/_/g, ' ')} · {money(Number(amount))}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function DesktopDayTable({
  days,
  expanded,
  onToggle,
}: {
  days: DailySummary[]
  expanded: string | null
  onToggle: (date: string | null) => void
}) {
  return (
    <div className="hidden overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm md:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">Collected</th>
            <th className="px-4 py-3 text-right">Billed</th>
            <th className="px-4 py-3 text-right">Orders</th>
            <th className="px-4 py-3 text-right">Guests</th>
            <th className="px-4 py-3 text-right">Payments</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr
              key={day.date}
              onClick={() => onToggle(expanded === day.date ? null : day.date)}
              className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-orange-50/50 ${
                expanded === day.date ? 'bg-orange-50' : ''
              }`}
            >
              <td className="px-4 py-3 font-semibold text-slate-800">{prettyDate(day.date)}</td>
              <td className="px-4 py-3 text-right font-bold text-emerald-600">{money(day.collectedRevenue)}</td>
              <td className="px-4 py-3 text-right text-orange-600">{money(day.billedRevenue)}</td>
              <td className="px-4 py-3 text-right text-slate-700">{day.orders}</td>
              <td className="px-4 py-3 text-right text-slate-700">{day.guests}</td>
              <td className="px-4 py-3 text-right text-xs text-slate-500">
                {Object.entries(day.byMode).length === 0
                  ? '—'
                  : Object.entries(day.byMode)
                      .map(([mode, amount]) => `${mode.replace(/_/g, ' ')} ${money(Number(amount))}`)
                      .join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}