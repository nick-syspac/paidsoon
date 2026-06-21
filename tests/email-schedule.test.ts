import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { computeNextEmailAt } from "@/lib/email/schedule"

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
