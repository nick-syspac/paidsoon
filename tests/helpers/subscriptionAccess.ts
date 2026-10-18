import { before, mock } from "node:test"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"

// Existing route suites exercise validation, feature denial and tenant ownership.
// Supply the new boundary's fresh loader without touching DB mocks or assertions.
before(async () => {
  await mock.module("@/lib/billing/effectiveAccessLoader", {
    namedExports: {
      getEffectiveAccess: async () => resolveEffectiveAccess({
        profile: {
          subscriptionStatus: "active",
          subscriptionTier: "business_pro",
          stripeSubscriptionId: "sub_test_only",
          trialEndsAt: null,
          billingAccessVersion: 1,
        },
        grant: null,
        billingRisks: [],
      }, new Date("2026-10-14T12:00:00Z")),
    },
  })
})