import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"

type Row = Record<string, unknown>

let categories: Row[]
let bills: Row[]
let transactions: Row[]
let classifications: Row[]
let tags: Row[]
let tagAssignments: Row[]
let events: Row[]
let nextId: number
const lockQueues = new Map<string, Promise<void>>()
let assignmentService: typeof import("@/lib/spendClassification/assignments")
let tagService: typeof import("@/lib/spendClassification/tags")

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => row[key] === expected)
}

function createTransaction(userId: string) {
  let releaseLock: (() => void) | undefined
  const tx = {
    $executeRawUnsafe: async (_sql: string, lockKey: string) => {
      const previous = lockQueues.get(lockKey) ?? Promise.resolve()
      let release!: () => void
      const current = new Promise<void>((resolve) => {
        release = resolve
      })
      lockQueues.set(lockKey, current)
      await previous
      releaseLock = () => {
        release()
        if (lockQueues.get(lockKey) === current) lockQueues.delete(lockKey)
      }
    },
    importedBill: {
      findFirst: async ({ where }: { where: Row }) => bills.find((row) => row.userId === userId && matches(row, where)) ?? null,
    },
    importedBankTransaction: {
      findFirst: async ({ where }: { where: Row }) => transactions.find((row) => row.userId === userId && matches(row, where)) ?? null,
    },
    spendCategory: {
      findFirst: async ({ where }: { where: Row }) => categories.find((row) => row.userId === userId && matches(row, where)) ?? null,
    },
    spendClassification: {
      findFirst: async ({ where }: { where: Row }) => classifications.find((row) => row.userId === userId && matches(row, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `classification-${nextId++}`, ...data }
        classifications.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const index = classifications.findIndex((item) => item.id === where.id && item.userId === userId)
        if (index < 0) throw new Error("not found")
        const updated = { ...classifications[index], ...data }
        classifications[index] = updated
        return updated
      },
    },
    spendClassificationEvent: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `event-${nextId++}`, ...data }
        events.push(row)
        return row
      },
    },
    spendTag: {
      findFirst: async ({ where }: { where: Row }) => tags.find((row) => row.userId === userId && matches(row, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `tag-${nextId++}`, status: "active", ...data }
        tags.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = tags.find((item) => item.id === where.id && item.userId === userId)
        if (!row) throw new Error("not found")
        Object.assign(row, data)
        return row
      },
    },
    spendClassificationTag: {
      findFirst: async ({ where }: { where: Row }) => tagAssignments.find((row) => row.userId === userId && matches(row, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `tag-link-${nextId++}`, ...data }
        tagAssignments.push(row)
        return row
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const beforeCount = tagAssignments.length
        tagAssignments = tagAssignments.filter((row) => !(row.userId === userId && matches(row, where)))
        return { count: beforeCount - tagAssignments.length }
      },
    },
  }
  return { tx, release: () => releaseLock?.() }
}

before(async () => {
  await mock.module("@/lib/db/withUserContext", {
    namedExports: {
      withUserContext: async (userId: string, fn: (tx: never) => Promise<unknown>) => {
        const transaction = createTransaction(userId)
        try {
          return await fn(transaction.tx as never)
        } finally {
          transaction.release()
        }
      },
    },
  })
  assignmentService = await import("@/lib/spendClassification/assignments")
  tagService = await import("@/lib/spendClassification/tags")
})

beforeEach(() => {
  categories = [
    { id: "category-a", userId: "tenant-a", status: "active", name: "Software" },
    { id: "category-b", userId: "tenant-a", status: "active", name: "Office" },
    { id: "category-other", userId: "tenant-b", status: "active", name: "Other" },
  ]
  bills = [
    {
      id: "bill-a",
      userId: "tenant-a",
      sourceId: "source-bill-a",
      amountCents: 4_500,
      expenseAccountCode: "621",
      rawSourceData: { untouched: true },
    },
  ]
  transactions = [
    {
      id: "transaction-a",
      userId: "tenant-a",
      sourceId: "source-transaction-a",
      amountCents: 3_000,
      direction: "outflow",
      rawSourceData: { unchanged: true },
    },
  ]
  classifications = []
  tags = []
  tagAssignments = []
  events = []
  nextId = 1
  lockQueues.clear()
})

test("classification creation is idempotent and leaves imported source fields untouched", async () => {
  const billBefore = structuredClone(bills[0])
  const input = {
    sourceType: "imported_bill" as const,
    sourceRecordId: "bill-a",
    status: "pending" as const,
    sourceFingerprint: "fingerprint-a",
  }

  const first = await assignmentService.upsertSpendClassification("tenant-a", input)
  const replay = await assignmentService.upsertSpendClassification("tenant-a", input)

  assert.equal(first.id, replay.id)
  assert.equal(classifications.length, 1)
  assert.equal(events.length, 1)
  assert.equal(classifications[0].importedBillId, "bill-a")
  assert.equal(classifications[0].importedBankTransactionId, null)
  assert.deepEqual(bills[0], billBefore)
})

test("manual category confirmation is audited and later automatic writes cannot overwrite it", async () => {
  const existing = await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bank_transaction",
    sourceRecordId: "transaction-a",
    status: "suggested",
    origin: "jev",
    categoryId: "category-a",
    confidence: 0.82,
  })
  const sourceBefore = structuredClone(transactions[0])

  const manual = await assignmentService.assignManualSpendCategory("tenant-a", {
    classificationId: String(existing.id),
    categoryId: "category-b",
    reason: "This is office equipment",
  })
  const replay = await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bank_transaction",
    sourceRecordId: "transaction-a",
    status: "confirmed",
    origin: "source_mapping",
    categoryId: "category-a",
    sourceFingerprint: "changed-source",
  })

  assert.equal(manual.categoryId, "category-b")
  assert.equal(manual.status, "confirmed")
  assert.equal(manual.origin, "manual")
  assert.equal(replay.categoryId, "category-b")
  assert.equal(replay.sourceFingerprint, null)
  assert.deepEqual(transactions[0], sourceBefore)
  assert.equal(events.at(-1)?.eventType, "classification_manually_confirmed")
  assert.equal(events.at(-1)?.actorId, "tenant-a")
  assert.equal(events.at(-1)?.oldCategoryId, "category-a")
  assert.equal(events.at(-1)?.newCategoryId, "category-b")
  assert.equal(events.at(-1)?.reason, "This is office equipment")
})

test("a changed automatic assignment appends history instead of replacing prior events", async () => {
  const initial = await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bill",
    sourceRecordId: "bill-a",
    status: "confirmed",
    origin: "rule",
    categoryId: "category-a",
    ruleId: "rule-a",
  })
  await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bill",
    sourceRecordId: "bill-a",
    status: "confirmed",
    origin: "source_mapping",
    categoryId: "category-b",
    ruleId: "mapping-b",
  })

  assert.equal(classifications.length, 1)
  assert.equal(classifications[0].id, initial.id)
  assert.equal(classifications[0].categoryId, "category-b")
  assert.equal(events.length, 2)
  assert.equal(events[1].eventType, "classification_automatically_updated")
  assert.equal(events[1].oldCategoryId, "category-a")
  assert.equal(events[1].newCategoryId, "category-b")
})

test("a changed source fingerprint resets the previous Jev retry budget", async () => {
  const existing = await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bill",
    sourceRecordId: "bill-a",
    status: "needs_review",
    sourceFingerprint: "old-fingerprint",
  })
  Object.assign(existing, {
    attemptCount: 3,
    nextAttemptAt: new Date("2026-10-04T00:00:00.000Z"),
    lastErrorCode: "network",
    claimedAt: new Date("2026-10-03T00:00:00.000Z"),
  })

  const refreshed = await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bill",
    sourceRecordId: "bill-a",
    status: "queued",
    sourceFingerprint: "new-fingerprint",
  })

  assert.equal(refreshed.attemptCount, 0)
  assert.equal(refreshed.nextAttemptAt, null)
  assert.equal(refreshed.lastErrorCode, null)
  assert.equal(refreshed.claimedAt, null)
})

test("source records, categories, and assignments are isolated by tenant", async () => {
  await assert.rejects(
    assignmentService.upsertSpendClassification("tenant-b", {
      sourceType: "imported_bill",
      sourceRecordId: "bill-a",
      status: "pending",
    }),
    (error: unknown) => error instanceof assignmentService.SpendAssignmentError && error.code === "source_record_not_found",
  )
})

test("tags are tenant-unique, soft-retired, and assignment changes are idempotently audited", async () => {
  const classification = await assignmentService.upsertSpendClassification("tenant-a", {
    sourceType: "imported_bill",
    sourceRecordId: "bill-a",
    status: "pending",
  })
  const tag = await tagService.createSpendTag("tenant-a", "  Vendor   Service ")
  await assert.rejects(
    tagService.createSpendTag("tenant-a", "vendor service"),
    (error: unknown) => error instanceof tagService.SpendTagError && error.code === "tag_name_taken",
  )

  assert.equal(
    await tagService.setSpendClassificationTag("tenant-a", {
      classificationId: String(classification.id),
      tagId: String(tag.id),
      assigned: true,
    }),
    true,
  )
  assert.equal(
    await tagService.setSpendClassificationTag("tenant-a", {
      classificationId: String(classification.id),
      tagId: String(tag.id),
      assigned: true,
    }),
    false,
  )
  await tagService.retireSpendTag("tenant-a", String(tag.id))
  assert.equal(tagAssignments.length, 1)
  await assert.rejects(
    tagService.setSpendClassificationTag("tenant-a", {
      classificationId: String(classification.id),
      tagId: String(tag.id),
      assigned: true,
    }),
    (error: unknown) => error instanceof tagService.SpendTagError && error.code === "tag_not_active",
  )
  assert.equal(
    await tagService.setSpendClassificationTag("tenant-a", {
      classificationId: String(classification.id),
      tagId: String(tag.id),
      assigned: false,
    }),
    true,
  )
  assert.equal(tagAssignments.length, 0)
  assert.deepEqual(
    events.map((event) => event.eventType),
    ["classification_initialized", "tag_created", "tag_assigned", "tag_retired", "tag_removed"],
  )
})