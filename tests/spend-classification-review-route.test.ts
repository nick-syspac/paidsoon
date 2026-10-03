import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"

type ReviewRoute = typeof import("@/app/api/spend-classification/review/route")
type CorrectionRoute = typeof import("@/app/api/spend-classification/review/[classificationId]/route")
type BulkRoute = typeof import("@/app/api/spend-classification/review/bulk-confirm/route")

let mockUser: { id: string } | null = { id: "tenant-a" }
let calls: Array<{ operation: string; userId: string; input?: unknown }> = []
let reviewRoute: ReviewRoute
let correctionRoute: CorrectionRoute
let bulkRoute: BulkRoute
const timestamp = new Date("2026-10-01T00:00:00.000Z")

function assignment(id: string, userId: string) {
  return { id, userId, status: "confirmed", origin: "manual", categoryId: "category-a", updatedAt: timestamp }
}

before(async () => {
  await mock.module("server-only", { namedExports: {} })
  await mock.module("@/lib/supabase/server", {
    namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
    },
  })
  await mock.module("@/lib/spendClassification/review", {
    namedExports: {
      SPEND_CLASSIFICATION_REVIEW_STATUSES: ["pending", "queued", "processing", "suggested", "confirmed", "needs_review", "excluded"],
      SpendClassificationReviewError: class SpendClassificationReviewError extends Error {
        code: string
        constructor(code: string) { super(code); this.code = code }
      },
      listSpendClassificationReview: async (userId: string, input: unknown) => {
        calls.push({ operation: "list", userId, input })
        return [{
          id: "classification-a",
          sourceType: "imported_bank_transaction",
          sourceRecordId: "source-row-a",
          status: "suggested",
          origin: "jev",
          categoryId: "category-a",
          confidence: 0.8,
          probabilities: { "category-a": 0.8 },
          model: "jev-1.13.0",
          ruleId: null,
          attemptCount: 0,
          lastErrorCode: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          category: { id: "category-a", name: "Travel", status: "active" },
          rule: null,
          importedBill: null,
          importedBankTransaction: {
            id: "source-row-a",
            description: "Train fare",
            counterpartyName: "Transit Co",
            amountCents: 4500,
            currency: "AUD",
            direction: "outflow",
            transactionDate: timestamp,
            expenseAccountCode: null,
            expenseAccountName: null,
            createdAt: timestamp,
            accountingConnection: { provider: "xero", organisationName: "Example Pty Ltd" },
          },
        }]
      },
      listSpendRefundCandidates: async (userId: string, classificationId: string) => {
        calls.push({ operation: "refund-candidates", userId, input: { classificationId } })
        return [{ id: "original-a", sourceType: "imported_bill", currency: "AUD", category: { id: "category-a", name: "Travel" } }]
      },
      markSpendClassificationAsTransfer: async (userId: string, input: unknown) => {
        calls.push({ operation: "mark-transfer", userId, input })
        return { ...assignment("classification-a", userId), status: "excluded", categoryId: null }
      },
      linkSpendRefund: async (userId: string, input: unknown) => {
        calls.push({ operation: "link-refund", userId, input })
        return { ...assignment("classification-a", userId), refundForClassificationId: "original-a" }
      },
      unlinkSpendRefund: async (userId: string, classificationId: string) => {
        calls.push({ operation: "unlink-refund", userId, input: { classificationId } })
        return assignment("classification-a", userId)
      },
      correctSpendClassification: async (userId: string, input: unknown) => {
        calls.push({ operation: "correct", userId, input })
        return assignment("classification-a", userId)
      },
      confirmSelectedSpendClassifications: async (userId: string, input: { classificationIds: string[] }) => {
        calls.push({ operation: "bulk", userId, input })
        return input.classificationIds.map((id) => assignment(id, userId))
      },
    },
  })
  ;[reviewRoute, correctionRoute, bulkRoute] = await Promise.all([
    import("@/app/api/spend-classification/review/route"),
    import("@/app/api/spend-classification/review/[classificationId]/route"),
    import("@/app/api/spend-classification/review/bulk-confirm/route"),
  ])
})

beforeEach(() => {
  mockUser = { id: "tenant-a" }
  calls = []
})

test("review list requires auth, validates filters, and scopes service calls to the session tenant", async () => {
  mockUser = null
  const unauthorized = await reviewRoute.GET(new Request("http://localhost/api/spend-classification/review"))
  assert.equal(unauthorized.status, 401)
  assert.equal(calls.length, 0)

  mockUser = { id: "tenant-b" }
  const invalid = await reviewRoute.GET(new Request("http://localhost/api/spend-classification/review?status=bogus"))
  assert.equal(invalid.status, 400)
  assert.equal(calls.length, 0)

  const response = await reviewRoute.GET(new Request("http://localhost/api/spend-classification/review?status=suggested&limit=20&offset=10"))
  assert.equal(response.status, 200)
  assert.deepEqual(calls[0], {
    operation: "list",
    userId: "tenant-b",
    input: { status: "suggested", limit: 20, offset: 10 },
  })
  const body = await response.json()
  assert.equal(body.items[0].source.recordId, "source-row-a")
  assert.equal(body.items[0].source.accountingProvider, "xero")
  assert.equal("userId" in body.items[0], false)
  assert.equal("sourceId" in body.items[0].source, false)
})

test("individual correction validates payloads and only creates a rule when explicitly requested", async () => {
  mockUser = null
  const unauthorized = await correctionRoute.PATCH(
    new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ categoryId: "category-a" }) }),
    { params: Promise.resolve({ classificationId: "classification-a" }) },
  )
  assert.equal(unauthorized.status, 401)

  mockUser = { id: "tenant-a" }
  const invalid = await correctionRoute.PATCH(
    new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ categoryId: "category-a", userId: "tenant-b" }) }),
    { params: Promise.resolve({ classificationId: "classification-a" }) },
  )
  assert.equal(invalid.status, 400)
  assert.equal(calls.length, 0)

  mockUser = { id: "tenant-b" }
  const valid = await correctionRoute.PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ categoryId: "category-b", reason: "Verified", createRule: { ruleType: "text_match", phrase: "train fare" } }),
    }),
    { params: Promise.resolve({ classificationId: "classification-b" }) },
  )
  assert.equal(valid.status, 200)
  assert.deepEqual(calls[0], {
    operation: "correct",
    userId: "tenant-b",
    input: {
      classificationId: "classification-b",
      categoryId: "category-b",
      reason: "Verified",
      createRule: { ruleType: "text_match", phrase: "train fare" },
    },
  })
  const body = await valid.json()
  assert.equal("userId" in body.classification, false)
})

test("special review actions require authentication and use only the path and session identity", async () => {
  mockUser = null
  const unauthorized = await correctionRoute.GET(new Request("http://localhost"), {
    params: Promise.resolve({ classificationId: "refund-a" }),
  })
  assert.equal(unauthorized.status, 401)

  mockUser = { id: "tenant-b" }
  const candidates = await correctionRoute.GET(new Request("http://localhost"), {
    params: Promise.resolve({ classificationId: "refund-a" }),
  })
  assert.equal(candidates.status, 200)
  assert.equal(calls[0].userId, "tenant-b")
  assert.equal(calls[0].operation, "refund-candidates")

  const transfer = await correctionRoute.PATCH(new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_transfer", reason: "Own accounts" }),
  }), { params: Promise.resolve({ classificationId: "transfer-a" }) })
  assert.equal(transfer.status, 200)
  assert.deepEqual(calls[1], {
    operation: "mark-transfer",
    userId: "tenant-b",
    input: { classificationId: "transfer-a", reason: "Own accounts" },
  })

  const refund = await correctionRoute.PATCH(new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify({ action: "link_refund", originalClassificationId: "original-a", userId: "tenant-a" }),
  }), { params: Promise.resolve({ classificationId: "refund-a" }) })
  assert.equal(refund.status, 400)
  assert.equal(calls.length, 2)

  const validRefund = await correctionRoute.PATCH(new Request("http://localhost", {
    method: "PATCH",
    body: JSON.stringify({ action: "link_refund", originalClassificationId: "original-a" }),
  }), { params: Promise.resolve({ classificationId: "refund-a" }) })
  assert.equal(validRefund.status, 200)
  assert.deepEqual(calls[2], {
    operation: "link-refund",
    userId: "tenant-b",
    input: { refundClassificationId: "refund-a", originalClassificationId: "original-a" },
  })
})

test("bulk confirmation requires explicit unique bounded IDs and forwards only the session tenant", async () => {
  mockUser = null
  const unauthorized = await bulkRoute.POST(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ classificationIds: ["classification-a"], categoryId: "category-a" }),
  }))
  assert.equal(unauthorized.status, 401)

  mockUser = { id: "tenant-a" }
  const invalid = await bulkRoute.POST(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ classificationIds: ["one", "one"], categoryId: "category-a" }),
  }))
  assert.equal(invalid.status, 400)
  assert.equal(calls.length, 0)

  mockUser = { id: "tenant-b" }
  const response = await bulkRoute.POST(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ classificationIds: ["classification-x", "classification-y"], categoryId: "category-b" }),
  }))
  assert.equal(response.status, 200)
  assert.equal(calls[0].userId, "tenant-b")
  assert.deepEqual(calls[0].input, { classificationIds: ["classification-x", "classification-y"], categoryId: "category-b" })
  const body = await response.json()
  assert.equal(body.classifications.length, 2)
  assert.equal("userId" in body.classifications[0], false)
})
