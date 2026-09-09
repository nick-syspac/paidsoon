import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildSnapshotRecord, resolveSnapshotGranularity } from "@/lib/marginguard/snapshotJob"

describe("MarginGuard snapshot helpers", () => {
  test("resolves daily granularity for 30d and monthly for longer presets", () => {
    assert.equal(resolveSnapshotGranularity("30d"), "daily")
    assert.equal(resolveSnapshotGranularity("3m"), "monthly")
    assert.equal(resolveSnapshotGranularity("6m"), "monthly")
    assert.equal(resolveSnapshotGranularity("12m"), "monthly")
    assert.equal(resolveSnapshotGranularity("fy"), "monthly")
  })

  test("builds normalized snapshot payload with deterministic assumptions", () => {
    const calculatedAt = new Date("2026-09-09T00:00:00.000Z")
    const snapshot = buildSnapshotRecord(
      "user-1",
      {
        period: {
          preset: "30d",
          from: "2026-08-10T00:00:00.000Z",
          to: "2026-09-09T00:00:00.000Z",
        },
        revenueCents: 100000,
        directCostCents: 65000,
        variableCostCents: 10000,
        grossProfitCents: 35000,
        grossMarginPercent: 35,
        contributionMarginCents: 25000,
        contributionMarginPercent: 25,
        completenessPercent: 88,
        confidence: "medium",
        status: "watch",
        assumptions: {
          grossMarginReason: "ok",
          contributionReason: "ok",
          missingItems: ["products"],
        },
      },
      calculatedAt,
    )

    assert.equal(snapshot.userId, "user-1")
    assert.equal(snapshot.periodGranularity, "daily")
    assert.equal(snapshot.currency, "AUD")
    assert.equal(snapshot.revenueCents, 100000)
    assert.equal(snapshot.assumptions.periodPreset, "30d")
    assert.deepEqual(snapshot.assumptions.missingItems, ["products"])
    assert.equal(snapshot.calculatedAt.toISOString(), "2026-09-09T00:00:00.000Z")
  })
})
