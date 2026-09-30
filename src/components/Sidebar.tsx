import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useSidebar } from '../context/SidebarContext'

export type NavItem = {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
}

type SidebarProps = {
  navItems: NavItem[]
  activeTab: string
  panelName: string
  onSelect: (id: string) => void
}

/**
 * Responsive, collapsible sidebar.
 *
 * - On large screens (lg+): a desktop sidebar that collapses to an icon-only
 *   rail via the arrow button (ChevronLeft/ChevronRight toggle).
 * - On small/medium screens (< lg): hides the desktop rail and shows a floating
 *   hamburger button that opens an off-canvas drawer with a backdrop.
 */
export default function Sidebar({ navItems, activeTab, panelName, onSelect }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { mobileOpen, closeMobile } = useSidebar()

  // Close the shared mobile drawer whenever a role dashboard (re)mounts.
  useEffect(() => {
    closeMobile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock page scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  const handleSelect = (id: string) => {
    onSelect(id)
    closeMobile()
  }

  const badge = (item: NavItem) =>
    item.badge != null && item.badge > 0 ? (
      <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
    ) : null

  return (
    <>
      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => closeMobile()}
        />
        <div
          className={`absolute left-0 top-0 z-10 flex h-full w-64 max-w-[80%] flex-col overflow-x-hidden overflow-y-auto border-r border-orange-100 bg-white p-3 shadow-[0_16px_40px_rgba(120,53,15,0.18)] transition-transform duration-300 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-3 flex items-center justify-between pr-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{panelName}</p>
            <button
              onClick={() => closeMobile()}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-50"
              aria-label="Close menu"
              title="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`flex min-w-0 w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                  activeTab === item.id
                    ? 'bg-orange-100 text-orange-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {badge(item)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop sidebar (lg+) */}
      <aside
        className={`hidden shrink-0 transition-all duration-300 lg:block ${collapsed ? 'lg:w-16' : 'lg:w-56'}`}
      >
        <nav className="rounded-[20px] border border-orange-100 bg-white p-2 shadow-sm">
          <div className={`mb-3 flex items-center justify-between px-2 pt-2 ${collapsed ? 'justify-center' : ''}`}>
            {!collapsed && (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{panelName}</p>
            )}
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>
          <div className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                title={collapsed ? item.label : undefined}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  collapsed ? 'justify-center' : ''
                } ${
                  activeTab === item.id
                    ? 'bg-orange-100 text-orange-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="relative shrink-0">
                  {item.icon}
                  {collapsed && item.badge != null && item.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </span>
                {!collapsed && item.label}
                {!collapsed && badge(item)}
              </button>
            ))}
          </div>
        </nav>
      </aside>
    </>
  )
}