import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { computeNextEmailAt, resolveScheduleConfig, shouldAutoChaseCustomer } from "@/lib/email/schedule"

const DEFAULT_SCHEDULE = {
  email1DaysAfterDue: 3,
  email2DaysAfterDue: 10,
  email3DaysAfterDue: 21,
}

describe("computeNextEmailAt", () => {
  test("stage 1 adds email1DaysAfterDue days to dueDate", () => {
    const dueDate = new Date("2026-01-01T00:00:00.000Z")
    const result = computeNextEmailAt(dueDate, 1, DEFAULT_SCHEDULE)
    assert.strictEqual(result.toISOString(), "2026-01-04T00:00:00.000Z")
  })

  test("stage 2 adds email2DaysAfterDue days to dueDate", () => {
    const dueDate = new Date("2026-01-01T00:00:00.000Z")
    const result = computeNextEmailAt(dueDate, 2, DEFAULT_SCHEDULE)
    assert.strictEqual(result.toISOString(), "2026-01-11T00:00:00.000Z")
  })

  test("stage 3 adds email3DaysAfterDue days to dueDate", () => {
    const dueDate = new Date("2026-01-01T00:00:00.000Z")
    const result = computeNextEmailAt(dueDate, 3, DEFAULT_SCHEDULE)
    assert.strictEqual(result.toISOString(), "2026-01-22T00:00:00.000Z")
  })

  test("does not mutate the original dueDate", () => {
    const dueDate = new Date("2026-03-15T00:00:00.000Z")
    const original = dueDate.toISOString()
    computeNextEmailAt(dueDate, 1, DEFAULT_SCHEDULE)
    assert.strictEqual(dueDate.toISOString(), original)
  })

  test("respects custom schedule values", () => {
    const dueDate = new Date("2026-06-01T00:00:00.000Z")
    const customSchedule = {
      email1DaysAfterDue: 1,
      email2DaysAfterDue: 5,
      email3DaysAfterDue: 14,
    }
    assert.strictEqual(
      computeNextEmailAt(dueDate, 1, customSchedule).toISOString(),
      "2026-06-02T00:00:00.000Z"
    )
    assert.strictEqual(
      computeNextEmailAt(dueDate, 2, customSchedule).toISOString(),
      "2026-06-06T00:00:00.000Z"
    )
    assert.strictEqual(
      computeNextEmailAt(dueDate, 3, customSchedule).toISOString(),
      "2026-06-15T00:00:00.000Z"
    )
  })

  test("works correctly around month boundaries", () => {
    const dueDate = new Date("2026-01-29T00:00:00.000Z")
    const result = computeNextEmailAt(dueDate, 2, DEFAULT_SCHEDULE)
    // 29 Jan + 10 days = 8 Feb
    assert.strictEqual(result.toISOString(), "2026-02-08T00:00:00.000Z")
  })

  test("works correctly around year boundaries", () => {
    const dueDate = new Date("2025-12-25T00:00:00.000Z")
    const result = computeNextEmailAt(dueDate, 3, DEFAULT_SCHEDULE)
    // 25 Dec + 21 days = 15 Jan 2026
    assert.strictEqual(result.toISOString(), "2026-01-15T00:00:00.000Z")
  })
})

describe("resolveScheduleConfig", () => {
  test("returns the tenant schedule when cadenceOverride is null", () => {
    assert.deepStrictEqual(resolveScheduleConfig(DEFAULT_SCHEDULE, null), DEFAULT_SCHEDULE)
  })

  test("returns the tenant schedule when cadenceOverride is undefined", () => {
    assert.deepStrictEqual(resolveScheduleConfig(DEFAULT_SCHEDULE, undefined), DEFAULT_SCHEDULE)
  })

  test("uses a well-formed cadenceOverride instead of the tenant schedule", () => {
    const override = { email1DaysAfterDue: 1, email2DaysAfterDue: 4, email3DaysAfterDue: 9 }
    assert.deepStrictEqual(resolveScheduleConfig(DEFAULT_SCHEDULE, override), override)
  })

  test("falls back to the tenant schedule when cadenceOverride is missing fields", () => {
    const malformed = { email1DaysAfterDue: 1 }
    assert.deepStrictEqual(resolveScheduleConfig(DEFAULT_SCHEDULE, malformed), DEFAULT_SCHEDULE)
  })

  test("falls back to the tenant schedule when cadenceOverride has the wrong types", () => {
    const malformed = { email1DaysAfterDue: "soon", email2DaysAfterDue: 10, email3DaysAfterDue: 21 }
    assert.deepStrictEqual(resolveScheduleConfig(DEFAULT_SCHEDULE, malformed), DEFAULT_SCHEDULE)
  })

  test("falls back to the tenant schedule when cadenceOverride has negative values", () => {
    const malformed = { email1DaysAfterDue: -1, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }
    assert.deepStrictEqual(resolveScheduleConfig(DEFAULT_SCHEDULE, malformed), DEFAULT_SCHEDULE)
  })
})

describe("shouldAutoChaseCustomer", () => {
  test("allows chasing when there is no linked customer", () => {
    assert.strictEqual(shouldAutoChaseCustomer(null), true)
    assert.strictEqual(shouldAutoChaseCustomer(undefined), true)
  })

  test("allows chasing for an opted-in, subscribed customer", () => {
    assert.strictEqual(
      shouldAutoChaseCustomer({ neverAutoChase: false, unsubscribed: false }),
      true
    )
  })

  test("excludes a customer with neverAutoChase set", () => {
    assert.strictEqual(
      shouldAutoChaseCustomer({ neverAutoChase: true, unsubscribed: false }),
      false
    )
  })

  test("excludes an unsubscribed customer", () => {
    assert.strictEqual(
      shouldAutoChaseCustomer({ neverAutoChase: false, unsubscribed: true }),
      false
    )
  })

  test("excludes a customer with both flags set", () => {
    assert.strictEqual(
      shouldAutoChaseCustomer({ neverAutoChase: true, unsubscribed: true }),
      false
    )
  })
})
