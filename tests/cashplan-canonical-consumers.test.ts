import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import type { Commitment, Prisma } from "@/lib/generated/prisma/client"
import type { PrismaTx } from "@/lib/db/withUserContext"
import { workspaceCommitment, workspaceSettings } from "@/tests/helpers/commitGuardWorkspace"
import type { CashPlanBillInput } from "@/lib/cashplan/factAssembler"
import type { CoverageRecord } from "@/lib/commitguard/coverage"
import { buildCommitGuardSummary } from "@/lib/commitguard/summary"
import { buildCommitGuardProtectionFacts } from "@/lib/commitguard/protectionFacts"

const now = new Date("2026-10-19T01:00:00Z")
const owner = "synthetic-owner"
let user: { id: string } | null = { id: owner }
let allowed = true, entitled = true, enabled = true, hasPlan = true
let cash: number | null = 100_000, balanceDate = "2026-10-19", currency = "aud", cashRevision = 3, revision = 7
let rows: Commitment[] = [], snapshots: Array<Record<string, unknown>> = [], snapshotWrites = 0
let accessReads = 0, financialReads = 0, failSnapshot = false
let overrides: unknown[] = []
let coverageRows: CoverageRecord[] = [], billRows: CashPlanBillInput[] = []
let readsOnly = false
const sourceReads: string[] = []
const access = () => resolveEffectiveAccess({ profile: { subscriptionTier: entitled ? "small_business" : "essentials",
  subscriptionStatus: allowed ? "active" : "cancelled", stripeSubscriptionId: allowed ? "sub-synthetic" : null,
  trialEndsAt: null, billingAccessVersion: 1 }, grant: null, billingRisks: [], platformOwnerAccess: false }, now)
const plan = () => ({ id: "plan-a", name: "Synthetic plan", currency, timezone: "Australia/Sydney",
  horizonWeeks: 13, bufferTargetCents: 95_000, updatedAt: now })
const tx = {
  $executeRaw: async () => 1,
  $queryRaw: async (sql: TemplateStringsArray) => sql.join("").includes("INSERT INTO") ? [{ id: "work" }] : [{ id: "commit-a" }],
  cashPlan: { findFirst: async ({ where }: { where: { userId: string; id?: string } }) => {
    assert.equal(where.userId, owner); financialReads++
    return hasPlan && (!where.id || where.id === "plan-a") ? plan() : null
  } },
  cashPlanSetting: { findFirst: async () => null },
  commitGuardCashContext: { findUnique: async () => cash === null ? null : ({ amountCents: cash, currency,
    balanceAsOf: new Date(`${balanceDate}T00:00:00Z`), revision: cashRevision,
    weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null,
    taxProtectionCurrency: "aud" }) },
  commitGuardSetting: { findUnique: async () => ({ enabled, calculationRevision: revision }),
    upsert: async () => ({ calculationRevision: ++revision }) },
  commitment: { findMany: async () => rows, count: async () => rows.length,
    create: async ({ data }: { data: Prisma.CommitmentUncheckedCreateInput }) => {
      const row = { ...workspaceCommitment, ...data, id: "commit-a", userId: owner,
        sourceDetectionCandidateId: null, recurrenceRule: null, pausedAt: null, cancelledAt: null,
        expiredAt: null, createdAt: now, updatedAt: now } as Commitment
      rows.push(row); return row
    },
    findFirst: async () => rows[0] ?? null,
    update: async ({ data }: { data: Partial<Commitment> }) => (rows[0] = { ...rows[0], ...data, updatedAt: now }),
  },
  commitmentCoverage: { findMany: async () => coverageRows },
  importedBill: { findMany: async ({ where }: { where: { userId: string; id: { in: string[] } } }) => {
    assert.equal(where.userId, owner)
    return billRows.filter((row) => where.id.in.includes(row.id))
  } },
  commitmentEvent: { create: async () => ({ id: "audit" }) },
  cashPlanOverride: { findMany: async () => overrides },
  cashPlanSnapshot: {
    findFirst: async ({ select }: { select: Record<string, unknown> }) => {
      assert.equal("weeks" in select, false, "active reader must never read opaque weeks")
      return snapshots.at(-1) ?? null
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (failSnapshot) throw new Error("private database failure")
      snapshotWrites++
      const saved = { id: `snapshot-${snapshotWrites}`, ...structuredClone(data) }
      snapshots.push(saved); return { id: saved.id }
    },
  },
}
// During consumer assertions, every mutation/raw query and every unlisted source
// table fails closed. There is no provider, tax orchestration or DB escape hatch.
const readTx = new Proxy(tx, { get(target, key) {
  assert.ok(typeof key === "string" && key in target && !key.startsWith("$"), `unexpected financial source: ${String(key)}`)
  sourceReads.push(key)
  return new Proxy(Reflect.get(target, key) as object, { get(table, operation) {
    assert.ok(typeof operation === "string" && /^find(First|Unique|Many)$/.test(operation), `GET write: ${String(key)}.${String(operation)}`)
    return Reflect.get(table, operation)
  } })
} })
mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext:
  async (id: string, callback: (client: PrismaTx) => Promise<unknown>) => {
    assert.equal(id, owner); return callback((readsOnly ? readTx : tx) as unknown as PrismaTx)
  } } })
// Real subscriptionRoute -> accessGuard -> mocked fresh central resolver. No
// new CashPlan feature entitlement, and no cached/queued authorization.
mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: { getEffectiveAccess: async () => { accessReads++; return access() } } })
mock.module("@/lib/supabase/server", { namedExports: {
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }),
  getAuthenticatedUser: async () => ({ data: { user } }),
} })
mock.module("next/navigation", { namedExports: { redirect: () => { throw new Error("redirect") } } })
mock.module("@/lib/commitguard/entitlements", { namedExports: {
  requireCommitGuardCoreAccess: async () => { assert.ok(entitled) },
  getCommitGuardEntitlements: async () => ({ hasCoreAccess: entitled, commitmentsTrackedLimit: 100 }),
} })
// Neither Tax Buffer orchestration nor any external provider is usable here.
mock.module("@/lib/taxBuffer/service", { namedExports: { loadTaxBufferSummary: async () => { throw new Error("Tax Buffer cycle") } } })
const summaryRoute = await import("@/app/api/cashplan/summary/route")
const itemsRoute = await import("@/app/api/cashplan/items/route")
const settingsRoute = await import("@/app/api/cashplan/settings/route")
const { default: SettingsPage } = await import("@/app/dashboard/settings/cash-plan/page")
const { loadCashPlanSummary, loadCashPlan, refreshCashPlanInTransaction } = await import("@/lib/cashplan/service")
const { buildCashPlanDashboardStatus } = await import("@/lib/dashboard/cashPlanStatus")
const { loadCashPlanProvider } = await import("@/lib/ownersDigest/service")
const { createCommitment, transitionCommitment } = await import("@/lib/commitguard/service")
const { cashPlanSnapshotFactsHash } = await import("@/lib/cashplan/factAssembler")
const request = (query = "", method = "GET", body: unknown = {}) => new Request(`https://paidsoon.test/api/cashplan/summary${query}`, {
  method, ...(method === "POST" ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
})
const create = () => createCommitment(owner, { name: "Synthetic tax commitment", category: "tax", amountCents: 10_000,
  currency: "aud", frequency: "one_off", nextDueDate: new Date("2026-10-20T00:00:00Z"),
  source: "manual", status: "active", confidence: "confirmed", essentiality: "operational" })

beforeEach(() => {
  mock.timers.reset(); mock.timers.enable({ apis: ["Date"], now })
  user = { id: owner }; allowed = true; entitled = true; enabled = true; hasPlan = true
  cash = 100_000; balanceDate = "2026-10-19"; currency = "aud"; cashRevision = 3; revision = 7
  rows = []; snapshots = []; snapshotWrites = 0; accessReads = 0; financialReads = 0; overrides = []; failSnapshot = false
  coverageRows = []; billRows = []; readsOnly = false; sourceReads.length = 0
})

async function consumers(expected: number): Promise<void> {
  readsOnly = true
  try { await checkConsumers(expected) } finally { readsOnly = false }
}

async function checkConsumers(expected: number): Promise<void> {
  const writesBefore = snapshotWrites
  const summaryResponse = await summaryRoute.GET(request())
  assert.equal(summaryResponse.status, 200)
  const summary = await summaryResponse.json()
  const items = await (await itemsRoute.GET(request())).json()
  const settings = await (await settingsRoute.GET(request())).json()
  const overview = await loadCashPlanSummary(owner, { now })
  const digest = await loadCashPlanProvider(owner, now)
  assert.equal(summary.overview.lowestClosingCashCents, expected)
  assert.deepEqual(items.summary, summary)
  assert.deepEqual(settings.summary, summary)
  assert.deepEqual(overview, summary)
  assert.equal(digest.metrics[0].monetaryValueCents, expected)
  assert.equal(digest.status, "partial")
  assert.equal(digest.dataAsOf?.toISOString(), `${balanceDate}T00:00:00.000Z`)
  const status = buildCashPlanDashboardStatus({ summary: overview, hasPlan: true })
  assert.equal(status.lowestCashLabel, new Intl.NumberFormat("en-AU", { style: "currency", currency: "aud", maximumFractionDigits: 0 }).format(expected / 100))
  const markup = renderToStaticMarkup(await SettingsPage())
  assert.ok(markup.includes(status.lowestCashLabel))
  assert.equal(snapshotWrites, writesBefore, "GET/page/digest calls cannot persist snapshots")
  assert.equal(JSON.stringify(summary).includes(owner), false)
}

async function coveredBill(): Promise<void> {
  await create()
  coverageRows = [{ id: "coverage-a", userId: owner, commitmentId: "commit-a",
    occurrenceDate: new Date("2026-10-20T00:00:00Z"), currency: "aud", coveredCents: 6000,
    targetKind: "imported_bill", importedBillId: "bill-a", taxReserveCategoryId: null }]
  billRows = [{ id: "bill-a", userId: owner, accountingConnectionId: "connection-a", sourceId: "bill-source-a",
    currency: "aud", amountCents: 10_000, dueDate: new Date("2026-10-20T00:00:00Z"), paidDate: null,
    status: "open", rawSourceData: { AmountDue: 60 }, sourceUpdatedAt: now, syncedAt: now,
    accountingConnection: { userId: owner, provider: "xero" } }]
}

test("8.5 commitment-only dated forecast is preliminary across actual routes, overview and digest, with no GET writes", async () => {
  await create(); balanceDate = "2026-10-12"
  await consumers(90_000)
  const result = await loadCashPlan(owner, { now })
  assert.equal(result.quality.state, "preliminary")
  for (const reason of ["commitments_only", "partial_source_coverage", "unreconciled_balance_age"]) {
    assert.ok(result.quality.reasons.includes(reason))
  }
  assert.deepEqual(result.sourceCoverage, { boundary: "commitments_and_explicitly_covered_bills", receivables: "missing", payables: "partial" })
  assert.equal(result.inputs.startingBalance.balanceAsOf, "2026-10-12")
  assert.equal(result.inputs.startingBalance.evaluationDate, "2026-10-19")
  assert.equal(result.forecast?.weeks.length, 13)
  assert.deepEqual(result.facts.map((row) => [row.id, row.amountCents]), [["commitguard:commit-a:2026-10-20", 10_000]])
  assert.ok(!sourceReads.includes("importedBill"), "no broad payable query without explicit coverage")
})

test("8.5 nonzero tax protection and buffer affect free cash but neither becomes opening cash nor a second movement", async () => {
  await create()
  const assembly = await loadCashPlan(owner, { now })
  const tax = buildCommitGuardProtectionFacts({ entitled: true, configuration: { enabled: true, accountingBasis: "cash" },
    taxProtectionCurrency: "aud", categories: [{ id: "tax-a", categoryType: "custom", name: "Synthetic reserve",
      enabled: true, calculationMethod: "fixed_amount", fixedAmountCents: 20_000, manualAmountCents: null,
      ratePercent: null, updatedAt: now }], overrides: [], financialInvoices: [], importedBills: [], now })
  const commitments = rows.map((row) => ({ ...workspaceCommitment, id: row.id, userId: row.userId,
    amountCents: row.amountCents, currency: row.currency, nextDueDate: row.nextDueDate,
    updatedAt: row.updatedAt, frequency: "one_off" as const, category: "software" }))
  const summary = buildCommitGuardSummary({ settings: { ...workspaceSettings, safetyBufferFixedCents: 15_000, safetyBufferCurrency: "aud" },
    calculationRevision: revision, cashContext: assembly.inputs.cashContext,
    commitments, tax, now,
    coverage: { sources: { userId: owner, commitments, bills: [], taxApplicable: true,
      taxCategories: [{ id: "tax-a", userId: owner, enabled: true, currency: "aud", requiredReserveCents: 20_000 }] }, rows: [] } })
  assert.equal(summary.quality.state, "complete")
  assert.equal(summary.freeCash.taxProtectedCashCents, 20_000)
  assert.equal(summary.freeCash.freeCashCents, 55_000)
  assert.equal(assembly.forecast?.weeks[0].openingCashCents, 100_000)
  assert.equal(assembly.bundle.outflows.length, 1)
  assert.equal(assembly.forecast?.weeks[0].outflowCents, 10_000)
  await consumers(90_000)
  assert.ok(!sourceReads.some((table) => /tax|reserve|deposit|invoice|payment/i.test(table)))
})

test("8.5 covered bill and 4000 residual reuse validated v2 facts, never opaque saved weeks", async () => {
  await coveredBill()
  const savedResponse = await summaryRoute.POST(request("", "POST", { planId: "plan-a" }))
  assert.equal(savedResponse.status, 200)
  snapshots[0].weeks = [{ openingCashCents: 999_999_999, outflowCents: 777_777_777, closingCashCents: 888_888_888 }]
  const retained = structuredClone(snapshots)
  await consumers(90_000)
  const result = await loadCashPlan(owner, { now })
  assert.equal(result.reusedSnapshotId, "snapshot-1")
  assert.deepEqual(result.facts.map((row) => [row.id, row.amountCents, row.currency, row.coverageIds]), [
    ["commitguard:commit-a:2026-10-20", 4000, "aud", ["coverage-a"]],
    ["imported_bill:bill-a", 6000, "aud", ["coverage-a"]],
  ])
  assert.equal(result.facts[1].sourceId, "connection-a:xero:bill-source-a")
  assert.deepEqual(result.coverage, [{ coverageId: "coverage-a", occurrenceId: result.facts[0].id,
    billFactId: result.facts[1].id, amountCents: 6000, currency: "aud" }])
  assert.deepEqual(snapshots, retained)
})

for (const variant of ["paid", "absent", "excluded", "currency", "out_of_window", "unsupported_balance"] as const) {
  test(`8.5 ${variant} bill invalidates saved lineage and restores full residual across consumers`, async () => {
    await coveredBill()
    assert.equal((await summaryRoute.POST(request("", "POST"))).status, 200)
    const retained = structuredClone(snapshots)
    if (variant === "paid") { billRows[0].status = "paid"; billRows[0].paidDate = now }
    if (variant === "absent") billRows = []
    if (variant === "excluded") overrides = [{ id: "exclude-bill", planId: "plan-a", entityType: "outflow",
      entityId: "imported_bill:bill-a", amountCents: 0, plannedDate: null, sourceType: "manual", sourceId: null,
      effectiveFrom: null, expiresAt: null, updatedAt: now }]
    if (variant === "currency") billRows[0].currency = "usd"
    if (variant === "out_of_window") billRows[0].dueDate = new Date("2027-02-01T00:00:00Z")
    if (variant === "unsupported_balance") billRows[0].rawSourceData = { Total: 100 }
    await consumers(90_000)
    const result = await loadCashPlan(owner, { now })
    assert.equal(result.reusedSnapshotId, null)
    assert.equal(result.facts.find((fact) => fact.sourceSystem === "commitguard")?.amountCents, 10_000)
    assert.deepEqual(result.coverage, [])
    assert.ok(result.quality.reasons.includes("coverage_review"))
    assert.ok(result.quality.reasons.includes("snapshot_lineage_review"))
    assert.ok(result.facts.filter((fact) => fact.included !== false).every((fact) => fact.currency === "aud"))
    assert.deepEqual(snapshots, retained)
  })
}

for (const variant of ["hash", "anchor", "cash_revision", "commitment_revision", "source_reference"] as const) {
  test(`8.5 v2 ${variant} mismatch cannot authorize persisted source facts`, async () => {
    await coveredBill()
    assert.equal((await summaryRoute.POST(request("", "POST"))).status, 200)
    const saved = snapshots[0]
    if (variant === "hash") saved.inputHash = "invalid"
    if (variant === "anchor") saved.anchorDate = new Date("2026-10-18T00:00:00Z")
    if (variant === "cash_revision") cashRevision++
    if (variant === "commitment_revision") revision++
    if (variant === "source_reference") billRows[0].sourceId = "changed-source-reference"
    const retained = structuredClone(snapshots)
    await consumers(90_000)
    const result = await loadCashPlan(owner, { now })
    assert.equal(result.reusedSnapshotId, null)
    assert.ok(result.quality.reasons.includes("snapshot_lineage_review"))
    assert.deepEqual(snapshots, retained)
  })
}

test("8.5 disable suppresses commitment and linked bill contribution but retains dated manual items, cash and both snapshot generations", async () => {
  await coveredBill()
  overrides = [{ id: "manual-a", planId: "plan-a", entityType: "outflow", entityId: "planned-a",
    amountCents: 2000, plannedDate: new Date("2026-10-21T00:00:00Z"), sourceType: "manual", sourceId: "planned-a",
    effectiveFrom: null, expiresAt: null, updatedAt: now }]
  snapshots.push({ id: "legacy", inputVersion: 1, weeks: [{ closingCashCents: 999_999_999 }] })
  assert.equal((await summaryRoute.POST(request("", "POST"))).status, 200)
  const retained = structuredClone({ snapshots, rows, coverageRows, billRows, overrides })
  enabled = false
  await consumers(98_000)
  assert.ok(!sourceReads.some((table) => ["commitment", "commitmentCoverage", "importedBill"].includes(table)))
  const result = await loadCashPlan(owner, { now })
  assert.ok(result.quality.reasons.includes("commitguard_disabled"))
  assert.equal(result.reusedSnapshotId, null)
  assert.deepEqual(result.facts.map((fact) => [fact.sourceSystem, fact.amountCents]), [["manual", 2000]])
  assert.deepEqual({ snapshots, rows, coverageRows, billRows, overrides }, retained)
  enabled = true
  await consumers(88_000)
})

test("8.5 current Essentials fallback retains core contribution without a new CashPlan feature gate; revoked subscription stops reads", async () => {
  await coveredBill()
  entitled = false
  await consumers(90_000)
  assert.equal(access().effectiveTier, "essentials")
  const beforeReads = financialReads
  allowed = false
  assert.equal((await summaryRoute.GET(request())).status, 403)
  assert.equal((await itemsRoute.GET(request())).status, 403)
  assert.equal((await settingsRoute.GET(request())).status, 403)
  await assert.rejects(loadCashPlanSummary(owner, { now }), { status: 403 })
  await assert.rejects(loadCashPlanProvider(owner, now), { status: 403 })
  assert.equal(financialReads, beforeReads)
  assert.equal(snapshotWrites, 0)
})

test("8.5 foreign commitment cents are excluded with quality, never converted or added to AUD cash", async () => {
  await create()
  rows.push({ ...rows[0], id: "foreign-currency", currency: "usd", amountCents: 777_777 })
  await consumers(90_000)
  const result = await loadCashPlan(owner, { now })
  assert.ok(result.quality.reasons.includes("currency_excluded"))
  assert.ok(result.quality.issues.some((issue) => issue.sourceId === "foreign-currency"))
  assert.equal(result.facts.length, 1)
  assert.equal(result.inputs.startingBalance.currency, "aud")
  assert.equal(rows[1].amountCents, 777_777)
  assert.equal(rows[1].currency, "usd")
})

test("real create/pause mutations change summary/items/settings/overview/digest immediately without GET writes", async () => {
  await consumers(100_000)
  await create()
  await consumers(90_000)
  assert.equal((await loadCashPlan(owner)).facts[0].id, "commitguard:commit-a:2026-10-20")
  assert.equal((await loadCashPlanProvider(owner, now)).signals.length, 1)
  await transitionCommitment(owner, "commit-a", "pause", owner)
  await consumers(100_000)
  assert.equal((await loadCashPlanProvider(owner, now)).signals.length, 0)
})

test("overview page is wired to the same real canonical service, not historical weeks or an empty forecast", () => {
  const source = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8")
  assert.match(source, /await loadCashPlanSummary\(user.id, \{ now \}\)/)
  assert.doesNotMatch(source, /cashPlanSnapshot|buildCashPlanForecast|CashPlanForecastWeek/)
})

test("POST persists v2 canonical metadata, hash and source/settings revisions while retaining historical opaque snapshots", async () => {
  await create()
  snapshots.push({ id: "historical", inputVersion: 1, weeks: [{ closingCashCents: 999_999_999 }] })
  const historical = structuredClone(snapshots[0])
  const response = await summaryRoute.POST(request("", "POST", { planId: "plan-a" }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.summary.overview.lowestClosingCashCents, 90_000)
  assert.equal(snapshotWrites, 1); assert.equal(snapshots.length, 2); assert.deepEqual(snapshots[0], historical)
  const saved = snapshots[1]
  assert.equal(saved.inputVersion, 2); assert.equal(saved.inputCurrency, "aud")
  assert.equal(saved.cashInputRevision, 3); assert.equal(saved.commitmentRevision, 8)
  const canonicalFacts = saved.canonicalFacts as { settingsRevision: string; facts: Array<{ sourceRevision: string }> }
  assert.equal(canonicalFacts.settingsRevision.length, 64); assert.equal(canonicalFacts.facts.length, 1)
  assert.ok(canonicalFacts.facts[0].sourceRevision.startsWith("8:"))
  assert.equal((saved.anchorDate as Date).toISOString(), "2026-10-19T00:00:00.000Z")
  assert.equal(saved.inputHash, cashPlanSnapshotFactsHash({ planId: "plan-a", anchorDate: "2026-10-19", currency: "aud",
    cashInputRevision: 3, commitmentRevision: 8, canonicalFacts: saved.canonicalFacts as never,
    coverage: saved.coverage as never, inputQuality: saved.inputQuality }))
  assert.equal((await loadCashPlan(owner)).reusedSnapshotId, saved.id)
  await transitionCommitment(owner, "commit-a", "pause", owner)
  const after = await loadCashPlanSummary(owner)
  assert.equal(after.overview.lowestClosingCashCents, 100_000)
  assert.equal((await loadCashPlan(owner)).reusedSnapshotId, null)
  assert.equal(snapshotWrites, 1)
})

test("CashPlan remains subscription-only, preserves existing Essentials core access, and module disable suppresses only contribution", async () => {
  await create(); entitled = false
  assert.equal((await summaryRoute.GET(request())).status, 200)
  assert.equal((await summaryRoute.POST(request("", "POST"))).status, 200)
  assert.equal((await loadCashPlanSummary(owner)).overview.lowestClosingCashCents, 90_000)
  assert.equal((snapshots[0].canonicalFacts as { facts: unknown[] }).facts.length, 1)
  entitled = true; enabled = false
  assert.equal((await loadCashPlanSummary(owner)).overview.lowestClosingCashCents, 100_000)
})

for (const mode of ["missing", "stale", "no_plan"] as const) test(`${mode} inputs have null money, no misleading digest risk and no fabricated snapshot`, async () => {
  if (mode === "missing") cash = null
  if (mode === "stale") balanceDate = "2026-10-11"
  if (mode === "no_plan") hasPlan = false
  const summary = await loadCashPlanSummary(owner)
  assert.equal(summary.overview.lowestClosingCashCents, null)
  assert.equal(summary.overview.latestClosingCashCents, null)
  assert.equal(summary.overview.bufferGapCents, null)
  assert.deepEqual(summary.workspace.weeks, [])
  assert.equal(buildCashPlanDashboardStatus({ summary, hasPlan }).lowestCashLabel, "Not available")
  const digest = await loadCashPlanProvider(owner, now)
  assert.deepEqual(digest.metrics, []); assert.deepEqual(digest.signals, [])
  assert.equal((await summaryRoute.POST(request("", "POST"))).status, 200)
  assert.equal(snapshotWrites, 0)
})

test("day-seven dated gross cash is preliminary; day-eight becomes unavailable across active consumers", async () => {
  balanceDate = "2026-10-12"
  const first = await loadCashPlanSummary(owner)
  assert.equal(first.startingBalance.amountCents, 100_000)
  assert.ok(first.quality.reasons.includes("unreconciled_balance_age"))
  mock.timers.reset(); mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-20T01:00:00Z") })
  const next = await (await summaryRoute.GET(request())).json()
  assert.equal(next.overview.lowestClosingCashCents, null)
  assert.ok(next.quality.reasons.includes("stale_balance"))
})

for (const amount of [0, -1000]) test(`signed gross opening cash ${amount}, not protected free cash or tax reserve movement`, async () => {
  cash = amount; await create()
  const summary = await loadCashPlanSummary(owner)
  assert.equal(summary.workspace.weeks[0].openingCashCents, amount)
  assert.equal(summary.overview.lowestClosingCashCents, amount - 10_000)
  assert.equal((await loadCashPlan(owner)).bundle.outflows.length, 1)
  const status = buildCashPlanDashboardStatus({ summary, hasPlan: true })
  assert.ok(status.lowestCashLabel.includes("-"))
})

test("trusted evaluation refresh uses caller transaction and current subscription access, never queued feature authority", async () => {
  await create()
  const result = await refreshCashPlanInTransaction(tx as unknown as PrismaTx, owner, access(), { now })
  assert.equal(result.summary.overview.lowestClosingCashCents, 90_000); assert.equal(snapshotWrites, 1)
  entitled = false
  await refreshCashPlanInTransaction(tx as unknown as PrismaTx, owner, access(), { now })
  assert.equal((snapshots[1].canonicalFacts as { facts: unknown[] }).facts.length, 1)
  allowed = false
  const reads = financialReads
  await assert.rejects(refreshCashPlanInTransaction(tx as unknown as PrismaTx, owner, access(), { now }), { status: 403 })
  assert.equal(financialReads, reads); assert.equal(snapshotWrites, 2)
})

for (const method of ["GET", "POST"] as const) test(`${method} enforces real 401/403 guard and validates safe tenant plan selection`, async () => {
  const invoke = (query = "", body: unknown = {}) => summaryRoute[method](request(query, method, body))
  user = null; assert.equal((await invoke()).status, 401); assert.equal(accessReads, 0); assert.equal(financialReads, 0)
  user = { id: owner }; allowed = false
  assert.equal((await invoke()).status, 403); assert.equal(financialReads, 0)
  allowed = true
  assert.equal((await invoke("?planId=foreign")).status, 404)
  assert.equal((await invoke("?planId=..%2Fforeign")).status, 400)
  assert.equal((await invoke("?cashAvailableCents=100000")).status, 400)
  if (method === "POST") {
    assert.equal((await invoke("?planId=plan-a", { planId: "other" })).status, 400)
    assert.equal((await invoke("", { userId: "foreign" })).status, 400)
    assert.equal((await summaryRoute.POST(new Request("https://paidsoon.test/api/cashplan/summary", { method: "POST", body: "{" }))).status, 400)
  }
  assert.equal(snapshotWrites, 0)
})