import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-123" }
let mockCoreAccess = true
let mockAlertsAccess = true
let mockScenariosAccess = true
let mockCustomerAccess = true
let throwThresholdValidation = false

let capturedSummaryArgs: { userId: string; period?: string } | null = null
let capturedAlertsArgs: { userId: string; status?: string; limit: number } | null = null
let capturedTransitionArgs:
  | { userId: string; id: string; status: string; actorId: string; reason?: string }
  | null = null
let capturedTargetArgs: { userId: string; actorId: string; scopeType: string; scopeKey: string | null } | null = null
let capturedScenarioArgs: { userId: string; actorId: string; scenarioType: string } | null = null
let capturedCustomerArgs: { userId: string; period?: string } | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let summaryGET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let alertsGET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let alertsPATCH: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let targetsPUT: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rulesPOST: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scenariosPOST: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let customersGET: any

describe("MarginGuard route authz and lifecycle flows", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/marginguard/entitlements", {
      namedExports: {
        requireMarginGuardCoreAccess: async () => {
          if (!mockCoreAccess) throw new Error("Upgrade required")
        },
        requireMarginGuardAlertsAccess: async () => {
          if (!mockAlertsAccess) throw new Error("Upgrade required")
        },
        requireMarginGuardScenariosAccess: async () => {
          if (!mockScenariosAccess) throw new Error("Upgrade required")
        },
        requireMarginGuardCustomerAnalysisAccess: async () => {
          if (!mockCustomerAccess) throw new Error("Upgrade required")
        },
      },
    })

    await mock.module("@/lib/marginguard/engine", {
      namedExports: {
        validateMarginThresholds: () => {
          if (throwThresholdValidation) {
            throw new Error("Thresholds must satisfy critical < warning < target")
          }
        },
      },
    })

    await mock.module("@/lib/marginguard/service", {
      namedExports: {
        getMarginSummary: async (userId: string, period?: string) => {
          capturedSummaryArgs = { userId, period }
          return {
            period: { preset: period ?? "30d", start: "2026-08-01", end: "2026-08-31" },
            grossMarginPercent: 42,
          }
        },
        listMarginAlerts: async (userId: string, status: string | undefined, limit: number) => {
          capturedAlertsArgs = { userId, status, limit }
          return [
            {
              id: "alert-1",
              state: status ?? "open",
              title: "Margin drift",
            },
          ]
        },
        transitionMarginAlert: async (
          userId: string,
          id: string,
          status: string,
          actorId: string,
          reason?: string,
        ) => {
          capturedTransitionArgs = { userId, id, status, actorId, reason }
          if (id === "missing") return null
          if (id === "invalid") throw new Error("Invalid alert state transition")
          return { id, state: status, reason: reason ?? null }
        },
        upsertMarginTarget: async (
          userId: string,
          input: { actorId: string; scopeType: string; scopeKey: string | null },
        ) => {
          capturedTargetArgs = {
            userId,
            actorId: input.actorId,
            scopeType: input.scopeType,
            scopeKey: input.scopeKey,
          }
          return { id: "target-1", ...input }
        },
        previewMarginRuleApplication: async () => ({ matches: 3, sample: [] }),
        applyMarginRule: async () => ({ updatedCount: 2 }),
        createOrUpdateMarginRule: async () => ({ id: "rule-1" }),
        runMarginScenario: async (
          userId: string,
          input: { actorId: string; scenarioType: string },
        ) => {
          capturedScenarioArgs = {
            userId,
            actorId: input.actorId,
            scenarioType: input.scenarioType,
          }
          return {
            id: "scenario-1",
            name: "Scenario",
            scenarioType: input.scenarioType,
            targetMarginPercent: 40,
            requiredPriceCents: 120000,
          }
        },
        getMarginCustomers: async (userId: string, period?: string) => {
          capturedCustomerArgs = { userId, period }
          return [
            {
              customerId: "cust-1",
              customerName: "Acme",
              grossMarginPercent: 33,
              status: "warning",
            },
          ]
        },
      },
    })

    ;({ GET: summaryGET } = await import("@/app/api/margin-guard/summary/route"))
    ;({ GET: alertsGET } = await import("@/app/api/margin-guard/alerts/route"))
    ;({ PATCH: alertsPATCH } = await import("@/app/api/margin-guard/alerts/[id]/route"))
    ;({ PUT: targetsPUT } = await import("@/app/api/margin-guard/targets/route"))
    ;({ POST: rulesPOST } = await import("@/app/api/margin-guard/rules/route"))
    ;({ POST: scenariosPOST } = await import("@/app/api/margin-guard/scenarios/route"))
    ;({ GET: customersGET } = await import("@/app/api/margin-guard/customers/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockCoreAccess = true
    mockAlertsAccess = true
    mockScenariosAccess = true
    mockCustomerAccess = true
    throwThresholdValidation = false

    capturedSummaryArgs = null
    capturedAlertsArgs = null
    capturedTransitionArgs = null
    capturedTargetArgs = null
    capturedScenarioArgs = null
    capturedCustomerArgs = null
  })

  test("returns 401 from summary route when unauthenticated", async () => {
    mockUser = null
    const response = await summaryGET(new Request("http://localhost/api/margin-guard/summary"))
    assert.equal(response.status, 401)
  })

  test("returns 400 from summary route on invalid period", async () => {
    const response = await summaryGET(new Request("http://localhost/api/margin-guard/summary?period=2y"))
    assert.equal(response.status, 400)
    assert.equal(capturedSummaryArgs, null)
  })

  test("returns 403 from alerts route when alert entitlement is unavailable", async () => {
    mockAlertsAccess = false
    const response = await alertsGET(new Request("http://localhost/api/margin-guard/alerts?status=open"))
    assert.equal(response.status, 403)
  })

  test("validates alerts list query params", async () => {
    const response = await alertsGET(new Request("http://localhost/api/margin-guard/alerts?limit=0"))
    assert.equal(response.status, 400)
    assert.equal(capturedAlertsArgs, null)
  })

  test("acknowledges an alert and attributes lifecycle action to authenticated user", async () => {
    const response = await alertsPATCH(
      new Request("http://localhost/api/margin-guard/alerts/alert-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged", reason: "Reviewed in standup" }),
      }),
      { params: Promise.resolve({ id: "alert-1" }) },
    )

    assert.equal(response.status, 200)
    assert.deepEqual(capturedTransitionArgs, {
      userId: "user-123",
      id: "alert-1",
      status: "acknowledged",
      actorId: "user-123",
      reason: "Reviewed in standup",
    })
  })

  test("returns 404 when alert lifecycle action targets missing record", async () => {
    const response = await alertsPATCH(
      new Request("http://localhost/api/margin-guard/alerts/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    )

    assert.equal(response.status, 404)
  })

  test("returns 400 when lifecycle transition is invalid", async () => {
    const response = await alertsPATCH(
      new Request("http://localhost/api/margin-guard/alerts/invalid", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      }),
      { params: Promise.resolve({ id: "invalid" }) },
    )

    assert.equal(response.status, 400)
  })

  test("sets a margin target with tenant-safe actor identity", async () => {
    const response = await targetsPUT(
      new Request("http://localhost/api/margin-guard/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "customer",
          scopeKey: "cust-22",
          targetGrossMarginPercent: 42,
        }),
      }),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(capturedTargetArgs, {
      userId: "user-123",
      actorId: "user-123",
      scopeType: "customer",
      scopeKey: "cust-22",
    })
  })

  test("returns 400 when threshold validation fails during target update", async () => {
    throwThresholdValidation = true
    const response = await targetsPUT(
      new Request("http://localhost/api/margin-guard/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: "organization",
          targetGrossMarginPercent: 40,
          warningGrossMarginPercent: 40,
          criticalGrossMarginPercent: 39,
        }),
      }),
    )

    assert.equal(response.status, 400)
  })

  test("requires rule.id for classify-cost apply action", async () => {
    const response = await rulesPOST(
      new Request("http://localhost/api/margin-guard/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          rule: {
            name: "Supplier direct cost",
            ruleType: "supplier",
            classification: "DIRECT_COST",
            priority: 100,
            enabled: true,
            matchConfig: { supplierId: "supplier-1" },
          },
        }),
      }),
    )

    assert.equal(response.status, 400)
  })

  test("runs scenario with actor bound to authenticated session", async () => {
    const response = await scenariosPOST(
      new Request("http://localhost/api/margin-guard/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Lift prices",
          scenarioType: "mixed",
          directCostCents: 70000,
          revenueCents: 100000,
          targetMarginPercent: 40,
          directCostChangePercent: -2,
          priceChangePercent: 5,
          volumeChangePercent: 3,
        }),
      }),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(capturedScenarioArgs, {
      userId: "user-123",
      actorId: "user-123",
      scenarioType: "mixed",
    })
  })

  test("returns customer profitability data for eligible users", async () => {
    const response = await customersGET(new Request("http://localhost/api/margin-guard/customers?period=3m"))
    assert.equal(response.status, 200)
    assert.deepEqual(capturedCustomerArgs, {
      userId: "user-123",
      period: "3m",
    })

    const body = await response.json()
    assert.equal(Array.isArray(body.customers), true)
    assert.equal(body.customers[0].customerName, "Acme")
  })
})
