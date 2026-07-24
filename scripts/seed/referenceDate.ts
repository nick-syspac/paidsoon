/**
 * scripts/seed/referenceDate.ts
 *
 * Timezone-aware date helpers for the development seed.
 *
 * PaidSoon's demo data models an Australian small business, so every seeded
 * date is anchored to a wall-clock day in `Australia/Melbourne` rather than to
 * UTC. That keeps "due today", "3 days overdue" and the ageing buckets correct
 * for a Melbourne-based tester regardless of when or where the seed is run.
 *
 * The reference day comes from `SEED_REFERENCE_DATE` (YYYY-MM-DD). When unset,
 * the current Melbourne calendar day is used, so overdue/upcoming scenarios stay
 * meaningful every time the seed runs.
 *
 * This module is deliberately dependency-free (no Prisma, no env loading) so it
 * can be unit tested directly.
 */

export const SEED_TIME_ZONE = "Australia/Melbourne"

const DAY_MS = 86_400_000

interface DateParts {
  year: number
  month: number
  day: number
}

/** Offset (ms) to add to a UTC instant to obtain the given zone's wall clock. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)

  const lookup: Record<string, string> = {}
  for (const part of parts) lookup[part.type] = part.value

  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) % 24,
    Number(lookup.minute),
    Number(lookup.second),
  )

  return asUtc - instant.getTime()
}

/** The calendar date in `timeZone` at the given instant. */
export function zonedDateParts(instant: Date, timeZone: string = SEED_TIME_ZONE): DateParts {
  const offset = zoneOffsetMs(instant, timeZone)
  const shifted = new Date(instant.getTime() + offset)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** Convert a wall-clock time in `timeZone` to the corresponding UTC instant. */
export function zonedTimeToUtc(
  parts: DateParts & { hour?: number; minute?: number; second?: number },
  timeZone: string = SEED_TIME_ZONE,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  )

  // Two-pass resolution handles DST transitions: the offset that applies is the
  // one in force at the candidate instant, not at the naive UTC instant.
  const firstPass = new Date(naive - zoneOffsetMs(new Date(naive), timeZone))
  const secondOffset = zoneOffsetMs(firstPass, timeZone)
  return new Date(naive - secondOffset)
}

export class InvalidSeedReferenceDateError extends Error {
  constructor(value: string) {
    super(
      `Invalid SEED_REFERENCE_DATE="${value}". Expected an ISO calendar date in YYYY-MM-DD form, e.g. 2026-07-25.`,
    )
    this.name = "InvalidSeedReferenceDateError"
  }
}

/**
 * Resolve the seed's reference day.
 *
 * Returns midday in `Australia/Melbourne` on the reference calendar day. Midday
 * is used as the anchor so that adding/subtracting whole days never lands on a
 * DST boundary and flips the calendar date.
 *
 * @param raw `SEED_REFERENCE_DATE` value, if provided.
 * @param now Instant treated as "now" when `raw` is absent (injectable for tests).
 */
export function resolveSeedReferenceDate(
  raw?: string | null,
  now: Date = new Date(),
): Date {
  const trimmed = raw?.trim()

  if (!trimmed) {
    return zonedTimeToUtc({ ...zonedDateParts(now), hour: 12 })
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) throw new InvalidSeedReferenceDateError(trimmed)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  // Reject impossible calendar dates (e.g. 2026-02-31) that Date.UTC would roll over.
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new InvalidSeedReferenceDateError(trimmed)
  }

  return zonedTimeToUtc({ year, month, day, hour: 12 })
}

/**
 * Build the date helpers used throughout the seed, all relative to `reference`.
 */
export function createSeedClock(reference: Date) {
  /** Midday Melbourne, `n` days before the reference day. */
  const daysAgo = (n: number): Date => new Date(reference.getTime() - n * DAY_MS)

  /** Midday Melbourne, `n` days after the reference day. */
  const daysFromNow = (n: number): Date => new Date(reference.getTime() + n * DAY_MS)

  /** Start of day (00:00:00 Melbourne) `n` days from the reference day. */
  const startOfDay = (n = 0): Date =>
    zonedTimeToUtc({ ...zonedDateParts(daysFromNow(n)), hour: 0, minute: 0, second: 0 })

  /** End of day (23:59:59 Melbourne) `n` days from the reference day. */
  const endOfDay = (n = 0): Date =>
    zonedTimeToUtc({ ...zonedDateParts(daysFromNow(n)), hour: 23, minute: 59, second: 59 })

  /** `n` hours before the reference instant — for intra-day activity ordering. */
  const hoursAgo = (n: number): Date => new Date(reference.getTime() - n * 3_600_000)

  return { reference, daysAgo, daysFromNow, startOfDay, endOfDay, hoursAgo }
}

export type SeedClock = ReturnType<typeof createSeedClock>
