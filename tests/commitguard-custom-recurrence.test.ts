import "@/tests/helpers/subscriptionAccess"
import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { z } from "zod"
import { Prisma } from "@/lib/generated/prisma/client"
import { buildCommitmentHorizonTotals } from "@/lib/commitguard/engine"
import type { CommitmentSnapshot } from "@/lib/commitguard/types"

const now = new Date("2026-10-19T12:00:00Z")
const base: CommitmentSnapshot = {
  id: "legacy-1", userId: "tenant-a", name: "Legacy custom expense", description: null,
  category: "software", amountCents: 1000, currency: "aud", frequency: "custom",
  nextDueDate: new Date("2026-10-20Z"), startDate: null, endDate: null,
  recurrenceRule: { legacy: true }, supplierName: null, supplierId: null, accountId: null,
  source: "manual", status: "active", confidence: "confirmed", noticePeriodDays: null,
  renewalDate: null, autoRenew: false, cancellable: true, essentiality: "operational",
  notes: null, linkedSpendInsightId: null, linkedCostGuardAlertId: null, archivedAt: null,
  createdAt: now, updatedAt: now,
}
const settings = {
  enabled: true, defaultHorizonDays: 30, safetyBufferMode: "fixed_amount",
  safetyBufferFixedCents: 0, safetyBufferCurrency: null, safetyBufferPercent: null, safetyBufferWeeks: null,
  detectRecurringCommitments: false, detectionMinOccurrences: 3, detectionAmountVariancePercent: 12,
  detectionIntervalToleranceDays: 3, detectionConfidenceThreshold: "medium",
  alertCommitmentDueSoon: false, alertRenewalApproaching: false, alertNoticePeriodApproaching: false,
  alertCommitmentAmountChanged: false, alertCommitmentBufferLow: false, alertCommitmentShortfall: false,
  renewalWarningDays: [30, 7],
}
let row: CommitmentSnapshot
let candidate: Record<string, unknown>
let mutations: string[]
let user: { id: string } | null
let coreAccess: boolean
let storageReads: number
let storageFailure = false
let service: typeof import("@/lib/commitguard/service")
let detection: typeof import("@/lib/commitguard/detection")
let collection: typeof import("@/app/api/commitguard/commitments/route")
let item: typeof import("@/app/api/commitguard/commitments/[id]/route")
let review: typeof import("@/app/api/commitguard/detections/[id]/review/route")
let Page: typeof import("@/app/dashboard/commitguard/page").default

function mergeDefined<T extends object>(previous: T, patch: object): T {
  return { ...previous, ...Object.fromEntries(Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, value === Prisma.DbNull ? null : value])) }
}
const tx = {
  $executeRaw: async () => 1,
  $queryRaw: async (sql: TemplateStringsArray, _tenant: string, id: string) =>
    sql.join("").includes("INSERT INTO public.commit_guard_work_items") || id === row.id || id === "candidate-1" ? [{ id }] : [],
  commitment: {
    findUnique: async () => null,
    count: async () => 1,
    findMany: async ({ where }: { where: { userId: string } }) => {
      storageReads++
      assert.equal(where.userId, "tenant-a")
      if (storageFailure) throw new Error("synthetic storage failure")
      return [row]
    },
    findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      storageReads++
      assert.equal(where.userId, "tenant-a")
      return where.id === row.id ? row : null
    },
    create: async ({ data }: { data: object }) => {
      mutations.push("commitment.create")
      row = mergeDefined({ ...base, id: "created-1" }, data)
      return row
    },
    update: async ({ data }: { data: object }) => {
      mutations.push("commitment.update")
      row = mergeDefined(row, data)
      return row
    },
  },
  commitmentDetectionCandidate: {
    findMany: async () => [candidate],
    findFirst: async ({ where }: { where: { userId: string } }) => {
      assert.equal(where.userId, "tenant-a")
      return candidate
    },
    update: async ({ data }: { data: object }) => {
      mutations.push("candidate.update")
      candidate = mergeDefined(candidate, data)
      return candidate
    },
  },
  commitGuardSetting: { upsert: async () => settings, findUnique: async () => settings },
  commitGuardCashContext: { findUnique: async () => null },
  commitmentCoverage: { findMany: async () => [] },
  importedBill: { findMany: async () => [] },
  taxReserveCategory: { findMany: async () => [] },
  taxBufferObligation: { findMany: async () => [] },
  commitmentEvent: {
    count: async () => 0,
    findMany: async () => [],
    create: async () => { mutations.push("event.create") },
    createMany: async () => { mutations.push("event.createMany") },
  },
}

function request(body: object, method = "POST"): Request {
  return new Request("http://localhost/api/commitguard/commitments", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
}
function context(id = "legacy-1") { return { params: Promise.resolve({ id }) } }
const createInput = { name: "New expense", category: "software", amountCents: 1000, currency: "aud", frequency: "monthly" }

async function fieldError(response: Response, field: string): Promise<void> {
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.ok(body.error.fieldErrors[field]?.length, JSON.stringify(body))
  assert.deepEqual(mutations, [])
}
function scheduleError(field: string): (error: unknown) => boolean {
  return (error) => error instanceof z.ZodError && error.issues.some((issue) => issue.path[0] === field)
}

describe("task 3.2: real CommitGuard services, routes and rendered legacy page (offline)", () => {
  before(async () => {
    // Only external boundaries are mocked. Service, candidate review, projection,
    // route schemas and the page/workspace render all execute their real code.
    await mock.module("@/lib/db/withUserContext", { namedExports: {
      withUserContext: async (tenant: string, callback: (value: typeof tx) => Promise<unknown>) => {
        assert.equal(tenant, "tenant-a")
        return callback(tx)
      },
    } })
    await mock.module("@/lib/billing", { namedExports: {
      requireFeature: async (_tenant: string, feature: string) => ["commitguard_core", "commitguard_detection"].includes(feature) && coreAccess,
      getSubscriptionTier: async () => "small_business",
    } })
    await mock.module("@/lib/commitguard/entitlements", { namedExports: {
      requireCommitGuardCoreAccess: async () => { if (!coreAccess) throw new Error("Upgrade required") },
      requireCommitGuardDetectionAccess: async () => {},
      getCommitGuardEntitlements: async () => ({ hasCoreAccess: coreAccess, hasDetectionAccess: true, commitmentsTrackedLimit: 100, detectionCandidatesPerCycleLimit: 100 }),
    } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: {
      loadTaxBufferSummary: async () => { throw new Error("No Tax Buffer access expected") },
    } })
    await mock.module("@/lib/supabase/server", { namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
      getAuthenticatedUser: async () => ({ data: { user } }),
    } })
    // Disable only the unrelated detection list on the page; review routes use
    // the real detection service and their separate billing feature guard below.
    await mock.module("@/lib/subscriptionPlans", { namedExports: {
      hasPlanFeature: (_tier: string, feature: string) => feature === "commitguard_core",
    } })
    await mock.module("@/components/dashboard/commitguard/CommitGuardCashContextPanel", { namedExports: {
      CommitGuardCashContextPanel: () => null,
    } })
    await mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }), redirect: () => { throw new Error("REDIRECT") } } })
    await mock.module("@/lib/commitguard/alertHistory", { namedExports: {
      listCommitGuardAlertsInTransaction: async () => ({ alerts: [], total: 0, page: 1, totalPages: 1, eventFound: true, evaluation: { available: false, lastEvaluatedAt: null } }),
      loadAlertCommitmentInTransaction: async () => null,
    } })
    service = await import("@/lib/commitguard/service")
    detection = await import("@/lib/commitguard/detection")
    collection = await import("@/app/api/commitguard/commitments/route")
    item = await import("@/app/api/commitguard/commitments/[id]/route")
    review = await import("@/app/api/commitguard/detections/[id]/review/route")
    ;({ default: Page } = await import("@/app/dashboard/commitguard/page"))
  })

  beforeEach(() => {
    row = { ...base }
    candidate = { id: "candidate-1", userId: "tenant-a", name: "Legacy candidate", frequency: "custom",
      category: "software", typicalAmountCents: 1000, currency: "aud", source: "system_inferred",
      supplierName: null, supplierId: null, status: "pending" }
    mutations = []
    user = { id: "tenant-a" }
    coreAccess = true
    storageReads = 0
    storageFailure = false
  })

  test("create/PATCH reject explicit custom and unknown frequencies with field-level 400 and no writes", async () => {
    for (const frequency of ["custom", "CUSTOM", "unsupported"]) {
      await fieldError(await collection.POST(request({ ...createInput, frequency })), "frequency")
      await fieldError(await item.PATCH(request({ frequency }, "PATCH"), context()), "frequency")
    }
  })

  test("route and real service reject custom rule payloads even under a supported frequency", async () => {
    for (const recurrenceRule of [{ rrule: "FREQ=DAILY" }, "FREQ=DAILY", {}]) {
      await fieldError(await collection.POST(request({ ...createInput, recurrenceRule })), "recurrenceRule")
      await fieldError(await item.PATCH(request({ recurrenceRule }, "PATCH"), context()), "recurrenceRule")
      await assert.rejects(service.createCommitment("tenant-a", { ...createInput, recurrenceRule }), scheduleError("recurrenceRule"))
      await assert.rejects(service.updateCommitment("tenant-a", row.id, { recurrenceRule }), scheduleError("recurrenceRule"))
    }
  })

  test("real mutation services cannot normalize custom/unknown frequencies into a one-off", async () => {
    for (const frequency of ["custom", "unknown"]) {
      await assert.rejects(service.createCommitment("tenant-a", { ...createInput, frequency }), scheduleError("frequency"))
      await assert.rejects(service.updateCommitment("tenant-a", row.id, { frequency }), scheduleError("frequency"))
    }
    assert.deepEqual(mutations, [])
  })

  test("legacy custom remains readable and supports unrelated edits without forced recurrence replacement", async () => {
    const read = await item.GET(request({}, "POST"), context())
    assert.equal(read.status, 200)
    assert.equal((await read.json()).commitment.frequency, "custom")
    // Even a legacy invalid date range must not block an unrelated note edit.
    row.startDate = new Date("2026-11-01Z")
    row.endDate = new Date("2026-10-01Z")
    const result = await item.PATCH(request({ notes: "Reviewed", name: "Renamed legacy expense" }, "PATCH"), context())
    assert.equal(result.status, 200)
    assert.equal(row.frequency, "custom")
    assert.equal(row.notes, "Reviewed")
    assert.deepEqual(row.recurrenceRule, { legacy: true })
    assert.deepEqual(mutations, ["commitment.update", "event.create"])
  })

  test("all seven supported frequencies can create and repair a legacy custom record", async () => {
    for (const frequency of ["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual"]) {
      row = { ...base }
      const repaired = await item.PATCH(request({ frequency }, "PATCH"), context())
      assert.equal(repaired.status, 200)
      assert.equal(row.frequency, frequency)
      assert.doesNotThrow(() => buildCommitmentHorizonTotals({ commitments: [row], now }))
      assert.equal((await collection.POST(request({ ...createInput, frequency }))).status, 201)
    }
  })

  test("D3 create dates and merged PATCH boundaries return field-level 400, with inclusive UTC boundary dates", async () => {
    await fieldError(await collection.POST(request({ ...createInput, startDate: "2026-10-21", endDate: "2026-10-20" })), "endDate")
    await fieldError(await collection.POST(request({ ...createInput, startDate: "2026-10-21", nextDueDate: "2026-10-20" })), "nextDueDate")
    row.startDate = new Date("2026-10-19Z")
    row.endDate = new Date("2026-10-25Z")
    await fieldError(await item.PATCH(request({ nextDueDate: "2026-10-26" }, "PATCH"), context()), "nextDueDate")
    await fieldError(await item.PATCH(request({ endDate: "2026-10-18" }, "PATCH"), context()), "endDate")
    for (const nextDueDate of ["2026-10-19T23:59:59Z", "2026-10-25T23:59:59Z"]) {
      assert.equal((await item.PATCH(request({ frequency: "monthly", nextDueDate }, "PATCH"), context())).status, 200)
    }
  })

  test("supported repair can explicitly clear a legacy recurrence rule using Prisma's null boundary", async () => {
    const response = await item.PATCH(request({ frequency: "monthly", recurrenceRule: null }, "PATCH"), context())
    assert.equal(response.status, 200)
    assert.equal(row.frequency, "monthly")
    assert.equal(row.recurrenceRule, null)
  })

  test("real service rejects invalid date writes but preserves not-found and tenant scoping", async () => {
    await assert.rejects(service.updateCommitment("tenant-a", row.id, { nextDueDate: new Date("invalid") }), scheduleError("nextDueDate"))
    const result = await item.PATCH(request({ notes: "Unowned" }, "PATCH"), context("other-tenant-id"))
    assert.equal(result.status, 404)
    assert.deepEqual(mutations, [])
  })

  test("candidate service rejects custom edits and conversion before any mutation; supported correction allows conversion", async () => {
    for (const action of ["edit", "confirm"] as const) {
      await assert.rejects(detection.reviewDetectedCommitmentCandidate({
        userId: "tenant-a", candidateId: "candidate-1", action,
        ...(action === "edit" ? { patch: { frequency: "custom" } } : {}),
      }), scheduleError("frequency"))
    }
    assert.deepEqual(mutations, [])
    await detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "candidate-1", action: "edit", patch: { name: "Still custom" } })
    assert.equal(candidate.frequency, "custom")
    await detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "candidate-1", action: "edit", patch: { frequency: "annual" } })
    await detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "candidate-1", action: "edit", patch: { suggestedDueDate: "2026-10-31" } })
    await detection.reviewDetectedCommitmentCandidate({ userId: "tenant-a", candidateId: "candidate-1", action: "confirm" })
    assert.equal(row.frequency, "annual")
    assert.equal(candidate.status, "converted")
  })

  test("candidate review route rejects custom patches and legacy custom confirmation with field-level 400", async () => {
    await fieldError(await review.POST(request({ action: "edit", patch: { frequency: "custom" } }), context("candidate-1")), "patch")
    await fieldError(await review.POST(request({ action: "confirm" }), context("candidate-1")), "frequency")
    const corrected = await review.POST(request({ action: "edit", patch: { frequency: "weekly" } }), context("candidate-1"))
    assert.equal(corrected.status, 200)
    assert.equal(candidate.frequency, "weekly")
  })

  test("real summary propagates incomplete custom projection, not a fabricated complete total or one-off", async () => {
    const result = await service.summarizeCommitGuard({ userId: "tenant-a", now })
    assert.ok(result.quality.reasons.includes("unsupported_recurrence"))
    assert.equal(result.horizons, null)
    assert.equal(result.freeCash.status, null)
    assert.deepEqual(mutations, [])
  })

  test("rendered real page/workspace retain legacy edit access with no complete totals or asserted safety status", async () => {
    const element = await Page({ searchParams: Promise.resolve({}) })
    const html = renderToStaticMarkup(element)
    assert.match(html, /Forecast incomplete/)
    assert.match(html, /Totals and free cash are not available/)
    assert.match(html, /Legacy custom expense/)
    assert.match(html, /Custom \(unsupported\)/)
    assert.match(html, /Unsupported custom recurrence/)
    assert.match(html, />Edit<\/button>/)
    // Legacy custom is a valid read filter, never a selectable new schedule.
    assert.match(html, /<select[^>]*name="frequency"[^>]*>[\s\S]*?<option value="custom">Custom \(unsupported\)/)
    assert.doesNotMatch(html.slice(html.indexOf("Add commitment")), /<option[^>]*value="custom"/)
    assert.doesNotMatch(html, /Status:|A\$0|Confirmed .*Probable/)
    assert.match(html, /Input quality: missing/)
    assert.match(html, /Safety status: Not available/)
    assert.match(html, /Protected cash \(30 days\)/)
    assert.match(html, /Free cash \(30 days\)/)
    assert.match(html, /unsupported recurrence/)
  })

  test("unexpected storage errors still fail rather than masquerading as incomplete projection", async () => {
    storageFailure = true
    await assert.rejects(Page({ searchParams: Promise.resolve({}) }), /synthetic storage failure/)
  })

  test("auth and entitlement rejection happens before storage or schedule processing", async () => {
    user = null
    assert.equal((await collection.POST(request({ ...createInput, frequency: "custom" }))).status, 401)
    user = { id: "tenant-a" }
    coreAccess = false
    assert.equal((await item.PATCH(request({ frequency: "custom" }, "PATCH"), context())).status, 403)
    assert.equal(storageReads, 0)
    assert.deepEqual(mutations, [])
  })
})