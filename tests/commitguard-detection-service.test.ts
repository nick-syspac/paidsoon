import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"
import { CommitGuardDetectionError, type CommitGuardDetectionErrorCode } from "@/lib/commitguard/detectionError"
import type { DetectionBillRow, DetectionBankRow } from "@/lib/commitguard/detectionEvidence"

const tenant = "synthetic-tenant"
const now = new Date("2026-10-19T12:00:00Z")
const defaultSettings = { enabled: true, detectRecurringCommitments: true,
  detectionMinOccurrences: 3, detectionAmountVariancePercent: 12,
  detectionIntervalToleranceDays: 3, detectionConfidenceThreshold: "low" }
let settings: Record<string, unknown> | null
let snapshot: EffectiveAccessSnapshot
let trace: string[], writes: string[], created: Record<string, unknown>[]
let samples: number
let billRows: DetectionBillRow[] | undefined
let bankRows: DetectionBankRow[]
let onLock: (() => void | Promise<void>) | undefined
let user: { id: string } | null
let accessUnavailable: boolean
let evidenceUnavailable: boolean
let detection: typeof import("@/lib/commitguard/detection")
let service: typeof import("@/lib/commitguard/service")
let route: typeof import("@/app/api/commitguard/detections/route")
let settingsRoute: typeof import("@/app/api/commitguard/settings/route")

function paid(): EffectiveAccessSnapshot {
  return { profile: { subscriptionStatus: "active", subscriptionTier: "business_pro",
    stripeSubscriptionId: "sub_synthetic", trialEndsAt: null, billingAccessVersion: 1 },
    grant: null, billingRisks: [] }
}
function grant(expiresAt: string, revokedAt: Date | null = null): EffectiveAccessSnapshot {
  return { profile: { ...paid().profile!, subscriptionStatus: "cancelled", stripeSubscriptionId: null },
    grant: { plan: "business_pro", startsAt: new Date("2026-10-01"), expiresAt: new Date(expiresAt), revokedAt },
    billingRisks: [] }
}
function assertNoFinancialWork(): void {
  assert.deepEqual(writes, [])
  assert.deepEqual(created, [])
  assert.equal(trace.includes("bills"), false)
  assert.equal(trace.includes("bank"), false)
  assert.equal(trace.includes("candidate"), false)
}
function failure(code: CommitGuardDetectionErrorCode) {
  return (error: unknown): boolean => error instanceof CommitGuardDetectionError && error.code === code
}

before(async () => {
  await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  }) } })
  // Actual central resolver and financialJobAccessSkip run. Only the scoped
  // database loader is mocked; stale route admission must not authorize execution.
  await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: {
    getEffectiveAccess: async (userId: string) => {
      assert.equal(userId, tenant)
      trace.push("access")
      if (accessUnavailable) throw new Error("synthetic access storage failure")
      return resolveEffectiveAccess(snapshot, now)
    },
  } })
  await mock.module("@/lib/billing/effectiveAccessSystem", { namedExports: {
    getEffectiveAccessForSystem: async () => { throw new Error("customer detector must not bypass RLS") },
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, callback: (tx: unknown) => Promise<unknown>) => {
      assert.equal(userId, tenant)
      let locked = false
      const tx = {
        $executeRaw: async (sql: TemplateStringsArray, key: string) => {
          assert.equal(sql.join("?"), "SELECT pg_advisory_xact_lock(hashtext(?))")
          assert.equal(key, `commitguard:${tenant}`)
          await onLock?.()
          locked = true
          trace.push("locked")
        },
        commitGuardSetting: {
          findUnique: async ({ where }: { where: object }) => {
            assert.equal(locked, true)
            assert.deepEqual(where, { userId: tenant })
            trace.push("settings")
            return settings
          },
          upsert: async () => { writes.push("settings"); throw new Error("unexpected default write") },
          update: async () => { writes.push("settings"); throw new Error("unexpected settings write") },
        },
        importedBill: { findMany: async ({ where, select }: { where: object; select: Record<string, unknown> }) => {
          assert.equal(locked, true)
          assert.deepEqual(where, { userId: tenant, accountingConnection: { userId: tenant },
            status: { notIn: ["void", "voided", "cancelled", "canceled", "deleted"] } })
          for (const field of ["accountingConnectionId", "sourceId", "status", "documentNumber", "supplierReference"]) {
            assert.equal(select[field], true)
          }
          assert.deepEqual(select.accountingConnection, { select: { provider: true } })
          trace.push("bills")
          if (evidenceUnavailable) throw new Error("synthetic evidence storage failure")
          return billRows ?? fixtureBills(samples)
        } },
        importedBankTransaction: { findMany: async ({ where, select }: { where: object; select: Record<string, unknown> }) => {
          assert.deepEqual(where, { userId: tenant, accountingConnection: { userId: tenant },
            direction: "outflow", amountCents: { not: 0 } })
          for (const field of ["accountingConnectionId", "sourceId", "direction", "rawSourceData", "reference"]) {
            assert.equal(select[field], true)
          }
          assert.deepEqual(select.accountingConnection, { select: { provider: true } })
          trace.push("bank")
          return bankRows
        } },
        commitmentDetectionCandidate: {
          findUnique: async ({ where }: { where: { userId_candidateKey: { userId: string; candidateKey: string } } }) => {
            assert.equal(where.userId_candidateKey.userId, tenant)
            assert.match(where.userId_candidateKey.candidateKey, /^[a-f0-9]{64}$/)
            trace.push("candidate"); return null
          },
          create: async ({ data }: { data: Record<string, unknown> }) => {
            assert.equal(data.userId, tenant)
            writes.push("candidate"); created.push(data)
            return { ...data, id: "synthetic-candidate" }
          },
          update: async () => { writes.push("candidate-update"); throw new Error("unexpected update") },
          findMany: async () => { trace.push("list"); return [] },
        },
        commitmentEvent: { upsert: async () => { writes.push("event") } },
        commitGuardWorkItem: { create: async () => { writes.push("work"); throw new Error("unexpected work") } },
      }
      return callback(tx)
    },
  } })
  detection = await import("@/lib/commitguard/detection")
  service = await import("@/lib/commitguard/service")
  route = await import("@/app/api/commitguard/detections/route")
  settingsRoute = await import("@/app/api/commitguard/settings/route")
})

beforeEach(() => {
  settings = { ...defaultSettings }; snapshot = paid(); trace = []; writes = []; created = []
  samples = 3; onLock = undefined; user = { id: tenant }; accessUnavailable = false; evidenceUnavailable = false
  billRows = undefined; bankRows = []
})

function fixtureBills(count: number, connection = "connection-a"): DetectionBillRow[] {
  return Array.from({ length: count }, (_, index) => ({ supplierName: "Synthetic",
    accountingConnectionId: connection, accountingConnection: { provider: "xero" }, sourceId: `bill-${index}`,
    supplierReference: null, documentNumber: `DOC-${index}`, status: "paid",
    sourceContactId: null, amountCents: 1000, currency: "aud",
    dueDate: new Date(Date.UTC(2026, 0, 1 + index * 7)), paidDate: null,
    sourceUpdatedAt: null, createdAt: now }))
}

function fixtureBank(count: number, connection = "connection-a"): DetectionBankRow[] {
  return fixtureBills(count, connection).map((bill, index) => ({
    accountingConnectionId: connection, accountingConnection: { provider: "xero" }, sourceId: `bank-${index}`,
    sourceContactId: null, amountCents: 1000, currency: "aud", counterpartyName: "Synthetic",
    reference: null, direction: "outflow", transactionDate: bill.dueDate!, rawSourceData: {},
  }))
}

test("5.2 real service filters unsupported rows even when a mock returns them", async () => {
  billRows = [...fixtureBills(3).map((row) => ({ ...row, status: "VOIDED" })),
    ...fixtureBills(3).map((row) => ({ ...row, status: "cancelled" }))]
  bankRows = [...fixtureBank(3).map((row) => ({ ...row, direction: "inflow" })),
    ...fixtureBank(3).map((row) => ({ ...row, direction: "unknown", amountCents: -1000 })),
    ...fixtureBank(3).map((row) => ({ ...row, amountCents: 0 }))]
  assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 0)
  assert.deepEqual(writes, [])
})

test("5.2 real service keeps two connections and source currencies distinct", async () => {
  billRows = [...fixtureBills(2), ...fixtureBills(2, "connection-b"),
    ...fixtureBills(2).map((row) => ({ ...row, currency: "USD" }))]
  assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 0)
  assert.deepEqual(writes, [])
  billRows = [...fixtureBills(3), ...fixtureBills(3, "connection-b")]
  assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 2)
  assert.deepEqual(created.map((row) => (row.evidence as { connectionId: string }).connectionId),
    ["connection-a", "connection-b"])
})

test("5.2 real service deduplicates exact references without merging bill and bank samples", async () => {
  billRows = [...fixtureBills(2), { ...fixtureBills(2)[1], sourceId: "retry" }]
  bankRows = fixtureBank(2)
  const below = await detection.detectCommitmentCandidates(tenant)
  assert.equal(below.created, 0)
  assert.deepEqual(below.warnings, ["duplicate_economic_reference", "potential_duplicate_streams"])
  assert.deepEqual(writes, [])
  billRows.push(fixtureBills(3)[2])
  bankRows = fixtureBank(5)
  const result = await detection.detectCommitmentCandidates(tenant)
  assert.equal(result.created, 1)
  const evidence = created[0].evidence as { sampleCount: number; sourceKind: string;
    observations: { sourceId: string }[]; alternateStreams: { sampleCount: number }[]; warnings: string[] }
  assert.equal(evidence.sampleCount, 3)
  assert.equal(evidence.sourceKind, "bill")
  assert.equal(evidence.alternateStreams[0].sampleCount, 5)
  assert.equal(evidence.observations.length, 3)
  assert.deepEqual(evidence.warnings, result.warnings)
})

test("5.2 real service accepts positive Xero and negative MYOB outflow streams independently", async () => {
  billRows = []
  bankRows = [...fixtureBank(3), ...fixtureBank(3, "connection-b").map((row) => ({ ...row,
    sourceId: `spend:${row.sourceId}`, amountCents: -1000, accountingConnection: { provider: "myob" } }))]
  assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 2)
  assert.ok(created.every((row) => row.source === "bank_transaction_pattern"))
  assert.ok(created.every((row) => (row.evidence as { sampleCount: number }).sampleCount === 3))
})

test("5.2 real service returns ambiguity warning without candidate writes below threshold", async () => {
  billRows = [...fixtureBills(3), { ...fixtureBills(3)[1], sourceId: "uncertain-copy", documentNumber: "OTHER" }]
  const result = await detection.detectCommitmentCandidates(tenant)
  assert.equal(result.created, 0)
  assert.deepEqual(result.warnings, ["ambiguous_potential_duplicates"])
  assert.deepEqual(writes, [])
})

for (const [label, configure, code] of [
  ["missing settings", () => { settings = null }, "settings_required"],
  ["disabled module", () => { settings!.enabled = false }, "module_disabled"],
  ["missing opt-in", () => { settings!.detectRecurringCommitments = false }, "detection_disabled"],
  ["missing profile", () => { snapshot.profile = null }, "access_denied"],
  ["missing subscription", () => { snapshot.profile!.stripeSubscriptionId = null }, "access_denied"],
  ["missing detection feature", () => { snapshot.profile!.subscriptionTier = "essentials" }, "access_denied"],
  ["missing effective tier", () => { snapshot.profile!.subscriptionTier = null }, "access_denied"],
  ["expired grant", () => { snapshot = grant(now.toISOString()) }, "access_denied"],
  ["revoked grant", () => { snapshot = grant("2026-11-01", now) }, "access_denied"],
  ["expired onboarding access", () => { snapshot.profile = { ...paid().profile!, stripeSubscriptionId: null,
    subscriptionStatus: "trialing", trialEndsAt: now } }, "access_denied"],
] as const) {
  test(`5.1 real detector stops before evidence/storage writes: ${label}`, async () => {
    configure()
    await assert.rejects(detection.detectCommitmentCandidates(tenant), failure(code))
    assertNoFinancialWork()
    assert.deepEqual(trace, code === "access_denied" ? ["access"] : ["access", "locked", "settings", "access"])
  })
}

for (let minimum = 2; minimum <= 10; minimum += 1) {
  test(`5.1 real detector supports configured minimum ${minimum}`, async () => {
    settings!.detectionMinOccurrences = minimum
    samples = minimum - 1
    assert.deepEqual(await detection.detectCommitmentCandidates(tenant), { created: 0, updated: 0, skipped: 1 })
    assert.deepEqual(writes, [])
    samples = minimum
    assert.deepEqual(await detection.detectCommitmentCandidates(tenant), { created: 1, updated: 0, skipped: 0 })
    assert.deepEqual(writes, ["candidate", "event"])
    assert.equal((created[0].evidence as { sampleCount: number }).sampleCount, minimum)
    assert.deepEqual(trace.slice(0, 6), ["access", "locked", "settings", "access", "bills", "bank"])
  })
}

test("7.6 detector stops on saved disable then uses retained source evidence after re-enable", async () => {
  const original = structuredClone(fixtureBills(samples))
  settings!.enabled = false
  await assert.rejects(detection.detectCommitmentCandidates(tenant), failure("module_disabled"))
  assertNoFinancialWork()
  settings!.enabled = true
  assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 1)
  assert.deepEqual(fixtureBills(samples), original)
  assert.deepEqual(writes, ["candidate", "event"])
})

for (const minimum of [1, 11, 2.5, NaN, Infinity, null, undefined, "2"]) {
  test(`5.1 real service refuses invalid stored threshold ${String(minimum)} without repair writes`, async () => {
    settings!.detectionMinOccurrences = minimum
    await assert.rejects(detection.detectCommitmentCandidates(tenant), failure("invalid_detection_settings"))
    assertNoFinancialWork()
  })
}

test("5.1 real detector honors current effective grant rather than raw subscription", async () => {
  snapshot = grant("2026-11-01")
  assert.equal(resolveEffectiveAccess(snapshot, now).source, "admin_grant")
  assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 1)
})

for (const change of ["module", "opt-in", "access", "threshold"] as const) {
  test(`5.1 settings and access are refreshed after lock wait: ${change}`, async () => {
    onLock = () => {
      if (change === "module") settings!.enabled = false
      if (change === "opt-in") settings!.detectRecurringCommitments = false
      if (change === "access") snapshot = grant(now.toISOString())
      if (change === "threshold") settings!.detectionMinOccurrences = 10
    }
    if (change === "threshold") {
      assert.equal((await detection.detectCommitmentCandidates(tenant)).created, 0)
      assert.deepEqual(writes, [])
    } else {
      const code = change === "module" ? "module_disabled" : change === "opt-in" ? "detection_disabled" : "access_denied"
      await assert.rejects(detection.detectCommitmentCandidates(tenant), failure(code))
      assertNoFinancialWork()
    }
  })
}

test("5.1 failed access resolution fails closed before evidence", async () => {
  accessUnavailable = true
  await assert.rejects(detection.detectCommitmentCandidates(tenant), /synthetic access storage failure/)
  assertNoFinancialWork()
})

for (const [code, status, configure] of [
  ["settings_required", 409, () => { settings = null }],
  ["module_disabled", 409, () => { settings!.enabled = false }],
  ["detection_disabled", 409, () => { settings!.detectRecurringCommitments = false }],
  ["invalid_detection_settings", 400, () => { settings!.detectionMinOccurrences = 11 }],
  ["access_denied", 403, () => { onLock = () => { snapshot = grant(now.toISOString()) } }],
] as const) {
  test(`5.1 actual POST maps ${code} safely to ${status} without listing/evidence/writes`, async () => {
    configure()
    const response = await route.POST()
    assert.equal(response.status, status)
    const body = await response.json()
    assert.equal(body.code, code)
    assert.deepEqual(Object.keys(body).sort(), ["code", "error"])
    assert.equal(JSON.stringify(body).includes(tenant), false)
    assert.equal(trace.includes("list"), false)
    assertNoFinancialWork()
  })
}
  for (const change of ["module", "access"] as const) {
    test(`5.1 execution waits for serialization then observes a concurrent ${change} change`, async () => {
      let entered!: () => void, release!: () => void
      const waiting = new Promise<void>((resolve) => { entered = resolve })
      const held = new Promise<void>((resolve) => { release = resolve })
      onLock = async () => { entered(); await held }
      const run = detection.detectCommitmentCandidates(tenant)
      await waiting
      assert.deepEqual(trace, ["access"])
      assertNoFinancialWork()
      if (change === "module") settings!.enabled = false
      else snapshot = grant(now.toISOString())
      release()
      await assert.rejects(run, failure(change === "module" ? "module_disabled" : "access_denied"))
      assertNoFinancialWork()
      assert.deepEqual(trace, ["access", "locked", "settings", "access"])
    })
  }

  for (const [field, value] of [
    ["detectionAmountVariancePercent", 0], ["detectionAmountVariancePercent", 101],
    ["detectionIntervalToleranceDays", 0], ["detectionIntervalToleranceDays", 31],
    ["detectionConfidenceThreshold", "unknown"],
  ] as const) {
    test(`5.1 invalid persisted ${field}=${value} cannot reach evidence`, async () => {
      settings![field] = value
      await assert.rejects(detection.detectCommitmentCandidates(tenant), failure("invalid_detection_settings"))
      assertNoFinancialWork()
    })
  }


test("5.1 actual POST authenticates before detection", async () => {
  user = null
  assert.equal((await route.POST()).status, 401)
  assert.deepEqual(trace, [])
  assertNoFinancialWork()
})

test("5.1 actual POST succeeds through the real service", async () => {
  settings!.detectionMinOccurrences = 2; samples = 2
  const response = await route.POST()
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).detection, { created: 1, updated: 0, skipped: 0 })
  assert.equal(trace.includes("list"), true)
  assert.deepEqual(writes, ["candidate", "event"])
})

test("5.1 unexpected evidence errors retain a generic 500 response", async () => {
  evidenceUnavailable = true
  const log = mock.method(console, "error", () => {})
  try {
    const response = await route.POST()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "Internal server error" })
    assert.deepEqual(writes, [])
  } finally { log.mock.restore() }
})

for (const minimum of [1, 11, 2.5, null, "2"]) {
  test(`5.1 settings PUT and real settings service reject invalid minimum ${String(minimum)}`, async () => {
    const response = await settingsRoute.PUT(new Request("http://localhost/api/commitguard/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detectionMinOccurrences: minimum }),
    }))
    assert.equal(response.status, 400)
    await assert.rejects(service.saveCommitGuardSettings(tenant, { detectionMinOccurrences: minimum as number }),
      (error: unknown) => error instanceof Error && error.name === "ZodError")
    assertNoFinancialWork()
    assert.equal(trace.includes("locked"), false)
  })
}