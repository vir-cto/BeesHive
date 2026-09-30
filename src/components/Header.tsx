import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  Bell,
  LogOut,
  Mail,
  Menu,
  Phone,
  UserCircle2,
  ChevronDown,
  X,
  Search,
  UtensilsCrossed,
} from 'lucide-react'
import { useRestaurant } from '../context/RestaurantContext'
import { useSidebar } from '../context/SidebarContext'
import Avatar from './Avatar'
import BeeLogo from './BeeLogo'
import { roleLabel } from '../lib/roleLabel'

export default function Header() {
  const { logout, user } = useAuth()
  const { notifications, menu, categories } = useRestaurant()
  const { mobileOpen, toggleMobile } = useSidebar()

  const [showProfile, setShowProfile] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()

  const myNotifications = user
    ? notifications.filter((n) => n.role === user.role)
    : []

  const unreadCount = myNotifications.filter((n) => !n.read).length

  const globalSearchResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase()

    if (!query) return []

    return menu
      .filter((item) => item.active && item.available)
      .map((item) => {
        const category = categories.find(
          (c) => c.id === item.categoryId,
        )

        const matches =
          item.name.toLowerCase().includes(query) ||
          (item.description || '').toLowerCase().includes(query) ||
          (category?.name || '').toLowerCase().includes(query)

        return matches
          ? {
              item,
              categoryName: category?.name || 'Menu',
            }
          : null
      })
      .filter(
        (
          result,
        ): result is {
          item: (typeof menu)[number]
          categoryName: string
        } => result !== null,
      )
      .slice(0, 8)
  }, [globalSearch, menu, categories])

  const openGlobalSearchResult = () => {
    const query = globalSearch.trim()

    if (!query) return

    setShowSearchResults(false)

    navigate(
      `/waiter?tab=menu&search=${encodeURIComponent(query)}`,
    )
  }

  // Close the profile/search panels when clicking outside
  // or pressing Escape.
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node

      if (
        profileRef.current &&
        !profileRef.current.contains(target)
      ) {
        setShowProfile(false)
      }

      if (
        searchRef.current &&
        !searchRef.current.contains(target)
      ) {
        setShowSearchResults(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProfile(false)
        setShowSearchResults(false)
      }
    }

    document.addEventListener(
      'mousedown',
      handleOutsideClick,
    )

    document.addEventListener(
      'keydown',
      handleEscape,
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
      )

      document.removeEventListener(
        'keydown',
        handleEscape,
      )
    }
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <div className="h-1 w-full bg-linear-to-r from-blue-950 via-blue-800 to-amber-400" />

      <div className="max-w-full px-4 py-3 md:px-6 lg:px-8">
        <div className="relative flex items-center justify-between gap-2">
          {/* Left side */}
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={() => toggleMobile()}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-xs font-bold transition lg:hidden ${
                mobileOpen
                  ? 'border-orange-300 bg-orange-100 text-orange-700'
                  : 'border-orange-100 bg-orange-50 text-orange-600 hover:bg-orange-100'
              }`}
              aria-label={
                mobileOpen ? 'Close menu' : 'Open menu'
              }
              title={
                mobileOpen ? 'Close menu' : 'Open menu'
              }
            >
              {mobileOpen ? (
                <X size={18} />
              ) : (
                <Menu size={18} />
              )}

              <span className="hidden min-[360px]:inline">
                {mobileOpen ? 'Close' : 'Menu'}
              </span>
            </button>

            {/* Logo */}
            <div className="flex min-w-0 items-center gap-2 drop-shadow-[0_6px_14px_rgba(30,58,138,0.25)] md:gap-3">
              <BeeLogo className="h-10 w-10 shrink-0 transition-transform duration-300 hover:scale-105 md:h-11 md:w-11" />
            </div>

            {/* Restaurant name */}
            <div className="min-w-0 leading-none">
              <h1 className="truncate font-brand text-[1.05rem] font-extrabold uppercase tracking-[0.08em] text-blue-950 sm:text-[1.25rem] md:text-[1.5rem] md:tracking-[0.12em]">
                Bee&apos;s Hive
              </h1>

              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.3em] text-amber-600">
                Restaurant
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
            {/* =====================================================
                GLOBAL SEARCH — WAITER ONLY
                ===================================================== */}
            {user?.role === 'waiter' && (
              <div
                ref={searchRef}
                className="relative hidden md:block"
              >
                <div className="flex w-64 items-center rounded-xl border border-slate-200 bg-white transition focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
                  <Search
                    size={17}
                    className="ml-3 shrink-0 text-slate-400"
                  />

                  <input
                    type="search"
                    value={globalSearch}
                    onChange={(event) => {
                      setGlobalSearch(event.target.value)
                      setShowSearchResults(
                        event.target.value.trim().length > 0,
                      )
                    }}
                    onFocus={() => {
                      if (globalSearch.trim()) {
                        setShowSearchResults(true)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        globalSearch.trim()
                      ) {
                        openGlobalSearchResult()
                      }

                      if (event.key === 'Escape') {
                        setShowSearchResults(false)
                      }
                    }}
                    placeholder="Search menu & items..."
                    className="w-full bg-transparent px-2.5 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    aria-label="Search menu and items"
                  />

                  {globalSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setGlobalSearch('')
                        setShowSearchResults(false)
                      }}
                      className="mr-2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Clear search"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Search results dropdown */}
                {showSearchResults && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_16px_40px_rgba(120,53,15,0.18)]">
                    {globalSearchResults.length > 0 ? (
                      <div className="max-h-96 overflow-y-auto p-2">
                        <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                          Menu Results
                        </p>

                        {globalSearchResults.map(
                          ({ item, categoryName }) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setShowSearchResults(false)

                                navigate(
                                  `/waiter?tab=menu&search=${encodeURIComponent(
                                    item.name,
                                  )}`,
                                )
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-orange-50"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                <UtensilsCrossed
                                  size={17}
                                />
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-slate-800">
                                  {item.name}
                                </span>

                                <span className="block truncate text-xs text-slate-400">
                                  {categoryName} · ₹
                                  {item.price}
                                </span>
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-center">
                        <Search
                          size={22}
                          className="mx-auto mb-2 text-slate-300"
                        />

                        <p className="text-sm font-semibold text-slate-600">
                          No menu items found
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Try a dish or category name
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* =====================================================
                NOTIFICATIONS
                ===================================================== */}
            <button
              onClick={() => navigate('/notifications')}
              className="relative rounded-xl border border-orange-100 bg-orange-50 p-2.5 text-orange-600 transition hover:bg-orange-100"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={18} />

              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {unreadCount > 99
                    ? '99+'
                    : unreadCount}
                </span>
              )}
            </button>

            {/* =====================================================
                PROFILE
                ===================================================== */}
            {user && (
              <div
                ref={profileRef}
                className="relative"
              >
                <button
                  onClick={() =>
                    setShowProfile((prev) => !prev)
                  }
                  className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition ${
                    showProfile
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-slate-200 hover:border-orange-200'
                  }`}
                  title="View profile details"
                  aria-label="View profile details"
                >
                  <Avatar
                    name={user.name}
                    src={user.avatarUrl}
                    role={user.role}
                    className="h-8 w-8 text-sm"
                  />

                  <div className="hidden sm:block">
                    <p className="text-xs font-bold text-slate-900">
                      {user.name}
                    </p>

                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {roleLabel(user.role)}
                    </p>
                  </div>

                  <ChevronDown
                    size={14}
                    className={`hidden shrink-0 text-slate-400 transition sm:block ${
                      showProfile ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showProfile && (
                  <>
                    {/* Backdrop for mobile */}
                    <div
                      className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
                      onClick={() =>
                        setShowProfile(false)
                      }
                    />

                    {/* Account Modal */}
                    <div
                      className="
                        fixed left-1/2 top-16 z-50 box-border w-full max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-[20px] border border-orange-100 bg-white shadow-2xl
                        md:absolute md:left-auto md:right-0 md:top-[calc(100%+8px)] md:w-64 md:max-w-none md:translate-x-0 md:shadow-[0_16px_40px_rgba(120,53,15,0.18)]
                      "
                    >
                      <div className="flex flex-col items-center bg-linear-to-br from-orange-50 to-amber-50 p-4 text-center">
                        <Avatar
                          name={user.name}
                          src={user.avatarUrl}
                          role={user.role}
                          className="h-16 w-16 text-2xl"
                        />

                        <p className="mt-2 max-w-full wrap-break-word text-sm font-bold text-slate-900">
                          {user.name}
                        </p>

                        <span className="mt-0.5 rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700">
                          {roleLabel(user.role)}
                        </span>
                      </div>

                      <div className="space-y-2 p-4 text-xs text-slate-600">
                        <p className="flex min-w-0 items-start gap-2">
                          <Mail
                            size={13}
                            className="mt-0.5 shrink-0 text-slate-400"
                          />{' '}
                          <span className="min-w-0 break-all">
                            {user.email}
                          </span>
                        </p>

                        {user.phone && (
                          <p className="flex min-w-0 items-start gap-2">
                            <Phone
                              size={13}
                              className="mt-0.5 shrink-0 text-slate-400"
                            />{' '}
                            <span className="min-w-0 break-all">
                              {user.phone}
                            </span>
                          </p>
                        )}

                        <p className="flex min-w-0 items-start gap-2 text-slate-400">
                          <UserCircle2
                            size={13}
                            className="mt-0.5 shrink-0"
                          />{' '}
                          <span className="min-w-0 break-all">
                            ID: {user.id}
                          </span>
                        </p>
                      </div>

                      <div className="flex gap-2 border-t border-slate-100 p-4">
                        <button
                          onClick={() =>
                            setShowProfile(false)
                          }
                          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                        >
                          <X
                            size={13}
                            className="shrink-0"
                          />{' '}
                          Close
                        </button>

                        <button
                          onClick={() => {
                            setShowProfile(false)
                            logout()
                          }}
                          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
                        >
                          <LogOut
                            size={13}
                            className="shrink-0"
                          />{' '}
                          Logout
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Logout */}
            <button
              onClick={() => logout()}
              className="hidden rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 sm:block"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}