import { before, beforeEach, mock, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Diagnostic, DiagnosticAction } from "@/lib/admin/diagnostics/types"

const tenant = "11111111-1111-4111-8111-111111111111"
let allowed: boolean, ownerChecks: number, healthReads: number
let page: typeof import("@/app/admin/(protected)/tenants/[userId]/page").default
let button: typeof import("@/components/admin/tenant-detail/ActionButton").ActionButton
const diagnostic: Diagnostic = { slug: "trial-lapsed", severity: "error", title: "Stripe trial period has lapsed",
  description: "Review billing state.", runbookSlug: "trial-lapsed", actions: [] }

before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {} } })
  mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => { throw new Error("live auth forbidden") } } })
  const { AdminGuardError } = await import("@/lib/admin/guard")
  mock.module("@/lib/admin/trialAccessAuthority", { namedExports: { requireTrialAccessOwner: async () => {
    ownerChecks++
    if (!allowed) throw new AdminGuardError("insufficient_role", "Not owner")
    return {}
  } } })
  mock.module("@/lib/admin/tenantSnapshot", { namedExports: { fetchTenantSnapshot: async () => {
    healthReads++
    return { profile: { displayName: "Tenant account" }, supabaseEmail: "tenant@example.test" }
  } } })
  mock.module("@/lib/admin/trialAccessManagement", { namedExports: { readTrialManagementSnapshot: async () => {
    throw new Error("Management unavailable in legacy entry test")
  } } })
  mock.module("@/lib/admin/diagnostics", { namedExports: { runDiagnostics: () => [diagnostic] } })
  mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => assert.fail("no generic trial refresh") }),
    notFound: () => assert.fail("existing tenant must remain visible") } })
  for (const name of ["IdentitySection", "SubscriptionSection", "ConnectionsSection", "ScheduleSection", "InvoiceSummarySection",
    "EmailLogSection", "EmailSettingsSection"]) {
    mock.module(`@/components/admin/tenant-detail/${name}`, { namedExports: { [name]: () => createElement("div", null, name) } })
  }
  page = (await import("@/app/admin/(protected)/tenants/[userId]/page")).default
  button = (await import("@/components/admin/tenant-detail/ActionButton")).ActionButton
})
beforeEach(() => { allowed = false; ownerChecks = 0; healthReads = 0 })

test("staff health remains visible without owner management controls", async () => {
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ userId: tenant }) }))
  assert.match(html, /Stripe trial period has lapsed/); assert.match(html, /SubscriptionSection/)
  assert.doesNotMatch(html, /Manage trial access|saved preview|Extend trial/)
  assert.equal(ownerChecks, 1); assert.equal(healthReads, 1)
})
test("owner diagnostics links to the protected management dialog without a generic trial mutation", async () => {
  allowed = true
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ userId: tenant }) }))
  assert.match(html, new RegExp(`href="/admin/tenants/${tenant}#trial-access"`))
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /id="trial-access"/); assert.match(html, /saved preview/)
  assert.match(html, /<dialog|Refresh billing eligibility/)
  assert.doesNotMatch(html, /Extend trial 7 days|actions\/extend-trial|management dialog is not yet available/)
  assert.equal(ownerChecks, 1)
})
test("management consumes initial and changed diagnostics fragments through the existing launch flow", () => {
  const source = readFileSync(new URL("../components/admin/tenant-detail/TrialAccessManager.tsx", import.meta.url), "utf8")
  assert.match(source, /window\.location\.hash !== "#trial-access"/)
  assert.match(source, /addEventListener\("hashchange", openLinkedManagement\)/)
  assert.match(source, /removeEventListener\("hashchange", openLinkedManagement\)/)
  assert.match(source, /window\.history\.replaceState\(window\.history\.state, "", window\.location\.pathname \+ window\.location\.search\)\s+launch\(\)/)
  assert.match(source, /addEventListener\("hashchange", openLinkedManagement\)\s+openLinkedManagement\(\)/)
})
test("stale generic trial-action metadata renders no button even for owners", () => {
  const stale = { actionSlug: "extend-trial", label: "Extend trial 7 days", description: "Legacy", payload: { days: 7 } }
  assert.equal(renderToStaticMarkup(createElement(button, { tenantUserId: tenant, action: stale as DiagnosticAction })), "")
  const safe: DiagnosticAction = { actionSlug: "trigger-resync", label: "Resync", description: "Refresh connection" }
  assert.match(renderToStaticMarkup(createElement(button, { tenantUserId: tenant, action: safe })), /Resync/)
})
test("legacy endpoint has no raw Stripe, database, best-effort audit or days mutation code", () => {
  const source = readFileSync(new URL("../app/api/admin/tenants/[id]/actions/extend-trial/route.ts", import.meta.url), "utf8")
  assert.match(source, /trialAccessRoute\(request, context, "extend-stripe"\)/)
  assert.doesNotMatch(source, /subscriptions\.(update|create)|prismaAdmin|logAdminEvent|new Stripe|req\.json\(|days\s*:/)
})