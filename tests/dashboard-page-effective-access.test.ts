import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { afterEach, before, beforeEach, mock, test } from "node:test"
import type { ReactElement } from "react"
import type { DashboardProfileFacts } from "@/lib/dashboard/loadDashboardProfile"
import type { TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import { getDashboardEffectiveTier } from "@/lib/dashboard/effectiveTier"
import { getPlanByTier, hasPlanFeature, isFeatureImplemented, type SubscriptionTier } from "@/lib/subscriptionPlans"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { canAccessTaxBuffer } from "@/lib/dashboard/taxBufferAccess"

const now = new Date("2026-10-16T12:00:00Z")
const start = new Date("2026-10-10Z")
const end = new Date("2026-10-20Z")
const publicTiers: SubscriptionTier[] = ["essentials", "business_control", "small_business", "business_pro"]
let profile: DashboardProfileFacts | null
let grant: TrialGrantSnapshot | null
let risks: BillingRiskSnapshot[]
let authenticated = true
let chaseUsage = 8
const calls: { name: string; query: unknown }[] = []
const services: string[] = []
const savedInvoice = {
  id: "invoice-1", status: "pending", currentStage: 0, nextEmailAt: start,
  firstChasedAt: null, clientEmail: "debtor@example.invalid", emailLogs: [],
}
const savedEmail = { fromName: "Saved sender", replyTo: "owner@example.invalid" }
const savedSchedule = { email1DaysAfterDue: 4, email2DaysAfterDue: 11, email3DaysAfterDue: 22 }
const batch = {
  id: "batch-1", fileName: "saved.csv", fileType: "csv", status: "completed", duplicateMode: "skip",
  rowsTotal: 3, rowsValid: 3, rowsWarning: 0, rowsFailed: 0, rowsSkipped: 0,
  createdAt: start, validatedAt: start, completedAt: start,
}
function record<T>(name: string, value: () => T) {
  return async (query: unknown): Promise<T> => { calls.push({ name, query }); return value() }
}
const tx = {
  userProfile: { findUnique: record("profile", () => profile) },
  tenantTrialGrant: { findUnique: record("grant", () => grant) },
  tenantBillingRisk: { findMany: record("risk", () => risks) },
  invoiceConnection: { findFirst: record("connection", () => null), findMany: record("connections", () => []) },
  accountingConnection: { findMany: record("accounting", () => []) },
  trackedInvoice: { count: record("chase-count", () => chaseUsage) },
  promiseToPay: { findMany: record("promises", () => []) },
  promiseEscalationPolicy: { findUnique: record("promise-policy", () => null) },
  emailSettings: { findUnique: record("email", () => savedEmail) },
  schedule: { findUnique: record("schedule", () => savedSchedule) },
  invoiceImportBatch: { findMany: record("invoice-import", () => [batch]) },
  spendImportBatch: { findMany: record("spend-import", () => [batch]) },
  customer: { findMany: record("customers", () => []) },
  aiUsageLog: { count: async (query: { where: { createdAt: { lt?: Date } } }) => {
    calls.push({ name: "ai-count", query }); return query.where.createdAt.lt ? 37 : 1
  } },
  costGuardAlert: { findMany: record("alerts", () => []) },
  runwayGuardSetting: { findFirst: record("runway", () => null) },
  runwayGuardSnapshot: { findFirst: record("runway-snapshot", () => null) },
  taxBufferEvent: { findMany: record("tax-events", () => []) },
  cashPlan: { findFirst: record("cash-plan", () => null) },
  cashPlanSetting: { findFirst: record("cash-settings", () => null) },
  commitGuardCashContext: { findUnique: record("owner-cash", () => null) },
}

type Page = (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>
const pages: Record<string, Page> = {}
const paths = [
  "", "invoices", "resolved", "spendleak", "spendleak/review",
  "settings/connections", "settings/import-export", "settings/templates", "settings/email", "settings/schedule", "settings/account",
]
function propsFor(node: unknown, name: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) { const found = propsFor(child, name); if (found) return found }
    return null
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null
  const element = node as ReactElement<Record<string, unknown>>
  if (typeof element.type === "function" && element.type.name === name) return element.props
  return propsFor(element.props.children, name)
}
async function render(path: string): Promise<ReactElement> {
  return pages[path]({ searchParams: Promise.resolve({}) })
}

before(async () => {
  await mock.module("next/navigation", { namedExports: { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } } })
  await mock.module("next/headers", { namedExports: { headers: async () => new Headers() } })
  await mock.module("@/lib/supabase/server", { namedExports: { getAuthenticatedUser: async () => ({ data: {
    user: authenticated ? { id: "tenant-a", email: "owner@example.invalid" } : null,
  } }) } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, fn: (client: typeof tx) => Promise<unknown>) => {
      assert.equal(userId, "tenant-a"); return fn(tx)
    },
  } })
  // Any accidental use of the old privileged raw-tier AI loader must fail.
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {} } })
  await mock.module("@/lib/billing/billingClientSession", { namedExports: { getBillingClientScope: async () => "session-scope" } })
  await mock.module("@/lib/diagnostics/server", { namedExports: {
    createServerTraceContext: () => ({}), traceEvent: () => {}, warnIfProductionDebugEnabled: () => {},
    traceOperation: async (_ctx: unknown, _input: unknown, work: () => Promise<unknown>) => work(),
  } })
  await mock.module("@/lib/dashboard/loadDashboardOverview", { namedExports: {
    loadDashboardOverview: async (...args: Parameters<typeof import("@/lib/dashboard/loadDashboardContext").loadDashboardContext>) => {
      const { loadDashboardContext } = await import("@/lib/dashboard/loadDashboardContext")
      return { context: await loadDashboardContext(...args), activeInvoices: [], brokenPromiseCountsByDebtor: {},
        escalationThreshold: 2, metrics: { paidInvoices: [], paidCountAllTime: 2, manuallyResolvedCountAllTime: 1, remindersSentToday: 3 },
        disputedInvoiceCount: 0, noContactEmailCustomerCount: 0, importAnomalyCount: 0 }
    },
  } })
  await mock.module("@/lib/dashboard/loadDashboardInvoices", { namedExports: {
    ACTIVE_INVOICE_STATUSES: ["pending"], RESOLVED_INVOICE_STATUSES: ["paid"],
    loadDashboardInvoices: async () => { services.push("invoices"); return [savedInvoice] },
  } })
  await mock.module("@/lib/dashboard/loadSpendLeakDashboard", { namedExports: {
    loadSpendLeakDashboard: async () => {
      services.push("spendleak")
      return { modules: [], findings: [], categorySpendSummaries: {}, selectedSourceCoverage: [],
        hasAccountingConnection: false, latestSyncAt: null, status: { state: "empty", title: "Empty" } }
    },
  } })
  for (const [path, exports] of [
    ["@/lib/marginguard/service", { getMarginSummary: "margin", getMarginTrends: "margin-trends" }],
    ["@/lib/taxBuffer/service", { loadTaxBufferSummary: "tax" }],
    ["@/lib/commitguard/service", { summarizeCommitGuard: "commit" }],
    ["@/lib/ownersDigest/service", { getCurrentOwnersDigest: "digest" }],
  ] as const) {
    await mock.module(path, { namedExports: Object.fromEntries(Object.entries(exports).map(([name, label]) =>
      [name, async () => { services.push(label); return null }])) })
  }
  const components = {
    settings: ["StripeConnectionClient", "AccountingConnectionsClient", "ImportExportSettingsView", "TemplatesClient", "EmailSettingsClient", "ScheduleSettingsClient", "AccountSettingsClient"],
    dashboard: ["InvoiceExportButton", "InvoiceTable", "LockedDashboardPreview", "UpgradeBanner", "OverviewCards", "RecentPayments", "AttentionRequired", "ReminderActivityFunnel", "PaymentTrendChart", "CurrencySummarySection", "AiSummaryCard"],
    "dashboard/spendleak": ["SpendLeakModuleGrid", "SpendLeakCategorySpendSummary", "SpendLeakFindingsTable", "SpendLeakStatusBanner", "SpendLeakExportButton", "SpendClassificationReviewClient"],
  }
  for (const [directory, names] of Object.entries(components)) {
    for (const name of names) await mock.module(`@/components/${directory}/${name}`, {
      namedExports: { [name]: { [name]: () => null }[name] },
    })
  }
  for (const path of paths) {
    const loaded = await import(`../app/dashboard/${path ? `${path}/` : ""}page.tsx`)
    pages[path] = loaded.default
  }
})

beforeEach(() => {
  mock.timers.enable({ apis: ["Date"], now })
  authenticated = true
  chaseUsage = 8
  calls.length = 0
  services.length = 0
  profile = {
    subscriptionTier: "essentials", subscriptionStatus: "canceled", stripeSubscriptionId: "sub-retained",
    trialEndsAt: null, billingAccessVersion: 5, displayName: "Saved name", createdAt: new Date("2026-01-01Z"),
    subscriptionCurrentPeriodStart: new Date("2026-10-01Z"), subscriptionCurrentPeriodEnd: new Date("2026-11-01Z"),
    subscriptionCancelAt: null, pendingDowngradeTier: null,
  }
  grant = { plan: "small_business", startsAt: start, expiresAt: end, revokedAt: null }
  risks = []
})
afterEach(() => mock.timers.reset())

for (const tier of publicTiers) test(`all 11 page models use granted ${tier}, not the inactive raw plan`, async () => {
  grant!.plan = tier
  profile!.subscriptionTier = tier === "essentials" ? "business_pro" : "essentials"
  const plan = getPlanByTier(tier)
  await render("")
  assert.equal(services.includes("spendleak"), canAccessSpendLeak(tier))
  assert.equal(services.includes("margin"), canAccessMarginGuard(tier))
  assert.equal(services.includes("tax"), canAccessTaxBuffer(tier))
  assert.equal(services.includes("digest"), canAccessOwnersDigest(tier))
  assert.equal(services.includes("commit"), hasPlanFeature(tier, "commitguard_core"))
  assert.equal(calls.some((call) => call.name === "runway"), canAccessRunwayGuard(tier))
  const overviewCards = propsFor(await render(""), "OverviewCards")!.cards as { id: string; value: string | number }[]
  assert.ok(overviewCards.length > 0)

  const invoices = await render("invoices")
  const invoiceTable = propsFor(invoices, "InvoiceTable")!
  assert.deepEqual(invoiceTable.invoices, [savedInvoice])
  assert.equal(invoiceTable.showResolved, false)
  assert.deepEqual(invoiceTable.heldAllowance, { usage: 8, allowance: plan.limits.chasedInvoicesPerMonth, resetsAt: end })
  assert.equal(Boolean(propsFor(invoices, "InvoiceExportButton")), hasPlanFeature(tier, "csv_export"))
  const banner = propsFor(invoices, "UpgradeBanner")
  assert.equal(Boolean(banner), tier === "essentials") // 8 persisted first-chases: 80% of 10
  if (banner) {
    assert.equal(banner.usage, 8)
    assert.equal(banner.allowance, plan.limits.chasedInvoicesPerMonth)
    assert.equal(banner.tierName, plan.name)
    assert.deepEqual(banner.periodEnd, end)
    assert.equal(banner.billingAccessVersion, 5)
    assert.equal(banner.billingSessionScope, "session-scope")
  }
  const resolvedTable = propsFor(await render("resolved"), "InvoiceTable")!
  assert.deepEqual(resolvedTable.invoices, [savedInvoice])
  assert.equal(resolvedTable.showResolved, true)
  const spend = await render("spendleak")
  assert.equal(Boolean(propsFor(spend, "SpendLeakModuleGrid")), canAccessSpendLeak(tier))
  assert.equal(Boolean(propsFor(spend, "SpendLeakExportButton")), canAccessSpendLeak(tier) && hasPlanFeature(tier, "csv_export"))
  assert.equal(Boolean(propsFor(await render("spendleak/review"), "SpendClassificationReviewClient")), canAccessSpendLeak(tier))
  const connections = await render("settings/connections")
  assert.equal(propsFor(connections, "StripeConnectionClient")!.maxConnections, plan.limits.connectedInvoiceSources)
  assert.equal(propsFor(connections, "AccountingConnectionsClient")!.hasFeature, hasPlanFeature(tier, "accounting_integrations"))
  const imported = propsFor(await render("settings/import-export"), "ImportExportSettingsView")!
  assert.equal(imported.canExport, hasPlanFeature(tier, "csv_export"))
  assert.equal(imported.canManageMarginGuard, hasPlanFeature(tier, "marginguard_core"))
  assert.equal(imported.canManageCommitGuard, hasPlanFeature(tier, "commitguard_core"))
  assert.equal((imported.initialBatches as typeof batch[])[0].rowsTotal, 3)
  assert.equal((imported.initialSpendBatches as typeof batch[])[0].id, "batch-1")
  const templates = propsFor(await render("settings/templates"), "TemplatesClient")!
  assert.equal(templates.canRewrite, hasPlanFeature(tier, "ai_rewrite"))
  assert.equal((templates.data as Record<string, unknown>).tier, tier)
  assert.equal((templates.data as Record<string, unknown>).canCustomize, hasPlanFeature(tier, "custom_reminder_templates"))
  assert.equal(templates.initialRemainingMonthlyCredits, tier === "essentials" ? null : ({ business_control: 120, small_business: 500, business_pro: 1000 }[tier as "business_control" | "small_business" | "business_pro"] - 37))
  const email = propsFor(await render("settings/email"), "EmailSettingsClient")!
  assert.equal(email.canUseCustomReplyTo, hasPlanFeature(tier, "custom_reply_to"))
  assert.equal(email.canUseCustomSenderName, hasPlanFeature(tier, "custom_sender_name"))
  assert.equal(email.canUseVerifiedDomain, hasPlanFeature(tier, "verified_from_domain"))
  assert.deepEqual(email.settings, savedEmail)
  const schedule = propsFor(await render("settings/schedule"), "ScheduleSettingsClient")!
  assert.equal(schedule.canCustomizeSequence, hasPlanFeature(tier, "email_reminder_sequence"))
  assert.deepEqual(schedule.schedule, savedSchedule)
  const account = propsFor(await render("settings/account"), "AccountSettingsClient")!
  assert.equal(account.tier, tier)
  assert.equal(account.status, "canceled") // billing status is not fabricated
  assert.equal(account.displayName, "Saved name")
})

for (const state of ["expired", "revoked", "future-grant", "unknown-status", "unknown-tier", "missing", "unpaid", "risk"]) {
  test(`every scoped page denies ${state} before catalog fallback or gated controls`, async () => {
    if (state === "expired") grant!.expiresAt = now
    if (state === "revoked") grant!.revokedAt = now
    if (state === "future-grant") grant!.startsAt = new Date(now.getTime() + 1000)
    if (state === "unknown-status") profile!.subscriptionStatus = "future-status"
    if (state === "unknown-tier") { profile!.subscriptionStatus = "active"; profile!.subscriptionTier = "future-tier"; grant = null }
    if (state === "missing") profile = null
    if (state === "unpaid") profile!.subscriptionStatus = "unpaid"
    if (state === "risk") risks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
    for (const path of paths) await assert.rejects(render(path), /REDIRECT:\/dashboard\/settings\/subscription/, path)
    assert.deepEqual(services, [])
    assert.equal(calls.some((call) => ["ai-count", "connections", "email", "schedule", "invoice-import", "spend-import"].includes(call.name)), false)
  })
}

for (const status of ["active", "past_due", "trialing"]) test(`${status} keeps the real Stripe plan over a different grant`, async () => {
  profile!.subscriptionStatus = status
  profile!.subscriptionTier = "business_control"
  grant!.plan = "business_pro"
  const account = propsFor(await render("settings/account"), "AccountSettingsClient")!
  assert.equal(account.tier, "business_control")
  assert.equal(account.status, status)
  const templates = propsFor(await render("settings/templates"), "TemplatesClient")!
  assert.equal(templates.initialRemainingMonthlyCredits, 83)
  const email = propsFor(await render("settings/email"), "EmailSettingsClient")!
  assert.equal(email.canUseVerifiedDomain, false)
  const chase = calls.find((call) => call.name === "ai-count")!.query
  assert.deepEqual(chase, { where: { userId: "tenant-a", feature: "ai_rewrite", createdAt: {
    gte: profile!.subscriptionCurrentPeriodStart, lt: profile!.subscriptionCurrentPeriodEnd,
  } } })
})

test("grant extension/plan change retains first-chase consumption and AI calendar/billing window", async () => {
  grant!.plan = "business_control"
  const first = propsFor(await render("settings/templates"), "TemplatesClient")!
  assert.equal(first.initialRemainingMonthlyCredits, 83)
  await render("invoices")
  const firstChase = calls.find((call) => call.name === "chase-count")!.query
  assert.deepEqual(firstChase, { where: { userId: "tenant-a", firstChasedAt: { gte: start, lt: end } } })
  calls.length = 0
  grant!.expiresAt = new Date("2026-10-30Z")
  grant!.plan = "business_pro"
  const second = propsFor(await render("settings/templates"), "TemplatesClient")!
  assert.equal(second.initialRemainingMonthlyCredits, 963)
  await render("invoices")
  assert.deepEqual(calls.find((call) => call.name === "chase-count")!.query, {
    where: { userId: "tenant-a", firstChasedAt: { gte: start, lt: grant!.expiresAt } },
  })
  assert.deepEqual(calls.find((call) => call.name === "ai-count")!.query, { where: {
    userId: "tenant-a", feature: "ai_rewrite", createdAt: { gte: profile!.subscriptionCurrentPeriodStart, lt: profile!.subscriptionCurrentPeriodEnd },
  } })
  assert.deepEqual(grant!.startsAt, start)
})

test("grant-only AI credits retain the Melbourne month across extension and plan changes", async () => {
  profile!.stripeSubscriptionId = null
  profile!.subscriptionCurrentPeriodStart = null
  profile!.subscriptionCurrentPeriodEnd = null
  grant!.plan = "business_control"
  const first = propsFor(await render("settings/templates"), "TemplatesClient")!
  assert.equal(first.initialRemainingMonthlyCredits, 83)
  const monthlyQuery = { where: {
    userId: "tenant-a", feature: "ai_rewrite", createdAt: {
      gte: new Date("2026-09-30T14:00:00Z"), lt: new Date("2026-10-31T13:00:00Z"),
    },
  } }
  assert.deepEqual(calls.find((call) => call.name === "ai-count")!.query, monthlyQuery)
  calls.length = 0
  grant!.expiresAt = new Date("2026-11-20Z")
  grant!.plan = "business_pro"
  const second = propsFor(await render("settings/templates"), "TemplatesClient")!
  assert.equal(second.initialRemainingMonthlyCredits, 963)
  assert.deepEqual(calls.find((call) => call.name === "ai-count")!.query, monthlyQuery)
})

test("capacity affects held-invoice presentation without resetting consumption or removing resolved data", async () => {
  grant!.plan = "essentials"
  chaseUsage = 10
  const invoices = await render("invoices")
  const table = propsFor(invoices, "InvoiceTable")!
  assert.deepEqual(table.heldInvoiceIds, new Set([savedInvoice.id]))
  assert.deepEqual(table.heldAllowance, { usage: 10, allowance: 10, resetsAt: end })
  const banner = propsFor(invoices, "UpgradeBanner")!
  assert.equal(banner.atCapacity, true)
  assert.equal(banner.usage, 10)
  const resolved = propsFor(await render("resolved"), "InvoiceTable")!
  assert.deepEqual(resolved.invoices, [savedInvoice])
  assert.equal(resolved.showResolved, true)
})

test("effective grants preserve separate catalog readiness and existing module rollout gates", async () => {
  grant!.plan = "business_pro"
  assert.equal(getPlanByTier("business_pro").features.team_seats, true)
  assert.equal(isFeatureImplemented("team_seats"), false)
  assert.equal(canAccessSpendLeak("business_pro"), false)
  assert.equal(propsFor(await render("spendleak"), "SpendLeakModuleGrid"), null)
  const connections = await render("settings/connections")
  assert.equal(propsFor(connections, "StripeConnectionClient")!.maxConnections,
    getPlanByTier("business_pro").limits.connectedInvoiceSources)
})

test("repeat renders observe expiry and revocation rather than cached parent/layout access", async () => {
  await render("settings/email")
  mock.timers.setTime(end.getTime())
  await assert.rejects(render("settings/email"), /REDIRECT/)
  mock.timers.setTime(now.getTime())
  grant!.revokedAt = now
  await assert.rejects(render("settings/email"), /REDIRECT/)
  assert.equal(calls.filter((call) => call.name === "profile").length, 3)
  assert.equal(calls.filter((call) => call.name === "grant").length, 3)
})

test("all scoped pages authenticate before reading tenant facts", async () => {
  authenticated = false
  for (const path of paths) await assert.rejects(render(path), /REDIRECT:\/sign-in/)
  assert.deepEqual(calls, [])
})

test("scoped raw-tier inventory remains empty, while billing pages stay outside this conversion", async () => {
  for (const path of paths) {
    const source = await readFile(new URL(`../app/dashboard/${path ? `${path}/` : ""}page.tsx`, import.meta.url), "utf8")
    assert.doesNotMatch(source, /subscriptionTier|normalizeSubscriptionTier/, path)
    assert.match(source, /getDashboardEffectiveTier/, path)
  }
  assert.equal(getDashboardEffectiveTier(null), null)
  assert.equal(getDashboardEffectiveTier({}), null)
})