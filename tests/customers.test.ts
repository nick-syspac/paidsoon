import assert from "node:assert/strict"
import test from "node:test"

import { findOrCreateCustomer } from "@/lib/db/customers"

type FakeCustomer = {
  id: string
  userId: string
  primaryEmail: string
  primaryEmailLower: string
  displayName: string | null
}

/** Minimal in-memory stand-in for the `db.customer` delegate, keyed like the real `[userId, primaryEmailLower]` unique constraint. */
function createFakeDb() {
  const rows = new Map<string, FakeCustomer>()
  let nextId = 1

  return {
    rows,
    customer: {
      async upsert({
        where,
        create,
      }: {
        where: { userId_primaryEmailLower: { userId: string; primaryEmailLower: string } }
        update: Record<string, never>
        create: Omit<FakeCustomer, "id">
      }) {
        const key = `${where.userId_primaryEmailLower.userId}:${where.userId_primaryEmailLower.primaryEmailLower}`
        const existing = rows.get(key)
        if (existing) return existing

        const row: FakeCustomer = { id: `customer-${nextId++}`, ...create }
        rows.set(key, row)
        return row
      },
    },
  }
}

test("creates a new Customer row for a previously unseen email", async () => {
  const db = createFakeDb()

  const customer = await findOrCreateCustomer(db as never, "user-1", "Client@Example.com", "Client Name")

  assert.equal(customer.primaryEmail, "Client@Example.com")
  assert.equal(customer.primaryEmailLower, "client@example.com")
  assert.equal(customer.displayName, "Client Name")
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
