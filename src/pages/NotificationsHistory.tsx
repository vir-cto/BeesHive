import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRestaurant } from '../context/RestaurantContext'
import type { Notification } from '../context/RestaurantContext'
import { BellRing, CheckCheck, ArrowLeft, Calendar, Filter, Undo2, Search, X, UtensilsCrossed, Receipt, Package, Users, LayoutGrid, BookOpen } from 'lucide-react'

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const todayStr = () => toDateStr(new Date())

type StatusFilter = 'all' | 'unread' | 'read'

function formatDate(ts: number): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

// Day-grouping label used to build the timeline in the list.
function dayGroupLabel(ts: number): string {
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)
  const start = new Date(ts)
  start.setHours(0, 0, 0, 0)
  const diffDays = Math.round((startToday.getTime() - start.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

// Type-aware visual meta derived from the title so related alerts look grouped
// and instantly recognisable, even without opening the message.
function notifMeta(title: string): { Icon: typeof BellRing; chip: string; dot: string } {
  const t = title.toLowerCase()
  if (/order|token|kot/.test(t)) return { Icon: UtensilsCrossed, chip: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' }
  if (/bill|payment|paid|settle|clearing/.test(t)) return { Icon: Receipt, chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' }
  if (/session|table|service|seat/.test(t)) return { Icon: LayoutGrid, chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' }
  if (/menu|price|special|dish|item/.test(t)) return { Icon: BookOpen, chip: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' }
  if (/stock|inventory|ingredient/.test(t)) return { Icon: Package, chip: 'bg-lime-100 text-lime-700', dot: 'bg-lime-500' }
  if (/staff|user|account|role/.test(t)) return { Icon: Users, chip: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' }
  return { Icon: BellRing, chip: 'bg-orange-100 text-orange-600', dot: 'bg-orange-500' }
}

export default function NotificationsHistory() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notifications, markNotificationRead, markAllNotificationsRead } = useRestaurant()

  const [selectedDate, setSelectedDate] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  if (!user) return null

  const myNotifications = notifications
    .filter((n) => n.role === user.role)
    .sort((a, b) => b.createdAt - a.createdAt)

  const unreadCount = myNotifications.filter((n) => !n.read).length

  // Apply date filter: when a date is chosen, keep only notifications from that day.
  const dateFiltered = selectedDate
    ? myNotifications.filter((n) => toDateStr(new Date(n.createdAt)) === selectedDate)
    : myNotifications

  const query = search.trim().toLowerCase()
  const filtered = dateFiltered.filter(
    (n) =>
      (statusFilter === 'all' ? true : statusFilter === 'unread' ? !n.read : n.read) &&
      (!query || n.title.toLowerCase().includes(query) || (n.message || '').toLowerCase().includes(query))
  )

  // Group the newest-first list into date buckets for a clean timeline feel.
  const groups = filtered.reduce<{ label: string; items: Notification[] }[]>((acc, n) => {
    const label = dayGroupLabel(n.createdAt)
    const last = acc[acc.length - 1]
    if (last && last.label === label) last.items.push(n)
    else acc.push({ label, items: [n] })
    return acc
  }, [])

  const backPath =
    user.role === 'admin' ? '/admin' : user.role === 'supervisor' ? '/supervisor' : '/waiter'

  const handleDateChange = (value: string) => setSelectedDate(value)

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(backPath)}
            className="rounded-xl border border-orange-100 bg-white p-2.5 text-slate-600 transition hover:bg-orange-50"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Notification History</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsRead(user.role)}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
            >
              <CheckCheck size={15} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-[20px] border border-orange-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          {/* Search */}
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Search size={14} className="text-orange-500" />
              Search
            </label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or message…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-8 text-sm outline-none focus:border-orange-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Date filter */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Calendar size={14} className="text-orange-500" />
              Date
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => handleDateChange(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  <Undo2 size={13} />
                  All dates
                </button>
              )}
            </div>
            {selectedDate && (
              <p className="text-xs text-slate-400">
                Showing notifications for{' '}
                <span className="font-semibold text-slate-600">
                  {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>{' '}
                ({dateFiltered.length} found)
              </p>
            )}
          </div>

          {/* Status filter */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Filter size={14} className="text-orange-500" />
              Status
            </label>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(
                [
                  ['all', 'All'],
                  ['unread', 'Unread'],
                  ['read', 'Read'],
                ] as [StatusFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === value ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-300 bg-white p-12 text-center">
          <BellRing className="mx-auto mb-3 text-orange-200" size={40} />
          <p className="text-sm font-semibold text-slate-600">No notifications found</p>
          <p className="mt-1 text-xs text-slate-400">
            {query
              ? 'No results match that search.'
              : selectedDate
                ? 'Try a different date or clear the date filter.'
                : statusFilter !== 'all'
                  ? 'Try a different status filter.'
                  : 'Your notifications will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-700">{group.label}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{group.items.length}</span>
              </div>
              <div className="space-y-2.5">
                {group.items.map((notification) => {
                  const { Icon, chip, dot } = notifMeta(notification.title)
                  return (
                    <button
                      key={notification.id}
                      onClick={() => {
                        if (!notification.read) markNotificationRead(notification.id)
                      }}
                      className={`flex w-full items-start gap-3 rounded-[18px] border p-4 text-left transition ${
                        notification.read
                          ? 'border-slate-200 bg-white'
                          : 'border-orange-200 bg-amber-50/60 hover:bg-amber-50'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          notification.read ? 'bg-slate-100 text-slate-400' : chip
                        }`}
                      >
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <p
                            className={`text-sm ${notification.read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}
                          >
                            {notification.title}
                          </p>
                          <span
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              notification.read ? 'bg-slate-100 text-slate-500' : 'bg-orange-500 text-white'
                            }`}
                          >
                            {!notification.read && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
                            {notification.read ? 'Read' : 'Unread'}
                          </span>
                        </div>
                        {notification.message && (
                          <p className="mt-0.5 wrap-break-word text-xs text-slate-500">{notification.message}</p>
                        )}
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                          <Calendar size={12} className="shrink-0" />
                          {formatDate(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.read && <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Click an unread notification to mark it as read
      </p>
    </div>
  )
}
