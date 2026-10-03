import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { buildSpendClassificationSummary } from "@/lib/spendClassification/summaries"
import { runSpendClassificationWorker } from "@/lib/spendClassification/workerCore"

type Row = Record<string, unknown>
type HandoffResult = Exclude<
  Awaited<ReturnType<typeof import("@/lib/spendClassification/handoff").handoffImportedSpendForClassification>>,
  { status: "source_not_found" }
>

let categories: Row[]
let bill: Row | null
let transaction: Row | null
let rules: Row[]
let settingEnabled: boolean
let classification: Row | null
let upsertCalls: Row[]
let auditEvents: Row[]
let jevContexts: Row[]
let handoffService: typeof import("@/lib/spendClassification/handoff")
let jevRequestService: typeof import("@/lib/spendClassification/jevRequest")
let reviewService: typeof import("@/lib/spendClassification/review")

function assertHandoffResult(result: unknown): asserts result is HandoffResult {
  assert.ok(result && typeof result === "object" && "status" in result && result.status !== "source_not_found")
}

function makeTx(userId: string) {
  return {
    importedBill: {
      findFirst: async ({ where }: { where: Row }) =>
        bill && bill.userId === userId && bill.id === where.id ? bill : null,
    },
    importedBankTransaction: {
      findFirst: async ({ where }: { where: Row }) =>
        transaction && transaction.userId === userId && transaction.id === where.id ? transaction : null,
    },
    spendClassificationSetting: {
      findUnique: async () => ({ enabled: settingEnabled }),
    },
    spendClassification: {
      findFirst: async ({ where }: { where: Row }) =>
        classification && classification.userId === userId &&
        (where.id === undefined || classification.id === where.id) &&
        (where.sourceType === undefined || classification.sourceType === where.sourceType) &&
        (where.sourceRecordId === undefined || classification.sourceRecordId === where.sourceRecordId) &&
        (where.status === undefined || (where.status as Row).in === undefined ||
          ((where.status as Row).in as string[]).includes(String(classification.status)))
          ? classification
          : null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        if (!classification || classification.userId !== userId || classification.id !== where.id) {
          throw new Error("classification not found")
        }
        Object.assign(classification, data, { updatedAt: new Date("2026-10-01T00:00:00.000Z") })
        return classification
      },
    },
    spendClassificationRule: {
      findMany: async ({ where }: { where: Row }) => {
        const createdAt = (where.createdAt as Row | undefined)?.lte as Date | undefined
        return rules.filter((rule) => !createdAt || !(rule.createdAt instanceof Date) || rule.createdAt <= createdAt)
      },
    },
    spendCategory: {
      findMany: async () => categories,
      findFirst: async ({ where }: { where: Row }) => categories.find((category) =>
        category.id === where.id && category.status === where.status) ?? null,
    },
    spendClassificationClaim: { deleteMany: async () => ({ count: 0 }) },
    spendClassificationEvent: {
      create: async ({ data }: { data: Row }) => {
        auditEvents.push(data)
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
        callback(makeTx(userId) as never),
    },
  })
  await mock.module("@/lib/spendClassification/categories", {
    namedExports: {
      provisionDefaultSpendCategories: async () => categories,
    },
  })
  await mock.module("@/lib/spendClassification/assignments", {
    namedExports: {
      upsertSpendClassification: async (userId: string, input: Row) => {
        upsertCalls.push(input)
        if (classification?.origin === "manual") return classification
        classification = {
          id: classification?.id ?? "classification-1",
          userId,
          sourceType: input.sourceType,
          sourceRecordId: input.sourceRecordId,
          ...input,
        }
        return classification
      },
    },
  })
  await mock.module("@/lib/spendClassification/jevClient", {
    namedExports: {
      JEV_MODEL: "jev-1.13.0",
      classifySpendWithJev: async (state: Row, options: Row[]) => {
        jevContexts.push({ state, options })
        return {
          categoryId: "category-software",
          confidence: 0.91,
          probabilities: { "category-software": 0.91, "category-other": 0.09 },
          model: "jev-1.13.0",
          usage: { inputTokens: 18, outputTokens: 4 },
        }
      },
    },
  })
  await mock.module("@/lib/spendClassification/locks", {
    namedExports: { lockSpendClassificationTenant: async () => undefined },
  })
  handoffService = await import("@/lib/spendClassification/handoff")
  jevRequestService = await import("@/lib/spendClassification/jevRequest")
  reviewService = await import("@/lib/spendClassification/review")
})

beforeEach(() => {
  categories = [
    { id: "category-software", name: "Software & Cloud", normalizedName: "software & cloud", description: null, status: "active", updatedAt: new Date("2026-01-01T00:00:00Z") },
    { id: "category-other", name: "Other", normalizedName: "other", description: null, status: "active", updatedAt: new Date("2026-01-01T00:00:00Z") },
  ]
  bill = {
    id: "bill-1",
    userId: "tenant-1",
    accountingConnectionId: "connection-1",
    supplierName: "Aster Cloud",
    expenseAccountCode: null,
    expenseAccountName: null,
    currency: "AUD",
    status: "open",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }
  transaction = {
    id: "transaction-1",
    userId: "tenant-1",
    accountingConnectionId: "connection-1",
    counterpartyName: "Aster Cloud",
    description: "Monthly hosted application access",
    expenseAccountCode: null,
    expenseAccountName: null,
    direction: "outflow",
    currency: "AUD",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }
  rules = []
  settingEnabled = true
  classification = null
  upsertCalls = []
  auditEvents = []
  jevContexts = []
})

test("queues an opted-in unresolved source once and does not repeat completed Jev work on unchanged re-import", async () => {
  const first = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(first)
  assert.equal(first?.status, "created_or_updated")
  assert.equal(first?.classificationStatus, "queued")
  assert.equal(upsertCalls.length, 1)

  classification = {
    ...classification,
    status: "suggested",
    origin: "jev",
  }
  const replay = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(replay)
  assert.equal(replay?.status, "unchanged")
  assert.equal(replay?.classificationStatus, "suggested")
  assert.equal(upsertCalls.length, 1)
})

test("seeded opt-in lifecycle queues, suggests, corrects, preserves on re-import, and summarizes without changing source data", async () => {
  transaction = { ...transaction!, amountCents: -12_500 }
  const importedSourceSnapshot = structuredClone(transaction)
  const queued = await handoffService.handoffImportedSpendForClassification(
    "tenant-1",
    "imported_bank_transaction",
    "transaction-1",
  )
  assertHandoffResult(queued)
  assert.equal(queued.classificationStatus, "queued")
  assert.ok(classification)

  const workerResult = await runSpendClassificationWorker({
    store: {
      acquireLease: async () => true,
      claimBatch: async () => {
        if (!classification || classification.status !== "queued") return []
        classification.status = "processing"
        return [{
          userId: "tenant-1",
          classificationId: String(classification.id),
          sourceType: "imported_bank_transaction",
          sourceRecordId: "transaction-1",
          sourceFingerprint: String(classification.sourceFingerprint),
          claimToken: "claim-1",
        }]
      },
      complete: async (_claim, result) => {
        if (!classification || classification.status !== "processing") return "stale"
        Object.assign(classification, {
          categoryId: result.categoryId,
          confidence: result.confidence,
          probabilities: result.probabilities,
          model: result.model,
          status: "suggested",
          origin: "jev",
        })
        return "suggested"
      },
      failClaim: async () => "needs_review",
      releaseClaim: async () => undefined,
      releaseLease: async () => undefined,
    },
    request: async (claim) => jevRequestService.requestJevSuggestionForSpend(
      claim.userId,
      claim.sourceType,
      claim.sourceRecordId,
    ),
    createOwnerToken: () => "e2e-owner",
  })

  assert.equal(workerResult.completed, 1)
  assert.equal(classification?.status, "suggested")
  assert.deepEqual(jevContexts[0]?.state, {
    description: "Monthly hosted application access",
    direction: "outflow",
    currency: "AUD",
  })

  await reviewService.correctSpendClassification("tenant-1", {
    classificationId: String(classification?.id),
    categoryId: "category-other",
    reason: "Reviewed against the source document",
  })
  assert.equal(classification?.status, "confirmed")
  assert.equal(classification?.origin, "manual")
  assert.equal(classification?.categoryId, "category-other")
  assert.equal(auditEvents.at(-1)?.eventType, "classification_manually_confirmed")

  const reimport = await handoffService.handoffImportedSpendForClassification(
    "tenant-1",
    "imported_bank_transaction",
    "transaction-1",
  )
  assertHandoffResult(reimport)
  assert.equal(reimport.status, "manual_preserved")
  assert.equal(classification?.categoryId, "category-other")
  assert.deepEqual(transaction, importedSourceSnapshot)

  const summary = buildSpendClassificationSummary([{
    sourceType: "bank_transactions",
    sourceRecordId: "transaction-1",
    amountCents: -12_500,
    currency: "AUD",
    direction: "outflow",
    sourceStatus: null,
    classificationStatus: String(classification?.status),
    category: { id: "category-other", name: "Other", status: "active" },
  }])
  assert.equal(summary.confirmed[0]?.amountCents, 12_500)
  assert.equal(summary.confirmed[0]?.categoryId, "category-other")

  await assert.rejects(
    reviewService.correctSpendClassification("tenant-2", {
      classificationId: String(classification?.id),
      categoryId: "category-other",
    }),
    (error: unknown) => error instanceof reviewService.SpendClassificationReviewError && error.code === "classification_not_found",
  )
})

test("preserves a manual assignment across a classification-relevant source change", async () => {
  classification = {
    id: "classification-manual",
    userId: "tenant-1",
    sourceType: "imported_bill",
    sourceRecordId: "bill-1",
    status: "confirmed",
    origin: "manual",
    categoryId: "category-other",
    sourceFingerprint: "prior-fingerprint",
  }
  const unchanged = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bill", "bill-1")
  assert.deepEqual(unchanged, {
    status: "manual_preserved",
    classificationStatus: "confirmed",
    fingerprint: "prior-fingerprint",
  })
  bill = { ...bill!, supplierName: "Renamed Aster Cloud" }
  const changed = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bill", "bill-1")
  assert.equal(changed?.status, "manual_preserved")
  assert.equal(upsertCalls.length, 0)
  assert.equal(classification.categoryId, "category-other")
})

test("a changed fingerprint queues a fresh suggestion instead of repeating the completed result", async () => {
  const first = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(first)
  assert.equal(first?.classificationStatus, "queued")
  classification = { ...classification, status: "suggested", origin: "jev" }

  transaction = { ...transaction!, description: "Annual hosted application access" }
  const updated = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(updated)
  assert.equal(updated?.status, "created_or_updated")
  assert.equal(updated?.classificationStatus, "queued")
  assert.notEqual(updated?.fingerprint, first?.fingerprint)
  assert.equal(upsertCalls.length, 2)
})

test("re-evaluates changed classification context and applies an explicit source-account mapping", async () => {
  rules = [{
    id: "mapping-1",
    ruleType: "source_account",
    categoryId: "category-software",
    priority: 100,
    enabled: true,
    matchConfig: { accountingConnectionId: "connection-1", accountCode: "620" },
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    category: { status: "active" },
  }]
  transaction = { ...transaction!, expenseAccountCode: "620" }

  const result = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(result)
  assert.equal(result?.status, "created_or_updated")
  assert.equal(result?.classificationStatus, "confirmed")
  assert.equal(upsertCalls[0]?.origin, "source_mapping")
  assert.equal(upsertCalls[0]?.categoryId, "category-software")
  assert.equal(upsertCalls[0]?.ruleId, "mapping-1")
})

test("leaves unresolved opt-out sources pending and routes non-outflows to review", async () => {
  settingEnabled = false
  const pending = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(pending)
  assert.equal(pending?.classificationStatus, "pending")

  classification = null
  rules = [{
    id: "merchant-rule-1",
    ruleType: "merchant",
    categoryId: "category-software",
    priority: 100,
    enabled: true,
    matchConfig: { merchantName: "Aster Cloud" },
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    category: { status: "active" },
  }]
  transaction = { ...transaction!, direction: "inflow" }
  const review = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(review)
  assert.equal(review?.classificationStatus, "needs_review")
  assert.equal(upsertCalls.at(-1)?.categoryId, null)
})

test("rules created later do not affect existing records on re-import but apply to newly imported records", async () => {
  const firstImport = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(firstImport)
  assert.equal(firstImport.classificationStatus, "queued")

  rules = [{
    id: "future-merchant-rule",
    ruleType: "merchant",
    categoryId: "category-software",
    priority: 100,
    enabled: true,
    matchConfig: { merchantName: "aster cloud" },
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    category: { status: "active" },
  }]
  transaction = { ...transaction!, description: "Changed after the rule was created" }

  const historical = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(historical)
  assert.equal(historical.classificationStatus, "queued")
  assert.equal(upsertCalls[1]?.categoryId, null)
  assert.equal(upsertCalls.length, 2)

  transaction = {
    ...transaction!,
    id: "transaction-new",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  }
  classification = null
  const future = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-new")
  assertHandoffResult(future)
  assert.equal(future.classificationStatus, "confirmed")
  assert.equal(upsertCalls[2]?.categoryId, "category-software")
  assert.equal(upsertCalls[2]?.ruleId, "future-merchant-rule")
})

test("classification fingerprint ignores provider IDs and non-classification amount fields", async () => {
  const first = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(first)
  const initialFingerprint = first?.fingerprint
  transaction = { ...transaction!, sourceId: "different-source-id", amountCents: 999_999, rawSourceData: { changed: true } }
  const unchanged = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(unchanged)
  assert.equal(unchanged?.fingerprint, initialFingerprint)
  assert.equal(unchanged?.status, "unchanged")
  assert.equal(upsertCalls.length, 1)
})

test("split provider records with raw line detail stay in review before rules or Jev", async () => {
  settingEnabled = true
  rules = [{
    id: "merchant-rule-1",
    ruleType: "merchant",
    categoryId: "category-software",
    priority: 100,
    enabled: true,
    matchConfig: { merchantName: "Aster Cloud" },
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2025-12-01T00:00:00Z"),
    category: { status: "active" },
  }]
  transaction = { ...transaction!, rawSourceData: { LineItems: [{ AccountCode: "620" }, { AccountCode: "640" }] } }

  const result = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")

  assertHandoffResult(result)
  assert.equal(result.classificationStatus, "needs_review")
  assert.equal(upsertCalls[0]?.categoryId, null)
  assert.equal(upsertCalls[0]?.origin, null)
})

test("ambiguous payroll and tax descriptions do not become deterministic category or tax decisions", async () => {
  settingEnabled = false
  for (const description of ["Payroll transfer - treatment unclear", "Tax payment - treatment unclear"]) {
    classification = null
    transaction = { ...transaction!, description, direction: "outflow" }

    const result = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")

    assertHandoffResult(result)
    assert.equal(result.classificationStatus, "pending")
    assert.equal(upsertCalls.at(-1)?.categoryId, null)
  }

  classification = null
  transaction = { ...transaction!, direction: "inflow", description: "Supplier refund with no reliable match" }
  const unlinkedRefund = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")
  assertHandoffResult(unlinkedRefund)
  assert.equal(unlinkedRefund.classificationStatus, "needs_review")
  assert.equal(upsertCalls.at(-1)?.categoryId, null)
})

test("manual transfer exclusions survive later source handoffs", async () => {
  classification = {
    id: "classification-transfer",
    userId: "tenant-1",
    sourceType: "imported_bank_transaction",
    sourceRecordId: "transaction-1",
    status: "excluded",
    origin: "manual",
    categoryId: null,
    sourceFingerprint: "transfer-fingerprint",
  }

  const result = await handoffService.handoffImportedSpendForClassification("tenant-1", "imported_bank_transaction", "transaction-1")

  assertHandoffResult(result)
  assert.equal(result.status, "manual_preserved")
  assert.equal(result.classificationStatus, "excluded")
  assert.equal(upsertCalls.length, 0)
})
