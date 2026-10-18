import { afterEach, before, beforeEach, mock, test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { UserProfile } from "@/lib/generated/prisma/client"
import type { TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import type { TrialEligibility } from "@/lib/billing/trialEligibility"
import type { TrialAccessContact } from "@/lib/email/trialAccessContact"

const tenant = "11111111-1111-4111-8111-111111111111"
const now = new Date("2026-10-17T00:00:00Z")
const originalSupabaseSecret = process.env.SUPABASE_SECRET_KEY
type Query = { where: { userId: string }; select?: Record<string, boolean> }
let profile: UserProfile | null
let grant: TrialGrantSnapshot | null
let risks: BillingRiskSnapshot[]
let contact: TrialAccessContact
let eligibility: TrialEligibility
let role: "platform_owner" | "platform_support" | "platform_admin"
let reads: string[], selects: Record<string, boolean>[], healthUnavailable: boolean
let sdkUnavailable: boolean, managementUnavailable: boolean, authorityLost: boolean
let ownerChecks: number
let targetOwnerRole = false
let page: typeof import("@/app/admin/(protected)/tenants/[userId]/page").default
let section: typeof import("@/components/admin/tenant-detail/SubscriptionSection").SubscriptionSection
let snapshots: typeof import("@/lib/admin/tenantSnapshot")
let management: typeof import("@/lib/admin/trialAccessManagement")
let guard: typeof import("@/lib/admin/guard")

function scoped(query: Query, label: string): void {
  assert.equal(query.where.userId, tenant)
  reads.push(label)
  if (query.select) selects.push(query.select)
}
const db = {
  platformRole: { findUnique: async (query: Query) => {
    assert.deepEqual(query, { where: { userId: tenant }, select: { role: true, status: true } })
    return targetOwnerRole ? { role: "platform_owner", status: "active" } : null
  } },
  userProfile: { findUnique: async (query: Query) => { scoped(query, "profile"); return structuredClone(profile) } },
  tenantTrialGrant: { findUnique: async (query: Query) => {
    scoped(query, "grant")
    if (healthUnavailable) throw new Error("PRIVATE storage unavailable")
    return structuredClone(grant)
  } },
  tenantBillingRisk: { findMany: async (query: Query) => { scoped(query, "risk"); return structuredClone(risks) } },
  schedule: { findUnique: async () => null },
  emailSettings: { findUnique: async () => null },
  invoiceConnection: { findMany: async () => [] },
  accountingConnection: { findMany: async () => [{ organisationName: "DEBTOR_OR_ACCOUNTING_ORG" }] },
  trackedInvoice: { groupBy: async () => [{ status: "paid", _count: { id: 3 } }] },
  emailLog: { findMany: async () => [] },
  // No journals, writes, transactions or provider mutations are provided. Any
  // accidental access to them fails this real page/snapshot test immediately.
}

before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: db } })
  mock.module("@/lib/supabase/server", { namedExports: { createClient: () => assert.fail("No live auth") } })
  mock.module("@supabase/supabase-js", { namedExports: { createClient: () => assert.fail("No live auth contact") } })
  mock.module("@/lib/admin/trialAccessAuthority", { namedExports: { requireTrialAccessOwner: async () => {
    ownerChecks++
    if (role !== "platform_owner" || (authorityLost && ownerChecks > 1)) {
      throw new guard.AdminGuardError("insufficient_role", "Owner required")
    }
    return { userId: "owner", platformRole: { userId: "owner", role, status: "active" },
      adminSession: { id: "session", userId: "owner", expiresAt: new Date("2026-10-18"), revokedAt: null } } as AdminGuardContext
  } } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => {
    reads.push("stripe-client")
    if (sdkUnavailable) throw new Error("PRIVATE stripe secret")
    return {}
  } } })
  mock.module("@/lib/billing/trialEligibility", { namedExports: { resolveTrialEligibility: async (stripe: unknown) => {
    reads.push("eligibility")
    if (managementUnavailable) throw new Error("PRIVATE upstream error")
    return profile?.stripeCustomerId && !stripe ? { ...eligibility, available: false, eligible: false, source: null,
      restrictions: ["stripe_unavailable"], snapshot: null } : structuredClone(eligibility)
  } } })
  mock.module("@/lib/email/trialAccessContactService", { namedExports: { createTrialAccessContactService: () => ({
    resolve: async () => { reads.push("owner-contact"); return structuredClone(contact) },
  }) } })
  mock.module("@/lib/admin/diagnostics", { namedExports: { runDiagnostics: () => [] } })
  mock.module("next/navigation", { namedExports: { notFound: () => { throw new Error("NOT_FOUND") }, useRouter: () => ({ refresh: () => {} }) } })
  for (const name of ["IdentitySection", "ConnectionsSection", "ScheduleSection", "InvoiceSummarySection", "EmailLogSection", "EmailSettingsSection", "DiagnosticsSection"]) {
    mock.module(`@/components/admin/tenant-detail/${name}`, { namedExports: { [name]: () => createElement("div", null, name) } })
  }
  guard = await import("@/lib/admin/guard")
  snapshots = await import("@/lib/admin/tenantSnapshot")
  management = await import("@/lib/admin/trialAccessManagement")
  section = (await import("@/components/admin/tenant-detail/SubscriptionSection")).SubscriptionSection
  page = (await import("@/app/admin/(protected)/tenants/[userId]/page")).default
})

beforeEach(() => {
  targetOwnerRole = false
  mock.timers.enable({ apis: ["Date"], now })
  delete process.env.SUPABASE_SECRET_KEY
  profile = { userId: tenant, displayName: "Test tenant", subscriptionTier: "essentials", subscriptionStatus: "canceled",
    stripeCustomerId: null, stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 4,
    subscriptionCurrentPeriodEnd: new Date("2026-11-01"), subscriptionCancelAt: null, subscriptionCancelAtPeriodEnd: false,
    pendingTrialOperationId: null, pendingBillingMutationId: null } as UserProfile
  grant = { plan: "small_business", startsAt: new Date("2026-10-01"), expiresAt: new Date("2026-12-01"), revokedAt: null }
  risks = []; reads = []; selects = []; ownerChecks = 0
  role = "platform_support"; healthUnavailable = false; sdkUnavailable = false; managementUnavailable = false; authorityLost = false
  contact = { email: "billing@example.test", name: "Billing person", source: "stripe_billing", nameMissing: false }
  eligibility = { available: true, eligible: true, source: "admin_grant", restrictions: [], resolution: null,
    snapshot: null, billingStatus: "canceled", risks: [], fingerprint: "PRIVATE fingerprint" }
})

test("admin health and management resolve the target owner and present internal access without trial dates", async () => {
  role = "platform_owner"
  profile!.subscriptionStatus = "active"
  profile!.subscriptionTier = "small_business"
  grant = null
  eligibility.billingStatus = "active"
  targetOwnerRole = true
  const health = await snapshots.fetchTenantSnapshot(tenant)
  const managed = await management.readTrialManagementSnapshot(tenant)
  assert.equal(health?.subscriptionAccess?.source, "platform_owner")
  assert.equal(managed.access.source, "platform_owner")
  const html = renderToStaticMarkup(createElement(section, { profile: profile!, access: managed.access }))
  assert.match(html, /Platform owner internal access/)
  assert.match(html, /No trial-derived access cutoff/)
  assert.doesNotMatch(JSON.stringify(managed), /platformOwnerAccess|platformRole/)
  targetOwnerRole = false
  assert.equal((await management.readTrialManagementSnapshot(tenant)).access.allowAccess, false)
})
afterEach(() => {
  mock.timers.reset()
  if (originalSupabaseSecret === undefined) delete process.env.SUPABASE_SECRET_KEY
  else process.env.SUPABASE_SECRET_KEY = originalSupabaseSecret
})

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await page({ params: Promise.resolve({ userId: tenant }) }))
}
function fact(html: string, label: string): string {
  const match = html.match(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>(.*?)</dd>`))
  assert.ok(match, `Missing ${label}`)
  return match[1]
}

for (const staffRole of ["platform_support", "platform_admin"] as const) test(`${staffRole} keeps read-only health without owner fetch, contact or journal details`, async () => {
  role = staffRole
  // If staff ever takes the owner path, the mock would throw an upstream error.
  managementUnavailable = true
  const html = await renderPage()
  assert.match(html, /Read-only tenant health/)
  assert.equal(fact(html, "Persisted billing plan"), "essentials")
  assert.equal(fact(html, "Current effective plan"), "small business")
  assert.match(html, /Admin grant|Stripe billing unchanged/)
  assert.doesNotMatch(html, /billing@example|Billing person|PRIVATE|DEBTOR_OR_ACCOUNTING_ORG|<button|<form|dialog|Eligible for/)
  assert.ok(!reads.some((value) => ["eligibility", "stripe-client", "owner-contact"].includes(value)))
  assert.equal(ownerChecks, 1)
  assert.deepEqual(selects, [{ plan: true, startsAt: true, expiresAt: true, revokedAt: true }, { kind: true, stripeStatus: true, blocking: true }])
})

test("owner renders the same fresh safe management data as GET, not stale billing access", async () => {
  role = "platform_owner"
  profile!.stripeCustomerId = "cus_PRIVATE"; profile!.stripeSubscriptionId = "sub_PRIVATE"
  profile!.subscriptionStatus = "trialing"; profile!.trialEndsAt = new Date("2026-10-20")
  eligibility.source = "stripe_trial"; eligibility.billingStatus = "trialing"
  eligibility.snapshot = { tier: "business_pro", subscriptionId: "sub_PRIVATE", customerId: "cus_PRIVATE", status: "trialing",
    priceId: "price_PRIVATE", periodStart: now, periodEnd: new Date("2026-11-17"), trialEndsAt: new Date("2026-10-25"),
    subscriptionCancelAt: null, subscriptionCancelAtPeriodEnd: false }
  const html = await renderPage()
  assert.equal(fact(html, "Persisted billing plan"), "essentials")
  assert.equal(fact(html, "Current effective plan"), "business pro")
  assert.equal(fact(html, "Current access source"), "Stripe trial")
  assert.match(fact(html, "Stripe trial end"), /2026-10-25/)
  assert.match(fact(html, "Effective access expiry"), /2026-12-01/)
  assert.match(fact(html, "Expiry source / applicable plan"), /Admin grant \/ small business/)
  assert.match(html, /Later continuity uses small business/)
  assert.match(html, /does not extend the current business pro/)
  assert.match(html, /Verified Stripe billing contact|billing@example.test|Billing person|fresh read-only billing verification/)
  assert.doesNotMatch(html, /cus_PRIVATE|sub_PRIVATE|price_PRIVATE|fingerprint|PRIVATE business reason/)
  assert.match(html, /Manage trial access/)
  assert.ok(reads.includes("eligibility") && reads.includes("owner-contact"))
  const safe = await management.readTrialManagementSnapshot(tenant)
  assert.equal(safe.billing.plan, "essentials"); assert.equal(safe.access.effectivePlan, "business_pro")
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|creatorOperation|reason|stripeCustomerId/)
  assert.equal(profile!.subscriptionTier, "essentials", "Rendering must not project or rewrite billing")
})

test("minimal identity/contact and no trial are explicitly unavailable, not a fabricated organisation or Stripe trial", async () => {
  role = "platform_owner"; profile!.displayName = "  "; grant = null
  contact = { email: null, name: null, source: null, nameMissing: true }
  const html = await renderPage()
  assert.match(html, /Tenant-account fallback|Email unavailable|Contact name unavailable|Missing email blocks optional notification only/)
  assert.equal(fact(html, "Stripe trial end"), "Unavailable")
  assert.equal(fact(html, "Current effective plan"), "No gated access")
  assert.doesNotMatch(html, /DEBTOR_OR_ACCOUNTING_ORG|Verified Stripe billing contact|cus_|sub_/)
})

test("owner-contact fallback is labeled and never masquerades as Stripe billing contact", async () => {
  role = "platform_owner"
  contact = { email: "owner@example.test", name: null, source: "owner_fallback", nameMissing: true }
  const html = await renderPage()
  assert.match(html, /owner@example.test|Owner-contact fallback \(Supabase auth email\)|Contact name unavailable/)
  assert.doesNotMatch(html, /Verified Stripe billing contact/)
})

test("staff auth contact fallback is labeled without acquiring owner-only contact", async () => {
  const snapshot = await snapshots.fetchTenantSnapshot(tenant)
  assert.ok(snapshot)
  const html = renderToStaticMarkup(createElement(section, { profile: snapshot.profile, access: snapshot.subscriptionAccess,
    supabaseEmail: "auth@example.test" }))
  assert.match(html, /auth@example.test|Owner-contact fallback/)
  assert.ok(!reads.includes("owner-contact"))
})

for (const status of ["active", "past_due", "unpaid", "incomplete"]) test(`${status} billing is distinct from a retained grant, never a grant-derived paid report`, async () => {
  profile!.stripeSubscriptionId = "sub_PRIVATE"; profile!.subscriptionStatus = status
  const html = await renderPage()
  assert.equal(fact(html, "Persisted billing status"), status)
  assert.equal(fact(html, "Persisted billing plan"), "essentials")
  assert.equal(fact(html, "Admin grant plan"), "small business")
  if (["active", "past_due"].includes(status)) {
    assert.equal(fact(html, "Current effective plan"), "essentials")
    assert.equal(fact(html, "Effective access expiry"), "No trial-derived access cutoff")
  } else assert.equal(fact(html, "Current effective plan"), "No gated access")
  assert.doesNotMatch(html, /sub_PRIVATE/)
})

for (const kind of ["expired", "revoked", "restricted"] as const) test(`${kind} grant does not claim current access`, async () => {
  if (kind === "expired") grant!.expiresAt = now // exclusive boundary
  if (kind === "revoked") grant!.revokedAt = now
  if (kind === "restricted") risks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
  const html = await renderPage()
  assert.equal(fact(html, "Current effective plan"), "No gated access")
  assert.equal(fact(html, "Admin grant plan"), "small business")
  if (kind === "revoked") assert.match(html, /Revoked:/)
  if (kind === "restricted") assert.match(html, /grants cannot bypass billing obligations/)
})

test("onboarding date is not labeled as a Stripe trial and stale Stripe timing is explicit", async () => {
  profile!.subscriptionStatus = "trialing"; profile!.trialEndsAt = new Date("2026-10-20"); grant = null
  let html = await renderPage()
  assert.equal(fact(html, "Stripe trial end"), "Unavailable")
  assert.match(html, /Recorded onboarding trial end \(not Stripe\)/)
  profile!.stripeSubscriptionId = "sub_PRIVATE"; profile!.trialEndsAt = new Date("2026-10-01")
  html = await renderPage()
  assert.match(html, /Stripe trial timing is pending reconciliation/)
  assert.equal(fact(html, "Current access source"), "Stripe trial")
})

for (const failure of ["sdk", "provider", "snapshot"] as const) test(`owner ${failure} unavailable does not break health or pretend fresh eligibility`, async () => {
  role = "platform_owner"; profile!.stripeCustomerId = "cus_PRIVATE"
  sdkUnavailable = failure === "sdk"; managementUnavailable = failure === "snapshot"
  if (failure === "provider") { eligibility.available = false; eligibility.eligible = false; eligibility.source = null }
  const html = await renderPage()
  assert.match(html, /IdentitySection|Subscription/)
  assert.match(html, failure === "snapshot" ? /Owner management snapshot unavailable/ : /Fresh Stripe verification unavailable/)
  assert.match(html, /persisted health data|persisted access is not proof/)
  assert.doesNotMatch(html, /PRIVATE|Eligible for|fresh read-only billing verification/)
})

test("losing owner authority during the fresh read falls back to staff health without owner details", async () => {
  role = "platform_owner"; authorityLost = true
  const html = await renderPage()
  assert.match(html, /Read-only tenant health/)
  assert.doesNotMatch(html, /billing@example|Owner management snapshot|saved preview/)
})

test("unavailable grant storage is not mistaken for an absent grant or allowed access", async () => {
  healthUnavailable = true
  const html = await renderPage()
  assert.equal(fact(html, "Admin grant plan"), "Unavailable")
  assert.equal(fact(html, "Current effective plan"), "Unavailable")
})

test("missing profile remains not-found, with no invented tenant or management lookup", async () => {
  profile = null; role = "platform_owner"
  await assert.rejects(renderPage, /NOT_FOUND/)
  assert.equal(ownerChecks, 0)
  assert.ok(!reads.includes("eligibility"))
})

test("safe persisted snapshot and invoice health counts remain independent", async () => {
  const snapshot = await snapshots.fetchTenantSnapshot(tenant)
  assert.ok(snapshot)
  assert.equal(snapshot.invoiceCounts.paid, 3)
  assert.equal(snapshot.invoiceCounts.total, 3)
  assert.equal(snapshot.subscriptionAccess?.effectivePlan, "small_business")
  assert.equal(snapshot.profile.subscriptionTier, "essentials")
  assert.doesNotMatch(JSON.stringify(snapshot.subscriptionAccess), /userId|stripeCustomerId|reason|Operation/)
})