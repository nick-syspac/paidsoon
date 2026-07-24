/**
 * scripts/verify-seed.ts
 *
 * Read-only verification that the development seed is present, internally
 * consistent, and safe. Run after `npm run db:seed`.
 *
 * Checks cover:
 *   - Accounts, tiers and entitlement shape
 *   - Invoice balances, currency and GST metadata
 *   - Ageing buckets (not due / 1–7 / 8–30 / 31–60 / 60+)
 *   - Invoice ↔ reminder status consistency (no impossible combinations)
 *   - Promise-to-pay, arrangement, dispute and pause behaviour
 *   - Tenant isolation between the seeded accounts
 *   - That no seeded record can trigger real email or accounting activity
 *
 * Usage:
 *   npm run verify-seed
 *
 * Exits 0 if all checks pass, 1 if any fail.
 */

import "./_loadEnv"

import { prismaAdmin } from "../lib/db/admin"
import { isUndeliverableAddress } from "../lib/email/deliveryGuard"
import { isDemoOrganisationId } from "../lib/providers/accounting/demoGuard"
import { hasPlanFeature } from "../lib/subscriptionPlans"
import { SEED_TIME_ZONE, zonedDateParts } from "./seed/referenceDate"

const SEED_EMAILS = [
  "owner@coastline-demo.test",
  "bookkeeper@coastline-demo.test",
  "owner@yarravalley-demo.test",
] as const

const PRIMARY_EMAIL = "owner@coastline-demo.test"
const SECOND_TENANT_EMAIL = "owner@yarravalley-demo.test"

const VALID_INVOICE_STATUSES = new Set([
  "pending",
  "paid",
  "paused",
  "snoozed",
  "sequence_complete",
  "manually_resolved",
])

const VALID_PROMISE_STATUSES = new Set(["active", "kept", "broken", "superseded"])
const VALID_ARRANGEMENT_STATUSES = new Set([
  "active",
  "broken",
  "fulfilled",
  "expired",
  "cancelled",
])
const VALID_ARRANGEMENT_TYPES = new Set([
  "full_payment",
  "partial_payment",
  "instalment_plan",
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

/** Resolve seed auth user ids by email, so verification does not hardcode UUIDs. */
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

async function main(): Promise<void> {
  console.log("=== PaidSoon Seed Verification ===")
  console.log(`Run at: ${new Date().toISOString()}`)

  const emailToUserId = await resolveSeedUserIds()

  // Fall back to matching profiles by display name if Supabase admin is absent.
  const seedUserIds = [...emailToUserId.values()]
  if (seedUserIds.length === 0) {
    console.error(
      "\nERROR: could not resolve seed auth users (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY unset?).",
    )
    process.exit(1)
  }

  const primaryUserId = emailToUserId.get(PRIMARY_EMAIL)
  const secondTenantUserId = emailToUserId.get(SECOND_TENANT_EMAIL)

  // -------------------------------------------------------------------------
  section("Accounts and entitlements")
  // -------------------------------------------------------------------------
  const profiles = await prismaAdmin.userProfile.findMany({
    where: { userId: { in: seedUserIds } },
  })
  check("All three seed accounts have a user profile", profiles.length === 3, `found ${profiles.length}`)

  const tiers = new Set(profiles.map((p) => p.subscriptionTier))
  check("A 'business' tier account exists", tiers.has("business"))
  check("A 'starter' tier account exists", tiers.has("starter"))

  const primaryProfile = profiles.find((p) => p.userId === primaryUserId)
  check("Primary account is on the Business tier", primaryProfile?.subscriptionTier === "business")
  check(
    "Primary account can use accounting integrations",
    hasPlanFeature(primaryProfile?.subscriptionTier, "accounting_integrations"),
  )
  check(
    "Primary account can use promise-to-pay tracking",
    hasPlanFeature(primaryProfile?.subscriptionTier, "promise_to_pay_tracking"),
  )

  const starterProfile = profiles.find((p) => p.subscriptionTier === "starter")
  check(
    "Starter account is correctly denied accounting integrations",
    !hasPlanFeature(starterProfile?.subscriptionTier, "accounting_integrations"),
  )

  const schedules = await prismaAdmin.schedule.findMany({ where: { userId: { in: seedUserIds } } })
  check("Every seed account has a reminder schedule", schedules.length === 3, `found ${schedules.length}`)

  // -------------------------------------------------------------------------
  section("Invoices, balances and currency")
  // -------------------------------------------------------------------------
  const invoices = await prismaAdmin.trackedInvoice.findMany({
    where: { userId: { in: seedUserIds } },
  })
  check("At least 30 invoices seeded", invoices.length >= 30, `found ${invoices.length}`)
  check("Every invoice is in AUD", invoices.every((i) => i.currency === "aud"))
  check("Every invoice has a positive balance in cents", invoices.every((i) => i.amountDue > 0))
  check(
    "Every invoice amount is an integer number of cents",
    invoices.every((i) => Number.isInteger(i.amountDue)),
  )
  check("Every invoice status is a known status", invoices.every((i) => VALID_INVOICE_STATUSES.has(i.status)))

  const withGst = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    const gst = meta?.gst as { exGstCents?: number; gstCents?: number; incGstCents?: number } | undefined
    return (
      gst != null &&
      typeof gst.exGstCents === "number" &&
      typeof gst.gstCents === "number" &&
      gst.exGstCents + gst.gstCents === i.amountDue &&
      gst.incGstCents === i.amountDue
    )
  })
  check(
    "GST breakdown reconciles to the invoice total on every invoice",
    withGst.length === invoices.length,
    `${withGst.length}/${invoices.length} reconcile`,
  )

  const withLines = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return Array.isArray(meta?.lineItems) && (meta.lineItems as unknown[]).length > 0
  })
  check("Every invoice has line items", withLines.length === invoices.length)

  const partiallyPaid = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    const original = meta?.originalTotalIncGstCents as number | undefined
    const paid = meta?.amountPaidCents as number | undefined
    return original != null && paid != null && original - paid === i.amountDue
  })
  check("A partially paid invoice exists and its balance reconciles", partiallyPaid.length >= 1)

  const multiPayment = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return Array.isArray(meta?.payments) && (meta.payments as unknown[]).length > 1
  })
  check("An invoice with multiple payments exists", multiPayment.length >= 1)

  const paidInvoices = invoices.filter((i) => i.status === "paid")
  check("Fully paid invoices exist", paidInvoices.length >= 1)
  check(
    "No paid invoice still has a reminder scheduled",
    paidInvoices.every((i) => i.nextEmailAt === null),
  )

  const highValue = invoices.filter((i) => i.amountDue >= 1_000_000)
  check("A high-value invoice (>= A$10,000) exists", highValue.length >= 1)

  // -------------------------------------------------------------------------
  section("Ageing buckets (primary account)")
  // -------------------------------------------------------------------------
  const now = new Date()
  const dayMs = 86_400_000
  const outstanding = invoices.filter(
    (i) => i.userId === primaryUserId && !["paid", "manually_resolved"].includes(i.status),
  )

  // Age is measured in whole calendar days in the application timezone, not in
  // elapsed milliseconds — otherwise an invoice due at 23:59 "today" reads as
  // -1 days old when the check runs in the morning.
  const calendarDay = (instant: Date): number => {
    const { year, month, day } = zonedDateParts(instant, SEED_TIME_ZONE)
    return Math.floor(Date.UTC(year, month - 1, day) / dayMs)
  }
  const today = calendarDay(now)
  const ageInDays = (due: Date) => today - calendarDay(due)
  const bucket = (lo: number, hi: number) =>
    outstanding.filter((i) => {
      const age = ageInDays(i.dueDate)
      return age >= lo && age <= hi
    })

  const notYetDue = outstanding.filter((i) => ageInDays(i.dueDate) < 0)
  check("Ageing: invoices not yet due", notYetDue.length >= 1, `${notYetDue.length}`)
  check("Ageing: due today / 1–7 days overdue", bucket(0, 7).length >= 2, `${bucket(0, 7).length}`)
  check("Ageing: 8–30 days overdue", bucket(8, 30).length >= 2, `${bucket(8, 30).length}`)
  check("Ageing: 31–60 days overdue", bucket(31, 60).length >= 1, `${bucket(31, 60).length}`)
  check("Ageing: 60+ days overdue", bucket(61, 100_000).length >= 1, `${bucket(61, 100_000).length}`)

  const dueToday = outstanding.filter((i) => ageInDays(i.dueDate) === 0)
  check("An invoice due today exists", dueToday.length >= 1)

  // -------------------------------------------------------------------------
  section("Reminder history and state-machine consistency")
  // -------------------------------------------------------------------------
  const emailLogs = await prismaAdmin.emailLog.findMany({
    where: { trackedInvoice: { userId: { in: seedUserIds } } },
  })
  check("At least 20 reminder email logs seeded", emailLogs.length >= 20, `found ${emailLogs.length}`)
  check("Every email log stage is 1, 2 or 3", emailLogs.every((l) => [1, 2, 3].includes(l.stage)))

  const logsByInvoice = new Map<string, typeof emailLogs>()
  for (const log of emailLogs) {
    const list = logsByInvoice.get(log.trackedInvoiceId) ?? []
    list.push(log)
    logsByInvoice.set(log.trackedInvoiceId, list)
  }

  const stageMismatches = invoices.filter(
    (i) => (logsByInvoice.get(i.id)?.length ?? 0) !== i.currentStage,
  )
  check(
    "currentStage matches the number of logged reminders on every invoice",
    stageMismatches.length === 0,
    stageMismatches.map((i) => i.externalId).join(", "),
  )

  check(
    "No invoice has a currentStage above 3",
    invoices.every((i) => i.currentStage >= 0 && i.currentStage <= 3),
  )
  check(
    "Every 'sequence_complete' invoice has all 3 reminders sent and none scheduled",
    invoices
      .filter((i) => i.status === "sequence_complete")
      .every((i) => i.currentStage === 3 && i.nextEmailAt === null),
  )
  check(
    "Every 'paused' invoice has no reminder scheduled",
    invoices.filter((i) => i.status === "paused").every((i) => i.nextEmailAt === null),
  )
  check(
    "Every 'snoozed' invoice has a future snoozedUntil",
    invoices.filter((i) => i.status === "snoozed").every((i) => i.snoozedUntil !== null && i.snoozedUntil > now),
  )
  check(
    "No non-snoozed invoice carries a snoozedUntil",
    invoices.filter((i) => i.status !== "snoozed").every((i) => i.snoozedUntil === null),
  )

  const dueReminders = invoices.filter(
    (i) => i.status === "pending" && i.nextEmailAt !== null && i.nextEmailAt <= now && i.currentStage < 3,
  )
  check("At least one reminder is due (cron queue is testable)", dueReminders.length >= 1)

  const scheduled = invoices.filter((i) => i.nextEmailAt !== null && i.nextEmailAt > now)
  check("At least one invoice has a future reminder scheduled", scheduled.length >= 1)

  const excluded = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return meta?.automationExcluded === true
  })
  check("An invoice excluded from automatic reminders exists", excluded.length >= 1)
  check(
    "Excluded invoices have no reminder scheduled",
    excluded.every((i) => i.nextEmailAt === null),
  )

  const undelivered = emailLogs.filter((l) => l.resendMessageId === null)
  check("A reminder with no confirmed delivery exists", undelivered.length >= 1)
  const delivered = emailLogs.filter((l) => l.resendMessageId !== null)
  check("Reminders with confirmed delivery exist", delivered.length >= 1)

  // -------------------------------------------------------------------------
  section("Promises to pay")
  // -------------------------------------------------------------------------
  const promises = await prismaAdmin.promiseToPay.findMany({
    where: { userId: { in: seedUserIds } },
    include: { trackedInvoice: { select: { id: true, userId: true, status: true } } },
  })
  check("At least 4 promises to pay seeded", promises.length >= 4, `found ${promises.length}`)
  check("Every promise status is valid", promises.every((p) => VALID_PROMISE_STATUSES.has(p.status)))

  const activePromises = promises.filter((p) => p.status === "active")
  check("An active promise to pay exists", activePromises.length >= 1)
  check(
    "Every active promise is still in the future (would not be auto-broken)",
    activePromises.every((p) => p.promisedPayBy > now),
  )

  const brokenPromises = promises.filter((p) => p.status === "broken")
  check("A broken promise to pay exists", brokenPromises.length >= 1)
  check(
    "Every broken promise is in the past and was notified",
    brokenPromises.every((p) => p.promisedPayBy < now && p.breachNotifiedAt !== null),
  )
  check("A kept promise exists", promises.some((p) => p.status === "kept"))
  check("A superseded promise exists", promises.some((p) => p.status === "superseded"))
  check(
    "Every promise belongs to the same account as its invoice",
    promises.every((p) => p.userId === p.trackedInvoice.userId),
  )
  check(
    "Invoices with an active promise are not in the due-reminder queue",
    activePromises.every((p) => !dueReminders.some((i) => i.id === p.trackedInvoiceId)),
  )

  // -------------------------------------------------------------------------
  section("Arrangements, disputes and collection pauses")
  // -------------------------------------------------------------------------
  const arrangements = await prismaAdmin.arrangement.findMany({
    where: { userId: { in: seedUserIds } },
    include: { coverages: true },
  })
  check("At least 4 arrangements seeded", arrangements.length >= 4, `found ${arrangements.length}`)
  check("Every arrangement status is valid", arrangements.every((a) => VALID_ARRANGEMENT_STATUSES.has(a.status)))
  check("Every arrangement type is valid", arrangements.every((a) => VALID_ARRANGEMENT_TYPES.has(a.arrangementType)))
  check("Every arrangement covers at least one invoice", arrangements.every((a) => a.coverages.length >= 1))
  check("An active arrangement exists", arrangements.some((a) => a.status === "active"))
  check(
    "A broken arrangement exists and is marked breached",
    arrangements.some((a) => a.status === "broken" && a.breachedAt !== null),
  )
  check(
    "A fulfilled arrangement exists and is marked fulfilled",
    arrangements.some((a) => a.status === "fulfilled" && a.fulfilledAt !== null),
  )
  check(
    "An instalment plan with a schedule exists",
    arrangements.some((a) => a.arrangementType === "instalment_plan" && Array.isArray(a.planSchedule)),
  )
  check(
    "Every active arrangement is still in the future (would not be auto-broken)",
    arrangements
      .filter((a) => a.status === "active")
      .every((a) => (a.promisedPayBy ?? a.expiresAt ?? new Date(0)) > now),
  )

  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  check(
    "Every arrangement coverage points at an invoice for the same debtor",
    arrangements.every((a) =>
      a.coverages.every((c) => invoiceById.get(c.trackedInvoiceId)?.clientEmail === a.debtorEmail),
    ),
  )

  const disputed = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return meta?.dispute != null
  })
  check("A disputed invoice exists", disputed.length >= 1)
  check("Disputed invoices are paused (collections frozen)", disputed.every((i) => i.status === "paused"))

  const collectionPaused = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return meta?.collectionPause != null
  })
  check("An invoice with collection activity paused exists", collectionPaused.length >= 1)
  check("Collection-paused invoices are in the paused state", collectionPaused.every((i) => i.status === "paused"))

  const archived = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return meta?.archived === true
  })
  check("An archived / inactive customer exists", archived.length >= 1)

  const noEmail = invoices.filter((i) => {
    const meta = i.providerMetadata as Record<string, unknown> | null
    return meta?.contactIssue != null
  })
  check("A customer without a usable email address exists", noEmail.length >= 1)
  check("That customer has no reminder scheduled", noEmail.every((i) => i.nextEmailAt === null))

  // -------------------------------------------------------------------------
  section("Customer grouping")
  // -------------------------------------------------------------------------
  const byClient = new Map<string, number>()
  for (const invoice of invoices) {
    if (invoice.userId !== primaryUserId) continue
    if (["paid", "manually_resolved"].includes(invoice.status)) continue
    byClient.set(invoice.clientEmail, (byClient.get(invoice.clientEmail) ?? 0) + 1)
  }
  const multiInvoiceClients = [...byClient.entries()].filter(([, count]) => count >= 3)
  check("A customer with 3+ outstanding invoices exists", multiInvoiceClients.length >= 1)

  const uniqueClients = new Set(invoices.map((i) => i.clientEmail))
  check("At least 20 distinct customers", uniqueClients.size >= 20, `${uniqueClients.size}`)

  // -------------------------------------------------------------------------
  section("Accounting integrations")
  // -------------------------------------------------------------------------
  const accountingConnections = await prismaAdmin.accountingConnection.findMany({
    where: { userId: { in: seedUserIds } },
    include: { syncRuns: true, providerInvoiceMappings: true, providerContactMappings: true },
  })
  check("At least 2 accounting connections seeded", accountingConnections.length >= 2)
  check(
    "Both Xero and MYOB are represented",
    ["xero", "myob"].every((p) => accountingConnections.some((c) => c.provider === p)),
  )
  check(
    "A connection with a successful sync history exists",
    accountingConnections.some((c) => c.syncRuns.some((r) => r.status === "success")),
  )
  check(
    "A failed sync run with a useful error message exists",
    accountingConnections.some((c) =>
      c.syncRuns.some((r) => r.status === "failed" && (r.errorMessage?.length ?? 0) > 20),
    ),
  )
  check(
    "Imported invoices are mapped to their source system",
    accountingConnections.reduce((n, c) => n + c.providerInvoiceMappings.length, 0) >= 6,
  )
  check(
    "Imported customers are mapped to their source system",
    accountingConnections.reduce((n, c) => n + c.providerContactMappings.length, 0) >= 6,
  )

  // -------------------------------------------------------------------------
  section("Tenant isolation")
  // -------------------------------------------------------------------------
  const primaryInvoiceIds = new Set(invoices.filter((i) => i.userId === primaryUserId).map((i) => i.id))
  const secondInvoiceIds = new Set(
    invoices.filter((i) => i.userId === secondTenantUserId).map((i) => i.id),
  )
  check("The second tenant has its own invoices", secondInvoiceIds.size >= 1, `${secondInvoiceIds.size}`)
  check(
    "No invoice belongs to both tenants",
    [...secondInvoiceIds].every((id) => !primaryInvoiceIds.has(id)),
  )

  const crossTenantClients = [...new Set(
    invoices.filter((i) => i.userId === secondTenantUserId).map((i) => i.clientEmail),
  )].filter((email) =>
    invoices.some((i) => i.userId === primaryUserId && i.clientEmail === email),
  )
  check("The two tenants share no customer records", crossTenantClients.length === 0, crossTenantClients.join(", "))

  const crossTenantConnections = accountingConnections.filter(
    (c) => c.userId === secondTenantUserId && c.providerInvoiceMappings.some((m) => primaryInvoiceIds.has(m.trackedInvoiceId)),
  )
  check("No provider mapping crosses a tenant boundary", crossTenantConnections.length === 0)

  // -------------------------------------------------------------------------
  section("Outbound-activity safety")
  // -------------------------------------------------------------------------
  const deliverableClients = invoices.filter((i) => !isUndeliverableAddress(i.clientEmail))
  check(
    "No seeded invoice has a deliverable client email address",
    deliverableClients.length === 0,
    deliverableClients.map((i) => i.clientEmail).join(", "),
  )

  const emailSettings = await prismaAdmin.emailSettings.findMany({ where: { userId: { in: seedUserIds } } })
  check(
    "No seeded sender address is deliverable",
    emailSettings.every(
      (s) => isUndeliverableAddress(s.fromEmail) && isUndeliverableAddress(s.replyTo),
    ),
  )
  check(
    "No seeded email log used a deliverable from-address",
    emailLogs.every((l) => l.fromAddress.includes(".test")),
  )

  const syncableConnections = accountingConnections.filter((c) =>
    ["active", "pending_first_sync", "error"].includes(c.status),
  )
  check(
    "Every syncable accounting connection is demo-guarded",
    syncableConnections.every((c) => isDemoOrganisationId(c.organisationId)),
    syncableConnections
      .filter((c) => !isDemoOrganisationId(c.organisationId))
      .map((c) => c.organisationId)
      .join(", "),
  )
  check(
    "No seeded connection holds a decryptable token (placeholders only)",
    accountingConnections.every(
      (c) =>
        c.encryptedAccessToken.startsWith("demo-seed-") &&
        c.encryptedRefreshToken.startsWith("demo-seed-"),
    ),
  )

  const stripeConnections = await prismaAdmin.invoiceConnection.findMany({
    where: { userId: { in: seedUserIds }, provider: "stripe" },
  })
  check(
    "Seeded Stripe Connect account ids are obviously fake",
    stripeConnections.every((c) => c.stripeConnectAccountId?.startsWith("acct_demo_seed_") === true),
  )

  // -------------------------------------------------------------------------
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
