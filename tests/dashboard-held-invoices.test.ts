import assert from "node:assert/strict"
import { mock, test } from "node:test"

mock.module("@/lib/db/withUserContext", {
  exports: { withUserContext: async () => undefined },
})
mock.module("@/lib/diagnostics/server", {
  exports: { traceOperation: async () => undefined },
})

const { computeHeldInvoiceIds } = await import("@/lib/dashboard/loadDashboardRiskSignals")

const now = new Date("2026-08-15T00:00:00.000Z")

function queuedInvoice(id: string, nextEmailAt: Date | null) {
  return {
    id,
    status: "pending",
    currentStage: 0,
    nextEmailAt,
  }
}

test("marks a queued invoice held only when its first reminder is due and allowance is exhausted", () => {
  const invoices = [
    queuedInvoice("due", new Date("2026-08-14T00:00:00.000Z")),
    queuedInvoice("future", new Date("2026-08-16T00:00:00.000Z")),
    queuedInvoice("unscheduled", null),
  ]

  const held = computeHeldInvoiceIds(invoices as never, true, now)

  assert.deepStrictEqual([...held], ["due"])
})

test("does not mark queued invoices held while allowance remains", () => {
  const invoices = [queuedInvoice("due", new Date("2026-08-14T00:00:00.000Z"))]

  assert.deepStrictEqual([...computeHeldInvoiceIds(invoices as never, false, now)], [])
})