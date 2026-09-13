import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDepositGuardCashPlanLineItems,
  buildDepositGuardNotificationPlan,
  buildDepositGuardRunwayImpact,
} from "@/lib/depositGuard/integrationsCore"

test("deposit guard cash plan items split expected inflows from received cash", () => {
  const lineItems = buildDepositGuardCashPlanLineItems({
    now: new Date("2026-09-13T00:00:00.000Z"),
    requests: [
      {
        id: "request-1",
        jobId: "job-1",
        customerId: null,
        requestType: "deposit",
        description: null,
        amountCents: 25_000,
        taxAmountCents: null,
        totalAmountCents: 25_000,
        currency: "aud",
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
        status: "requested",
        sentAt: new Date("2026-09-13T00:00:00.000Z"),
        firstViewedAt: null,
        lastViewedAt: null,
        paidAt: null,
        cancelledAt: null,
        createdAt: new Date("2026-09-13T00:00:00.000Z"),
        updatedAt: new Date("2026-09-13T00:00:00.000Z"),
      },
    ],
    payments: [
      {
        id: "payment-1",
        jobId: "job-1",
        depositRequestId: "request-1",
        amountCents: 10_000,
        currency: "aud",
        paymentMethod: "bank_transfer",
        paymentProvider: "manual",
        status: "confirmed",
        paidAt: new Date("2026-09-14T00:00:00.000Z"),
        recordedBy: null,
        notes: null,
        createdAt: new Date("2026-09-14T00:00:00.000Z"),
        updatedAt: new Date("2026-09-14T00:00:00.000Z"),
      },
    ],
  })

  assert.equal(lineItems.inflows.length, 2)
  assert.equal(lineItems.outflows.length, 0)
  assert.equal(lineItems.inflows[0]?.amountCents, 15_000)
  assert.equal(lineItems.inflows[1]?.amountCents, 10_000)
})

test("deposit guard runway impact builds a forecast from deposit cash receipts", () => {
  const impact = buildDepositGuardRunwayImpact({
    openingCashCents: 50_000,
    now: new Date("2026-09-13T00:00:00.000Z"),
    requests: [
      {
        id: "request-1",
        jobId: "job-1",
        customerId: null,
        requestType: "deposit",
        description: null,
        amountCents: 25_000,
        taxAmountCents: null,
        totalAmountCents: 25_000,
        currency: "aud",
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
        status: "requested",
        sentAt: new Date("2026-09-13T00:00:00.000Z"),
        firstViewedAt: null,
        lastViewedAt: null,
        paidAt: null,
        cancelledAt: null,
        createdAt: new Date("2026-09-13T00:00:00.000Z"),
        updatedAt: new Date("2026-09-13T00:00:00.000Z"),
      },
    ],
    payments: [],
    horizonWeeks: 4,
  })

  assert.equal(impact.forecast[0]?.projectedCashCents, 50_000)
  assert.equal(impact.forecast[1]?.projectedCashCents, 75_000)
  assert.ok(impact.reasons[0]?.includes("deposit request"))
})

test("deposit guard notification plan includes deep links for key transitions", () => {
  const plan = buildDepositGuardNotificationPlan({
    jobs: [
      {
        id: "job-1",
        name: "Website redesign",
        workStatus: "ready_to_start",
        paymentStatus: "overdue",
        commencementBlocked: false,
      },
    ],
    requests: [
      {
        id: "request-1",
        jobId: "job-1",
        status: "viewed",
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
        paidAt: null,
        firstViewedAt: new Date("2026-09-13T00:00:00.000Z"),
        lastViewedAt: new Date("2026-09-13T01:00:00.000Z"),
      },
    ],
  })

  assert.equal(plan.immediate.length, 2)
  assert.equal(plan.daily.length, 1)
  assert.equal(plan.immediate[0]?.href, "/dashboard/deposit-guard/job-1")
  assert.equal(plan.daily[0]?.href, "/dashboard/deposit-guard/job-1#request-request-1")
})