import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessProfile, type TrialGrantSnapshot } from "@/lib/billing/effectiveAccess"

import {
  getDashboardSubscriptionAccessState,
  getSubscriptionBillingState,
  getSubscriptionCancellationPageState,
  getApplicationAccessPresentation,
  isDashboardBillingResolutionPath,
} from "@/lib/subscriptionStatusPresentation"

const now = new Date("2026-10-16T12:00:00Z")
function accessFor(status: string, grant: TrialGrantSnapshot | null = null, overrides: Partial<EffectiveAccessProfile> = {}) {
  return resolveEffectiveAccess({ profile: {
    subscriptionStatus: status, subscriptionTier: "business_control", stripeSubscriptionId: "sub_test",
    trialEndsAt: new Date("2026-10-18T12:00:00Z"), billingAccessVersion: 8, ...overrides,
  }, grant, billingRisks: [] }, now)
}
const grant: TrialGrantSnapshot = {
  plan: "small_business", startsAt: new Date("2026-10-15T12:00:00Z"),
  expiresAt: new Date("2026-10-23T12:00:00Z"), revokedAt: null,
}

test("dashboard access allows trialing users", () => {
  const state = getDashboardSubscriptionAccessState(accessFor("trialing"), "trialing")
  assert.deepEqual(state, {
    allowAccess: true,
    showBillingWarning: false,
    billingWarning: null,
    redirectReason: null,
  })
})

test("dashboard access blocks canceled and unpaid users", () => {
  assert.deepEqual(getDashboardSubscriptionAccessState(accessFor("canceled"), "canceled"), {
    allowAccess: false,
    showBillingWarning: false,
    billingWarning: null,
    redirectReason: "canceled",
  })

  assert.deepEqual(getDashboardSubscriptionAccessState(accessFor("unpaid"), "unpaid"), {
    allowAccess: false,
    showBillingWarning: true,
    billingWarning: "Please resolve your billing state through billing settings or support.",
    redirectReason: "unpaid",
  })
})

test("dashboard access keeps past_due users with billing warning", () => {
  const state = getDashboardSubscriptionAccessState(accessFor("past_due", grant), "past_due")
  assert.equal(state.allowAccess, true)
  assert.equal(state.showBillingWarning, true)
  assert.equal(typeof state.billingWarning, "string")
  assert.equal(state.redirectReason, null)
})

test("temporary application plan is distinct from inactive billing and never promises a postponed charge", () => {
  for (const status of ["canceled", "paused"]) {
    const access = accessFor(status, grant)
    assert.equal(getDashboardSubscriptionAccessState(access, status).allowAccess, true)
    const view = getApplicationAccessPresentation(access)
    assert.match(view.headline, /Small Business.*Temporary PaidSoon grant/)
    assert.match(view.description, /Stripe billing unchanged/)
    assert.match(view.description, /does not postpone charges or purchase/)
    assert.match(view.description, /23 October 2026.*UTC/)
    assert.equal(view.showBanner, true)
  }
})

test("paid and grace preserve billing plan and have no trial cutoff despite retained grant", () => {
  for (const status of ["active", "past_due"]) {
    const access = accessFor(status, grant)
    const view = getApplicationAccessPresentation(access)
    assert.match(view.headline, /Business Control/)
    assert.doesNotMatch(view.headline, /Small Business/)
    assert.equal(view.continuity, null)
    assert.equal(view.showBanner, false)
    assert.equal(access.effectiveAccessExpiresAt, null)
  }
})

test("Stripe preferred plan and later grant continuity name their own plan and dates", () => {
  const view = getApplicationAccessPresentation(accessFor("trialing", grant))
  assert.match(view.headline, /Business Control.*Stripe trial/)
  assert.match(view.description, /18 October 2026/)
  assert.doesNotMatch(view.description, /23 October/)
  assert.match(view.continuity!, /Small Business.*23 October 2026/)
  assert.match(view.continuity!, /does not extend the current plan or postpone Stripe charges/)
})

test("longer onboarding continuity does not extend the preferred grant plan", () => {
  const view = getApplicationAccessPresentation(accessFor("trialing", grant, {
    stripeSubscriptionId: null, trialEndsAt: new Date("2026-10-25T12:00:00Z"),
  }))
  assert.match(view.headline, /Small Business.*Temporary PaidSoon grant/)
  assert.match(view.description, /23 October/)
  assert.match(view.continuity!, /Onboarding trial.*Business Control.*25 October/)
})

test("Stripe timing pending remains authoritative while local onboarding ends exactly at cutoff", () => {
  const stripe = accessFor("trialing", null, { trialEndsAt: now })
  assert.equal(getDashboardSubscriptionAccessState(stripe, "trialing").allowAccess, true)
  assert.match(getApplicationAccessPresentation(stripe).description, /pending reconciliation/)
  const onboarding = accessFor("trialing", null, { stripeSubscriptionId: null, trialEndsAt: now })
  assert.equal(getDashboardSubscriptionAccessState(onboarding, "trialing").allowAccess, false)
})

test("revocation, exact expiry, unknown states and absent profiles cannot authorize a default tier", () => {
  for (const access of [
    accessFor("canceled", { ...grant, expiresAt: now }),
    accessFor("paused", { ...grant, revokedAt: now }),
    accessFor("mystery", grant),
    accessFor("active", null, { stripeSubscriptionId: null }),
    accessFor("trialing", null, { subscriptionTier: "mystery" }),
    null,
  ]) {
    assert.equal(getDashboardSubscriptionAccessState(access).allowAccess, false)
    assert.equal(access?.effectiveTier ?? null, null)
    assert.equal(getApplicationAccessPresentation(access).headline, "Application access unavailable")
  }
})

test("only exact billing settings and cancellation paths bypass denied dashboard access", () => {
  for (const path of ["/dashboard/settings/subscription", "/dashboard/settings/subscription/cancel"]) {
    assert.equal(isDashboardBillingResolutionPath(path), true)
  }
  for (const path of [null, "/dashboard", "/dashboard/settings", "/dashboard/settings/account",
    "/dashboard/settings/subscription-fake", "/dashboard/settings/subscription/other"]) {
    assert.equal(isDashboardBillingResolutionPath(path), false)
  }
})

test("expired and revoked grant records remain visible in billing without claiming current access", () => {
  for (const inactive of [{ ...grant, expiresAt: now }, { ...grant, revokedAt: now }]) {
    const view = getApplicationAccessPresentation(accessFor("canceled", inactive))
    assert.equal(view.headline, "Application access unavailable")
    assert.equal(view.showBanner, false)
    assert.match(view.retainedGrant!, /Small Business.*does not.*establish access on its own/)
    if (inactive.revokedAt) assert.match(view.retainedGrant!, /revoked/)
  }
})

test("active paid subscription shows the next billing date and cancel action", () => {
  const state = getSubscriptionBillingState({
    status: "active",
    currentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
    subscriptionCancelAt: null,
    canCancelSubscription: true,
  })

  assert.deepEqual(state, {
    headline: "Next billing date: 12 September 2026",
    description: null,
    showCancelAction: true,
    isTrialOnly: false,
  })
})

test("trial-only account shows end free trial wording and no cancel action", () => {
  const state = getSubscriptionBillingState({
    status: "trialing",
    currentPeriodEnd: null,
    subscriptionCancelAt: null,
    canCancelSubscription: false,
  })

  assert.deepEqual(state, {
    headline: "End free trial",
    description: "You're on a free trial with no active paid subscription yet.",
    showCancelAction: true,
    isTrialOnly: true,
  })
})

test("scheduled cancellation shows cancels on date wording instead of renewal", () => {
  const state = getSubscriptionBillingState({
    status: "active",
    currentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
    subscriptionCancelAt: new Date("2026-09-12T00:00:00.000Z"),
    canCancelSubscription: true,
  })

  assert.deepEqual(state, {
    headline: "Cancels on 12 September 2026",
    description: "Your subscription stays active until 12 September 2026. You will not be charged again after that date.",
    showCancelAction: false,
    isTrialOnly: false,
  })
})

test("past_due billing state shows warning copy", () => {
  const state = getSubscriptionBillingState({
    status: "past_due",
    currentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
    subscriptionCancelAt: null,
    canCancelSubscription: true,
  })

  assert.deepEqual(state, {
    headline: "Payment overdue",
    description:
      "We could not process your latest payment. Please update your billing details to keep your reminders running.",
    showCancelAction: true,
    isTrialOnly: false,
  })
})

test("incomplete cancellation page disables cancel flow", () => {
  const state = getSubscriptionCancellationPageState({
    status: "incomplete",
    currentPeriodEnd: null,
    subscriptionCancelAt: null,
    canCancelSubscription: false,
  })

  assert.deepEqual(state, {
    title: "Subscription not active",
    description:
      "Your checkout was not completed. Finish checkout before managing cancellation.",
    confirmLabel: null,
    confirmDisabled: true,
  })
})

test("cancellation confirmation page shows a confirm button for active subscribers", () => {
  const state = getSubscriptionCancellationPageState({
    status: "active",
    currentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
    subscriptionCancelAt: null,
    canCancelSubscription: true,
  })

  assert.deepEqual(state, {
    title: "Are you sure?",
    description:
      "Your plan will remain active until 12 September 2026, and you will not be charged again after that date.",
    confirmLabel: "Continue to Stripe",
    confirmDisabled: false,
  })
})

test("cancellation confirmation page allows trial-only users to end the trial locally", () => {
  const state = getSubscriptionCancellationPageState({
    status: "trialing",
    currentPeriodEnd: null,
    subscriptionCancelAt: null,
    canCancelSubscription: false,
  })

  assert.deepEqual(state, {
    title: "Are you sure?",
    description:
      "You're on a free trial with no active paid subscription yet. Ending it now will stop the trial and return you to the subscription settings page.",
    confirmLabel: "End free trial",
    confirmDisabled: false,
  })
})