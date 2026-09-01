/**
 * scripts/verify-seed.ts
 *
 * Lightweight validation for the canonical financial seed data.
 */

import "./_loadEnv"

import { prismaAdmin } from "../lib/db/admin"
import { getInvoiceLimitForTier, resolveAllowancePeriod } from "../lib/billing"
import { buildSpendLeakModuleSummaries, isSpendLeakDataStale } from "../lib/dashboard/spendleakPresentation"
import { isUndeliverableAddress } from "../lib/email/deliveryGuard"
import { isDemoOrganisationId } from "../lib/providers/accounting/demoGuard"
import { hasPlanFeature } from "../lib/subscriptionPlans"
import { SEED_TIME_ZONE, zonedDateParts } from "./seed/referenceDate"

const BOOKKEEPER_EMAIL = "bookkeeper@coastline-demo.test"
const PRIMARY_EMAIL = "owner@coastline-demo.test"
const SECOND_TENANT_EMAIL = "owner@yarravalley-demo.test"
const SEED_EMAILS = [BOOKKEEPER_EMAIL, PRIMARY_EMAIL, SECOND_TENANT_EMAIL] as const

const VALID_INVOICE_STATUSES = new Set([
  "pending",
  "paid",
  "paused",
  "snoozed",
  "sequence_complete",
  "manually_resolved",
])
const VALID_PROMISE_STATUSES = new Set(["active", "kept", "broken", "superseded"])
const VALID_ARRANGEMENT_STATUSES = new Set(["active", "broken", "fulfilled", "expired", "cancelled"])
const VALID_ARRANGEMENT_TYPES = new Set(["full_payment", "partial_payment", "instalment_plan"])
const EXPECTED_SPEND_FINDING_TYPES = new Set([
  "recurring_spend",
  "duplicate_spend",
  "renewal",
  "supplier_concentration",
  "cash_pressure",
])

let passed = 0
let failed = 0

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n${title}`)
}

async function resolveSeedUserIds(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return map

  const { createClient } = await import("@supabase/supabase-js")
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const wanted = new Set<string>(SEED_EMAILS)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) break
    for (const user of data.users) {
      const email = user.email?.toLowerCase()
      if (email && wanted.has(email)) map.set(email, user.id)
    }
    if (data.users.length < 1000 || map.size === wanted.size) break
  }

  return map
}

function flattenInvoice(row: {
  id: string
  userId: string
  status: string
  currentStage: number
  nextEmailAt: Date | null
  snoozedUntil: Date | null
  firstChasedAt: Date | null
  providerMetadata: unknown
  financialInvoice: {
    id: string
    sourceId: string
    amountDueCents: number
    currency: string
    dueDate: Date
    paymentUrl: string | null
    contact: { email: string | null; name: string | null } | null
  }
  emailLogs: Array<{ id: string; stage: number; resendMessageId: string | null }>
}) {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    currentStage: row.currentStage,
    nextEmailAt: row.nextEmailAt,
    snoozedUntil: row.snoozedUntil,
    firstChasedAt: row.firstChasedAt,
    externalId: row.financialInvoice.sourceId,
    amountDue: row.financialInvoice.amountDueCents,
    currency: row.financialInvoice.currency,
    dueDate: row.financialInvoice.dueDate,
    clientEmail: row.financialInvoice.contact?.email ?? "",
    clientName: row.financialInvoice.contact?.name ?? "",
    providerMetadata: row.providerMetadata,
    emailLogs: row.emailLogs,
  }
}

async function main(): Promise<void> {
  console.log("=== PaidSoon Seed Verification ===")
  console.log(`Run at: ${new Date().toISOString()}`)

  const emailToUserId = await resolveSeedUserIds()
  const seedUserIds = [...new Set(emailToUserId.values())]
  if (seedUserIds.length === 0) {
    console.error("\nERROR: could not resolve seed auth users (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY unset?).")
    process.exit(1)
  }

  const primaryUserId = emailToUserId.get(PRIMARY_EMAIL)
  const secondTenantUserId = emailToUserId.get(SECOND_TENANT_EMAIL)

  section("Accounts and entitlements")
  const profiles = await prismaAdmin.userProfile.findMany({ where: { userId: { in: seedUserIds } } })
  check("All seed accounts have a profile", profiles.length === 3, `found ${profiles.length}`)

  const tiers = new Set(profiles.map((p) => p.subscriptionTier))
  check("A 'small_business' tier account exists", tiers.has("small_business"))
  check("A 'starter' tier account exists", tiers.has("starter"))

  const primaryProfile = profiles.find((p) => p.userId === primaryUserId)
  const starterProfile = profiles.find((p) => p.subscriptionTier === "starter")
  check("Primary account is on the Small Business tier", primaryProfile?.subscriptionTier === "small_business")
  check("Primary account can use accounting integrations", hasPlanFeature(primaryProfile?.subscriptionTier, "accounting_integrations"))
  check("Starter account can use core features", hasPlanFeature(starterProfile?.subscriptionTier, "accounting_integrations") && hasPlanFeature(starterProfile?.subscriptionTier, "promise_to_pay_tracking"))

  const schedules = await prismaAdmin.schedule.findMany({ where: { userId: { in: seedUserIds } } })
  check("Every seed account has a reminder schedule", schedules.length === 3, `found ${schedules.length}`)

  section("Invoices, balances and currency")
  const invoices = await prismaAdmin.trackedInvoice.findMany({
    where: { userId: { in: seedUserIds } },
    include: {
      financialInvoice: { include: { contact: true } },
      emailLogs: { select: { id: true, stage: true, resendMessageId: true } },
    },
  })
  const invoiceFacts = invoices.map(flattenInvoice)

  check("At least 30 invoices seeded", invoiceFacts.length >= 30, `found ${invoiceFacts.length}`)
  check("Every invoice is in AUD", invoiceFacts.every((i) => i.currency === "aud"))
  check("Every invoice has a positive balance in cents", invoiceFacts.every((i) => i.amountDue > 0))
  check("Every invoice amount is an integer number of cents", invoiceFacts.every((i) => Number.isInteger(i.amountDue)))
  check("Every invoice status is a known status", invoiceFacts.every((i) => VALID_INVOICE_STATUSES.has(i.status)))

  const withGst = invoiceFacts.filter((i) => {
    const metadata = (i.providerMetadata ?? {}) as Record<string, unknown>
    const gst = metadata.gst as { exGstCents?: number; gstCents?: number; incGstCents?: number } | undefined
    return gst != null && typeof gst.exGstCents === "number" && typeof gst.gstCents === "number" && gst.exGstCents + gst.gstCents === i.amountDue && gst.incGstCents === i.amountDue
  })
  check("GST breakdown reconciles to the invoice total", withGst.length === invoiceFacts.length, `${withGst.length}/${invoiceFacts.length} reconcile`)

  const withLines = invoiceFacts.filter((i) => {
    const metadata = (i.providerMetadata ?? {}) as Record<string, unknown>
    return Array.isArray(metadata.lineItems) && (metadata.lineItems as unknown[]).length > 0
  })
  check("Every invoice has line items", withLines.length === invoiceFacts.length)

  const paidInvoices = invoiceFacts.filter((i) => i.status === "paid")
  check("Fully paid invoices exist", paidInvoices.length >= 1)
  check("No paid invoice still has a reminder scheduled", paidInvoices.every((i) => i.nextEmailAt === null))

  const highValue = invoiceFacts.filter((i) => i.amountDue >= 1_000_000)
  check("A high-value invoice exists", highValue.length >= 1)

  section("Ageing buckets")
  const now = new Date()
  const dayMs = 86_400_000
  const outstanding = invoiceFacts.filter((i) => i.userId === primaryUserId && !["paid", "manually_resolved"].includes(i.status))
  const calendarDay = (instant: Date): number => {
    const { year, month, day } = zonedDateParts(instant, SEED_TIME_ZONE)
    return Math.floor(Date.UTC(year, month - 1, day) / dayMs)
  }
  const today = calendarDay(now)
  const ageInDays = (due: Date) => today - calendarDay(due)
  const bucket = (lo: number, hi: number) => outstanding.filter((i) => {
    const age = ageInDays(i.dueDate)
    return age >= lo && age <= hi
  })

  check("Ageing: invoices not yet due", outstanding.some((i) => ageInDays(i.dueDate) < 0))
  check("Ageing: due today / 1–7 days overdue", bucket(0, 7).length >= 2)
  check("Ageing: 8–30 days overdue", bucket(8, 30).length >= 2)
  check("Ageing: 31–60 days overdue", bucket(31, 60).length >= 1)
  check("Ageing: 60+ days overdue", bucket(61, 100_000).length >= 1)

  section("Reminder history and state-machine consistency")
  const emailLogs = await prismaAdmin.emailLog.findMany({ where: { trackedInvoice: { userId: { in: seedUserIds } } } })
  check("At least 20 reminder email logs seeded", emailLogs.length >= 20, `found ${emailLogs.length}`)
  check("Every email log stage is 1, 2 or 3", emailLogs.every((l) => [1, 2, 3].includes(l.stage)))

  const logsByInvoice = new Map<string, typeof emailLogs>()
  for (const log of emailLogs) {
    const list = logsByInvoice.get(log.trackedInvoiceId) ?? []
    list.push(log)
    logsByInvoice.set(log.trackedInvoiceId, list)
  }

  const stageMismatches = invoiceFacts.filter((i) => (logsByInvoice.get(i.id)?.length ?? 0) !== i.currentStage)
  check("currentStage matches reminders on every invoice", stageMismatches.length === 0, stageMismatches.map((i) => i.externalId).join(", "))
  check("No invoice has a currentStage above 3", invoiceFacts.every((i) => i.currentStage >= 0 && i.currentStage <= 3))

  const dueReminders = invoiceFacts.filter((i) => i.status === "pending" && i.nextEmailAt !== null && i.nextEmailAt <= now && i.currentStage < 3)
  check("At least one reminder is due", dueReminders.length >= 1)
  const scheduled = invoiceFacts.filter((i) => i.nextEmailAt !== null && i.nextEmailAt > now)
  check("At least one invoice has future reminder scheduled", scheduled.length >= 1)

  section("Promises to pay and arrangements")
  const promises = await prismaAdmin.promiseToPay.findMany({
    where: { userId: { in: seedUserIds } },
    include: { trackedInvoice: { select: { id: true, userId: true, status: true } } },
  })
  check("At least 4 promises to pay seeded", promises.length >= 4, `found ${promises.length}`)
  check("Every promise status is valid", promises.every((p) => VALID_PROMISE_STATUSES.has(p.status)))

  const arrangements = await prismaAdmin.arrangement.findMany({
    where: { userId: { in: seedUserIds } },
    include: { coverages: true },
  })
  check("At least 4 arrangements seeded", arrangements.length >= 4, `found ${arrangements.length}`)
  check("Every arrangement status is valid", arrangements.every((a) => VALID_ARRANGEMENT_STATUSES.has(a.status)))
  check("Every arrangement type is valid", arrangements.every((a) => VALID_ARRANGEMENT_TYPES.has(a.arrangementType)))
  check("Every arrangement covers at least one invoice", arrangements.every((a) => a.coverages.length >= 1))

  section("Accounting integrations")
  const accountingConnections = await prismaAdmin.accountingConnection.findMany({
    where: { userId: { in: seedUserIds } },
    include: { syncRuns: true, financialInvoices: true, financialContacts: true },
  })
  check("At least 2 accounting connections seeded", accountingConnections.length >= 2)
  check("Both Xero and MYOB are represented", ["xero", "myob"].every((p) => accountingConnections.some((c) => c.provider === p)))
  check("A connection with a successful sync history exists", accountingConnections.some((c) => c.syncRuns.some((r) => r.status === "success")))
  check("Imported invoices are mapped to their source system", accountingConnections.reduce((n, c) => n + c.financialInvoices.length, 0) >= 6)
  check("Imported customers are mapped to their source system", accountingConnections.reduce((n, c) => n + c.financialContacts.length, 0) >= 6)

  section("SpendLeak foundation data")
  const spendBills = await prismaAdmin.importedBill.findMany({ where: { userId: { in: seedUserIds } } })
  const spendBankTransactions = await prismaAdmin.importedBankTransaction.findMany({
    where: { userId: { in: seedUserIds } },
  })
  const spendSuppliers = await prismaAdmin.supplierProfile.findMany({
    where: { userId: { in: seedUserIds } },
  })
  const spendInsights = await prismaAdmin.spendInsight.findMany({
    where: { userId: { in: seedUserIds } },
    orderBy: { detectedAt: "desc" },
  })
  const cashSnapshots = await prismaAdmin.cashForecastSnapshot.findMany({
    where: { userId: { in: seedUserIds } },
  })

  check("SpendLeak imported bills are present", spendBills.length >= 8, `found ${spendBills.length}`)
  check(
    "SpendLeak imported bank transactions are present",
    spendBankTransactions.length >= 5,
    `found ${spendBankTransactions.length}`,
  )
  check("SpendLeak supplier profiles are present", spendSuppliers.length >= 5, `found ${spendSuppliers.length}`)
  check("SpendLeak findings are present", spendInsights.length >= 6, `found ${spendInsights.length}`)
  check("SpendLeak cash snapshots are present", cashSnapshots.length >= 2, `found ${cashSnapshots.length}`)

  check(
    "SpendLeak imported bill currency is uppercase AUD",
    spendBills.every((bill) => bill.currency === "AUD"),
  )
  check(
    "SpendLeak finding severities are valid",
    spendInsights.every((insight) => ["low", "medium", "high"].includes(insight.severity)),
  )
  check(
    "SpendLeak finding states are valid",
    spendInsights.every((insight) => ["open", "resolved", "dismissed", "snoozed"].includes(insight.state)),
  )

  const findingTypes = new Set(spendInsights.map((insight) => insight.findingType))
  check(
    "SpendLeak findings include all expected signal types",
    [...EXPECTED_SPEND_FINDING_TYPES].every((type) => findingTypes.has(type)),
    [...EXPECTED_SPEND_FINDING_TYPES].filter((type) => !findingTypes.has(type)).join(", "),
  )

  const moduleSummaries = buildSpendLeakModuleSummaries(spendInsights)
  check("SpendLeak module summaries produce five dashboard modules", moduleSummaries.length === 5)
  check(
    "At least one SpendLeak dashboard module has red severity",
    moduleSummaries.some((module) => module.severity === "red"),
  )

  const latestSyncByUser = new Map<string, Date>()
  for (const bill of spendBills) {
    const current = latestSyncByUser.get(bill.userId)
    if (!current || bill.syncedAt > current) latestSyncByUser.set(bill.userId, bill.syncedAt)
  }
  const primarySpendSync = primaryUserId ? latestSyncByUser.get(primaryUserId) ?? null : null
  const secondSpendSync = secondTenantUserId ? latestSyncByUser.get(secondTenantUserId) ?? null : null
  check(
    "Primary tenant SpendLeak data is fresh",
    primarySpendSync instanceof Date && !isSpendLeakDataStale(primarySpendSync, now),
  )
  check(
    "Second tenant SpendLeak data is stale",
    secondSpendSync instanceof Date && isSpendLeakDataStale(secondSpendSync, now),
  )

  section("Tenant isolation")
  const primaryInvoiceIds = new Set(invoiceFacts.filter((i) => i.userId === primaryUserId).map((i) => i.id))
  const secondInvoiceIds = new Set(invoiceFacts.filter((i) => i.userId === secondTenantUserId).map((i) => i.id))
  check("The second tenant has its own invoices", secondInvoiceIds.size >= 1, `${secondInvoiceIds.size}`)
  check("No invoice belongs to both tenants", [...secondInvoiceIds].every((id) => !primaryInvoiceIds.has(id)))

  const crossTenantClients = [...new Set(invoiceFacts.filter((i) => i.userId === secondTenantUserId).map((i) => i.clientEmail))].filter((email) => invoiceFacts.some((i) => i.userId === primaryUserId && i.clientEmail === email))
  check("The two tenants share no customer records", crossTenantClients.length === 0, crossTenantClients.join(", "))

  const crossTenantConnections = accountingConnections.filter((c) => c.userId === secondTenantUserId && c.financialInvoices.some((invoice) => primaryInvoiceIds.has(invoice.id)))
  check("No financial invoice crosses a tenant boundary", crossTenantConnections.length === 0)

  section("Outbound-activity safety")
  const deliverableClients = invoiceFacts.filter((i) => !isUndeliverableAddress(i.clientEmail))
  check("No seeded invoice has a deliverable client email address", deliverableClients.length === 0, deliverableClients.map((i) => i.clientEmail).join(", "))

  const emailSettings = await prismaAdmin.emailSettings.findMany({ where: { userId: { in: seedUserIds } } })
  check("No seeded sender address is deliverable", emailSettings.every((s) => isUndeliverableAddress(s.fromEmail) && isUndeliverableAddress(s.replyTo)))
  check("No seeded email log used a deliverable from-address", emailLogs.every((l) => l.fromAddress.includes(".test")))

  const syncableConnections = accountingConnections.filter((c) => ["active", "disconnected", "error"].includes(c.status))
  check("Every syncable accounting connection is demo-guarded", syncableConnections.every((c) => isDemoOrganisationId(c.organisationId)), syncableConnections.filter((c) => !isDemoOrganisationId(c.organisationId)).map((c) => c.organisationId).join(", "))

  console.log(`\n${"─".repeat(56)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.error("\nSome seed checks FAILED. Re-run `npm run db:seed` and investigate.")
    process.exit(1)
  }
  console.log("\nAll seed checks PASSED. The development database is ready for testing.")
}

main()
  .catch((err) => {
    console.error("Verification failed:", err)
    process.exit(1)
  })
  .finally(() => prismaAdmin.$disconnect())
