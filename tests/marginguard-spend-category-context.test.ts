import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildMarginSpendingCategoryContext } from "@/lib/marginguard/spendingCategoryContext"

describe("MarginGuard spending-category context", () => {
  test("exposes confirmed categories beside independent MarginGuard cost classes", () => {
    const context = buildMarginSpendingCategoryContext({
      importedBills: [
        { id: "bill-overhead", amountCents: 12500, currency: "AUD", status: "open" },
        { id: "bill-suggestion", amountCents: 5000, currency: "AUD", status: "open" },
        { id: "bill-draft", amountCents: 2000, currency: "AUD", status: "draft" },
      ],
      importedBankTransactions: [
        { id: "txn-direct", amountCents: -3000, currency: "AUD", direction: "outflow" },
        { id: "txn-inflow", amountCents: 4500, currency: "AUD", direction: "inflow" },
        { id: "txn-unknown", amountCents: -700, currency: "AUD", direction: "unknown" },
      ],
      spendClassifications: [
        {
          sourceType: "imported_bill",
          sourceRecordId: "bill-overhead",
          status: "confirmed",
          category: { id: "category-software", name: "Software & Cloud" },
        },
        {
          sourceType: "imported_bill",
          sourceRecordId: "bill-suggestion",
          status: "suggested",
          category: { id: "category-software", name: "Software & Cloud" },
        },
        {
          sourceType: "imported_bank_transaction",
          sourceRecordId: "txn-direct",
          status: "confirmed",
          category: { id: "category-software", name: "Software & Cloud" },
        },
        {
          sourceType: "imported_bank_transaction",
          sourceRecordId: "txn-inflow",
          status: "confirmed",
          category: { id: "category-software", name: "Software & Cloud" },
        },
        {
          sourceType: "imported_bank_transaction",
          sourceRecordId: "txn-unknown",
          status: "confirmed",
          category: { id: "category-software", name: "Software & Cloud" },
        },
      ],
      marginClassifications: [
        { sourceType: "imported_bill", sourceRecordId: "bill-overhead", classification: "OVERHEAD" },
        { sourceType: "imported_bill", sourceRecordId: "bill-suggestion", classification: "DIRECT_COST" },
        { sourceType: "imported_bank_transaction", sourceRecordId: "txn-direct", classification: "DIRECT_COST" },
        { sourceType: "imported_bank_transaction", sourceRecordId: "txn-inflow", classification: "VARIABLE_COST" },
        { sourceType: "imported_bank_transaction", sourceRecordId: "txn-unknown", classification: "DIRECT_COST" },
      ],
    })

    assert.deepEqual(context, [
      {
        sourceType: "imported_bank_transaction",
        currency: "AUD",
        categoryId: "category-software",
        categoryName: "Software & Cloud",
        marginCostClass: "DIRECT_COST",
        amountCents: 3000,
        recordCount: 1,
        sourceRecordIds: ["txn-direct"],
      },
      {
        sourceType: "imported_bill",
        currency: "AUD",
        categoryId: "category-software",
        categoryName: "Software & Cloud",
        marginCostClass: "OVERHEAD",
        amountCents: 12500,
        recordCount: 1,
        sourceRecordIds: ["bill-overhead"],
      },
    ])
  })
})
