import type { UserRole } from '../context/AuthContext'

interface AvatarProps {
  name: string
  src?: string | null
  role?: UserRole | string
  /** Tailwind size classes, e.g. "h-9 w-9 text-sm" — defaults to h-10 w-10 text-base */
  className?: string
  title?: string
}

const roleFallback: Record<string, string> = {
  admin: 'bg-orange-100 text-orange-700',
  waiter: 'bg-blue-100 text-blue-700',
  supervisor: 'bg-emerald-100 text-emerald-700',
}

/**
 * User avatar that shows the uploaded photo when available and otherwise
 * falls back to the first initial of the name in a role-coloured circle.
 */
export default function Avatar({ name, src, role, className, title }: AvatarProps) {
  const sizeClass = className ?? 'h-10 w-10 text-base'
  const fallbackClass = roleFallback[role ?? ''] ?? 'bg-slate-100 text-slate-600'

  if (src) {
    return (
      <img
        src={src}
        alt={title ?? name}
        title={title ?? name}
        className={`${sizeClass} shrink-0 rounded-full border border-white object-cover shadow-sm`}
      />
    )
  }

  return (
    <div
      title={title ?? name}
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-bold ${fallbackClass}`}
    >
      {name.charAt(0).toUpperCase() || '?'}
    </div>
  )
}