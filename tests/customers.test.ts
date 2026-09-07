import assert from "node:assert/strict"
import test from "node:test"

import { findOrCreateCustomer } from "@/lib/db/customers"

type FakeCustomer = {
  id: string
  userId: string
  financialContactId: string
}

type FakeContact = {
  id: string
  userId: string
  email: string | null
  emailLower: string | null
  name: string
}

/**
 * In-memory stand-in for the canonical flow: contacts keyed by
 * (userId, emailLower), customers keyed by (userId, financialContactId).
 */
function createFakeDb() {
  const rows = new Map<string, FakeCustomer>()
  const contacts = new Map<string, FakeContact>()
  let nextId = 1

  return {
    rows,
    contacts,
    financialContact: {
      async findUnique({ where }: { where: { userId_emailLower: { userId: string; emailLower: string } } }) {
        const key = `${where.userId_emailLower.userId}:${where.userId_emailLower.emailLower}`
        return contacts.get(key) ?? null
      },
      async upsert({ create }: { where: unknown; update: unknown; create: { userId: string; name: string; email?: string | null } }) {
        const emailLower = create.email?.toLowerCase() ?? null
        const key = `${create.userId}:${emailLower}`
        const existing = contacts.get(key)
        if (existing) return existing
        const row: FakeContact = {
          id: `contact-${nextId++}`,
          userId: create.userId,
          email: create.email ?? null,
          emailLower,
          name: create.name,
        }
        contacts.set(key, row)
        return row
      },
    },
    customer: {
      async upsert({
        where,
        create,
      }: {
        where: { userId_financialContactId: { userId: string; financialContactId: string } }
        update: Record<string, never>
        create: { userId: string; financialContactId: string }
      }) {
        const key = `${where.userId_financialContactId.userId}:${where.userId_financialContactId.financialContactId}`
        const existing = rows.get(key)
        if (existing) return existing
        const row: FakeCustomer = { id: `customer-${nextId++}`, ...create }
        rows.set(key, row)
        return row
      },
    },
  }
}

test("creates a new Customer + canonical contact for a previously unseen email", async () => {
  const db = createFakeDb()

  const customer = await findOrCreateCustomer(db as never, "user-1", "Client@Example.com", "Client Name")

  const contact = [...db.contacts.values()][0]
  assert.equal(contact.email, "Client@Example.com")
  assert.equal(contact.emailLower, "client@example.com")
  assert.equal(contact.name, "Client Name")
  assert.equal(customer.financialContactId, contact.id)
  assert.equal(db.rows.size, 1)
})

test("returns the existing row for the same email casing without creating a duplicate", async () => {
  const db = createFakeDb()

  const first = await findOrCreateCustomer(db as never, "user-1", "client@example.com")
  const second = await findOrCreateCustomer(db as never, "user-1", "client@example.com")

  assert.equal(second.id, first.id)
  assert.equal(db.rows.size, 1)
})

test("returns the existing row for a different email casing without creating a duplicate", async () => {
  const db = createFakeDb()

  const first = await findOrCreateCustomer(db as never, "user-1", "Client@Example.com")
  const second = await findOrCreateCustomer(db as never, "user-1", "CLIENT@EXAMPLE.COM")

  assert.equal(second.id, first.id)
  assert.equal(db.rows.size, 1)
})

test("scopes matching per user — different users with the same email get separate rows", async () => {
  const db = createFakeDb()

  const userA = await findOrCreateCustomer(db as never, "user-a", "shared@example.com")
  const userB = await findOrCreateCustomer(db as never, "user-b", "shared@example.com")

  assert.notEqual(userA.id, userB.id)
  assert.equal(db.rows.size, 2)
})
