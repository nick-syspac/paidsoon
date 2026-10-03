import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"

type Row = Record<string, unknown>
let rows: Row[]
let events: Row[]
let service: typeof import("@/lib/spendClassification/review")

function createTx(userId: string) {
  return {
    $executeRawUnsafe: async () => 0,
    spendClassification: {
      findFirst: async ({ where }: { where: Row }) =>
        rows.find((row) => row.userId === userId && row.id === where.id) ?? null,
      findMany: async ({ where }: { where: Row }) => rows.filter((row) => {
        if (row.userId !== userId) return false
        if (typeof where.id === "object" && where.id !== null) {
          const idFilter = where.id as Row
          if (typeof idFilter.in === "object" && Array.isArray(idFilter.in) && !idFilter.in.includes(row.id)) return false
          if (typeof idFilter.not === "string" && idFilter.not === row.id) return false
        }
        if (typeof where.refundForClassificationId === "string" && row.refundForClassificationId !== where.refundForClassificationId) return false
        if (typeof where.refundForClassificationId === "object" && where.refundForClassificationId !== null) {
          const linkFilter = where.refundForClassificationId as Row
          if (linkFilter.in && Array.isArray(linkFilter.in) && !linkFilter.in.includes(row.refundForClassificationId)) return false
          if (linkFilter === null && row.refundForClassificationId !== null) return false
        }
        if (typeof where.status === "string" && row.status !== where.status) return false
        if (where.categoryId && row.categoryId === null) return false
        return true
      }),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = rows.find((candidate) => candidate.userId === userId && candidate.id === where.id)
        if (!row) throw new Error("missing classification")
        Object.assign(row, data)
        return row
      },
    },
    spendClassificationClaim: { deleteMany: async () => ({ count: 0 }) },
    spendClassificationEvent: {
      create: async ({ data }: { data: Row }) => {
        events.push(data)
        return data
      },
    },
  }
}

before(async () => {
  await mock.module("server-only", { namedExports: {} })
  await mock.module("@/lib/db/withUserContext", {
    namedExports: {
      withUserContext: async (userId: string, callback: (tx: never) => Promise<unknown>) =>
        callback(createTx(userId) as never),
    },
  })
  await mock.module("@/lib/spendClassification/locks", {
    namedExports: { lockSpendClassificationTenant: async () => undefined },
  })
  service = await import("@/lib/spendClassification/review")
})

beforeEach(() => {
  rows = [
    {
      id: "original-bank",
      userId: "tenant-a",
      sourceType: "imported_bank_transaction",
      status: "confirmed",
      origin: "manual",
      categoryId: "category-software",
      refundForClassificationId: null,
      category: { id: "category-software", name: "Software & Cloud" },
      importedBankTransaction: { direction: "outflow", amountCents: -10000, currency: "AUD", counterpartyName: "Cloud Co", description: "Cloud subscription" },
      importedBill: null,
    },
    {
      id: "original-bill",
      userId: "tenant-a",
      sourceType: "imported_bill",
      status: "confirmed",
      origin: "manual",
      categoryId: "category-software",
      refundForClassificationId: null,
      category: { id: "category-software", name: "Software & Cloud" },
      importedBankTransaction: null,
      importedBill: { status: "open", amountCents: 6000, currency: "AUD", supplierName: "Cloud Co", documentNumber: "B-1" },
    },
    {
      id: "refund-bank",
      userId: "tenant-a",
      sourceType: "imported_bank_transaction",
      status: "needs_review",
      origin: null,
      categoryId: null,
      refundForClassificationId: null,
      importedBankTransaction: { direction: "inflow", amountCents: 2500, currency: "AUD", counterpartyName: "Cloud Co", description: "Credit" },
      importedBill: null,
    },
    {
      id: "transfer-bank",
      userId: "tenant-a",
      sourceType: "imported_bank_transaction",
      status: "pending",
      origin: null,
      categoryId: "category-software",
      refundForClassificationId: null,
      refunds: [],
      importedBankTransaction: { direction: "outflow", amountCents: -8000, currency: "AUD" },
      importedBill: null,
    },
    {
      id: "private-original",
      userId: "tenant-b",
      sourceType: "imported_bank_transaction",
      status: "confirmed",
      origin: "manual",
      categoryId: "private-category",
      refundForClassificationId: null,
      importedBankTransaction: { direction: "outflow", amountCents: -10000, currency: "AUD" },
      importedBill: null,
    },
  ]
  events = []
})

test("manual transfer action excludes spend, clears category, and writes audit history", async () => {
  const result = await service.markSpendClassificationAsTransfer("tenant-a", { classificationId: "transfer-bank", reason: "Between own accounts" })
  assert.equal(result.status, "excluded")
  assert.equal(result.origin, "manual")
  assert.equal(result.categoryId, null)
  assert.equal(events[0]?.eventType, "classification_marked_internal_transfer")
  assert.equal(events[0]?.reason, "Between own accounts")
})

test("explicit same-source refund link is confirmed and traceable to the original assignment", async () => {
  const result = await service.linkSpendRefund("tenant-a", {
    refundClassificationId: "refund-bank",
    originalClassificationId: "original-bank",
  })
  assert.equal(result.status, "confirmed")
  assert.equal(result.origin, "manual")
  assert.equal(result.categoryId, null)
  assert.equal(result.refundForClassificationId, "original-bank")
  assert.equal(events[0]?.eventType, "classification_refund_linked")
})

test("cross-source linked refund candidate is traceable but does not alter the bill assignment", async () => {
  await service.linkSpendRefund("tenant-a", {
    refundClassificationId: "refund-bank",
    originalClassificationId: "original-bill",
  })
  assert.equal(rows.find((row) => row.id === "original-bill")?.status, "confirmed")
  assert.equal(rows.find((row) => row.id === "refund-bank")?.refundForClassificationId, "original-bill")
})

test("unlinking a refund clears the netting relationship and returns it to review", async () => {
  await service.linkSpendRefund("tenant-a", {
    refundClassificationId: "refund-bank",
    originalClassificationId: "original-bank",
  })
  const result = await service.unlinkSpendRefund("tenant-a", "refund-bank")
  assert.equal(result.status, "needs_review")
  assert.equal(result.refundForClassificationId, null)
  assert.deepEqual(events.map(({ eventType }) => eventType), [
    "classification_refund_linked",
    "classification_refund_unlinked",
  ])
})

test("refund links reject cross-tenant, non-outflow, currency-mismatch, and over-allocation targets", async () => {
  await assert.rejects(
    service.linkSpendRefund("tenant-a", { refundClassificationId: "refund-bank", originalClassificationId: "private-original" }),
    (error: unknown) => error instanceof service.SpendClassificationReviewError && error.code === "invalid_refund_target",
  )
  rows.push({
    id: "inflow-target", userId: "tenant-a", sourceType: "imported_bank_transaction", status: "confirmed", categoryId: "category-software",
    importedBankTransaction: { direction: "inflow", amountCents: 9000, currency: "AUD" },
  })
  await assert.rejects(
    service.linkSpendRefund("tenant-a", { refundClassificationId: "refund-bank", originalClassificationId: "inflow-target" }),
    (error: unknown) => error instanceof service.SpendClassificationReviewError && error.code === "invalid_refund_target",
  )
  rows.find((row) => row.id === "refund-bank")!.importedBankTransaction = { direction: "inflow", amountCents: 2500, currency: "USD" }
  await assert.rejects(
    service.linkSpendRefund("tenant-a", { refundClassificationId: "refund-bank", originalClassificationId: "original-bank" }),
    (error: unknown) => error instanceof service.SpendClassificationReviewError && error.code === "refund_currency_mismatch",
  )
  rows.find((row) => row.id === "refund-bank")!.importedBankTransaction = { direction: "inflow", amountCents: 12000, currency: "AUD" }
  await assert.rejects(
    service.linkSpendRefund("tenant-a", { refundClassificationId: "refund-bank", originalClassificationId: "original-bank" }),
    (error: unknown) => error instanceof service.SpendClassificationReviewError && error.code === "refund_exceeds_original",
  )
  assert.equal(events.length, 0)
})

test("refund candidate lookup is tenant- and currency-scoped", async () => {
  const candidates = await service.listSpendRefundCandidates("tenant-a", "refund-bank")
  assert.deepEqual(candidates.map(({ id }) => id), ["original-bank", "original-bill"])
})
