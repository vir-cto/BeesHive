/**
 * Bee's Hive business-day utilities — FIXED Asia/Kolkata (IST, UTC+5:30).
 *
 * The restaurant operates in India, so "Today" and every analytics day
 * boundary MUST be computed on the IST calendar — never on the runtime
 * browser timezone and never on UTC. All helpers here are pure functions of
 * the epoch timestamp and are deterministic on every device:
 *
 *   START of a business day = IST midnight (00:00 IST)      — inclusive
 *   END   of a business day = IST midnight of the NEXT day  — exclusive
 *   (implemented as `end = nextDayStart - 1` for inclusive comparisons)
 *
 * `createdAt` / `recordedAt` / `generatedAt` values are `Date.now()` epoch
 * milliseconds, so only the boundary arithmetic matters — no Date parsing of
 * strings, no 23:59:59.999 style endings, no UTC/local mixing.
 */

/** Fixed India Standard Time offset from UTC, in minutes (+5:30). */
export const IST_OFFSET_MINUTES = 330

const MS_PER_MINUTE = 60_000

/** Calendar parts of a timestamp as seen on the IST clock. */
const istParts = (ts: number) => {
  const shifted = new Date(ts + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1, // 1–12
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0 = Sunday … 6 = Saturday
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` of the IST calendar day containing `ts`. */
export const toBusinessDayStr = (ts: number): string => {
  const { year, month, day } = istParts(ts)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** `YYYY-MM-DD` of today's IST calendar day (evaluated at call time). */
export const todayBusinessDayStr = (): string => toBusinessDayStr(Date.now())

/** Epoch ms of IST midnight (00:00 IST) for a `YYYY-MM-DD` business day. */
export const businessDayStart = (dateStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MINUTES * MS_PER_MINUTE
}

/** Epoch ms of the LAST millisecond inside the business day (inclusive end). */
export const businessDayEnd = (dateStr: string): number =>
  businessDayStart(shiftBusinessDayStr(dateStr, 1)) - 1

/** `ts` falls inside the IST business day `dateStr` ([start, next start) ). */
export const isSameBusinessDay = (ts: number, dateStr: string): boolean =>
  toBusinessDayStr(ts) === dateStr

/** Shift a `YYYY-MM-DD` business day by whole calendar days (pure date math). */
export const shiftBusinessDayStr = (dateStr: string, deltaDays: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d))
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

/** Start of the Monday-based week containing `dateStr` (IST midnight). */
export const businessWeekStart = (dateStr: string): number => {
  const { year, month, day, weekday } = istParts(businessDayStart(dateStr))
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday
  return businessDayStart(`${year}-${pad2(month)}-${pad2(day)}`) + offsetToMonday * 86_400_000
}

/** Last millisecond of the Sunday ending the week containing `dateStr`. */
export const businessWeekEnd = (dateStr: string): number =>
  businessWeekStart(dateStr) + 7 * 86_400_000 - 1

/** Epoch ms of IST midnight on the 1st of the month containing `dateStr`. */
export const businessMonthStart = (dateStr: string): number => {
  const [y, m] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * MS_PER_MINUTE
}

/** Last millisecond of the last day of the month containing `dateStr`. */
export const businessMonthEnd = (dateStr: string): number => {
  const [y, m] = dateStr.split('-').map(Number)
  return Date.UTC(y, m, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * MS_PER_MINUTE - 1
}

/** Epoch ms of IST midnight on Jan 1 of the year containing `dateStr`. */
export const businessYearStart = (dateStr: string): number => {
  const [y] = dateStr.split('-').map(Number)
  return Date.UTC(y, 0, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * MS_PER_MINUTE
}

/** Last millisecond of Dec 31 of the year containing `dateStr`. */
export const businessYearEnd = (dateStr: string): number => {
  const [y] = dateStr.split('-').map(Number)
  return Date.UTC(y + 1, 0, 1, 0, 0, 0, 0) - IST_OFFSET_MINUTES * MS_PER_MINUTE - 1
}
