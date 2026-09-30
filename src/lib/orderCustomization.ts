/**
 * Bee's Hive — guest customisation helpers.
 *
 * A guest's spice preference and anything else they ask for ("no onion", "less
 * oil", "pack separately" …) travel with the order item as
 * `OrderItem.specialRequests`, so the same text:
 *   • prints on the kitchen / parcel token receipt (`SPECIAL REQUEST`)
 *   • shows on the supervisor KDS board, admin live orders and token history
 *
 * Shared by the waiter order screen and the admin parcel screen so both flows
 * offer the identical choices.
 */

/** Spice levels a guest can ask for. */
export const SPICE_LEVELS = ['Less Spice', 'Low', 'Medium', 'Hot']

/** Helper text shown under each spice level on the order screens. */
export const SPICE_DESCRIPTIONS: Record<string, string> = {
  'Less Spice': 'Very low heat — kid friendly',
  Low: 'Gentle, mild chilli warmth',
  Medium: 'Balanced house spice',
  Hot: 'Full fiery chilli punch',
}

/** Quick-pick requests customers ask for most often. */
export const CUSTOMER_NOTE_OPTIONS = [
  'No Onion',
  'No Garlic',
  'Less Oil',
  'Less Salt',
  'Extra Gravy',
  'Extra Spicy Chilli',
  'Extra Crispy',
  'Serve Hot',
  'Pack Separately',
  'Jain (No Onion & Garlic)',
]

/**
 * Compose one `specialRequests` string from the spice choice, quick-pick notes
 * and any free text the guest said. Returns `undefined` when nothing was chosen,
 * so items without a request stay clean.
 */
export const buildSpecialRequests = (spice?: string, notes: string[] = [], freeText?: string): string | undefined => {
  const parts: string[] = []
  if (spice) parts.push(`Spice: ${spice}`)
  notes.forEach((note) => {
    const trimmed = note.trim()
    if (trimmed) parts.push(trimmed)
  })
  const extra = freeText?.trim()
  if (extra) parts.push(extra)
  return parts.length > 0 ? parts.join(' · ') : undefined
}
