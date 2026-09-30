import { resolveFoodType, foodTypeLabel, type FoodTypeCarrier } from '../lib/menuFilters'

/**
 * Veg / Non-Veg marker used on every menu surface, following the standard
 * Indian restaurant convention: a green square with a green dot for Veg and a
 * red square with a red triangle for Non-Veg. Unclassified (legacy) dishes
 * render a neutral "?" so staff can see the dish still needs classifying
 * instead of it silently looking vegetarian.
 */
export function FoodTypeDot({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border-[1.5px] border-emerald-600 p-0.5 ${className}`} aria-hidden="true"><span className="block h-full w-full rounded-full bg-emerald-600" /></span>
}

interface FoodTypeMarkProps extends FoodTypeCarrier {
  /** Tile/list text size. */
  size?: 'sm' | 'md'
  /** Show the "Veg" / "Non-Veg" word next to the symbol. */
  withLabel?: boolean
}

/**
 * Compact Veg / Non-Veg marker for dish rows and tiles.
 * `title` carries the full label so hovering explains the symbol.
 */
export default function FoodTypeMark({ foodType, isVeg, size = 'md', withLabel = false }: FoodTypeMarkProps) {
  const type = resolveFoodType({ foodType, isVeg })
  const label = foodTypeLabel(type)
  const box = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  if (type === null) {
    return (
      <span
        title={`Food type: ${label}`}
        className={`inline-flex shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-slate-400 ${box} text-[8px] font-black leading-none text-slate-400`}
      >
        ?
      </span>
    )
  }

  const veg = type === 'veg'
  const color = veg ? 'border-emerald-600' : 'border-rose-600'

  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={`Food type: ${label}`}>
      <span className={`inline-flex items-center justify-center rounded-[3px] border-[1.5px] p-0.5 ${box} ${color}`}>
        {veg
          ? <span className="block h-full w-full rounded-full bg-emerald-600" />
          : (
            <svg viewBox="0 0 10 10" className="h-full w-full fill-rose-600" aria-hidden="true">
              <polygon points="5,0.5 9.5,9.5 0.5,9.5" />
            </svg>
          )}
      </span>
      {withLabel && <span className={`text-[11px] font-bold ${veg ? 'text-emerald-700' : 'text-rose-700'}`}>{label}</span>}
    </span>
  )
}
