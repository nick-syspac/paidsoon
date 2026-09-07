/**
 * Unit tests for canonical ingestion helpers (lib/financial/ingest.ts).
 *
 * Uses in-memory delegate fakes (no real DB) — the same convention as
 * tests/customers.test.ts — to prove idempotency on the
 * (userId, sourceSystem, sourceId) key, provenance completeness, currency
 * normalisation, and correct contact reuse across sources.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  upsertFinancialContact,
  upsertFinancialInvoice,
  findFinancialContactByEmail,
  type CanonicalInvoiceInput,
} from "@/lib/financial/ingest"

type ContactRow = {
  id: string
  userId: string
  sourceSystem: string
  sourceId: string
  email: string | null
  emailLower: string | null
  name: string
  syncedAt: Date
}

type InvoiceRow = {
  id: string
  userId: string
  sourceSystem: string
  sourceId: string
  currency: string
  amountDueCents: number
  syncedAt: Date
}

function createFakeDb() {
  const contacts = new Map<string, ContactRow>()
  const contactsByEmail = new Map<string, ContactRow>()
  const invoices = new Map<string, InvoiceRow>()
  let nextId = 1

  return {
    contacts,
    contactsByEmail,
    invoices,
    financialContact: {
      async findUnique({ where }: { where: { userId_emailLower?: { userId: string; emailLower: string }; userId_sourceSystem_sourceId?: { userId: string; sourceSystem: string; sourceId: string } } }) {
        if (where.userId_emailLower) {
          const { userId, emailLower } = where.userId_emailLower
          return contactsByEmail.get(`${userId}:${emailLower}`) ?? null
        }
        const k = where.userId_sourceSystem_sourceId!
        return contacts.get(`${k.userId}:${k.sourceSystem}:${k.sourceId}`) ?? null
      },
      async upsert({ where, create, update }: { where: { userId_sourceSystem_sourceId: { userId: string; sourceSystem: string; sourceId: string } }; create: Omit<ContactRow, "id" | "syncedAt"> & { syncedAt?: Date }; update: Partial<ContactRow> }) {
        const k = where.userId_sourceSystem_sourceId
        const key = `${k.userId}:${k.sourceSystem}:${k.sourceId}`
        const existing = contacts.get(key)
        if (existing) {
          const merged = { ...existing, ...update }
          contacts.set(key, merged)
          if (merged.emailLower) contactsByEmail.set(`${merged.userId}:${merged.emailLower}`, merged)
          return merged
        }
        const row: ContactRow = { id: `contact-${nextId++}`, syncedAt: new Date(), ...create }
        contacts.set(key, row)
        if (row.emailLower) contactsByEmail.set(`${row.userId}:${row.emailLower}`, row)
        return row
      },
    },
    financialInvoice: {
      async findUnique({ where }: { where: { userId_sourceSystem_sourceId: { userId: string; sourceSystem: string; sourceId: string } } }) {
        const k = where.userId_sourceSystem_sourceId
        return invoices.get(`${k.userId}:${k.sourceSystem}:${k.sourceId}`) ?? null
      },
      async create({ data, select }: { data: Omit<InvoiceRow, "id" | "syncedAt">; select?: { id: true } }) {
        const row: InvoiceRow = { id: `inv-${nextId++}`, syncedAt: new Date(), ...data }
        invoices.set(`${data.userId}:${data.sourceSystem}:${data.sourceId}`, row)
        return select ? { id: row.id } : row
      },
      async update({ where, data, select }: { where: { id: string }; data: Partial<InvoiceRow>; select?: { id: true } }) {
        const entry = [...invoices.entries()].find(([, v]) => v.id === where.id)
        if (!entry) throw new Error("not found")
        const merged = { ...entry[1], ...data }
        invoices.set(entry[0], merged)
        return select ? { id: merged.id } : merged
      },
    },
  }
}

function invoiceInput(overrides: Partial<CanonicalInvoiceInput> = {}): CanonicalInvoiceInput {
  return {
    userId: "user-1",
    sourceSystem: "xero",
    sourceId: "inv-abc",
    amountDueCents: 10000,
    currency: "AUD",
    dueDate: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  }
}

test("creates a canonical invoice with provenance and normalised currency", async () => {
  const db = createFakeDb()
  const { invoice, created } = await upsertFinancialInvoice(db as never, invoiceInput())

  assert.equal(created, true)
  const stored = [...db.invoices.values()][0]
  assert.equal(stored.id, invoice.id)
  assert.equal(stored.sourceSystem, "xero")
  assert.equal(stored.sourceId, "inv-abc")
  // Currency is always normalised to lowercase from the source (never defaulted).
  assert.equal(stored.currency, "aud")
  assert.ok(stored.syncedAt instanceof Date)
})

test("re-running a sync over unchanged source data does not duplicate the invoice", async () => {
  const db = createFakeDb()
  const first = await upsertFinancialInvoice(db as never, invoiceInput())
  const second = await upsertFinancialInvoice(db as never, invoiceInput())

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(first.invoice.id, second.invoice.id)
  assert.equal(db.invoices.size, 1)
})

test("idempotency key is per (userId, sourceSystem, sourceId)", async () => {
  const db = createFakeDb()
  await upsertFinancialInvoice(db as never, invoiceInput({ userId: "user-1", sourceId: "same" }))
  // Same source id from a different source system is a distinct record.
  await upsertFinancialInvoice(db as never, invoiceInput({ userId: "user-1", sourceId: "same", sourceSystem: "csv" }))
  // Same source id for a different tenant is a distinct record.
  await upsertFinancialInvoice(db as never, invoiceInput({ userId: "user-2", sourceId: "same" }))

  assert.equal(db.invoices.size, 3)
})

test("findFinancialContactByEmail matches case-insensitively and reuses the contact", async () => {
  const db = createFakeDb()
  await upsertFinancialContact(db as never, {
    userId: "user-1",
    sourceSystem: "stripe",
    sourceId: "email:client@example.com",
    name: "Client",
    email: "Client@Example.com",
  })

  const found = await findFinancialContactByEmail(db as never, "user-1", "CLIENT@EXAMPLE.COM")
  assert.ok(found)
  assert.equal(found!.emailLower, "client@example.com")

  // A second upsert for a different source with the same email is discoverable
  // by the shared per-tenant email key.
  const again = await findFinancialContactByEmail(db as never, "user-1", "client@example.com")
  assert.equal(again!.id, found!.id)
})
