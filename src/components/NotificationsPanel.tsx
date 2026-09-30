import { CheckCheck, BellRing } from 'lucide-react'
import type { NotificationItem } from '../context/RestaurantContext'

interface NotificationsPanelProps {
  notifications: NotificationItem[]
  onMarkRead: (notificationId: string) => void
  onMarkAllRead: () => void
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function NotificationsPanel({ notifications, onMarkRead, onMarkAllRead }: NotificationsPanelProps) {
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="absolute right-0 top-12 w-80 sm:w-96">
      <div className="overflow-hidden rounded-[20px] border border-orange-100 bg-white shadow-[0_20px_50px_rgba(120,53,15,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/60 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            <p className="text-[11px] text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-orange-600"
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <BellRing className="mx-auto mb-2 text-orange-200" size={36} />
              <p className="text-sm font-semibold text-slate-600">No notifications yet</p>
              <p className="mt-1 text-xs text-slate-400">New alerts will show up here in real time.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => onMarkRead(notification.id)}
                className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-orange-50/60 ${
                  notification.read ? 'bg-white' : 'bg-amber-50/40'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    notification.read ? 'bg-slate-100 text-slate-400' : 'bg-orange-100 text-orange-600'
                  }`}
                >
                  <BellRing size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${notification.read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>
                    {notification.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notification.message}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Live updates • click to mark as read
          </p>
        </div>
      </div>
    </div>
  )
}