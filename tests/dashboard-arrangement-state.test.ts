import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  arrangementScopeLabel,
  deriveArrangementStatus,
  isArrangementHighPriority,
  type ArrangementCoverageWithArrangement,
} from "@/lib/dashboard/arrangements"

function makeCoverage(status: "active" | "broken" | "fulfilled", coverageCount: number): ArrangementCoverageWithArrangement {
  return {
    id: `cov-${status}`,
    arrangementId: `arr-${status}`,
    trackedInvoiceId: "inv-1",
    userId: "user-1",
    debtorEmail: "client@example.com",
    createdAt: new Date(),
    arrangement: {
      id: `arr-${status}`,
      userId: "user-1",
      debtorEmail: "client@example.com",
      debtorName: "Client",
      arrangementType: "full_payment",
      status,
      promisedPayBy: null,
      agreedAmount: null,
      currency: "usd",
      planSchedule: null,
      termsNotes: null,
      expiresAt: null,
      breachedAt: null,
      fulfilledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      coverages: Array.from({ length: coverageCount }).map((_, index) => ({
        trackedInvoiceId: `inv-${index + 1}`,
      })),
    },
  }
}

describe("Dashboard arrangement state helpers", () => {
  test("prioritizes active arrangement over broken", () => {
    const status = deriveArrangementStatus([
      makeCoverage("broken", 1),
      makeCoverage("active", 2),
    ])
    assert.equal(status?.type, "active")
  })

  test("marks broken arrangement as high priority", () => {
    const status = deriveArrangementStatus([makeCoverage("broken", 1)])
    assert.equal(isArrangementHighPriority(status), true)
  })

  test("uses multi-invoice scope label when coverages exceed one", () => {
    const status = deriveArrangementStatus([makeCoverage("active", 3)])
    assert.ok(status)
    assert.equal(arrangementScopeLabel(status.arrangement), "Multi-invoice (3)")
  })
})
