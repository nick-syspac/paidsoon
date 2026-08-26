import { before, beforeEach, describe, test, mock } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let canRewrite = true
let shouldRewriteThrow = false
let usageLogWrites = 0
let rewriteCalls = 0

let guardrailStatus: {
  allowed: boolean
  reason: "monthly" | "hourly" | "burst" | null
  monthlyQuota: number
  remainingMonthlyCredits: number
  usage: { monthly: number; hourly: number; burst: number }
  period: { start: Date; end: Date }
} | null = {
  allowed: true,
  reason: null,
  monthlyQuota: 120,
  remainingMonthlyCredits: 8,
  usage: { monthly: 112, hourly: 1, burst: 0 },
  period: { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/settings/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/settings/ai", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        requireFeature: async () => canRewrite,
      },
    })

    await mock.module("@/lib/email/ai-usage-guardrails", {
      namedExports: {
        AI_USAGE_LIMIT_ERROR: "Usage limit reached",
        getAiRewriteGuardrailStatus: async () => guardrailStatus,
      },
    })

    await mock.module("@/lib/email/ai-rewrite", {
      namedExports: {
        AI_REWRITE_MODEL: "gpt-4o-mini",
        INPUT_COST_PER_TOKEN_USD: 0.15 / 1_000_000,
        OUTPUT_COST_PER_TOKEN_USD: 0.6 / 1_000_000,
        rewriteMessage: async () => {
          rewriteCalls += 1
          if (shouldRewriteThrow) {
            throw new Error("provider down")
          }
          return {
            output: {
              friendly: { subject: "Friendly", message: "Friendly body" },
              firm: { subject: "Firm", message: "Firm body" },
              final_notice: { subject: "Final", message: "Final body" },
            },
            usage: {
              promptTokens: 100,
              completionTokens: 200,
              totalTokens: 300,
            },
          }
        },
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          aiUsageLog: {
            create: async () => {
              usageLogWrites += 1
              return {}
            },
          },
        },
      },
    })

    ;({ POST } = await import("@/app/api/settings/ai/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    canRewrite = true
    shouldRewriteThrow = false
    usageLogWrites = 0
    rewriteCalls = 0
    guardrailStatus = {
      allowed: true,
      reason: null,
      monthlyQuota: 120,
      remainingMonthlyCredits: 8,
      usage: { monthly: 112, hourly: 1, burst: 0 },
      period: { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") },
    }
  })

  test("allows request below limits and returns decremented remaining credits", async () => {
    const res = await POST(makeRequest({ text: "Please pay invoice #123 by Friday.", stage: 2 }))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.success, true)
    assert.equal(body.remainingMonthlyCredits, 7)
    assert.equal(rewriteCalls, 1)
    assert.equal(usageLogWrites, 1)
  })

  test("blocks request at monthly quota boundary", async () => {
    guardrailStatus = {
      allowed: false,
      reason: "monthly",
      monthlyQuota: 120,
      remainingMonthlyCredits: 0,
      usage: { monthly: 120, hourly: 0, burst: 0 },
      period: { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") },
    }

    const res = await POST(makeRequest({ text: "Please pay invoice #123 by Friday.", stage: 2 }))
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, "Usage limit reached")
    assert.equal(body.remainingMonthlyCredits, 0)
    assert.equal(rewriteCalls, 0)
    assert.equal(usageLogWrites, 0)
  })

  test("blocks request at hourly cap boundary", async () => {
    guardrailStatus = {
      allowed: false,
      reason: "hourly",
      monthlyQuota: 120,
      remainingMonthlyCredits: 2,
      usage: { monthly: 118, hourly: 12, burst: 0 },
      period: { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") },
    }

    const res = await POST(makeRequest({ text: "Please pay invoice #123 by Friday.", stage: 2 }))
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, "Usage limit reached")
    assert.equal(body.remainingMonthlyCredits, 2)
    assert.equal(rewriteCalls, 0)
    assert.equal(usageLogWrites, 0)
  })

  test("blocks request at burst-cap boundary", async () => {
    guardrailStatus = {
      allowed: false,
      reason: "burst",
      monthlyQuota: 120,
      remainingMonthlyCredits: 4,
      usage: { monthly: 116, hourly: 6, burst: 3 },
      period: { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") },
    }

    const res = await POST(makeRequest({ text: "Please pay invoice #123 by Friday.", stage: 2 }))
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, "Usage limit reached")
    assert.equal(body.remainingMonthlyCredits, 4)
    assert.equal(rewriteCalls, 0)
    assert.equal(usageLogWrites, 0)
  })

  test("validation failure does not consume usage", async () => {
    const res = await POST(makeRequest({ text: "short", stage: 2 }))
    assert.equal(res.status, 422)
    assert.equal(rewriteCalls, 0)
    assert.equal(usageLogWrites, 0)
  })

  test("entitlement failure does not consume usage", async () => {
    canRewrite = false

    const res = await POST(makeRequest({ text: "Please pay invoice #123 by Friday.", stage: 2 }))
    assert.equal(res.status, 403)
    assert.equal(rewriteCalls, 0)
    assert.equal(usageLogWrites, 0)
  })

  test("provider failure does not consume usage", async () => {
    shouldRewriteThrow = true

    const res = await POST(makeRequest({ text: "Please pay invoice #123 by Friday.", stage: 2 }))
    assert.equal(res.status, 500)
    assert.equal(rewriteCalls, 1)
    assert.equal(usageLogWrites, 0)
  })
})
