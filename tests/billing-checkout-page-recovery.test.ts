import { before, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { ReactElement } from "react"

type Element = ReactElement<Record<string, unknown>>
let profile: { subscriptionTier: string; billingAccessVersion: number } | null = { subscriptionTier: "small_business", billingAccessVersion: 42 }
let selected: unknown
let render: typeof import("@/app/billing/checkout/page").default
before(async () => {
  await mock.module("next/navigation", { namedExports: { redirect: () => { throw new Error("redirect") } } })
  await mock.module("server-only", { namedExports: {} })
  await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: { id: "owner-private" } } }),
    getClaims: async () => ({ data: { claims: { sub: "owner-private", session_id: "96ea5264-fbe7-4d46-9086-e9244675c511" } }, error: null }),
  } }) } })
  await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: async (userId: string, callback: (tx: unknown) => Promise<unknown>) => {
    assert.equal(userId, "owner-private")
    return callback({ userProfile: { findUnique: async (query: unknown) => { selected = query; return profile } } })
  } } })
  await mock.module("@/components/billing/StartCheckoutButton", { namedExports: { StartCheckoutButton: () => null } })
  ;({ default: render } = await import("@/app/billing/checkout/page"))
})
function findBillingProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || !("props" in node)) return null
  const props = (node as Element).props
  if ("billingSessionScope" in props) return props
  for (const child of [props.children].flat(Infinity)) {
    const found = findBillingProps(child)
    if (found) return found
  }
  return null
}
test("denied-access checkout entry loads safe version even for explicit pricing query, and recovery renders for contact-only tier", async () => {
  for (const reason of ["unpaid", "canceled", "incomplete", "trial_expired"]) {
    const page = await render({ searchParams: Promise.resolve({ plan: "accountant_partner", reason }) })
    const props = findBillingProps(page)
    assert.ok(props)
    assert.equal(props.billingAccessVersion, 42)
    assert.equal(props.checkoutEnabled, false)
    assert.equal(props.tier, "accountant_partner")
    assert.match(String(props.billingSessionScope), /^[a-f0-9]{64}$/)
    assert.doesNotMatch(JSON.stringify(props), /owner-private|stripeCustomer|stripeSubscription/)
    assert.deepEqual(selected, { where: { userId: "owner-private" }, select: { subscriptionTier: true, billingAccessVersion: true } })
  }
})
test("missing profile fails closed for mutation version while recovery entry still renders", async () => {
  profile = null
  const props = findBillingProps(await render({ searchParams: Promise.resolve({ plan: "essentials" }) }))
  assert.equal(props?.billingAccessVersion, null)
})