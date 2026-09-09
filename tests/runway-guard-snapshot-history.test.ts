import assert from "node:assert/strict"
import test from "node:test"

import {
  buildRunwaySnapshotRecord,
  calculateRunwayTrend,
} from "@/lib/runwayGuard/foundation"
import { runRunwaySnapshotSweep, getRunwayHistoryTrend } from "@/lib/runwayGuard/snapshotJob"

test("buildRunwaySnapshotRecord creates a deterministic snapshot payload", () => {
  const snapshot = buildRunwaySnapshotRecord({
    userId: "user-1",
    summary: {
      usableCashCents: 1_200_000,
      runwayDays: 90,
      projectedExhaustionDay: 90,
      status: "watch",
      source: "cashplan",
      confidence: 0.86,
      reasons: ["Projected cash-out day at 90."],
      explainability: ["Opening cash: 1500000", "Projected exhaustion day: 90"],
    },
    snapshotAt: new Date("2026-09-09T00:00:00.000Z"),
  })

  assert.equal(snapshot.userId, "user-1")
  assert.equal(snapshot.runwayDays, 90)
  assert.equal(snapshot.confidence, 0.86)
  assert.ok(snapshot.dedupeKey.includes("runway-guard:snapshot:user-1"))
  assert.deepEqual(snapshot.assumptions, {
    source: "cashplan",
    status: "watch",
    thresholdDays: 90,
  })
})

test("calculateRunwayTrend reports declining runway across snapshot history", () => {
  const trend = calculateRunwayTrend([
    { snapshotAt: new Date("2026-08-01T00:00:00.000Z"), runwayDays: 120 },
    { snapshotAt: new Date("2026-09-01T00:00:00.000Z"), runwayDays: 80 },
  ])

  assert.equal(trend.currentRunwayDays, 80)
  assert.equal(trend.previousRunwayDays, 120)
  assert.equal(trend.deltaRunwayDays, -40)
  assert.equal(trend.direction, "declining")
  assert.ok(trend.summary.toLowerCase().includes("declining"))
})

test("runRunwaySnapshotSweep upserts a single snapshot per tenant-at-timestamp", async () => {
  const records = new Map<string, { userId: string; snapshotAt: Date; runwayDays: number; usableCashCents: number }>()

  const prisma: any = {
    runwayGuardSetting: {
      findMany: async () => [{ userId: "user-1", enabled: true }],
    },
    runwayGuardSnapshot: {
      findMany: async () => Array.from(records.values()),
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.userId_snapshotAt.userId}:${where.userId_snapshotAt.snapshotAt.toISOString()}`
        const existing = records.get(key)
        const next = existing ? { ...existing, ...update } : { ...create }
        records.set(key, next)
        return next
      },
    },
  }

  const summary = {
    usableCashCents: 1_300_000,
    runwayDays: 95,
    projectedExhaustionDay: 95,
    status: "watch" as const,
    source: "cashplan" as const,
    confidence: 0.82,
    reasons: ["Updated runway forecast."],
    explainability: ["Updated explanation."],
  }

  const snapshotAt = new Date("2026-09-09T12:00:00.000Z")
  const first = await runRunwaySnapshotSweep({
    prisma,
    buildSummary: async () => summary,
    now: snapshotAt,
  })
  const second = await runRunwaySnapshotSweep({
    prisma,
    buildSummary: async () => summary,
    now: snapshotAt,
  })

  assert.equal(first.processedUsers, 1)
  assert.equal(second.processedUsers, 1)
  assert.equal(Array.from(records.values()).filter((record) => record.userId === "user-1").length, 1)
  assert.equal(Array.from(records.values())[0].runwayDays, 95)
})

test("getRunwayHistoryTrend returns a trend summary from persisted snapshot history", async () => {
  const trend = await getRunwayHistoryTrend({
    userId: "user-2",
    prisma: {
      runwayGuardSnapshot: {
        findMany: async () => [
          { snapshotAt: new Date("2026-08-01T00:00:00.000Z"), runwayDays: 120 },
          { snapshotAt: new Date("2026-09-01T00:00:00.000Z"), runwayDays: 80 },
        ],
        upsert: async () => ({}) as any,
      },
    } as any,
  })

  assert.equal(trend.currentRunwayDays, 80)
  assert.equal(trend.deltaRunwayDays, -40)
  assert.equal(trend.direction, "declining")
  assert.ok(trend.summary.toLowerCase().includes("declining"))
})
