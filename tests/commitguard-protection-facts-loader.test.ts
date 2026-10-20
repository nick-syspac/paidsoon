import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import type { CommitGuardTaxCategoryInput, CommitGuardTaxInvoiceInput,
  CommitGuardTaxBillInput } from "@/lib/commitguard/protectionFacts"
import type { TaxBufferOverrideInput } from "@/lib/taxBuffer/categoryInputs"

const now = new Date("2026-10-19T12:00:00Z")
const category: CommitGuardTaxCategoryInput = { id: "category-a", categoryType: "gst", name: "GST",
  enabled: true, calculationMethod: "fixed_amount", ratePercent: null,
  fixedAmountCents: 12_000, manualAmountCents: null, updatedAt: now }
interface Tenant {
  entitled: boolean
  configuration: { enabled: boolean; accountingBasis: string } | null
  currency: string | null
  categories: CommitGuardTaxCategoryInput[]
  overrides: TaxBufferOverrideInput[]
  invoices: CommitGuardTaxInvoiceInput[]
  bills: CommitGuardTaxBillInput[]
}
type Query = { where: { userId: string }; select?: Record<string, boolean>; orderBy?: unknown }
let tenants: Map<string, Tenant>
const reads: Array<{ userId: string; model: string; query: Query }> = []
const contexts: string[] = []
let readError: Error | null = null
let load: typeof import("@/lib/commitguard/protectionFactsLoader").loadCommitGuardProtectionFacts
let loadCash: typeof import("@/lib/commitguard/cashContextLoader").loadCommitGuardCashContext

describe("CommitGuard real read-only protection loader with mocked tenant reads", () => {
  before(async () => {
    await mock.module("@/lib/billing", { namedExports: {
      requireFeature: async (userId: string, feature: string, options: { now: Date }) => {
        assert.equal(feature, "tax_buffer_basic")
        assert.equal(options.now, now)
        return tenants.get(userId)?.entitled ?? false
      },
    } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: {
      loadTaxBufferSummary: () => { throw new Error("Mutating summary must not be called") },
    } })
    await mock.module("@/lib/db/withUserContext", { namedExports: {
      withUserContext: async <T>(userId: string, callback: (tx: unknown) => Promise<T>): Promise<T> => {
        contexts.push(userId)
        const tenant = tenants.get(userId)!
        function read<TValue>(model: string, value: TValue): (query: Query) => Promise<TValue> {
          return async (query) => {
            assert.equal(query.where.userId, userId)
            reads.push({ userId, model, query })
            if (readError) throw readError
            return value
          }
        }
        // Deliberately ONLY read methods. No write stubs, CashPlan, tax snapshots,
        // events, obligations or reserved balances exist on this transaction.
        return callback({
          taxBufferConfiguration: { findUnique: read("configuration", tenant.configuration) },
          taxReserveCategory: { findMany: read("categories", tenant.categories) },
          taxBufferOverride: { findMany: read("overrides", tenant.overrides) },
          financialInvoice: { findMany: read("invoices", tenant.invoices) },
          importedBill: { findMany: read("bills", tenant.bills) },
          commitGuardCashContext: { findUnique: async (query: Query) => {
            if (Object.keys(query.select ?? {}).length === 1) {
              assert.deepEqual(query.select, { taxProtectionCurrency: true })
              return read("tax-attestation", { taxProtectionCurrency: tenant.currency })(query)
            }
            // Independently callable gross-cash loader, even without Tax Buffer access.
            return read("gross-cash", { amountCents: 50_000, currency: "aud", balanceAsOf: now,
              weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null,
              taxProtectionCurrency: tenant.currency, revision: 4 })(query)
          } },
        })
      },
    } })
    ;({ loadCommitGuardProtectionFacts: load } = await import("@/lib/commitguard/protectionFactsLoader"))
    ;({ loadCommitGuardCashContext: loadCash } = await import("@/lib/commitguard/cashContextLoader"))
  })

  beforeEach(() => {
    const tenant: Tenant = { entitled: true, configuration: { enabled: true, accountingBasis: "cash" },
      currency: "aud", categories: [{ ...category }], overrides: [], invoices: [], bills: [] }
    tenants = new Map([["tenant-a", tenant], ["tenant-b", { ...tenant, currency: "usd",
      categories: [{ ...category, id: "category-b", fixedAmountCents: 20_000 }] }]])
    reads.length = 0
    contexts.length = 0
    readError = null
  })

  test("returns full required reserves using only tenant-scoped read methods", async () => {
    const facts = await load("tenant-a", now)
    assert.equal(facts.amountCents, 12_000) // never reserved balance or required-minus-reserved
    assert.deepEqual(contexts, ["tenant-a"])
    assert.deepEqual(reads.map((call) => call.model).sort(), ["categories", "configuration", "overrides", "tax-attestation"])
    assert.equal(facts.categories[0].categoryId, "category-a")
    assert.equal("userId" in facts, false)
    assert.deepEqual(reads.find((call) => call.model === "overrides")?.query.orderBy,
      [{ createdAt: "desc" }, { id: "desc" }])
  })

  test("separate tenants retain distinct category identities, amounts and attestations", async () => {
    const a = await load("tenant-a", now)
    const b = await load("tenant-b", now)
    assert.equal(a.amountCents, 12_000)
    assert.equal(b.amountCents, 20_000)
    assert.equal(b.currency, "usd")
    assert.equal(b.categories[0].categoryId, "category-b")
    assert.deepEqual(contexts, ["tenant-a", "tenant-b"])
  })

  test("no Tax Buffer entitlement yields zero/not-applicable before tax financial reads; cash stays readable", async () => {
    tenants.get("tenant-a")!.entitled = false
    const facts = await load("tenant-a", now)
    assert.equal(facts.amountCents, 0)
    assert.deepEqual(facts.quality, { state: "not_applicable", reasons: ["not_applicable"] })
    assert.deepEqual(contexts, [])
    const cash = await loadCash("tenant-a", now)
    assert.equal(cash.amountCents, 50_000)
    assert.equal(cash.currency, "aud")
  })

  test("explicit disable stops at configuration without category/attestation/source reads", async () => {
    tenants.get("tenant-a")!.configuration!.enabled = false
    const facts = await load("tenant-a", now)
    assert.equal(facts.applicable, false)
    assert.equal(facts.amountCents, 0)
    assert.deepEqual(reads.map((call) => call.model), ["configuration"])
  })

  test("missing configuration stays incomplete without creating defaults", async () => {
    tenants.get("tenant-a")!.configuration = null
    const facts = await load("tenant-a", now)
    assert.equal(facts.amountCents, null)
    assert.equal(facts.quality.state, "incomplete")
    assert.ok(facts.quality.reasons.includes("tax_configuration_missing"))
    assert.deepEqual(reads.map((call) => call.model), ["configuration"])
  })

  test("cash existence/currency does not substitute for a missing tax-currency attestation", async () => {
    tenants.get("tenant-a")!.currency = null
    assert.equal((await loadCash("tenant-a", now)).currency, "aud")
    const facts = await load("tenant-a", now)
    assert.equal(facts.currency, null)
    assert.equal(facts.amountCents, null)
    assert.ok(facts.quality.reasons.includes("tax_protection_currency_missing"))
  })

  test("latest category overrides reuse pure mapping and avoid unnecessary source reads", async () => {
    const tenant = tenants.get("tenant-a")!
    tenant.categories[0].calculationMethod = "percentage_profit"
    tenant.overrides = [0, 99_000].map((value) => ({ reserveCategoryId: category.id,
      obligationId: null, overrideValueCents: value, reason: "Reviewed", createdBy: null, createdAt: now }))
    const facts = await load("tenant-a", now)
    assert.equal(facts.amountCents, 0)
    assert.equal(facts.categories[0].source, "manual_override")
    assert.equal(reads.some((call) => ["invoices", "bills"].includes(call.model)), false)
  })

  test("actual source selections include currencies and dates and reject mixed-source arithmetic", async () => {
    const tenant = tenants.get("tenant-a")!
    tenant.categories[0] = { ...category, calculationMethod: "percentage_profit", ratePercent: 25 }
    tenant.invoices = [{ id: "invoice-a", amountDueCents: 100_000, currency: "aud",
      dueDate: now, syncedAt: now, sourceUpdatedAt: null }]
    tenant.bills = [{ id: "bill-a", amountCents: 20_000, gstCents: 0, currency: "usd",
      syncedAt: now, sourceUpdatedAt: null }]
    const facts = await load("tenant-a", now)
    assert.equal(facts.amountCents, null)
    assert.ok(facts.quality.reasons.includes("tax_source_currencies_mixed"))
    for (const model of ["invoices", "bills"]) {
      const selection = reads.find((call) => call.model === model)!.query.select!
      assert.equal(selection.currency, true)
      assert.equal(selection.id, true)
      assert.equal(selection.syncedAt, true)
      assert.equal(selection.sourceUpdatedAt, true)
    }
    tenant.bills[0].currency = "aud"
    assert.equal((await load("tenant-a", now)).amountCents, 20_000)
  })

  test("disabled category remains absent despite an override, so future coverage can flag its missing target", async () => {
    tenants.get("tenant-a")!.categories[0].enabled = false
    const facts = await load("tenant-a", now)
    assert.deepEqual(facts.categories, [])
    assert.equal(facts.amountCents, 0)
  })

  test("read failures propagate rather than becoming complete zero protection", async () => {
    readError = new Error("mock read failed")
    await assert.rejects(load("tenant-a", now), /mock read failed/)
  })
})