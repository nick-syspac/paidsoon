import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import type { ReactElement } from "react"
import { resolveEffectiveAccess, type EffectiveAccess } from "@/lib/billing/effectiveAccess"

const now = new Date("2026-10-16T12:00:00Z")
let user: { id: string; email: string } | null
let pathname: string
let access: EffectiveAccess
let missing: boolean
let layout: typeof import("@/app/dashboard/layout").default
let settingsLayout: typeof import("@/app/dashboard/settings/layout").default
function resolve(status = "canceled", validGrant = false): EffectiveAccess {
  return resolveEffectiveAccess({ profile: {
    subscriptionStatus: status, subscriptionTier: "essentials", stripeSubscriptionId: "sub_private",
    trialEndsAt: null, billingAccessVersion: 7,
  }, grant: validGrant ? { plan: "business_pro", startsAt: now, expiresAt: new Date("2026-10-17Z"), revokedAt: null } : null,
  billingRisks: [] }, now)
}
function propsFor(node: unknown, name: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || !("props" in node)) return null
  const element = node as ReactElement<Record<string, unknown>>
  if (typeof element.type === "function" && element.type.name === name) return element.props
  for (const child of [element.props.children].flat(Infinity)) {
    const props = propsFor(child, name)
    if (props) return props
  }
  return null
}

function textContent(node: unknown): string {
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(textContent).join(" ")
  if (!node || typeof node !== "object" || !("props" in node)) return ""
  return textContent((node as ReactElement<{ children?: unknown }>).props.children)
}

before(async () => {
  await mock.module("next/navigation", { namedExports: { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) } } })
  await mock.module("next/headers", { namedExports: { headers: async () => new Headers({ "x-paidsoon-pathname": pathname }) } })
  await mock.module("@/lib/supabase/server", { namedExports: { getAuthenticatedUser: async () => ({ data: { user } }) } })
  await mock.module("@/lib/dashboard/loadDashboardProfile", { namedExports: {
    getDashboardProfile: async () => missing ? null : {
      displayName: "Tenant", subscriptionTier: "essentials", subscriptionStatus: "canceled", effectiveAccess: access,
    },
  } })
  await mock.module("@/lib/billing", { namedExports: { getSubscriptionTier: async () => access.effectiveTier } })
  await mock.module("@/lib/marketing/seo", { namedExports: { buildNoIndexMetadata: () => ({}) } })
  await mock.module("@/lib/diagnostics/server", { namedExports: {
    createServerTraceContext: () => ({}), traceEvent: () => {}, warnIfProductionDebugEnabled: () => {},
    traceOperation: async (_ctx: unknown, _input: unknown, work: () => Promise<unknown>) => work(),
  } })
  for (const [path, name] of [
    ["@/components/dashboard/UserMenu", "UserMenu"], ["@/components/dashboard/SupportBanner", "SupportBanner"],
    ["@/components/dashboard/DashboardMain", "DashboardMain"], ["@/components/settings/SettingsNavigation", "SettingsNavigation"],
  ]) {
    await mock.module(path, { namedExports: { [name]: { [name]: () => null }[name] } })
  }
  ;({ default: layout } = await import("@/app/dashboard/layout"))
  ;({ default: settingsLayout } = await import("@/app/dashboard/settings/layout"))
})
beforeEach(() => {
  user = { id: "tenant-private", email: "test@example.invalid" }
  pathname = "/dashboard"
  access = resolve()
  missing = false
})

test("grant-only canceled/paused tenants enter dashboard using granted shell plan", async () => {
  for (const status of ["canceled", "paused"]) {
    access = resolve(status, true)
    const page = await layout({ children: "content" })
    assert.equal(propsFor(page, "UserMenu")?.tier, "business_pro")
  }
})

test("denied access redirects normal routes but exact subscription and cancel pages remain reachable", async () => {
  for (const path of ["/dashboard", "/dashboard/settings", "/dashboard/invoices", "/dashboard/settings/subscription/other"]) {
    pathname = path
    await assert.rejects(layout({ children: "content" }), /REDIRECT:\/billing\/checkout\?plan=essentials/)
  }
  for (const path of ["/dashboard/settings/subscription", "/dashboard/settings/subscription/cancel"]) {
    pathname = path
    const page = await layout({ children: "recovery" })
    assert.equal(propsFor(page, "UserMenu")?.tier, null)
    const main = propsFor(page, "DashboardMain")!
    assert.ok(Object.entries(main).filter(([key]) => key.startsWith("canView")).every(([, value]) => value === false))
    await settingsLayout({ children: "recovery" })
  }
})

test("missing profile has no active/default tier but can still reach own billing recovery", async () => {
  missing = true
  await assert.rejects(layout({ children: "content" }), /reason=access_denied/)
  pathname = "/dashboard/settings/subscription"
  assert.equal(propsFor(await layout({ children: "recovery" }), "UserMenu")?.tier, null)
})

test("billing bypass never bypasses authentication", async () => {
  user = null
  pathname = "/dashboard/settings/subscription"
  await assert.rejects(layout({ children: "recovery" }), /REDIRECT:\/sign-in/)
})

test("exact grant expiry, revocation and unknown states deny new dashboard renders", async () => {
  for (const denied of [
    resolveEffectiveAccess({ profile: {
      subscriptionStatus: "paused", subscriptionTier: "essentials", stripeSubscriptionId: null,
      trialEndsAt: null, billingAccessVersion: 7,
    }, grant: { plan: "business_pro", startsAt: new Date(now.getTime() - 1000), expiresAt: now, revokedAt: null }, billingRisks: [] }, now),
    resolveEffectiveAccess({ profile: {
      subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null,
      trialEndsAt: null, billingAccessVersion: 7,
    }, grant: { plan: "business_pro", startsAt: now, expiresAt: new Date("2026-10-17Z"), revokedAt: now }, billingRisks: [] }, now),
    resolve("future-status", true),
  ]) {
    access = denied
    await assert.rejects(layout({ children: "content" }), /REDIRECT:\/billing\/checkout/)
  }
})

test("past-due grace retains the existing warning and billing plan instead of retained grant", async () => {
  access = resolve("past_due", true)
  const page = await layout({ children: "content" })
  assert.equal(propsFor(page, "UserMenu")?.tier, "essentials")
  assert.match(textContent(page), /Your latest payment did not go through/)
})