import test from "node:test"
import assert from "node:assert/strict"
import {
  InvalidSeedReferenceDateError,
  SEED_TIME_ZONE,
  createSeedClock,
  resolveSeedReferenceDate,
  zonedDateParts,
} from "@/scripts/seed/referenceDate"

const DAY_MS = 86_400_000

test("SEED_REFERENCE_DATE resolves to midday in the application timezone", () => {
  const reference = resolveSeedReferenceDate("2026-07-25")
  const parts = zonedDateParts(reference, SEED_TIME_ZONE)

  assert.deepEqual(parts, { year: 2026, month: 7, day: 25 })
  // Melbourne is UTC+10 in July (no DST), so midday local is 02:00 UTC.
  assert.equal(reference.toISOString(), "2026-07-25T02:00:00.000Z")
})

test("reference date is DST-correct during Melbourne daylight saving", () => {
  const reference = resolveSeedReferenceDate("2026-01-15")
  const parts = zonedDateParts(reference, SEED_TIME_ZONE)

  assert.deepEqual(parts, { year: 2026, month: 1, day: 15 })
  // Melbourne is UTC+11 in January, so midday local is 01:00 UTC.
  assert.equal(reference.toISOString(), "2026-01-15T01:00:00.000Z")
})

test("an absent reference date falls back to today in the application timezone", () => {
  const now = new Date("2026-07-24T23:30:00.000Z") // 09:30 on the 25th in Melbourne
  const reference = resolveSeedReferenceDate(undefined, now)

  assert.deepEqual(zonedDateParts(reference, SEED_TIME_ZONE), {
    year: 2026,
    month: 7,
    day: 25,
  })
})

test("an empty reference date is treated as absent", () => {
  const now = new Date("2026-03-02T05:00:00.000Z")
  const fromEmpty = resolveSeedReferenceDate("   ", now)
  const fromUndefined = resolveSeedReferenceDate(undefined, now)

  assert.equal(fromEmpty.toISOString(), fromUndefined.toISOString())
})

test("malformed reference dates are rejected with a helpful error", () => {
  for (const bad of ["25-07-2026", "2026/07/25", "2026-7-5", "today", "2026-07-25T00:00:00Z"]) {
    assert.throws(
      () => resolveSeedReferenceDate(bad),
      InvalidSeedReferenceDateError,
      `expected "${bad}" to be rejected`,
    )
  }
})

test("calendar dates that do not exist are rejected rather than rolled over", () => {
  for (const bad of ["2026-02-31", "2026-13-01", "2026-00-10", "2025-02-29"]) {
    assert.throws(
      () => resolveSeedReferenceDate(bad),
      InvalidSeedReferenceDateError,
      `expected "${bad}" to be rejected`,
    )
  }
})

test("leap days are accepted in leap years", () => {
  const reference = resolveSeedReferenceDate("2028-02-29")
  assert.deepEqual(zonedDateParts(reference, SEED_TIME_ZONE), {
    year: 2028,
    month: 2,
    day: 29,
  })
})

test("the seed clock offsets from the reference date", () => {
  const reference = resolveSeedReferenceDate("2026-07-25")
  const clock = createSeedClock(reference)

  assert.equal(clock.reference.getTime(), reference.getTime())
  assert.equal(clock.daysAgo(7).getTime(), reference.getTime() - 7 * DAY_MS)
  assert.equal(clock.daysFromNow(3).getTime(), reference.getTime() + 3 * DAY_MS)
  assert.equal(clock.hoursAgo(6).getTime(), reference.getTime() - 6 * 3_600_000)
})

test("the seed clock produces ordered day boundaries in the application timezone", () => {
  const clock = createSeedClock(resolveSeedReferenceDate("2026-07-25"))

  const start = clock.startOfDay(0)
  const end = clock.endOfDay(0)

  assert.ok(start < clock.reference, "start of day is before midday")
  assert.ok(end > clock.reference, "end of day is after midday")
  assert.deepEqual(zonedDateParts(start, SEED_TIME_ZONE), { year: 2026, month: 7, day: 25 })
  assert.deepEqual(zonedDateParts(end, SEED_TIME_ZONE), { year: 2026, month: 7, day: 25 })
})

test("day boundaries respect the requested day offset", () => {
  const clock = createSeedClock(resolveSeedReferenceDate("2026-07-25"))

  assert.deepEqual(zonedDateParts(clock.startOfDay(-1), SEED_TIME_ZONE), {
    year: 2026,
    month: 7,
    day: 24,
  })
  assert.deepEqual(zonedDateParts(clock.endOfDay(5), SEED_TIME_ZONE), {
    year: 2026,
    month: 7,
    day: 30,
  })
})

test("overdue ageing derived from the clock lands in the expected buckets", () => {
  const clock = createSeedClock(resolveSeedReferenceDate("2026-07-25"))
  const ageInDays = (due: Date) =>
    Math.round((clock.reference.getTime() - due.getTime()) / DAY_MS)

  assert.equal(ageInDays(clock.daysAgo(3)), 3)
  assert.equal(ageInDays(clock.daysAgo(30)), 30)
  assert.equal(ageInDays(clock.daysAgo(72)), 72)
  assert.equal(ageInDays(clock.daysFromNow(12)), -12)
})
