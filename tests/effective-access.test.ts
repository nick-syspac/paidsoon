import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveEffectiveAccess,
  type EffectiveAccessProfile,
  type EffectiveAccessSnapshot,
  type BillingRiskSnapshot,
} from "@/lib/billing/effectiveAccess"

const now = new Date("2026-10-14T12:00:00Z")
const past = new Date("2026-10-01T12:00:00Z")
const future = new Date("2026-10-21T12:00:00Z")
const later = new Date("2026-10-28T12:00:00Z")
const plans = ["essentials", "business_control", "small_business", "business_pro"] as const
const statuses = ["active", "trialing", "past_due", "unpaid", "incomplete", "incomplete_expired", "canceled", "cancelled", "paused", "unknown"]

function snapshot(overrides: Partial<EffectiveAccessProfile> = {}): EffectiveAccessSnapshot {
  return {
    profile: {
      subscriptionStatus: "canceled", subscriptionTier: "essentials",
      stripeSubscriptionId: null, trialEndsAt: future,
      billingAccessVersion: 7, ...overrides,
    },
    grant: { plan: "business_pro", startsAt: past, expiresAt: later, revokedAt: null },
    billingRisks: [],
  }
}

for (const linked of [false, true]) {
  for (const status of statuses) {
    for (const withGrant of [false, true]) {
      test(`${linked ? "linked" : "local"} ${status}, grant=${withGrant} follows source matrix`, () => {
        const input = snapshot({ subscriptionStatus: status, stripeSubscriptionId: linked ? "sub_mock" : null })
        if (!withGrant) input.grant = null
        const output = resolveEffectiveAccess(input, now)
        const restricted = ["past_due", "unpaid", "incomplete", "incomplete_expired", "unknown"].includes(status)
        const source = linked && status === "active" ? "paid"
          : linked && status === "past_due" ? "past_due_grace"
          : linked && status === "trialing" ? "stripe_trial"
          : withGrant && !restricted ? "admin_grant"
          : !linked && status === "trialing" ? "onboarding_trial" : "none"
        assert.equal(output.source, source)
        assert.equal(output.allowAccess, source !== "none")
        assert.equal(output.effectiveTier, source === "none" ? null : source === "admin_grant" ? "business_pro" : "essentials")
        assert.equal(output.version, 7)
        if (source === "paid" || source === "past_due_grace" || source === "none") {
          assert.equal(output.effectiveAccessExpiresAt, null)
          assert.equal(output.effectiveTrialExpiresAt, null)
          assert.equal(output.effectiveExpirySource, null)
        }
        if (status === "past_due") {
          assert.equal(output.showBillingWarning, true)
          assert.match(output.billingWarning ?? "", /latest payment/)
          if (withGrant) assert.equal(output.grant?.eligible, false)
          else assert.equal(output.grant, null)
        }
      })
    }
  }
}

for (const plan of [...plans, "accountant_partner", "starter", "solo"]) {
  for (const status of ["active", "trialing", "past_due"]) {
    test(`known billing plan ${plan} is preserved for ${status}`, () => {
      const output = resolveEffectiveAccess(snapshot({ subscriptionStatus: status, subscriptionTier: plan, stripeSubscriptionId: "sub_mock" }), now)
      assert.equal(output.effectiveTier, plan === "starter" ? "essentials" : plan === "solo" ? "business_control" : plan)
      assert.equal(output.allowAccess, true)
    })
  }
}

for (const plan of plans) {
  test(`strict public grant plan ${plan} supplies bounded access`, () => {
    const input = snapshot()
    input.grant!.plan = plan
    const output = resolveEffectiveAccess(input, now)
    assert.equal(output.effectiveTier, plan)
    assert.equal(output.effectiveExpiryTier, plan)
    assert.equal(output.source, "admin_grant")
    assert.deepEqual(output.effectiveAccessExpiresAt, later)
  })
  test(`legacy onboarding supports ${plan} without a Stripe subscription`, () => {
    const input = snapshot({ subscriptionStatus: "trialing", subscriptionTier: plan })
    input.grant = null
    const output = resolveEffectiveAccess(input, now)
    assert.equal(output.effectiveTier, plan)
    assert.equal(output.source, "onboarding_trial")
    assert.equal(output.stripeTrialEndsAt, null)
  })
}

for (const plan of ["starter", "solo", "accountant_partner", "unknown", "", "constructor", "__proto__", "toString"]) {
  test(`grant rejects non-public/canonical plan ${JSON.stringify(plan)}`, () => {
    const input = snapshot()
    input.grant!.plan = plan
    const output = resolveEffectiveAccess(input, now)
    assert.equal(output.allowAccess, false)
    assert.equal(output.effectiveTier, null)
    assert.equal(output.grant?.plan, null)
  })
}
for (const tier of [null, "", "unknown", "constructor", "__proto__", "toString"]) {
  for (const status of ["active", "trialing", "past_due"]) {
    test(`unknown billing tier ${JSON.stringify(tier)} fails closed for ${status}`, () => {
      const output = resolveEffectiveAccess(snapshot({ subscriptionStatus: status, subscriptionTier: tier, stripeSubscriptionId: "sub_mock" }), now)
      assert.equal(output.allowAccess, false)
      assert.equal(output.effectiveTier, null)
      assert.equal(output.restriction, "unknown_billing_tier")
      assert.equal(output.grant?.eligible, false)
    })
  }
}

test("missing profile and unknown/null status cannot authorize a valid grant", () => {
  const input = snapshot()
  input.profile = null
  assert.equal(resolveEffectiveAccess(input, now).restriction, "missing_profile")
  for (const status of [null, "", "future_status"]) {
    const output = resolveEffectiveAccess(snapshot({ subscriptionStatus: status }), now)
    assert.equal(output.source, "none")
    assert.equal(output.effectiveTier, null)
    assert.equal(output.restriction, "unknown_subscription_status")
  }
})

for (const end of [past, now, new Date(NaN)]) {
  test(`exclusive grant/onboarding end ${String(end)} denies at now`, () => {
    const input = snapshot({ subscriptionStatus: "trialing", trialEndsAt: end })
    input.grant!.expiresAt = end
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  })
}
test("grant start is inclusive, future/invalid starts and any revocation deny", () => {
  const input = snapshot()
  input.grant!.startsAt = now
  assert.equal(resolveEffectiveAccess(input, now).allowAccess, true)
  for (const start of [future, new Date(NaN)]) {
    input.grant!.startsAt = start
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  }
  input.grant!.startsAt = past
  for (const revokedAt of [past, now, future, new Date(NaN)]) {
    input.grant!.revokedAt = revokedAt
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  }
})

for (const end of [null, past, now, new Date(NaN)]) {
  test(`Stripe trialing ignores absent/stale local end ${String(end)}`, () => {
    const input = snapshot({ subscriptionStatus: "trialing", stripeSubscriptionId: "sub_mock", trialEndsAt: end })
    input.grant = null
    const output = resolveEffectiveAccess(input, now)
    assert.equal(output.allowAccess, true)
    assert.equal(output.source, "stripe_trial")
    assert.equal(output.trialTimingPendingReconciliation, true)
    assert.deepEqual(output.effectiveTrialExpiresAt, now)
  })
}

test("later grant expiry has its own provenance and plan while Stripe wins current access", () => {
  const input = snapshot({ subscriptionStatus: "trialing", stripeSubscriptionId: "sub_mock" })
  const output = resolveEffectiveAccess(input, now)
  assert.equal(output.source, "stripe_trial")
  assert.equal(output.effectiveTier, "essentials")
  assert.deepEqual(output.stripeTrialEndsAt, future)
  assert.deepEqual(output.effectiveTrialExpiresAt, later)
  assert.equal(output.effectiveExpirySource, "admin_grant")
  assert.equal(output.effectiveExpiryTier, "business_pro")
  assert.equal(Math.max(now.getTime(), output.effectiveTrialExpiresAt!.getTime()), later.getTime())
})
test("later Stripe expiry and ties retain Stripe provenance", () => {
  for (const end of [future, later]) {
    const input = snapshot({ subscriptionStatus: "trialing", stripeSubscriptionId: "sub_mock", trialEndsAt: later })
    input.grant!.expiresAt = end
    assert.equal(resolveEffectiveAccess(input, now).effectiveExpirySource, "stripe_trial")
  }
})
test("independent later onboarding expiry does not replace preferred grant plan", () => {
  const input = snapshot({ subscriptionStatus: "trialing", trialEndsAt: later })
  input.grant!.expiresAt = future
  const output = resolveEffectiveAccess(input, now)
  assert.equal(output.source, "admin_grant")
  assert.equal(output.effectiveTier, "business_pro")
  assert.equal(output.effectiveExpirySource, "onboarding_trial")
  assert.equal(output.effectiveExpiryTier, "essentials")
  assert.deepEqual(output.effectiveTrialExpiresAt, later)
})
test("revocation leaves independent onboarding and Stripe access untouched", () => {
  for (const linked of [false, true]) {
    const input = snapshot({ subscriptionStatus: "trialing", stripeSubscriptionId: linked ? "sub_mock" : null })
    input.grant!.revokedAt = now
    const output = resolveEffectiveAccess(input, now)
    assert.equal(output.source, linked ? "stripe_trial" : "onboarding_trial")
    assert.deepEqual(output.effectiveTrialExpiresAt, future)
  }
})

const risks: BillingRiskSnapshot[] = [
  { kind: "subscription_invoice", stripeStatus: "open", blocking: true },
  { kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: false },
  ...["warning_needs_response", "warning_under_review", "needs_response", "under_review", "lost"].map((stripeStatus) => ({ kind: "subscription_dispute", stripeStatus, blocking: false })),
  { kind: "subscription_invoice", stripeStatus: "unknown", blocking: false },
  { kind: "unknown", stripeStatus: "paid", blocking: false },
]
for (const risk of risks) {
  for (const status of ["canceled", "paused", "active", "trialing", "past_due"]) {
    test(`${risk.kind}/${risk.stripeStatus} suppresses grants, preserves ${status} base policy`, () => {
      const input = snapshot({ subscriptionStatus: status, stripeSubscriptionId: "sub_mock" })
      input.billingRisks = [risk]
      const output = resolveEffectiveAccess(input, now)
      assert.equal(output.grant?.eligible, false)
      assert.equal(output.allowAccess, ["active", "trialing", "past_due"].includes(status))
      assert.equal(output.effectiveTier, output.allowAccess ? "essentials" : null)
      assert.equal(output.showBillingWarning, true)
      assert.notEqual(output.effectiveExpirySource, "admin_grant")
      if (status === "trialing") assert.deepEqual(output.effectiveTrialExpiresAt, future)
    })
  }
}
for (const risk of [
  ...["draft", "open", "paid", "void"].map((stripeStatus) => ({ kind: "subscription_invoice", stripeStatus, blocking: false })),
  ...["won", "warning_closed", "prevented"].map((stripeStatus) => ({ kind: "subscription_dispute", stripeStatus, blocking: false })),
]) {
  test(`resolved/nonblocking ${risk.kind}/${risk.stripeStatus} permits a current grant`, () => {
    const input = snapshot()
    input.billingRisks = [risk]
    assert.equal(resolveEffectiveAccess(input, now).source, "admin_grant")
    input.billingRisks = [risk, risks[0]]
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  })
}
test("risk does not remove independent bounded onboarding policy", () => {
  const input = snapshot({ subscriptionStatus: "trialing" })
  input.billingRisks = risks
  assert.equal(resolveEffectiveAccess(input, now).source, "onboarding_trial")
})
test("fresh resolution restores a valid grant after risk clears, but not an expired grant", () => {
  const input = snapshot()
  input.billingRisks = [risks[0]]
  assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  input.billingRisks = []
  assert.equal(resolveEffectiveAccess(input, now).source, "admin_grant")
  assert.equal(resolveEffectiveAccess(input, later).allowAccess, false)
})
test("grant supplies continuity after Stripe ends without changing the retained grant window", () => {
  const input = snapshot({ subscriptionStatus: "trialing", stripeSubscriptionId: "sub_mock" })
  assert.equal(resolveEffectiveAccess(input, now).source, "stripe_trial")
  input.profile!.subscriptionStatus = "canceled"
  const output = resolveEffectiveAccess(input, future)
  assert.equal(output.source, "admin_grant")
  assert.equal(output.effectiveTier, "business_pro")
  assert.deepEqual(output.grant?.startsAt, past)
  assert.equal(resolveEffectiveAccess(input, later).source, "none")
})
test("a millisecond before grant expiry allows access but equality denies", () => {
  const input = snapshot()
  assert.equal(resolveEffectiveAccess(input, new Date(later.getTime() - 1)).allowAccess, true)
  assert.equal(resolveEffectiveAccess(input, later).allowAccess, false)
})
test("account age/absent onboarding expiry and local active never imply paid access", () => {
  for (const status of ["active", "trialing"]) {
    const input = snapshot({ subscriptionStatus: status, trialEndsAt: null })
    input.grant = null
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  }
})
test("invalid now explicitly throws rather than making an authorization decision", () => {
  assert.throws(() => resolveEffectiveAccess(snapshot(), new Date(NaN)), RangeError)
})
test("output is a safe projection and does not mutate or share input dates", () => {
  const input = snapshot()
  const original = structuredClone(input)
  const output = resolveEffectiveAccess(input, now)
  assert.deepEqual(input, original)
  assert.deepEqual(Object.keys(output.grant!).sort(), ["eligible", "expiresAt", "plan", "revokedAt", "startsAt"])
  output.grant!.expiresAt!.setTime(0)
  assert.deepEqual(input, original)
})