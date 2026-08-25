import assert from "node:assert/strict"
import { test } from "node:test"

import { getSubscriptionBillingState, getSubscriptionCancellationPageState } from "@/lib/subscriptionStatusPresentation"

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