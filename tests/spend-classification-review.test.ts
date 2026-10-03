import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

type Classification = {
  id: string
  userId: string
  categoryId: string | null
  origin: string | null
  status: string
  confidence?: number | null
  probabilities?: unknown
  model?: string | null
  ruleId?: string | null
  attemptCount?: number
  nextAttemptAt?: Date | null
  lastErrorCode?: string | null
  claimedAt?: Date | null
  updatedBy?: string
  updatedAt?: Date
}

let classifications: Classification[]
let categories: Array<{ id: string; userId: string; status: string }>
let rules: Array<Record<string, unknown>>
let events: Array<Record<string, unknown>>
let reviewService: typeof import("@/lib/spendClassification/review")

function createTx(userId: string) {
  return {
    $executeRawUnsafe: async () => 0,
    spendCategory: {
      findFirst: async ({ where }: { where: { userId: string; id: string; status: string } }) =>
        categories.find((category) => category.userId === userId && category.id === where.id && category.status === where.status) ?? null,
    },
    spendClassification: {
      findFirst: async ({ where }: { where: { userId: string; id: string } }) =>
        classifications.find((row) => row.userId === userId && row.id === where.id) ?? null,
      findMany: async ({ where }: { where: { userId: string; id?: { in: string[] }; status?: string } }) =>
        classifications.filter((row) => row.userId === userId &&
          (!where.id || where.id.in.includes(row.id)) && (!where.status || row.status === where.status)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = classifications.find((candidate) => candidate.userId === userId && candidate.id === where.id)
        if (!row) throw new Error("missing classification")
        Object.assign(row, data, { updatedAt: new Date("2026-10-01T00:00:00.000Z") })
        return row
      },
    },
    spendClassificationClaim: {
      deleteMany: async () => ({ count: 0 }),
    },
    spendClassificationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data)
        return data
      },
    },
    spendClassificationRule: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...data, id: `rule-${rules.length + 1}`, createdAt: new Date("2026-10-01T00:00:00.000Z") }
        rules.push(created)
        return created
      },
    },
  }
}

before(async () => {
  await mock.module("@/lib/db/withUserContext", {
    namedExports: {
      withUserContext: async (userId: string, callback: (tx: never) => Promise<unknown>) =>
        callback(createTx(userId) as never),
    },
  })
  await mock.module("@/lib/spendClassification/locks", {
    namedExports: { lockSpendClassificationTenant: async () => undefined },
  })
  reviewService = await import("@/lib/spendClassification/review")
})

describe("spend classification review service", { concurrency: false }, () => {
beforeEach(() => {
  classifications = [
    { id: "classification-a", userId: "tenant-a", categoryId: null, origin: "jev", status: "suggested" },
    { id: "classification-b", userId: "tenant-a", categoryId: null, origin: null, status: "needs_review" },
    { id: "classification-private", userId: "tenant-b", categoryId: null, origin: "jev", status: "suggested" },
  ]
  categories = [
    { id: "category-a", userId: "tenant-a", status: "active" },
    { id: "category-b", userId: "tenant-b", status: "active" },
  ]
  rules = []
  events = []
})

test("review listing is tenant-scoped and applies the requested status filter", async () => {
  const results = await reviewService.listSpendClassificationReview("tenant-a", { status: "suggested", limit: 10, offset: 0 })
  assert.deepEqual(results.map(({ id }) => id), ["classification-a"])
})

test("single correction writes a manual assignment and audit event without implicitly creating a rule", async () => {
  const result = await reviewService.correctSpendClassification("tenant-a", {
    classificationId: "classification-a",
    categoryId: "category-a",
    reason: "Confirmed from receipt",
  })

  assert.equal(result.origin, "manual")
  assert.equal(result.status, "confirmed")
  assert.equal(result.categoryId, "category-a")
  assert.equal(rules.length, 0)
  assert.equal(events.length, 1)
  assert.equal(events[0].actorId, "tenant-a")
  assert.equal(events[0].reason, "Confirmed from receipt")
  assert.equal(events[0].oldCategoryId, null)
  assert.equal(events[0].newCategoryId, "category-a")
})

test("an explicitly requested future rule is created atomically with the correction", async () => {
  await reviewService.correctSpendClassification("tenant-a", {
    classificationId: "classification-a",
    categoryId: "category-a",
    createRule: { ruleType: "merchant", merchantName: " Aster   Cloud " },
  })

  assert.equal(rules.length, 1)
  assert.equal(rules[0].userId, "tenant-a")
  assert.deepEqual(rules[0].matchConfig, { merchantName: "aster cloud" })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].metadata, {
    oldOrigin: "jev",
    newOrigin: "manual",
    futureRuleId: "rule-1",
    futureOnly: true,
  })
})

test("bulk confirmation audits each explicit selection and does not create rules", async () => {
  const results = await reviewService.confirmSelectedSpendClassifications("tenant-a", {
    classificationIds: ["classification-a", "classification-b"],
    categoryId: "category-a",
  })

  assert.equal(results.length, 2)
  assert.deepEqual(results.map(({ origin, status, categoryId }) => ({ origin, status, categoryId })), [
    { origin: "manual", status: "confirmed", categoryId: "category-a" },
    { origin: "manual", status: "confirmed", categoryId: "category-a" },
  ])
  assert.equal(events.length, 2)
  assert.deepEqual(events.map(({ classificationId }) => classificationId), ["classification-a", "classification-b"])
  assert.equal(rules.length, 0)
})

test("tenant-scoped correction does not reveal another tenant's classification", async () => {
  await assert.rejects(
    reviewService.correctSpendClassification("tenant-a", {
      classificationId: "classification-private",
      categoryId: "category-a",
    }),
    (error: unknown) => error instanceof reviewService.SpendClassificationReviewError && error.code === "classification_not_found",
  )
  assert.equal(events.length, 0)
})

test("bulk confirmation rejects manual records atomically", async () => {
  classifications[0].origin = "manual"
  await assert.rejects(
    reviewService.confirmSelectedSpendClassifications("tenant-a", {
      classificationIds: ["classification-b", "classification-a"],
      categoryId: "category-a",
    }),
    (error: unknown) => error instanceof reviewService.SpendClassificationReviewError && error.code === "manual_assignment_protected",
  )
  assert.equal(classifications[1].origin, null)
  assert.equal(events.length, 0)
})
})
