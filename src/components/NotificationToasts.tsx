import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useRestaurant } from '../context/RestaurantContext'
import type { NotificationItem } from '../context/RestaurantContext'
import { BellRing, CheckCheck, X } from 'lucide-react'

const TOAST_DURATION_MS = 7000

export default function NotificationToasts() {
  const { user } = useAuth()
  const { notifications, markNotificationRead } = useRestaurant()
  const [toasts, setToasts] = useState<NotificationItem[]>([])
  const seenIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  // On login, existing notifications are treated as "already seen" so only
  // NEW notifications trigger a real-time toast.
  useEffect(() => {
    if (!user) return
    const roleNotifications = notifications.filter((n) => n.role === user.role)

    if (!initialized.current) {
      roleNotifications.forEach((n) => seenIds.current.add(n.id))
      initialized.current = true
      return
    }

    const fresh = roleNotifications.filter((n) => !seenIds.current.has(n.id))
    if (fresh.length === 0) return
    fresh.forEach((n) => seenIds.current.add(n.id))
    setToasts((prev) => [...fresh.slice(0, 3), ...prev].slice(0, 4))
  }, [notifications, user])

  // Auto-dismiss each toast after the duration.
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, TOAST_DURATION_MS)
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [toasts])

  const dismiss = (id: string) => {
    seenIds.current.add(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-70 flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-slide pointer-events-auto flex items-start gap-3 rounded-2xl border border-orange-200 bg-white p-4 shadow-[0_16px_40px_rgba(120,53,15,0.18)]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <BellRing size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">{toast.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{toast.message}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => markNotificationRead(toast.id)}
              title="Mark as read"
              className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50"
            >
              <CheckCheck size={15} />
            </button>
            <button
              onClick={() => dismiss(toast.id)}
              title="Dismiss"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}