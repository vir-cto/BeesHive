import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Eye } from 'lucide-react'

/**
 * The application's ONE view control.
 *
 * Every screen that used to render its Small / Medium / Large / List options as
 * a row of separate buttons now renders this single compact button
 * (`[ 👁 View ▾ ]`). Opening it shows the options with the current one ticked;
 * picking one closes the menu and applies it immediately (no reload).
 *
 * Presentation only: the caller owns the value, so each screen keeps its own
 * option list, its own layout and its own persistence.
 */
export interface ViewModeOption<T extends string> {
  id: T
  label: string
}

interface ViewModeSelectProps<T extends string> {
  value: T
  options: readonly ViewModeOption<T>[]
  onChange: (next: T) => void
  /** Accessible name, e.g. "Session view". */
  label?: string
  className?: string
}

export default function ViewModeSelect<T extends string>({
  value,
  options,
  onChange,
  label = 'View',
  className = '',
}: ViewModeSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.id === value) ?? options[0]

  // Close on an outside click or Escape — the menu must never trap the layout.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        title={`${label}${selected ? ` — ${selected.label}` : ''}`}
        className="flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-700 active:scale-[0.98] sm:px-3"
      >
        <Eye size={14} className="shrink-0 text-orange-500" />
        <span>View</span>
        <span className="hidden max-w-24 truncate text-slate-400 sm:inline">
          {selected ? `· ${selected.label}` : ''}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-orange-100 bg-white py-1 shadow-[0_18px_36px_-14px_rgba(120,53,15,0.35)]"
        >
          {options.map((option) => {
            const isSelected = option.id === value
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setOpen(false)
                    if (!isSelected) onChange(option.id)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold transition ${
                    isSelected ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Check size={14} className={`shrink-0 ${isSelected ? 'text-orange-600' : 'text-transparent'}`} />
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
