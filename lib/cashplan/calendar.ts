import { z } from "zod"

const DAY_MS = 86_400_000
export const CASH_PLAN_HORIZON_WEEKS = 13

export interface CashPlanAnchor {
  /** Evaluation's business-calendar date, not its UTC date. */
  date: string
  timezone: string
  startsAt: string
  endsAt: string
  /** Fourteen independently resolved local midnights, including exclusive end. */
  weekStartsAt: string[]
}

function formatter(timezone: string): Intl.DateTimeFormat {
  if (!timezone || /^[+-]/.test(timezone)) throw new RangeError("Invalid named timezone")
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, calendar: "iso8601", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  })
}

function wallClock(format: Intl.DateTimeFormat, instant: Date): string {
  const parts = Object.fromEntries(format.formatToParts(instant).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

function midnight(date: string, format: Intl.DateTimeFormat): string {
  const naive = Date.parse(`${date}T00:00:00Z`)
  const target = `${date}T00:00:00`
  // Discover actual zone offsets around the target, then verify the wall clock.
  // Never reuse today's offset across DST, or silently fall back to UTC. For an
  // ambiguous midnight use the earliest instant; a nonexistent midnight is unsupported.
  const candidates = new Set<number>()
  for (const hours of [-36, 0, 36]) {
    const sample = naive + hours * 3_600_000
    const offset = Date.parse(`${wallClock(format, new Date(sample))}Z`) - sample
    const candidate = naive - offset
    if (wallClock(format, new Date(candidate)) === target) candidates.add(candidate)
  }
  if (!candidates.size) throw new RangeError("Business midnight cannot be resolved")
  return new Date(Math.min(...candidates)).toISOString()
}

export function buildCashPlanAnchor(now: Date, timezone: string): CashPlanAnchor {
  const format = formatter(timezone)
  const date = wallClock(format, now).slice(0, 10)
  const calendarStart = Date.parse(`${date}T00:00:00Z`)
  const weekStartsAt = Array.from({ length: CASH_PLAN_HORIZON_WEEKS + 1 }, (_, week) =>
    midnight(new Date(calendarStart + week * 7 * DAY_MS).toISOString().slice(0, 10), format))
  return { date, timezone, startsAt: weekStartsAt[0], endsAt: weekStartsAt[13], weekStartsAt }
}

/** D9 obligations are UTC calendar dates. Convert their UTC midnight to the
 * business calendar before indexing; elapsed 168-hour divisions are wrong at DST. */
export function getCashPlanWeekIndex(utcDate: string, anchor: CashPlanAnchor): number | null {
  const date = z.iso.date().parse(utcDate)
  const localDate = wallClock(formatter(anchor.timezone), new Date(`${date}T00:00:00Z`)).slice(0, 10)
  const days = (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${anchor.date}T00:00:00Z`)) / DAY_MS
  if (days < 0 || days >= CASH_PLAN_HORIZON_WEEKS * 7) return null
  return Math.floor(days / 7)
}