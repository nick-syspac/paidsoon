import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-123" }
let mockCoreAccess = true
let capturedInput: unknown = null
let storedRunwaySettings = {
  enabled: true,
  horizonDays: 180,
  warningThresholdDays: 90,
  criticalThresholdDays: 45,
  lowConfidenceWeight: 0.6,
  minimumConfidence: 0.5,
}
let mockHistoryRows: Array<{ snapshotAt: Date; runwayDays: number }> = [
  { snapshotAt: new Date("2026-08-01T00:00:00.000Z"), runwayDays: 120 },
  { snapshotAt: new Date("2026-09-01T00:00:00.000Z"), runwayDays: 80 },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let summaryGET: any

describe("RunwayGuard summary route", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/runwayGuard/entitlements", {
      namedExports: {
        requireRunwayGuardCoreAccess: async () => {
          if (!mockCoreAccess) throw new Error("Upgrade required")
        },
        requireRunwayGuardScenarioAccess: async () => {
          if (!mockCoreAccess) throw new Error("Upgrade required")
        },
      },
    })

    await mock.module("@/lib/runwayGuard/service", {
      namedExports: {
        buildRunwayGuardServiceOutput: (input: unknown) => {
          capturedInput = input
          return {
            summary: {
              usableCashCents: 1000000,
              runwayDays: 90,
              projectedExhaustionDay: 90,
              status: "warning",
              source: "estimate",
              confidence: 0.6,
              reasons: ["sample"],
              explainability: ["sample explanation"],
            },
            scenario: { impact_on_runway_days: 0, new_runway_status: "warning" },
            alert: { event: "none", severity: "info", message: "stable" },
            materialChange: { hasMaterialChange: false, severity: "info", reason: "stable", dedupeKey: "stable" },
          }
        },
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: any) => Promise<any>) =>
          fn({
            runwayGuardSnapshot: {
              findMany: async () => mockHistoryRows,
            },
            runwayGuardSetting: {
              findUnique: async () => storedRunwaySettings,
              upsert: async ({ update, create }: any) => {
                storedRunwaySettings = { ...storedRunwaySettings, ...create, ...update }
                return storedRunwaySettings
              },
            },
          }),
      },
    })

    ;({ GET: summaryGET } = await import("@/app/api/runway-guard/summary/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockCoreAccess = true
    capturedInput = null
    storedRunwaySettings = {
      enabled: true,
      horizonDays: 180,
      warningThresholdDays: 90,
      criticalThresholdDays: 45,
      lowConfidenceWeight: 0.6,
      minimumConfidence: 0.5,
    }
    mockHistoryRows = [
      { snapshotAt: new Date("2026-08-01T00:00:00.000Z"), runwayDays: 120 },
      { snapshotAt: new Date("2026-09-01T00:00:00.000Z"), runwayDays: 80 },
    ]
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await summaryGET(new Request("http://localhost/api/runway-guard/summary"))
    assert.equal(response.status, 401)
  })

  test("returns 403 when feature is unavailable", async () => {
    mockCoreAccess = false
    const response = await summaryGET(new Request("http://localhost/api/runway-guard/summary"))
    assert.equal(response.status, 403)
  })

  test("returns summary payload for entitled tenants", async () => {
    const response = await summaryGET(
      new Request("http://localhost/api/runway-guard/summary?openingCashCents=1000000&protectedCashCents=200000&reserveBufferCents=50000"),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.summary.runwayDays, 90)
    assert.ok(capturedInput)
  })

  test("returns scenario payload for entitled tenants", async () => {
    const scenarioModule = await import("@/app/api/runway-guard/scenarios/route")
    const response = await scenarioModule.POST(
      new Request("http://localhost/api/runway-guard/scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          openingCashCents: 1000000,
          protectedCashCents: 200000,
          reserveBufferCents: 50000,
          committedOutflowsCents: 100000,
          scenarioType: "custom",
          inflowMultiplier: 1.1,
          outflowMultiplier: 0.95,
        }),
      }),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.summary.runwayDays, 90)
    assert.ok(body.scenario)
  })

  test("returns runway timeline for entitled tenants", async () => {
    const timelineModule = await import("@/app/api/runway-guard/timeline/route")
    const response = await timelineModule.GET(
      new Request("http://localhost/api/runway-guard/timeline?openingCashCents=1000000&protectedCashCents=200000&reserveBufferCents=50000&horizonDays=90"),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(Array.isArray(body.timeline))
    assert.ok(body.timeline.length > 0)
  })

  test("returns runway drivers and recommendations for entitled tenants", async () => {
    const driversModule = await import("@/app/api/runway-guard/drivers/route")
    const response = await driversModule.GET(
      new Request("http://localhost/api/runway-guard/drivers?openingCashCents=1000000&protectedCashCents=200000&reserveBufferCents=50000&horizonDays=90"),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(body.summary)
    assert.ok(Array.isArray(body.drivers))
    assert.ok(Array.isArray(body.recommendations))
  })

  test("returns runway settings for entitled tenants", async () => {
    storedRunwaySettings = {
      enabled: true,
      horizonDays: 210,
      warningThresholdDays: 120,
      criticalThresholdDays: 60,
      lowConfidenceWeight: 0.65,
      minimumConfidence: 0.55,
    }

    const settingsModule = await import("@/app/api/runway-guard/settings/route")
    const response = await settingsModule.GET()

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.settings.horizonDays, 210)
    assert.equal(body.settings.warningThresholdDays, 120)
    assert.equal(body.settings.minimumConfidence, 0.55)
    assert.ok(body.settings.enabled)
  })

  test("updates runway settings for entitled tenants", async () => {
    const settingsModule = await import("@/app/api/runway-guard/settings/route")
    const response = await settingsModule.PUT(
      new Request("http://localhost/api/runway-guard/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          horizonDays: 240,
          warningThresholdDays: 120,
          criticalThresholdDays: 60,
          lowConfidenceWeight: 0.7,
          minimumConfidence: 0.6,
        }),
      }),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.settings.horizonDays, 240)
    assert.equal(body.settings.warningThresholdDays, 120)
    assert.equal(body.settings.minimumConfidence, 0.6)
  })

  test("returns runway history trend for entitled tenants", async () => {
    const historyModule = await import("@/app/api/runway-guard/history/route")
    const response = await historyModule.GET(
      new Request("http://localhost/api/runway-guard/history?limit=30"),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(Array.isArray(body.history))
    assert.equal(body.trend.currentRunwayDays, 80)
    assert.equal(body.trend.direction, "declining")
  })

  test("reads and persists runway settings through the service layer", async () => {
    const { getRunwayGuardSettings, saveRunwayGuardSettings } = await import("@/lib/runwayGuard/settings")

    const initial = await getRunwayGuardSettings("user-123")
    assert.equal(initial.horizonDays, 180)

    const updated = await saveRunwayGuardSettings("user-123", {
      enabled: true,
      horizonDays: 240,
      warningThresholdDays: 120,
      criticalThresholdDays: 60,
      lowConfidenceWeight: 0.7,
      minimumConfidence: 0.6,
    })

    assert.equal(updated.horizonDays, 240)
    assert.equal(updated.warningThresholdDays, 120)
    assert.equal(updated.minimumConfidence, 0.6)
  })
})
