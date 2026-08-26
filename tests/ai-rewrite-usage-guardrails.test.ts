import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  getAiRewriteGuardrailPolicy,
  evaluateAiRewriteGuardrails,
  resolveAiRewriteQuotaWindow,
  countAiRewriteUsageWindows,
} from "@/lib/email/ai-usage-guardrails"

describe("ai rewrite usage guardrails helper", () => {
  test("returns expected per-tier policy values", () => {
    assert.equal(getAiRewriteGuardrailPolicy("starter"), null)
    assert.deepEqual(getAiRewriteGuardrailPolicy("solo"), {
      monthlyQuota: 120,
      hourlyCap: 12,
      burstCap: 3,
    })
    assert.deepEqual(getAiRewriteGuardrailPolicy("small_business"), {
      monthlyQuota: 500,
      hourlyCap: 20,
      burstCap: 5,
    })
    assert.deepEqual(getAiRewriteGuardrailPolicy("accountant_partner"), {
      monthlyQuota: 1500,
      hourlyCap: 40,
      burstCap: 8,
    })
  })

  test("evaluates monthly, hourly, and burst limit precedence", () => {
    const policy = { monthlyQuota: 10, hourlyCap: 4, burstCap: 2 }

    assert.deepEqual(
      evaluateAiRewriteGuardrails(policy, { monthly: 10, hourly: 0, burst: 0 }),
      { allowed: false, reason: "monthly", remainingMonthlyCredits: 0 },
    )

    assert.deepEqual(
      evaluateAiRewriteGuardrails(policy, { monthly: 9, hourly: 4, burst: 0 }),
      { allowed: false, reason: "hourly", remainingMonthlyCredits: 1 },
    )

    assert.deepEqual(
      evaluateAiRewriteGuardrails(policy, { monthly: 9, hourly: 3, burst: 2 }),
      { allowed: false, reason: "burst", remainingMonthlyCredits: 1 },
    )

    assert.deepEqual(
      evaluateAiRewriteGuardrails(policy, { monthly: 3, hourly: 2, burst: 1 }),
      { allowed: true, reason: null, remainingMonthlyCredits: 7 },
    )
  })

  test("uses subscription period when available for quota window", () => {
    const start = new Date("2026-08-01T00:00:00.000Z")
    const end = new Date("2026-09-01T00:00:00.000Z")
    const now = new Date("2026-08-15T12:00:00.000Z")

    const window = resolveAiRewriteQuotaWindow(
      {
        subscriptionTier: "solo",
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: start,
        subscriptionCurrentPeriodEnd: end,
        trialEndsAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      now,
    )

    assert.equal(window.start.toISOString(), start.toISOString())
    assert.equal(window.end.toISOString(), end.toISOString())
  })

  test("counts monthly, hourly, and burst usage windows from ai_usage_logs", async () => {
    const now = new Date("2026-08-20T10:00:00.000Z")
    const calls: Array<Date> = []

    const tx = {
      aiUsageLog: {
        count: async ({
          where,
        }: {
          where: {
            userId: string
            feature: string
            createdAt: { gte: Date; lt?: Date }
          }
        }) => {
          const gte = where.createdAt.gte
          calls.push(gte)
          if (gte.getTime() === new Date("2026-08-01T00:00:00.000Z").getTime()) return 6
          if (gte.getTime() === new Date("2026-08-20T09:00:00.000Z").getTime()) return 2
          return 1
        },
      },
    }

    const result = await countAiRewriteUsageWindows(
      tx as unknown as Parameters<typeof countAiRewriteUsageWindows>[0],
      "user-1",
      {
        subscriptionTier: "small_business",
        subscriptionStatus: "active",
        subscriptionCurrentPeriodStart: new Date("2026-08-01T00:00:00.000Z"),
        subscriptionCurrentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
        trialEndsAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      now,
    )

    assert.deepEqual(result.usage, { monthly: 6, hourly: 2, burst: 1 })
    assert.equal(calls.length, 3)
  })
})
