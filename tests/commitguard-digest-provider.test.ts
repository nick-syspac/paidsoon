import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import type { CommitmentEvent, CommitGuardEvaluationState } from "@/lib/generated/prisma/client"
import { COMMIT_GUARD_EVENT_TYPES as E } from "@/lib/commitguard/events"
import { buildCommitGuardOperationalEvents } from "@/lib/commitguard/operationalEvaluation"
import { workspaceCommitment, workspaceSettings } from "@/tests/helpers/commitGuardWorkspace"
import type { OwnersDigestSettingsSnapshot } from "@/lib/ownersDigest/types"

let OWNERS_DIGEST_DEFAULT_SETTINGS: OwnersDigestSettingsSnapshot

const now = new Date("2026-10-19T07:00:00Z") // Monday; existing UTC-hour sender
let settings: typeof workspaceSettings & { calculationRevision: number }
let cash: { amountCents: number | null; currency: string | null; balanceAsOf: Date | null; revision: number }
let commitments: typeof workspaceCommitment[]
let candidates: { id: string; name: string; status: string; currency: string; typicalAmountCents: number; evidenceFingerprint: string }[]
let events: CommitmentEvent[]
let evaluation: CommitGuardEvaluationState | null
let features: Set<string>
let digestSettings: OwnersDigestSettingsSnapshot
let systemTier: string | null
let accessChecks: number
let revokeAt: number
let emails: { html: string; text: string; to: string }[]
let deliveries: { key: string; status: string; messageId: string | null }[]
let writes: string[]
let eventReads: number
let reserveGap: number
let planGap: number | null
let provider: typeof import("@/lib/ownersDigest/service")
let send: typeof import("@/lib/email/sendOwnersDigest").sendOwnersDigest
let snapshot: Record<string, unknown>
let items: Record<string, unknown>[]
let metrics: Record<string, unknown>[]
let runs: Record<string, unknown>[]

function event(type: string, overrides: Partial<CommitmentEvent> = {}): CommitmentEvent {
  return { id: `event-${events.length}`, userId: "tenant-a", commitmentId: null, detectionCandidateId: null,
    eventType: type, severity: "watch", title: "Untrusted stored title", message: "Untrusted stored text",
    actorId: null, metadata: {}, dedupeKey: `key-${events.length}`, cycleKey: null, inputRevision: 9,
    relevance: "active", resolvedAt: null, occurredAt: new Date("2026-10-19T01:00:00Z"),
    occurrenceDate: null, createdAt: now, ...overrides }
}
function operational(): void {
  events = buildCommitGuardOperationalEvents({ commitments, settings, history: [], advancedAlerts: true, now })
    .map((row, index) => event(row.eventType, { ...row, metadata: row.metadata as CommitmentEvent["metadata"], id: `op-${index}` }))
}
function risk(status: "shortfall" | "at_risk" | "watch" = "shortfall"): void {
  cash.amountCents = status === "shortfall" ? 5000 : status === "at_risk" ? 21000 : 25000
  settings.safetyBufferFixedCents = 10000; settings.safetyBufferCurrency = "aud"
  evaluation = { id: "evaluation-1", createdAt: now, lastSuccessfulDailyEvaluationAt: now,
    userId: "tenant-a", cashRiskEpisodeId: "risk:episode-1", cashRiskStatus: status,
    cashRiskRelevance: "active", lastEvaluatedAt: now, calculationRevision: 9,
    cashInputRevision: 4, cashRiskResolvedAt: null, updatedAt: now }
  events = [event(status === "shortfall" ? E.COMMITMENT_SHORTFALL : E.COMMITMENT_BUFFER_LOW, {
    id: "risk-event", cycleKey: "risk:episode-1", severity: status === "shortfall" ? "critical" : status === "watch" ? "watch" : "warning",
    metadata: { currency: "aud", cashInputRevision: 4, status, horizonDays: 30 },
  })]
}
function owns(args: { where: { userId?: string; plan?: { userId: string } } }): void {
  assert.equal(args.where.userId ?? args.where.plan?.userId, "tenant-a")
}
function tx() {
  const read = <T>(value: () => T) => async (args: Parameters<typeof owns>[0]): Promise<T> => { owns(args); return value() }
  return {
    commitGuardSetting: { findUnique: read(() => settings) },
    commitGuardCashContext: { findUnique: read(() => ({ ...cash, weeklyOperatingExpensesCents: null,
      weeklyExpensesCurrency: null, weeklyExpensesAsOf: null, taxProtectionCurrency: null })) },
    commitment: { findMany: read(() => commitments) },
    commitmentCoverage: { findMany: read(() => []) },
    importedBill: { findMany: read(() => []) },
    taxReserveCategory: { findMany: read(() => []) },
    taxBufferObligation: { findMany: read(() => []) },
    commitGuardEvaluationState: { findUnique: read(() => evaluation) },
    commitmentDetectionCandidate: { findMany: read(() => candidates) },
    commitmentEvent: { findMany: async (args: Parameters<typeof owns>[0]) => { owns(args); eventReads++; return events } },
    trackedInvoice: { findMany: read(() => []) }, costGuardAlert: { findMany: read(() => []) },
    cashPlanSnapshot: { findFirst: read(() => planGap === null ? null : {
      createdAt: new Date("2026-10-18T06:00:00Z"), confidence: 90, status: "warning",
      lowestClosingCashCents: 10000, bufferGapCents: planGap,
    }) }, runwayGuardSnapshot: { findFirst: read(() => null) },
    ownersDigestSetting: { upsert: async () => ({ ...digestSettings, userId: "tenant-a" }) },
    ownersDigestSnapshot: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => { writes.push("snapshot"); snapshot = { id: "digest-1", ...create }; return snapshot },
      findUniqueOrThrow: async () => ({ ...snapshot, items, metrics, providerRuns: runs }),
    },
    ownersDigestItem: {
      deleteMany: async () => { items = [] },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => { items = data.map((item, index) => ({ ...item, id: `item-${index}` })) },
    },
    ownersDigestMetric: { deleteMany: async () => { metrics = [] }, createMany: async ({ data }: { data: Record<string, unknown>[] }) => { metrics = data } },
    ownersDigestProviderRun: { deleteMany: async () => { runs = [] }, createMany: async ({ data }: { data: Record<string, unknown>[] }) => { runs = data } },
  }
}

describe("7.7 real CommitGuard provider, digest generation and existing mailer (offline)", () => {
  before(async () => {
    // CashPlan's own real assembly/consumer integration is covered separately;
    // this fixture isolates its cash-pressure correlation contract.
    await mock.module("@/lib/cashplan/service", { namedExports: {
      loadCashPlanSummary: async () => ({ planId: planGap === null ? null : "plan", anchorDate: "2026-10-19",
        commitmentRevision: 9, currency: "aud", quality: { state: "preliminary", reasons: ["partial_source_coverage"] },
        startingBalance: { balanceAsOf: "2026-10-18", cashInputRevision: 4 },
        overview: { lowestClosingCashCents: planGap === null ? null : 10000, bufferGapCents: planGap } }),
    } })
    await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext:
      async (id: string, fn: (client: object) => Promise<unknown>) => { assert.equal(id, "tenant-a"); return fn(tx()) } } })
    await mock.module("@/lib/billing", { namedExports: {
      requireFeature: async (id: string, feature: string) => { assert.equal(id, "tenant-a"); return features.has(feature) },
      getSubscriptionTier: async () => "small_business", getCommitmentLimitForTier: () => 100,
      getCommitmentDetectionCandidateLimitForTier: () => 100,
    } })
    await mock.module("@/lib/billing/effectiveAccessSystem", { namedExports: {
      getEffectiveAccessForSystem: async () => ({ allowAccess: true,
        effectiveTier: ++accessChecks >= revokeAt ? "essentials" : systemTier }),
    } })
    // Only unrelated module dependencies are isolated. CommitGuard summary,
    // event adapter, provider registry, digest persistence and mailer are real.
    await mock.module("@/lib/dashboard/loadSpendLeakDashboard", { namedExports: { loadSpendLeakDashboard: async () => ({ findings: [], isStale: false, hasAccountingConnection: false, latestSyncAt: null }) } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: { loadTaxBufferSummary: async () => ({ reserveGapCents: reserveGap, categories: [], totalReservedCents: 0, totalRequiredReserveCents: reserveGap }) } })
    await mock.module("@/lib/marginguard/service", { namedExports: { getMarginSummary: async () => ({ status: "unknown", revenueCents: 0, completenessPercent: 0 }) } })
    await mock.module("@/lib/depositGuard/integrations", { namedExports: { loadDepositGuardOwnerDigestProvider: async () => ({ source: "depositguard", status: "not_configured", signals: [], metrics: [], dataAsOf: null, stale: false, entitled: true, configured: false, available: true }) } })
    await mock.module("@/lib/ownersDigest/recipient", { namedExports: { fetchOwnersDigestRecipientEmail: async () => "synthetic@example.test" } })
    await mock.module("resend", { namedExports: { Resend: class { emails = { send: async (args: typeof emails[number]) => { emails.push(args); return { data: { id: "mock-message" } } } } } } })
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
      userProfile: { findUnique: async () => ({ displayName: "Synthetic owner" }) },
      ownersDigestSetting: { findUnique: async () => digestSettings },
      ownersDigestDelivery: {
        findUnique: async ({ where }: { where: { userId_deliveryKey: { deliveryKey: string } } }) => deliveries.find((d) => d.key === where.userId_deliveryKey.deliveryKey),
        upsert: async ({ create }: { create: { deliveryKey: string } }) => { writes.push("delivery"); deliveries.push({ key: create.deliveryKey, status: "pending", messageId: null }) },
        update: async ({ where, data }: { where: { userId_deliveryKey: { deliveryKey: string } }; data: { status: string; messageId?: string } }) => {
          Object.assign(deliveries.find((d) => d.key === where.userId_deliveryKey.deliveryKey)!, data)
        },
      },
    } } })
    provider = await import("@/lib/ownersDigest/service")
    ;({ OWNERS_DIGEST_DEFAULT_SETTINGS } = await import("@/lib/ownersDigest/settings"))
    send = (await import("@/lib/email/sendOwnersDigest")).sendOwnersDigest
  })
  beforeEach(() => {
    settings = { ...structuredClone(workspaceSettings), calculationRevision: 9 }
    cash = { amountCents: 500000, currency: "aud", balanceAsOf: new Date("2026-10-19Z"), revision: 4 }
    commitments = [structuredClone(workspaceCommitment)]; candidates = []; events = []; evaluation = null
    features = new Set(["commitguard_core", "commitguard_advanced_alerts", "commitguard_detection", "owners_digest_core"])
    digestSettings = { ...OWNERS_DIGEST_DEFAULT_SETTINGS, emailEnabled: true }
    systemTier = "small_business"; accessChecks = 0; revokeAt = Infinity
    emails = []; deliveries = []; writes = []; items = []; metrics = []; runs = []; snapshot = {}; eventReads = 0
    reserveGap = 0; planGap = null
  })

  test("stable operational event/entity identity, actual observation date, watch mapping and reachable event link", async () => {
    operational()
    const before = structuredClone(events)
    const first = await provider.loadCommitGuardProvider("tenant-a", now)
    const again = await provider.loadCommitGuardProvider("tenant-a", new Date("2026-10-19T08:00:00Z"))
    assert.ok(first.signals.length >= 3)
    assert.deepEqual(again.signals, first.signals)
    for (const signal of first.signals) {
      assert.equal(signal.entityId, commitments[0].id)
      assert.equal(signal.entityType, "commitment")
      assert.equal(signal.metadata?.sourceSeverity, events.find((e) => e.id === signal.metadata?.eventId)!.severity)
      assert.equal(signal.severity, signal.metadata?.sourceSeverity === "critical" ? "critical" : "warning")
      assert.equal(signal.detectedAt.toISOString(), "2026-10-19T01:00:00.000Z")
      assert.equal(signal.actionUrl, `/dashboard/commitguard?eventId=${signal.metadata?.eventId}#event-${signal.metadata?.eventId}`)
      assert.equal(signal.summary.includes("Untrusted"), false)
    }
    assert.deepEqual(events, before); assert.deepEqual(writes, []); assert.deepEqual(emails, [])
  })

  test("current category preferences and advanced access suppress stored due/renewal/notice events", async () => {
    operational()
    for (const [preference, type] of [["alertCommitmentDueSoon", E.COMMITMENT_DUE_SOON], ["alertRenewalApproaching", E.COMMITMENT_RENEWAL_APPROACHING], ["alertNoticePeriodApproaching", E.COMMITMENT_NOTICE_PERIOD_APPROACHING]] as const) {
      settings[preference] = false
      assert.equal((await provider.loadCommitGuardProvider("tenant-a", now)).signals.some((s) => s.signalType === type), false)
      settings[preference] = true
    }
    features.delete("commitguard_advanced_alerts")
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    assert.equal(events.length, 3, "no history deletion")
  })

  test("paused/cancelled/expired/archived/deleted obligations and changed renewal cycle are not actionable", async () => {
    operational()
    for (const status of ["paused", "cancelled", "expired"] as const) {
      commitments[0].status = status
      assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    }
    commitments[0].status = "active"; commitments[0].archivedAt = now
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    commitments[0].archivedAt = null; commitments[0].renewalDate = new Date("2027-11-01Z")
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals.map((s) => s.signalType), [E.COMMITMENT_DUE_SOON])
    commitments = []
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
  })

  test("elapsed occurrence, superseded band and missed notice history never replay as upcoming", async () => {
    operational()
    const later = await provider.loadCommitGuardProvider("tenant-a", new Date("2026-10-26T07:00:00Z"))
    assert.deepEqual(later.signals, [])
    for (const relevance of ["resolved", "suspended", "superseded", "historical"]) {
      operational(); events.forEach((e) => { e.relevance = relevance })
      assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    }
    operational(); events.forEach((e) => { e.resolvedAt = now })
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
  })

  test("risk event replaces live signal for same episode, preserves source identity and uses actual deficit not protected total", async () => {
    risk()
    const result = await provider.loadCommitGuardProvider("tenant-a", now)
    assert.equal(result.signals.length, 1)
    const signal = result.signals[0]
    assert.equal(signal.id, "commitguard-event-risk-event")
    assert.equal(signal.entityId, "risk:episode-1")
    assert.equal(signal.financialImpactCents, 15000)
    assert.equal(signal.correlationKey, "cash_pressure")
    assert.equal(signal.detectedAt.getTime(), events[0].occurredAt.getTime())
    assert.equal(result.signals.some((s) => s.signalType === "FREE_CASH_RISK"), false)
  })

  test("risk source state, quality, revisions, category and current safety status are rechecked", async () => {
    for (const alter of [
      () => { evaluation!.cashRiskRelevance = "resolved" }, () => { evaluation!.cashRiskRelevance = "suspended" },
      () => { evaluation!.cashInputRevision = 5 }, () => { evaluation!.calculationRevision = 10 },
      () => { evaluation!.lastEvaluatedAt = new Date("2026-10-18Z") },
      () => { events[0].inputRevision = 8 }, () => { events[0].cycleKey = "old-episode" },
      () => { events[0].relevance = "historical" }, () => { events[0].resolvedAt = now },
      () => { settings.alertCommitmentShortfall = false }, () => { cash.amountCents = 500000 },
      () => { cash.amountCents = null; cash.currency = null; cash.balanceAsOf = null },
      () => { cash.balanceAsOf = new Date("2026-10-11Z") },
      () => { commitments[0].currency = "usd" }, () => { commitments[0].frequency = "custom" },
    ]) {
      settings.alertCommitmentShortfall = true; commitments[0] = structuredClone(workspaceCommitment)
      cash = { amountCents: 5000, currency: "aud", balanceAsOf: new Date("2026-10-19Z"), revision: 4 }
      risk(); alter()
      assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    }
  })

  test("watch maps to warning metadata, low-buffer preference and non-AUD correlation are respected", async () => {
    risk("watch")
    let result = await provider.loadCommitGuardProvider("tenant-a", now)
    assert.equal(result.signals[0].severity, "warning")
    assert.equal(result.signals[0].metadata?.sourceSeverity, "watch")
    settings.alertCommitmentBufferLow = false
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    settings.alertCommitmentBufferLow = true; risk()
    cash.currency = "usd"; commitments[0].currency = "usd"; settings.safetyBufferCurrency = "usd"
    events[0].metadata = { currency: "usd", cashInputRevision: 4, status: "shortfall", horizonDays: 30 }
    result = await provider.loadCommitGuardProvider("tenant-a", now)
    assert.equal(result.signals[0].correlationKey, "cash_pressure:usd")
    assert.equal(result.signals[0].financialImpactCents, null)
    assert.match(result.signals[0].summary, /USD/)
  })

  test("pre-evaluation live risk uses saved source date and current preferences, not protected principal as impact", async () => {
    risk(); evaluation = null; events = []
    const result = await provider.loadCommitGuardProvider("tenant-a", now)
    assert.equal(result.signals.length, 1)
    assert.equal(result.signals[0].signalType, "FREE_CASH_RISK")
    assert.equal(result.signals[0].financialImpactCents, 15000)
    assert.equal(result.signals[0].detectedAt.toISOString(), "2026-10-19T00:00:00.000Z")
    settings.alertCommitmentShortfall = false
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
  })

  test("repeated event identity is emitted once and later recurrence keeps a distinct episode identity", async () => {
    risk(); events.push({ ...events[0] })
    let result = await provider.loadCommitGuardProvider("tenant-a", now)
    assert.equal(result.signals.length, 1)
    events[0] = { ...events[0], relevance: "resolved", resolvedAt: now }
    events[1] = { ...events[1], id: "recurred-event", cycleKey: "risk:episode-2" }
    evaluation!.cashRiskEpisodeId = "risk:episode-2"
    result = await provider.loadCommitGuardProvider("tenant-a", now)
    assert.equal(result.signals.length, 1)
    assert.equal(result.signals[0].entityId, "risk:episode-2")
    assert.equal(result.signals[0].metadata?.eventId, "recurred-event")
  })

  test("existing digest materiality filters small amount updates and current amount preference excludes history", async () => {
    events = [event(E.COMMITMENT_AMOUNT_CHANGED, { relevance: "historical", commitmentId: commitments[0].id,
      metadata: { currency: "aud", amountDeltaCents: 5000, direction: "increase" } })]
    assert.equal((await provider.loadCommitGuardProvider("tenant-a", now)).signals.length, 1)
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 0)
    digestSettings.minimumMaterialityCents = 4000
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 1)
    settings.alertCommitmentAmountChanged = false
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 0)
    assert.equal(events.length, 1)
  })

  test("disabled module and denied core/advanced access never produce cash signals or read event history", async () => {
    risk(); settings.enabled = false
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    assert.equal(eventReads, 0)
    settings.enabled = true; features.delete("commitguard_advanced_alerts")
    assert.deepEqual((await provider.loadCommitGuardProvider("tenant-a", now)).signals, [])
    assert.equal(eventReads, 0)
    features.delete("commitguard_core")
    await assert.rejects(provider.loadCommitGuardProvider("tenant-a", now), /Upgrade required/)
    assert.equal(eventReads, 0)
  })

  test("informational amount decreases and pending current-evidence detection use source dates within actual UTC reporting bucket", async () => {
    candidates = [{ id: "candidate-1", name: "Synthetic detection", status: "pending", currency: "aud", typicalAmountCents: 12000, evidenceFingerprint: "evidence-1" }]
    events = [event(E.COMMITMENT_AMOUNT_CHANGED, { id: "amount-event", relevance: "historical", commitmentId: commitments[0].id,
      severity: "critical", occurredAt: new Date("2026-10-18T23:59:59.999Z"), metadata: { currency: "aud", amountDeltaCents: 20000, direction: "decrease" } }),
    event(E.COMMITMENT_DETECTED, { id: "detection-event", detectionCandidateId: "candidate-1", dedupeKey: "commitguard:detected:candidate-1:evidence-1" })]
    digestSettings.timezone = "Pacific/Auckland"
    let digest = await provider.generateOwnersDigest("tenant-a", { now })
    assert.equal(digest.items.some((s) => s.metadata?.eventId === "amount-event"), false, "local Monday is still prior UTC week")
    assert.ok(digest.items.some((s) => s.metadata?.eventId === "detection-event"))
    events[0].occurredAt = new Date("2026-10-19T00:00:00Z")
    digest = await provider.generateOwnersDigest("tenant-a", { now })
    const amount = digest.items.find((s) => s.metadata?.eventId === "amount-event")!
    assert.equal(amount.severity, "info"); assert.match(amount.summary, /decreased \(informational\)/)
    assert.equal(amount.detectedAt.toISOString(), "2026-10-19T00:00:00.000Z")
    for (const status of ["ignored", "not_a_commitment", "converted"]) {
      candidates[0].status = status
      assert.equal((await provider.loadCommitGuardProvider("tenant-a", now)).signals.some((s) => s.signalType === E.COMMITMENT_DETECTED), false)
    }
    candidates[0].status = "pending"; candidates[0].evidenceFingerprint = "new-evidence"
    assert.equal((await provider.loadCommitGuardProvider("tenant-a", now)).signals.some((s) => s.signalType === E.COMMITMENT_DETECTED), false)
    candidates[0].evidenceFingerprint = "evidence-1"; settings.detectRecurringCommitments = false
    assert.equal((await provider.loadCommitGuardProvider("tenant-a", now)).signals.some((s) => s.signalType === E.COMMITMENT_DETECTED), false)
    settings.detectRecurringCommitments = true; features.delete("commitguard_detection")
    assert.equal((await provider.loadCommitGuardProvider("tenant-a", now)).signals.some((s) => s.signalType === E.COMMITMENT_DETECTED), false)
  })

  test("daily/monthly information follows digest bucket, with no future events or old period replay", async () => {
    events = [event(E.COMMITMENT_AMOUNT_CHANGED, { commitmentId: commitments[0].id, relevance: "historical",
      occurredAt: new Date("2026-10-01Z"), metadata: { currency: "aud", amountDeltaCents: 12000, direction: "increase" } })]
    digestSettings.frequency = "daily"
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 0)
    digestSettings.frequency = "monthly"
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 1)
    events[0].occurredAt = new Date("2026-09-30T23:59:59.999Z")
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 0)
    events[0].occurredAt = new Date("2026-10-19T07:00:00.001Z")
    assert.equal((await provider.generateOwnersDigest("tenant-a", { now })).items.length, 0)
  })

  test("existing tax/CashPlan cash-pressure signals correlate once, without adding their impacts", async () => {
    risk(); reserveGap = 20000; planGap = -12000
    const [commit, tax, plan] = await Promise.all([
      provider.loadCommitGuardProvider("tenant-a", now), provider.loadTaxBufferProvider("tenant-a", now), provider.loadCashPlanProvider("tenant-a", now),
    ])
    assert.equal(tax.signals.length, 1); assert.equal(plan.signals.length, 1)
    const merged = provider.dedupeOwnersDigestSignals([...commit.signals, ...tax.signals, ...plan.signals])
    assert.equal(merged.length, 1)
    assert.equal(merged[0].financialImpactCents, 20000)
    assert.deepEqual(new Set(merged[0].contributingSources), new Set(["commitguard", "taxbuffer", "cashplan"]))
  })

  test("existing mailer sends generated CommitGuard event once using existing delivery identity only", async () => {
    risk()
    const outcome = await send("tenant-a", now)
    assert.equal(outcome.status, "sent"); assert.equal(emails.length, 1)
    assert.match(emails[0].html, /Commitment cash shortfall/)
    assert.equal(emails[0].to, "synthetic@example.test")
    assert.deepEqual(deliveries.map((d) => d.key), ["weekly:2026-10-19T00:00:00.000Z:owner_only"])
    assert.equal((await send("tenant-a", now)).status, "already_sent")
    assert.equal(emails.length, 1)
    assert.ok(writes.every((w) => ["snapshot", "delivery"].includes(w)))
  })

  test("email opt-out, module-level digest disable, off cadence and current email entitlement block transport without deleting events", async () => {
    risk(); const saved = structuredClone(events)
    for (const mode of ["email-off", "digest-off", "frequency-off", "no-email-entitlement", "revoked-before-send"] as const) {
      digestSettings = { ...OWNERS_DIGEST_DEFAULT_SETTINGS, emailEnabled: true }; systemTier = "small_business"; revokeAt = Infinity; accessChecks = 0
      if (mode === "email-off") digestSettings.emailEnabled = false
      if (mode === "digest-off") digestSettings.enabled = false
      if (mode === "frequency-off") digestSettings.frequency = "off"
      if (mode === "no-email-entitlement") systemTier = "business_control"
      if (mode === "revoked-before-send") revokeAt = 3
      assert.equal((await send("tenant-a", now)).status, "skipped", mode)
      assert.equal(emails.length, 0); assert.deepEqual(events, saved)
    }
  })

  test("stored timezone does not change current UTC-hour cadence or UTC delivery bucket", async () => {
    risk(); digestSettings.timezone = "Australia/Sydney"
    assert.equal((await send("tenant-a", new Date("2026-10-18T20:00:00Z"))).status, "skipped", "local Monday 07:00 is not current sender's UTC-hour schedule")
    assert.equal(emails.length, 0)
    assert.equal((await send("tenant-a", now)).status, "sent")
    assert.equal(deliveries[0].key, "weekly:2026-10-19T00:00:00.000Z:owner_only")
  })
})