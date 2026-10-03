import assert from "node:assert/strict"
import { before, mock, test } from "node:test"

type Row = Record<string, unknown>
type Fixture = {
  setting: { enabled: boolean } | null
  assignment: { id: string } | null
  bill: Row | null
  transaction: Row | null
  categories: Array<{ id: string; name: string; description: string | null }>
  calls: { setting: number; assignment: number; source: number; categories: number }
}

let fixture: Fixture
let requestService: typeof import("@/lib/spendClassification/jevRequest")

function createTx(userId: string) {
  return {
    spendClassificationSetting: {
      findUnique: async ({ where }: { where: Row }) => {
        fixture.calls.setting += 1
        assert.equal(where.userId, userId)
        return fixture.setting
      },
    },
    spendClassification: {
      findFirst: async ({ where }: { where: Row }) => {
        fixture.calls.assignment += 1
        assert.equal(where.userId, userId)
        return fixture.assignment
      },
    },
    importedBill: {
      findFirst: async ({ where, select }: { where: Row; select: Row }) => {
        fixture.calls.source += 1
        assert.equal(where.userId, userId)
        assert.deepEqual(Object.keys(select), ["supplierName", "currency"])
        return fixture.bill
      },
    },
    importedBankTransaction: {
      findFirst: async ({ where, select }: { where: Row; select: Row }) => {
        fixture.calls.source += 1
        assert.equal(where.userId, userId)
        assert.deepEqual(Object.keys(select), ["description", "direction", "currency"])
        return fixture.transaction
      },
    },
    spendCategory: {
      findMany: async ({ where, select }: { where: Row; select: Row }) => {
        fixture.calls.categories += 1
        assert.equal(where.userId, userId)
        assert.equal(where.status, "active")
        assert.deepEqual(Object.keys(select), ["id", "name", "description"])
        return fixture.categories
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
  requestService = await import("@/lib/spendClassification/jevRequest")
})

function resetFixture(overrides: Partial<Fixture> = {}) {
  fixture = {
    setting: { enabled: true },
    assignment: { id: "internal-classification-id" },
    bill: null,
    transaction: null,
    categories: [
      { id: "category-software", name: "Software & Cloud", description: "Hosting and applications" },
      { id: "category-other", name: "Other", description: null },
    ],
    calls: { setting: 0, assignment: 0, source: 0, categories: 0 },
    ...overrides,
  }
}

function mockProvider(requests: unknown[]) {
  return {
    systemOne: async (request: unknown) => {
      requests.push(request)
      return {
        model: "jev-1.13.0",
        answers: {
          category: {
            type: "choice",
            choice: "category-software",
            confidence: 0.88,
            probabilities: { "category-software": 0.88, "category-other": 0.12 },
          },
        },
        usage: { input_tokens: 8, output_tokens: 2 },
      }
    },
  }
}

function stateFromRequest(request: unknown): Record<string, unknown> {
  assert.ok(typeof request === "object" && request !== null)
  return (request as { state: Record<string, unknown> }).state
}

test("sends only minimized bill merchant, direction, and currency after opt-in", async () => {
  resetFixture({
    bill: {
      supplierName: "Acme Cloud Pty Ltd",
      currency: "aud",
      id: "internal-bill-id",
      sourceId: "provider-bill-id-secret",
      sourceContactId: "contact-id-secret",
      supplierReference: "PO-REFERENCE-SECRET",
      documentNumber: "INVOICE-SECRET-9021",
      amountCents: 827_163,
      rawSourceData: { privatePayload: "raw-provider-secret" },
    },
  })
  const requests: unknown[] = []
  const result = await requestService.requestJevSuggestionForSpend(
    "tenant-private-id",
    "imported_bill",
    "internal-bill-id",
    mockProvider(requests) as never,
  )

  assert.equal(result.status, "requested")
  assert.deepEqual(stateFromRequest(requests[0]), {
    merchant: "Acme Cloud Pty Ltd",
    direction: "outflow",
    currency: "AUD",
  })
  const requestText = JSON.stringify(requests)
  for (const secret of [
    "tenant-private-id",
    "internal-bill-id",
    "provider-bill-id-secret",
    "contact-id-secret",
    "PO-REFERENCE-SECRET",
    "INVOICE-SECRET-9021",
    "827163",
    "raw-provider-secret",
  ]) {
    assert.equal(requestText.includes(secret), false, `request must omit ${secret}`)
  }
})

test("removes embedded email, phone, and reference values from minimized transaction description", async () => {
  resetFixture({
    transaction: {
      description: "Monthly cloud hosting ref: REF-9821 contact jane@example.test phone 0400 123 456",
      direction: "outflow",
      currency: "AUD",
      id: "internal-transaction-id",
      sourceId: "provider-transaction-secret",
      sourceContactId: "bank-contact-secret",
      counterpartyName: "Private Person Name",
      reference: "BANK-REFERENCE-SECRET",
      amountCents: 1_234_567,
      rawSourceData: { privatePayload: "raw-transaction-secret" },
    },
  })
  const requests: unknown[] = []
  const result = await requestService.requestJevSuggestionForSpend(
    "tenant-private-id",
    "imported_bank_transaction",
    "internal-transaction-id",
    mockProvider(requests) as never,
  )

  assert.equal(result.status, "requested")
  assert.deepEqual(stateFromRequest(requests[0]), {
    description: "Monthly cloud hosting contact phone",
    direction: "outflow",
    currency: "AUD",
  })
  const requestText = JSON.stringify(requests)
  for (const secret of [
    "tenant-private-id",
    "internal-transaction-id",
    "provider-transaction-secret",
    "bank-contact-secret",
    "Private Person Name",
    "BANK-REFERENCE-SECRET",
    "jane@example.test",
    "0400 123 456",
    "REF-9821",
    "1234567",
    "raw-transaction-secret",
  ]) {
    assert.equal(requestText.includes(secret), false, `request must omit ${secret}`)
  }
})

test("opt-out returns without reading source or categories and never calls the provider", async () => {
  resetFixture({ setting: { enabled: false } })
  const requests: unknown[] = []
  const result = await requestService.requestJevSuggestionForSpend(
    "tenant-opted-out",
    "imported_bank_transaction",
    "transaction-private-id",
    mockProvider(requests) as never,
  )

  assert.deepEqual(result, { status: "opted_out" })
  assert.deepEqual(fixture.calls, { setting: 1, assignment: 0, source: 0, categories: 0 })
  assert.deepEqual(requests, [])
})

test("does not make provider requests for work that is not queued or processing", async () => {
  resetFixture({ assignment: null })
  const requests: unknown[] = []
  const result = await requestService.requestJevSuggestionForSpend(
    "tenant-a",
    "imported_bank_transaction",
    "transaction-a",
    mockProvider(requests) as never,
  )

  assert.deepEqual(result, { status: "not_eligible" })
  assert.deepEqual(fixture.calls, { setting: 1, assignment: 1, source: 0, categories: 0 })
  assert.deepEqual(requests, [])
})
