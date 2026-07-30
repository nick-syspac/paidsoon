import test from "node:test"
import assert from "node:assert/strict"
import { isUndeliverableAddress } from "@/lib/email/deliveryGuard"
import {
  DEMO_ORGANISATION_ID_PREFIX,
  isDemoOrganisationId,
} from "@/lib/providers/accounting/demoGuard"
import { SEED_EMAIL_DOMAINS, syntheticUserId } from "@/scripts/seed/authUsers"

test("reserved test domains are treated as undeliverable", () => {
  const addresses = [
    "accounts@preston-cafe.example.test",
    "owner@coastline-demo.test",
    "someone@anything.invalid",
    "someone@anything.example",
    "someone@host.localhost",
    "root@localhost",
    "someone@example.com",
    "someone@example.net",
    "someone@example.org",
  ]

  for (const address of addresses) {
    assert.equal(isUndeliverableAddress(address), true, `expected ${address} to be undeliverable`)
  }
})

test("real addresses are not suppressed", () => {
  const addresses = [
    "accounts@realbusiness.com.au",
    "billing@stripe.com",
    "hello@paidsoon.app",
    "person@testcompany.com",
    "person@example.company.com.au",
  ]

  for (const address of addresses) {
    assert.equal(isUndeliverableAddress(address), false, `expected ${address} to be deliverable`)
  }
})

test("missing or malformed addresses are treated as undeliverable", () => {
  for (const address of [null, undefined, "", "   ", "no-at-sign", "trailing@"]) {
    assert.equal(isUndeliverableAddress(address), true, `expected ${String(address)} to be undeliverable`)
  }
})

test("the undeliverable check ignores case and surrounding whitespace", () => {
  assert.equal(isUndeliverableAddress("  Accounts@Preston-Cafe.Example.TEST  "), true)
  assert.equal(isUndeliverableAddress("Owner@Coastline-Demo.TEST"), true)
})

test("every seed email domain is undeliverable", () => {
  for (const domain of SEED_EMAIL_DOMAINS) {
    assert.equal(isUndeliverableAddress(`anyone@${domain}`), true, domain)
  }
})

test("demo accounting organisations are recognised and skipped", () => {
  assert.equal(isDemoOrganisationId(`${DEMO_ORGANISATION_ID_PREFIX}myob/coastline-plumbing`), true)
  assert.equal(isDemoOrganisationId(`${DEMO_ORGANISATION_ID_PREFIX}xero/yarra-valley-web-studio`), true)
})

test("real accounting organisation ids are not skipped", () => {
  for (const id of [
    "b2f6e0a1-1c4d-4f6a-9a3b-2c5f8d1e7b90",
    "myob/coastline-plumbing",
    "",
    "seed:myob/other",
  ]) {
    assert.equal(isDemoOrganisationId(id), false, `expected ${id} to be treated as real`)
  }
})

test("synthetic seed user ids are stable, distinct and UUID-shaped", () => {
  const ids = [1, 2, 3].map(syntheticUserId)

  assert.equal(new Set(ids).size, 3)
  assert.deepEqual(ids, [1, 2, 3].map(syntheticUserId))
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }
})
