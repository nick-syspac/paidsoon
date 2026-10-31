import assert from "node:assert/strict"
import { describe, test } from "node:test"

const policy = {
  accountDisplayRevision: 7,
  accountDisplayFromDate: new Date("2026-10-15T00:00:00.000Z"),
  accountDisplayTimeZone: "Australia/Melbourne",
}

describe("CommitGuard and CashPlan account-display provenance", () => {
  test("rejects stale persisted candidates and snapshots on a mismatched display revision", async () => {
    const { filterCurrentAccountDisplayRows } = await import("@/lib/commitguard/cashContextLoader")

    const rows = [
      {
        id: "current",
        accountDisplayRevision: 7,
        accountDisplayFromDate: new Date("2026-10-15T00:00:00.000Z"),
        accountDisplayTimeZone: "Australia/Melbourne",
      },
      {
        id: "stale",
        accountDisplayRevision: 6,
        accountDisplayFromDate: new Date("2026-10-09T00:00:00.000Z"),
        accountDisplayTimeZone: "Australia/Melbourne",
      },
      {
        id: "legacy",
        accountDisplayRevision: null,
        accountDisplayFromDate: null,
        accountDisplayTimeZone: null,
      },
    ]

    const filtered = filterCurrentAccountDisplayRows(rows, policy)
    assert.deepEqual(filtered.map((row) => row.id), ["current"])
  })

  test("keeps the current cutoff when the persisted row is still valid for the same policy", async () => {
    const { filterCurrentAccountDisplayRows } = await import("@/lib/commitguard/cashContextLoader")

    const rows = [
      {
        id: "match",
        accountDisplayRevision: 7,
        accountDisplayFromDate: new Date("2026-10-15T00:00:00.000Z"),
        accountDisplayTimeZone: "Australia/Melbourne",
      },
    ]

    const filtered = filterCurrentAccountDisplayRows(rows, policy)
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, "match")
  })
})
