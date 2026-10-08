import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  buildSpendLeakDashboardStatus,
  buildSpendLeakCategorySpendSummaries,
  buildSpendLeakEvidenceView,
  buildSpendLeakModuleSummaries,
  isSpendLeakDataStale,
} from "@/lib/dashboard/spendleakPresentation"
import type { SpendInsight } from "@/lib/generated/prisma/client"

function makeInsight(overrides: Partial<SpendInsight> & { id: string; findingType: string }): SpendInsight {
  const { id, findingType, ...rest } = overrides
  const normalizedRest = {
    ...rest,
    reviewAction: rest.reviewAction ?? null,
    reviewActionAt: rest.reviewActionAt ?? null,
    reviewActionBy: rest.reviewActionBy ?? null,
    reviewNote: rest.reviewNote ?? null,
    evidenceFingerprint: rest.evidenceFingerprint ?? null,
    resolvedAt: rest.resolvedAt ?? null,
  }

  return {
    id,
    userId: "user-1",
    accountingConnectionId: null,
    findingType,
    subjectKey: `subject-${id}`,
    severity: "low",
    summary: "summary",
    state: "open",
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    evidence: {},
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...normalizedRest,
  }
}

describe("SpendLeak presentation", () => {
  test("groups confirmed spend by source, category, and currency while separating unresolved states", () => {
    const summaries = buildSpendLeakCategorySpendSummaries([
      {
        sourceType: "bills",
        sourceRecordId: "bill-b",
        amountCents: 3000,
        currency: "aud",
        direction: "outflow",
        sourceStatus: "paid",
        classificationStatus: "confirmed",
        category: { id: "cat-software", name: "Software & Cloud", status: "active" },
      },
      {
        sourceType: "bills",
        sourceRecordId: "bill-a",
        amountCents: -12000,
        currency: "AUD",
        direction: "outflow",
        sourceStatus: "open",
        classificationStatus: "confirmed",
        category: { id: "cat-software", name: "Software & Cloud", status: "merged" },
      },
      {
        sourceType: "bank_transactions",
        sourceRecordId: "txn-confirmed",
        amountCents: 7000,
        currency: "AUD",
        direction: "outflow",
        sourceStatus: null,
        classificationStatus: "confirmed",
        category: { id: "cat-software", name: "Software & Cloud", status: "active" },
      },
      {
        sourceType: "bank_transactions",
        sourceRecordId: "txn-refund-same-source",
        amountCents: 2000,
        currency: "AUD",
        direction: "inflow",
        sourceStatus: null,
        classificationStatus: "confirmed",
        category: null,
        refundFor: {
          sourceType: "bank_transactions",
          sourceRecordId: "txn-confirmed",
          classificationStatus: "confirmed",
          category: { id: "cat-software", name: "Software & Cloud" },
        },
      },
      {
        sourceType: "bank_transactions",
        sourceRecordId: "txn-refund-cross-source",
        amountCents: 1000,
        currency: "AUD",
        direction: "inflow",
        sourceStatus: null,
        classificationStatus: "confirmed",
        category: null,
        refundFor: {
          sourceType: "bills",
          sourceRecordId: "bill-a",
          classificationStatus: "confirmed",
          category: { id: "cat-software", name: "Software & Cloud" },
        },
      },
      {
        sourceType: "bills",
        sourceRecordId: "bill-unconfirmed",
        amountCents: 2300,
        currency: "AUD",
        direction: "outflow",
        sourceStatus: "open",
        classificationStatus: "suggested",
        category: { id: "cat-software", name: "Software & Cloud", status: "active" },
      },
      {
        sourceType: "bills",
        sourceRecordId: "bill-unclassified",
        amountCents: 420,
        currency: "AUD",
        direction: "outflow",
        sourceStatus: "open",
        classificationStatus: null,
        category: null,
      },
      {
        sourceType: "bank_transactions",
        sourceRecordId: "txn-unknown-direction",
        amountCents: -8000,
        currency: "AUD",
        direction: "unknown",
        sourceStatus: null,
        classificationStatus: "needs_review",
        category: null,
      },
      {
        sourceType: "bank_transactions",
        sourceRecordId: "txn-inflow",
        amountCents: 1500,
        currency: "AUD",
        direction: "inflow",
        sourceStatus: null,
        classificationStatus: "confirmed",
        category: { id: "cat-software", name: "Software & Cloud", status: "active" },
      },
      {
        sourceType: "bank_transactions",
        sourceRecordId: "txn-usd-suggestion",
        amountCents: 1250,
        currency: "usd",
        direction: "outflow",
        sourceStatus: null,
        classificationStatus: "suggested",
        category: null,
      },
      {
        sourceType: "bills",
        sourceRecordId: "bill-draft",
        amountCents: 9000,
        currency: "AUD",
        direction: "outflow",
        sourceStatus: "draft",
        classificationStatus: null,
        category: null,
      },
    ])

    assert.deepEqual(summaries.confirmed, [
      {
        sourceType: "bank_transactions",
        currency: "AUD",
        categoryId: "cat-software",
        categoryName: "Software & Cloud",
        amountCents: 5000,
        recordCount: 1,
        sourceRecordIds: ["txn-confirmed"],
        refundRecordCount: 1,
        refundRecordIds: ["txn-refund-same-source"],
      },
      {
        sourceType: "bills",
        currency: "AUD",
        categoryId: "cat-software",
        categoryName: "Software & Cloud",
        amountCents: 15000,
        recordCount: 2,
        sourceRecordIds: ["bill-a", "bill-b"],
        refundRecordCount: 0,
        refundRecordIds: [],
      },
    ])
    assert.deepEqual(summaries.unresolved, [
      {
        sourceType: "bank_transactions",
        currency: "AUD",
        bucket: "unknown_direction",
        amountCents: 8000,
        recordCount: 1,
        sourceRecordIds: ["txn-unknown-direction"],
      },
      {
        sourceType: "bank_transactions",
        currency: "USD",
        bucket: "unconfirmed",
        amountCents: 1250,
        recordCount: 1,
        sourceRecordIds: ["txn-usd-suggestion"],
      },
      {
        sourceType: "bills",
        currency: "AUD",
        bucket: "unclassified",
        amountCents: 420,
        recordCount: 1,
        sourceRecordIds: ["bill-unclassified"],
      },
      {
        sourceType: "bills",
        currency: "AUD",
        bucket: "unconfirmed",
        amountCents: 2300,
        recordCount: 1,
        sourceRecordIds: ["bill-unconfirmed"],
      },
      {
        sourceType: "bills",
        currency: "AUD",
        bucket: "excluded",
        amountCents: 9000,
        recordCount: 1,
        sourceRecordIds: ["bill-draft"],
      },
    ])
    assert.deepEqual(summaries.refundCredits, [{
      sourceType: "bank_transactions",
      currency: "AUD",
      categoryId: "cat-software",
      categoryName: "Software & Cloud",
      amountCents: 1000,
      refundRecordIds: ["txn-refund-cross-source"],
      originalSourceType: "bills",
      originalSourceRecordIds: ["bill-a"],
    }])
  })

  test("groups findings by module and derives severity from highest ranked finding", () => {
    const findings = [
      makeInsight({ id: "1", findingType: "duplicate_payment", severity: "high", estimatedAnnualCents: 50000 }),
      makeInsight({ id: "2", findingType: "duplicate_invoice", severity: "low", estimatedAnnualCents: 10000 }),
      makeInsight({ id: "3", findingType: "renewal_alert", severity: "medium", estimatedAnnualCents: 20000 }),
    ]

    const modules = buildSpendLeakModuleSummaries(findings)
    const duplicate = modules.find((module) => module.id === "duplicate_spend")
    const renewals = modules.find((module) => module.id === "renewals")

    assert.ok(duplicate)
    assert.equal(duplicate?.findingCount, 2)
    assert.equal(duplicate?.severity, "red")
    assert.equal(duplicate?.estimatedAnnualCents, 60000)

    assert.ok(renewals)
    assert.equal(renewals?.findingCount, 1)
    assert.equal(renewals?.severity, "yellow")
  })

  test("treats sync as stale only after the 24-hour threshold", () => {
    const now = new Date("2026-09-02T12:00:01.000Z")
    const fresh = new Date("2026-09-01T13:00:01.000Z")
    const stale = new Date("2026-09-01T11:59:59.000Z")

    assert.equal(isSpendLeakDataStale(fresh, now), false)
    assert.equal(isSpendLeakDataStale(stale, now), true)
  })

  test("classifies dashboard sync states explicitly", () => {
    const now = new Date("2026-09-02T12:00:00.000Z")

    const initial = buildSpendLeakDashboardStatus({
      findingsCount: 0,
      hasAccountingConnection: true,
      latestSyncAt: null,
      sourceSyncCount: 0,
      expectedSourceCount: 2,
      syncedExpectedSourceCount: 0,
      now,
    })

    const partial = buildSpendLeakDashboardStatus({
      findingsCount: 2,
      hasAccountingConnection: true,
      latestSyncAt: new Date("2026-09-02T00:00:00.000Z"),
      sourceSyncCount: 2,
      expectedSourceCount: 2,
      syncedExpectedSourceCount: 1,
      now,
    })

    const empty = buildSpendLeakDashboardStatus({
      findingsCount: 0,
      hasAccountingConnection: true,
      latestSyncAt: new Date("2026-09-02T00:00:00.000Z"),
      sourceSyncCount: 3,
      expectedSourceCount: 2,
      syncedExpectedSourceCount: 2,
      now,
    })

    assert.equal(initial.state, "initial_sync")
    assert.equal(partial.state, "partial_data")
    assert.equal(empty.state, "empty")
    assert.match(empty.description, /selected spend sources have synced/i)
    assert.match(empty.description, /not identified a supported opportunity yet/i)
  })

  test("renders duplicate spend evidence into readable sections", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "4",
        findingType: "duplicate_spend",
        reviewAction: "cancel",
        reviewActionAt: new Date("2026-09-03T00:00:00.000Z"),
        reviewNote: "Duplicate confirmed",
        evidence: {
          supplier: "metro saas systems",
          source: "expense_import",
          billIds: ["coast-bill-metro-jan", "coast-bill-metro-feb"],
          dayDifference: 30,
          amountCents: 420000,
          recentCharges: [
            {
              sourceId: "dup-jan",
              documentNumber: "BILL-2001",
              supplierReference: "January metro",
              amountCents: 420000,
              observedDate: "2026-08-01T00:00:00.000Z",
            },
            {
              sourceId: "dup-feb",
              documentNumber: null,
              supplierReference: null,
              amountCents: 420000,
              observedDate: null,
            },
          ],
        },
        estimatedMonthlyCents: 420000,
        estimatedAnnualCents: 5040000,
      }),
    )

    const duplicateSection = view.sections.find((section) => section.title === "Duplicate comparison")

    assert.ok(duplicateSection)
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Bill references")?.value, "coast-bill-metro-jan · coast-bill-metro-feb")
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Amount")?.value, "$4,200")
    assert.deepEqual(duplicateSection?.table?.columns, ["Date", "Amount", "Document number", "Supplier reference", "Source record"])
    assert.deepEqual(duplicateSection?.table?.rows, [
      {
        id: "dup-jan",
        values: ["01/08/2026", "$4,200", "BILL-2001", "January metro", "dup-jan"],
      },
      {
        id: "dup-feb",
        values: ["Not available", "$4,200", "Not available", "Not available", "dup-feb"],
      },
    ])
    assert.equal(view.sourceSummary.find((field) => field.label === "Evidence source")?.value, "Expense import")
    assert.equal(view.sourceSummary.find((field) => field.label === "Review outcome")?.value, "Cancel")
    assert.equal(view.sourceSummary.find((field) => field.label === "Estimated annual impact")?.value, "$50,400")
  })

  test("renders matched duplicate-payment transactions and uses counterparty evidence", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "payment-1",
        findingType: "duplicate_payment",
        summary: "Possible duplicate payment detected for Acme Cloud within a short timeframe.",
        evidence: {
          counterparty: "Acme Cloud",
          transactionIds: ["txn-first", "txn-second"],
          amountCents: 120000,
          dayDifference: 6,
          recentTransactions: [
            {
              sourceId: "txn-first",
              description: "Cloud hosting payment",
              counterpartyName: "Acme Cloud",
              amountCents: 120000,
              transactionDate: "2026-08-01T00:00:00.000Z",
            },
            {
              sourceId: "txn-second",
              description: "Acme Cloud payment",
              counterpartyName: "Acme Cloud",
              amountCents: 120000,
              transactionDate: "2026-08-07T00:00:00.000Z",
            },
          ],
        },
      }),
    )

    const duplicateSection = view.sections.find((section) => section.title === "Duplicate comparison")

    assert.ok(duplicateSection)
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Counterparty")?.value, "Acme Cloud")
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Transaction references")?.value, "txn-first · txn-second")
    assert.equal(duplicateSection?.table?.title, "Matched transactions")
    assert.deepEqual(duplicateSection?.table?.columns, ["Date", "Amount", "Description", "Counterparty", "Source record"])
    assert.deepEqual(duplicateSection?.table?.rows, [
      {
        id: "txn-first",
        values: ["01/08/2026", "$1,200", "Cloud hosting payment", "Acme Cloud", "txn-first"],
      },
      {
        id: "txn-second",
        values: ["07/08/2026", "$1,200", "Acme Cloud payment", "Acme Cloud", "txn-second"],
      },
    ])
  })

  test("keeps aggregate fallbacks for legacy duplicate-payment evidence without transaction rows", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "legacy-payment",
        findingType: "duplicate_payment",
        evidence: {
          counterparty: "Acme Cloud",
          transactionIds: ["txn-old-1", "txn-old-2"],
          amountCents: 120000,
        },
      }),
    )

    const duplicateSection = view.sections.find((section) => section.title === "Duplicate comparison")

    assert.ok(duplicateSection)
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Counterparty")?.value, "Acme Cloud")
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Transaction references")?.value, "txn-old-1 · txn-old-2")
    assert.equal(duplicateSection?.fields.find((field) => field.label === "Gap")?.value, "Not available")
    assert.equal(duplicateSection?.table, undefined)
  })

  test("renders cash pressure evidence with recent transaction rows", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "7",
        findingType: "cash_pressure",
        summary: "Cash pressure is elevated.",
        evidence: {
          negativeBankTransactionCents: 2100000,
          spendCents: 4500000,
          transactionCount: 3,
          recentTransactions: [
            {
              sourceId: "txn-1",
              description: "Operating cash",
              counterpartyName: "Bank account",
              amountCents: 2100000,
              transactionDate: "2026-08-21T00:00:00.000Z",
            },
            {
              sourceId: null,
              description: "Northwind Office",
              counterpartyName: null,
              amountCents: 360000,
              transactionDate: null,
            },
          ],
        },
      }),
    )

    const cashPressureSection = view.sections.find((section) => section.title === "Cash pressure snapshot")

    assert.ok(cashPressureSection)
    assert.equal(cashPressureSection?.table?.title, "Recent bank transactions")
    assert.deepEqual(cashPressureSection?.table?.columns, ["Date", "Amount", "Description", "Counterparty", "Source record"])
    assert.deepEqual(cashPressureSection?.table?.rows, [
      {
        id: "txn-1",
        values: ["21/08/2026", "$21,000", "Operating cash", "Bank account", "txn-1"],
      },
      {
        id: "Northwind Office",
        values: ["Not available", "$3,600", "Northwind Office", "Not available", "Not available"],
      },
    ])
  })

  test("renders recurring spend cadence and recent charge rows", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "5",
        findingType: "recurring_spend",
        summary: "Acme Cloud shows a repeat monthly spend pattern.",
        evidence: {
          supplier: "Acme Cloud",
          source: "myob",
          billCount: 3,
          averageAmountCents: 120000,
          cadenceLabel: "monthly",
          averageIntervalDays: 30,
          firstObservedDate: "2026-06-01T00:00:00.000Z",
          latestObservedDate: "2026-08-01T00:00:00.000Z",
          recentCharges: [
            {
              sourceId: "bill-aug",
              documentNumber: "BILL-1003",
              supplierReference: "August cloud",
              amountCents: 120000,
              dueDate: "2026-08-01T00:00:00.000Z",
              observedDate: "2026-08-01T00:00:00.000Z",
            },
            {
              sourceId: "bill-jul",
              documentNumber: null,
              supplierReference: null,
              amountCents: 120000,
              dueDate: null,
              observedDate: null,
            },
          ],
        },
      }),
    )

    const recurringSection = view.sections.find((section) => section.title === "Recurring pattern")

    assert.ok(recurringSection)
    assert.equal(recurringSection?.fields.find((field) => field.label === "Observed cadence")?.value, "monthly")
    assert.equal(recurringSection?.fields.find((field) => field.label === "Average interval")?.value, "30 days")
    assert.equal(recurringSection?.fields.find((field) => field.label === "First seen")?.value, "01/06/2026")
    assert.equal(recurringSection?.fields.find((field) => field.label === "Latest seen")?.value, "01/08/2026")
    assert.deepEqual(recurringSection?.table?.columns, ["Date", "Amount", "Document number", "Supplier reference", "Source record"])
    assert.deepEqual(recurringSection?.table?.rows, [
      {
        id: "bill-aug",
        values: ["01/08/2026", "$1,200", "BILL-1003", "August cloud", "bill-aug"],
      },
      {
        id: "bill-jul",
        values: ["Not available", "$1,200", "Not available", "Not available", "bill-jul"],
      },
    ])
  })

  test("keeps recurring spend legacy payloads readable when richer evidence is absent", () => {
    const view = buildSpendLeakEvidenceView(
      makeInsight({
        id: "6",
        findingType: "recurring_spend",
        evidence: {
          supplier: "Legacy SaaS",
          billCount: 2,
          averageAmountCents: 9900,
        },
      }),
    )

    const recurringSection = view.sections.find((section) => section.title === "Recurring pattern")

    assert.ok(recurringSection)
    assert.equal(recurringSection?.fields.find((field) => field.label === "Observed cadence")?.value, "Not available")
    assert.equal(recurringSection?.fields.find((field) => field.label === "First seen")?.value, "Not available")
    assert.equal(recurringSection?.table, undefined)
  })
})
