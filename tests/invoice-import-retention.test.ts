import { describe, test } from "node:test"
import assert from "node:assert/strict"

import { planInvoiceImportRetention } from "@/lib/invoiceImport/retention"

const NOW = new Date("2026-01-15T12:00:00.000Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000)

describe("planInvoiceImportRetention", () => {
  test("purges staging rows for a completed batch older than 24h", () => {
    const actions = planInvoiceImportRetention(
      [{ id: "b1", status: "completed", completedAt: hoursAgo(25), updatedAt: hoursAgo(25) }],
      NOW,
    )
    assert.deepEqual(actions, [{ batchId: "b1", action: "purge_staging" }])
  })

  test("leaves a completed batch alone before the 24h window elapses", () => {
    const actions = planInvoiceImportRetention(
      [{ id: "b1", status: "completed", completedAt: hoursAgo(1), updatedAt: hoursAgo(1) }],
      NOW,
    )
    assert.deepEqual(actions, [])
  })

  test("falls back to updatedAt when completedAt is null", () => {
    const actions = planInvoiceImportRetention(
      [{ id: "b1", status: "failed", completedAt: null, updatedAt: hoursAgo(48) }],
      NOW,
    )
    assert.deepEqual(actions, [{ batchId: "b1", action: "purge_staging" }])
  })

  test("treats cancelled the same as completed/failed", () => {
    const actions = planInvoiceImportRetention(
      [{ id: "b1", status: "cancelled", completedAt: null, updatedAt: hoursAgo(24) }],
      NOW,
    )
    assert.deepEqual(actions, [{ batchId: "b1", action: "purge_staging" }])
  })

  test("marks a batch abandoned and purges it after 7 days of inactivity in a non-terminal status", () => {
    const actions = planInvoiceImportRetention(
      [{ id: "b1", status: "uploaded", completedAt: null, updatedAt: hoursAgo(24 * 7 + 1) }],
      NOW,
    )
    assert.deepEqual(actions, [{ batchId: "b1", action: "mark_abandoned_and_purge" }])
  })

  test("leaves an active non-terminal batch alone before the abandonment window elapses", () => {
    const actions = planInvoiceImportRetention(
      [{ id: "b1", status: "validated", completedAt: null, updatedAt: hoursAgo(1) }],
      NOW,
    )
    assert.deepEqual(actions, [])
  })

  test("processes a mixed batch set independently", () => {
    const actions = planInvoiceImportRetention(
      [
        { id: "keep", status: "mapping", completedAt: null, updatedAt: hoursAgo(1) },
        { id: "purge", status: "completed", completedAt: hoursAgo(30), updatedAt: hoursAgo(30) },
        { id: "abandon", status: "uploaded", completedAt: null, updatedAt: hoursAgo(200) },
      ],
      NOW,
    )
    assert.deepEqual(actions, [
      { batchId: "purge", action: "purge_staging" },
      { batchId: "abandon", action: "mark_abandoned_and_purge" },
    ])
  })
})
