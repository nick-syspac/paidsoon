import assert from "node:assert/strict"
import { before, describe, mock, test } from "node:test"

let taxBufferSummary: typeof import("@/lib/taxBuffer/service").loadTaxBufferSummary
let categoryLookupCount = 0
let billTaxEvidenceSelection: unknown = null

const highConfidenceSpendCategory = {
  sourceType: "imported_bill",
  sourceRecordId: "bill-no-tax-evidence",
  status: "confirmed",
  confidence: 0.99,
  category: { id: "category-software", name: "Software & Cloud" },
}

const taxBufferConfiguration = {
  userId: "user-1",
  enabled: true,
  accountingBasis: "cash",
  businessType: "other",
  gstRegistered: true,
  gstFrequency: "quarterly",
  reserveBalanceSource: "manual",
  reserveBalanceCents: 0,
  reserveHealthWatchThreshold: 0.9,
  reserveHealthCriticalThreshold: 0.7,
}

describe("Tax Buffer spend-classification isolation", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            taxBufferConfiguration: {
              upsert: async () => taxBufferConfiguration,
              findUnique: async () => taxBufferConfiguration,
            },
            taxReserveCategory: {
              count: async () => 1,
              createMany: async () => ({ count: 0 }),
              findMany: async () => [{
                id: "gst-category",
                categoryType: "gst",
                name: "GST",
                enabled: true,
                calculationMethod: "integration",
                recurrence: "quarterly",
                ratePercent: null,
                fixedAmountCents: null,
                manualAmountCents: null,
                sourcePreference: "auto",
              }],
            },
            taxBufferObligation: { findMany: async () => [] },
            financialInvoice: { findMany: async () => [] },
            importedBill: {
              findMany: async (args: { select: unknown }) => {
                billTaxEvidenceSelection = args.select
                return [
                  { amountCents: 12_000, gstCents: null, dueDate: null },
                  { amountCents: 8_000, gstCents: 0, dueDate: null },
                ]
              },
            },
            cashForecastSnapshot: { findFirst: async () => null },
            cashPlanSnapshot: { findFirst: async () => null },
            taxBufferSnapshot: {
              findFirst: async () => null,
              create: async () => ({ id: "snapshot-1" }),
            },
            taxBufferOverride: { findMany: async () => [] },
            taxBufferEvent: { upsert: async () => ({ id: "event-1" }) },
            spendClassification: {
              findMany: async () => {
                categoryLookupCount += 1
                return [highConfidenceSpendCategory]
              },
            },
          }
          return callback(tx)
        },
      },
    })

    ;({ loadTaxBufferSummary: taxBufferSummary } = await import("@/lib/taxBuffer/service"))
  })

  test("missing or ambiguous source GST evidence stays estimated despite a high-confidence category", async () => {
    categoryLookupCount = 0
    billTaxEvidenceSelection = null

    const summary = await taxBufferSummary("user-1")
    const gstCategory = summary.categories.find((category) => category.type === "gst")

    assert.ok(gstCategory)
    assert.equal(gstCategory.requiredReserveCents, 0)
    assert.equal(gstCategory.confidence, "low")
    assert.equal(gstCategory.source, "integration")
    assert.deepEqual(gstCategory.explainability, ["GST collected: 0", "GST credits: 0"])
    assert.deepEqual(billTaxEvidenceSelection, { amountCents: true, gstCents: true, dueDate: true })
    assert.equal(categoryLookupCount, 0)
    assert.equal(highConfidenceSpendCategory.confidence, 0.99)
  })
})
