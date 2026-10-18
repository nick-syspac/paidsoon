import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import {
  resolveTrialEligibility,
  type TrialBillingRiskEvidence,
  type TrialEligibilityProfile,
} from "@/lib/billing/trialEligibility"

const now = new Date("2026-10-15T12:00:00Z")
const seconds = Math.floor(now.getTime() / 1000)
const profile: TrialEligibilityProfile = {
  userId: "tenant_1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
  subscriptionStatus: "canceled", billingAccessVersion: 3, pendingTrialOperationId: null,
}

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1", customer: "cus_1", metadata: {}, status: "canceled",
    items: { data: [{ quantity: 1, price: { id: "price_control", type: "recurring", recurring: { usage_type: "licensed" } } }], has_more: false },
    cancel_at: null, cancel_at_period_end: false, trial_end: seconds + 86400,
    trial_start: seconds - 86400, billing_cycle_anchor: seconds,
    schedule: null, pending_update: null, pause_collection: null,
    pending_invoice_item_interval: null, next_pending_invoice_item_invoice: null,
    latest_invoice: null,
    ...overrides,
  } as unknown as Stripe.Subscription
}

function invoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id: "in_1", customer: "cus_1", metadata: {}, status: "paid", amount_remaining: 0,
    attempt_count: 1, due_date: null, billing_reason: "subscription_cycle",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: {} } },
    period_start: seconds - 1000, period_end: seconds + 1000,
    ...overrides,
  } as unknown as Stripe.Invoice
}

function charge(overrides: Record<string, unknown> = {}): Stripe.Charge {
  return {
    id: "ch_1", customer: "cus_1", metadata: {}, payment_intent: "pi_1", disputed: true,
    on_behalf_of: null, transfer_data: null, source_transfer: null,
    ...overrides,
  } as unknown as Stripe.Charge
}

function payment(overrides: Record<string, unknown> = {}): Stripe.InvoicePayment {
  return { id: "inpay_1", invoice: "in_1", payment: { type: "payment_intent", payment_intent: "pi_1" }, status: "paid", ...overrides } as unknown as Stripe.InvoicePayment
}

function dispute(overrides: Record<string, unknown> = {}): Stripe.Dispute {
  return { id: "du_1", charge: "ch_1", payment_intent: "pi_1", status: "lost", ...overrides } as unknown as Stripe.Dispute
}

type ListParams = { starting_after?: string; customer?: string; status?: string; charge?: string; invoice?: string; payment?: { payment_intent?: string } }
interface Fixtures {
  customer?: Record<string, unknown>
  subscriptions?: Stripe.Subscription[][]
  current?: Stripe.Subscription
  invoices?: Stripe.Invoice[][]
  charges?: Stripe.Charge[][]
  payments?: Stripe.InvoicePayment[][]
  reverse?: Stripe.InvoicePayment[][]
  disputes?: Stripe.Dispute[][]
  fail?: string
}

/** Only read methods exist. Any accidental mutation/Connect call fails the test. */
function provider(fixtures: Fixtures = {}) {
  const calls: { method: string; params: unknown[] }[] = []
  function record(method: string, args: unknown[]): void {
    calls.push({ method, params: args })
    assert.ok(args.length <= 2, "must not pass Stripe request options")
    for (const arg of args) if (arg && typeof arg === "object") assert.equal("stripeAccount" in arg, false)
    if (fixtures.fail === method) throw new Error("sensitive upstream failure must not leak")
  }
  function list<T extends { id: string }>(method: string, pages: T[][], params: ListParams) {
    record(method, [params])
    const index = params.starting_after ? pages.findIndex((page) => page.at(-1)?.id === params.starting_after) + 1 : 0
    assert.ok(index >= 0 && index < pages.length, `unexpected cursor for ${method}`)
    return Promise.resolve({ data: pages[index], has_more: index < pages.length - 1 })
  }
  const stripe = {
    customers: { retrieve: async (...args: unknown[]) => {
      record("customers.retrieve", args)
      return fixtures.customer ?? { id: "cus_1", metadata: {} }
    } },
    subscriptions: {
      list: (params: ListParams) => {
        assert.equal(params.customer, "cus_1")
        assert.equal(params.status, "all")
        return list("subscriptions.list", fixtures.subscriptions ?? [[subscription()]], params)
      },
      retrieve: async (...args: unknown[]) => {
        record("subscriptions.retrieve", args)
        assert.deepEqual(args, ["sub_1", { expand: ["latest_invoice"] }])
        return fixtures.current ?? fixtures.subscriptions?.[0]?.[0] ?? subscription({ status: "trialing" })
      },
    },
    invoices: { list: (params: ListParams) => {
      assert.equal(params.customer, "cus_1")
      return list("invoices.list", fixtures.invoices ?? [[]], params)
    } },
    charges: { list: (params: ListParams) => {
      assert.equal(params.customer, "cus_1")
      return list("charges.list", fixtures.charges ?? [[]], params)
    } },
    invoicePayments: { list: (params: ListParams) => {
      if (params.payment) {
        assert.equal(params.payment.payment_intent, "pi_1")
        return list("invoicePayments.reverse", fixtures.reverse ?? fixtures.payments ?? [[]], params)
      }
      return list("invoicePayments.list", fixtures.payments ?? [[]], params)
    } },
    disputes: { list: (params: ListParams) => {
      assert.equal(params.charge, "ch_1")
      return list("disputes.list", fixtures.disputes ?? [[]], params)
    } },
  } as unknown as Stripe
  return { stripe, calls }
}

async function resolve(fixtures: Fixtures = {}, binding = profile, previous: TrialBillingRiskEvidence[] = []) {
  const { stripe } = provider(fixtures)
  return resolveTrialEligibility(stripe, binding, now, previous)
}

function disputedFixtures(status = "lost"): Fixtures {
  return { invoices: [[invoice()]], charges: [[charge()]], payments: [[payment()]], disputes: [[dispute({ status })]] }
}

describe("read-only trial eligibility", () => {
  before(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_essentials"
    process.env.STRIPE_SOLO_PRICE_ID = "price_control"
    process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "price_small"
    process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_pro"
  })

  for (const status of ["trialing", "canceled", "cancelled", "paused"]) {
    test(`no customer allows debt-free local ${status} without any provider reads`, async () => {
      const { stripe, calls } = provider()
      const result = await resolveTrialEligibility(stripe, { ...profile, stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: status }, now)
      assert.equal(result.eligible, true)
      assert.equal(result.source, "admin_grant")
      assert.deepEqual(calls, [])
    })
  }
  for (const status of ["active", "past_due", "unpaid", "incomplete", "incomplete_expired", "unknown", null]) {
    test(`no customer does not assume local ${status} is debt free`, async () => {
      const result = await resolve({}, { ...profile, stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: status })
      assert.equal(result.eligible, false)
      assert.equal(result.source, null)
    })
  }
  for (const status of ["canceled", "paused"]) {
    test(`${status} subscription is eligible without resumption or mutations`, async () => {
      const { stripe, calls } = provider({ subscriptions: [[subscription({ status })]] })
      const result = await resolveTrialEligibility(stripe, profile, now)
      assert.equal(result.eligible, true)
      assert.equal(result.source, "admin_grant")
      assert.ok(result.fingerprint)
      assert.deepEqual(calls.map((call) => call.method), ["customers.retrieve", "subscriptions.list", "invoices.list", "charges.list"])
    })
  }
  for (const status of ["active", "past_due", "unpaid", "incomplete", "incomplete_expired"]) {
    test(`fresh ${status} blocks despite canceled local projection`, async () => {
      const result = await resolve({ subscriptions: [[subscription({ status })]] })
      assert.equal(result.available, true)
      assert.equal(result.eligible, false)
      assert.ok(result.restrictions.includes(`subscription_${status}`))
      assert.equal(result.source, null)
    })
  }
  test("suitable trial uses expanded authoritative snapshot and never grants locally", async () => {
    const trial = subscription({ status: "trialing", latest_invoice: "in_1" })
    const current = subscription({ status: "trialing", latest_invoice: invoice() })
    const result = await resolve({ subscriptions: [[trial]], current, invoices: [[invoice()]] })
    assert.equal(result.source, "stripe_trial")
    assert.equal(result.snapshot?.tier, "business_control")
    assert.equal(result.snapshot?.periodEnd?.getTime(), (seconds + 1000) * 1000)
    assert.equal(result.snapshot?.trialEndsAt?.getTime(), (seconds + 86400) * 1000)
  })
  test("trialing past recorded expiry remains Stripe source, not an application fallback", async () => {
    const result = await resolve({ subscriptions: [[subscription({ status: "trialing", trial_end: seconds - 100 })]] })
    assert.equal(result.source, "stripe_trial")
  })
  for (const overrides of [
    { schedule: "sub_sched_1" }, { cancel_at: seconds + 100 }, { cancel_at_period_end: true },
    { pending_update: {} }, { pause_collection: {} }, { pending_invoice_item_interval: {} },
    { next_pending_invoice_item_invoice: seconds + 100 }, { trial_end: null },
    { items: { data: [{ quantity: 2, price: { id: "price_control", type: "recurring", recurring: { usage_type: "licensed" } } }], has_more: false } },
    { items: { data: [{ quantity: 1, price: { id: "price_control", type: "recurring", recurring: { usage_type: "metered" } } }], has_more: false } },
  ]) {
    test(`unsupported live trial ${JSON.stringify(overrides)} cannot fall back`, async () => {
      const result = await resolve({ subscriptions: [[subscription({ status: "trialing", ...overrides })]] })
      assert.equal(result.eligible, false)
      assert.equal(result.source, null)
      assert.ok(result.restrictions.includes("unsupported_stripe_trial"))
    })
  }
  test("multiple live subscriptions on a later page fail closed", async () => {
    const result = await resolve({ subscriptions: [[subscription({ status: "trialing" })], [subscription({ id: "sub_2", status: "paused" })]] })
    assert.ok(result.restrictions.includes("multiple_live_subscriptions"))
    assert.equal(result.source, null)
  })
  for (const overrides of [
    { status: "unknown" },
    { customer: "cus_other" }, { metadata: { user_id: "tenant_other" } },
    { items: { data: [{ price: { id: "unmapped" } }], has_more: false } },
    { items: { data: [], has_more: false } },
    { items: { data: [{ price: { id: "price_control" } }, { price: { id: "price_control" } }], has_more: false } },
  ]) {
    test(`unknown/conflicting subscription evidence ${JSON.stringify(overrides)} blocks`, async () => {
      const result = await resolve({ subscriptions: [[subscription(overrides)]] })
      assert.equal(result.available, false)
      assert.equal(result.fingerprint, null)
    })
  }
  for (const customer of [{ id: "cus_1", deleted: true }, { id: "cus_other", metadata: {} }, { id: "cus_1", metadata: { userId: "tenant_other" } }]) {
    test(`invalid fresh linked customer ${JSON.stringify(customer)} blocks`, async () => {
      assert.equal((await resolve({ customer })).eligible, false)
    })
  }
  test("missing/ambiguous linked subscription and no-customer subscription binding block", async () => {
    assert.equal((await resolve({ subscriptions: [[]] })).available, false)
    assert.equal((await resolve({ subscriptions: [[subscription({ id: "sub_old" }), subscription({ id: "sub_new", status: "trialing" })]] }, { ...profile, stripeSubscriptionId: "sub_old" })).available, false)
    assert.equal((await resolve({}, { ...profile, stripeCustomerId: null })).available, false)
  })
  for (const debt of [
    { status: "open", amount_remaining: 100, attempt_count: 1 },
    { status: "open", amount_remaining: 100, attempt_count: 0, due_date: seconds - 1 },
    { status: "uncollectible", amount_remaining: 0 },
  ]) {
    test(`older debt ${JSON.stringify(debt)} survives unrelated newer paid invoice and cancellation`, async () => {
      const result = await resolve({ invoices: [[invoice({ id: "in_new" })], [invoice(debt)]] })
      assert.equal(result.eligible, false)
      assert.ok(result.risks.find((risk) => risk.stripeObjectId === "in_1")?.blocking)
      assert.equal(result.risks.find((risk) => risk.stripeObjectId === "in_new")?.blocking, false)
    })
  }
  for (const status of ["paid", "void", "draft"]) {
    test(`${status} invoice is safe, including historical failed attempts`, async () => {
      const result = await resolve({ invoices: [[invoice({ status, amount_remaining: status === "draft" ? 100 : 0 })]] })
      assert.equal(result.eligible, true)
      assert.equal(result.risks[0].blocking, false)
    })
  }
  test("open not-yet-due/unattempted invoice is not failed or overdue debt", async () => {
    assert.equal((await resolve({ invoices: [[invoice({ status: "open", amount_remaining: 100, attempt_count: 0, due_date: seconds + 1 })]] })).eligible, true)
  })
  for (const status of ["warning_needs_response", "warning_under_review", "needs_response", "under_review", "lost", "won", "warning_closed", "prevented"]) {
    test(`verified subscription dispute ${status} has exact independent risk evidence`, async () => {
      const result = await resolve(disputedFixtures(status))
      const blocking = !["won", "warning_closed", "prevented"].includes(status)
      assert.equal(result.eligible, !blocking)
      assert.deepEqual(result.risks.find((risk) => risk.kind === "subscription_dispute"), {
        kind: "subscription_dispute", stripeObjectId: "du_1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
        stripeInvoiceId: "in_1", stripeChargeId: "ch_1", stripeStatus: status, blocking,
      })
    })
  }
  test("older charge/payment/dispute pages cannot hide lost disputes behind won disputes", async () => {
    const result = await resolve({ ...disputedFixtures(),
      charges: [[], [charge()]],
    })
    assert.equal(result.available, false, "malformed empty nonterminal page fails closed")
    const older = await resolve({ ...disputedFixtures(),
      charges: [[charge({ id: "ch_new", payment_intent: null, disputed: false, on_behalf_of: "acct_debtor" })], [charge()]],
      payments: [[payment({ id: "inpay_new", payment: { type: "payment_record", payment_record: "pr_1" } })], [payment()]],
      reverse: [[payment()]], disputes: [[dispute({ id: "du_new", status: "won" })], [dispute()]],
    })
    assert.equal(older.eligible, false)
    assert.equal(older.risks.filter((risk) => risk.kind === "subscription_dispute").length, 2)
  })
  test("legacy direct charge maps through paginated invoice payments without removed charge.invoice", async () => {
    const result = await resolve({ ...disputedFixtures(), charges: [[charge({ payment_intent: null })]],
      payments: [[payment({ payment: { type: "charge", charge: "ch_1" } })]],
      disputes: [[dispute({ payment_intent: null })]],
    })
    assert.equal(result.eligible, false)
    assert.ok(result.risks.some((risk) => risk.kind === "subscription_dispute"))
  })
  test("Connect/debtor charge is excluded by verified account provenance, never by metadata", async () => {
    const { stripe, calls } = provider({ charges: [[charge({ on_behalf_of: "acct_debtor" })]], fail: "invoicePayments.reverse" })
    assert.equal((await resolveTrialEligibility(stripe, profile, now)).eligible, true)
    assert.equal(calls.some((call) => call.method === "disputes.list"), false)
    assert.equal(calls.some((call) => call.method === "invoicePayments.reverse"), false)
  })
  test("platform one-time PaymentIntent is excluded only after complete reverse mapping proves no invoice", async () => {
    const { stripe, calls } = provider({ charges: [[charge()]], reverse: [[]] })
    assert.equal((await resolveTrialEligibility(stripe, profile, now)).eligible, true)
    assert.ok(calls.some((call) => call.method === "invoicePayments.reverse"))
    assert.equal(calls.some((call) => call.method === "disputes.list"), false)
  })
  test("explicit manual platform invoice proves an unrelated legacy one-time charge", async () => {
    const result = await resolve({ invoices: [[invoice({ parent: null, billing_reason: "manual" })]],
      payments: [[payment({ payment: { type: "charge", charge: "ch_1" } })]], charges: [[charge({ payment_intent: null })]],
    })
    assert.equal(result.eligible, true)
    assert.deepEqual(result.risks, [])
  })
  test("unknown charge mapping, metadata-only mapping, unknown invoice and dispute status fail closed", async () => {
    const cases: Fixtures[] = [
      { charges: [[charge({ payment_intent: null })]] },
      { charges: [[charge({ metadata: { subscriptionId: "sub_1" } })]] },
      { ...disputedFixtures(), reverse: [[payment({ invoice: "in_unknown" })]] },
      { invoices: [[invoice({ parent: null })]] },
      { invoices: [[invoice({ status: "unknown" })]] },
      { invoices: [[invoice({ amount_remaining: undefined })]] },
      { ...disputedFixtures(), disputes: [[dispute({ status: "unknown" })]] },
      { ...disputedFixtures(), disputes: [[dispute({ charge: "ch_other" })]] },
      { ...disputedFixtures(), disputes: [[]] },
      { ...disputedFixtures(), charges: [[charge({ on_behalf_of: "acct_debtor" })]] },
    ]
    for (const fixture of cases) {
      const result = await resolve(fixture)
      assert.equal(result.available, false)
      assert.equal(result.fingerprint, null)
    }
  })
  test("previous risk only clears on specific verified resolution, not absence or cancellation", async () => {
    const previous = (await resolve(disputedFixtures())).risks
    assert.equal((await resolve({}, profile, previous)).available, false)
    assert.equal((await resolve(disputedFixtures("won"), profile, previous)).eligible, true)
    const debt = (await resolve({ invoices: [[invoice({ status: "open", amount_remaining: 100 })]] })).risks
    assert.equal((await resolve({ invoices: [[invoice({ status: "open", attempt_count: 0 })]] }, profile, debt)).eligible, false)
    assert.equal((await resolve({ invoices: [[invoice({ status: "void" })]] }, profile, debt)).eligible, true)
    assert.equal((await resolve({ invoices: [[invoice({ status: "draft" })]] }, profile, debt)).available, false)
  })
  test("reverse PaymentIntent lookup fully paginates older subscription mappings", async () => {
    const result = await resolve({ ...disputedFixtures(),
      reverse: [[payment({ id: "inpay_new" })], [payment()]],
    })
    assert.equal(result.eligible, false)
    assert.ok(result.risks.some((risk) => risk.kind === "subscription_dispute" && risk.blocking))
  })
  test("unknown previous risk cannot be treated as debt free", async () => {
    const previous = (await resolve(disputedFixtures())).risks
    previous[0].stripeStatus = "unknown"
    assert.equal((await resolve(disputedFixtures("won"), profile, previous)).available, false)
  })
  test("duplicate pagination IDs are rejected rather than skipping old records", async () => {
    assert.equal((await resolve({ subscriptions: [[subscription()], [subscription()]] })).available, false)
  })
  test("debt-free paused subscription conflicting with current local binding is ambiguous", async () => {
    const result = await resolve({ subscriptions: [[subscription(), subscription({ id: "sub_2", status: "paused" })]] })
    assert.ok(result.restrictions.includes("ambiguous_subscription_binding"))
  })
  for (const method of ["customers.retrieve", "subscriptions.list", "subscriptions.retrieve", "invoices.list", "charges.list", "invoicePayments.list", "invoicePayments.reverse", "disputes.list"]) {
    test(`${method} provider failure is unavailable, sanitized, and cannot fall back`, async () => {
      const result = await resolve({ ...disputedFixtures(), subscriptions: [[subscription({ status: "trialing" })]], fail: method })
      assert.equal(result.available, false)
      assert.equal(result.eligible, false)
      assert.equal(result.source, null)
      assert.equal(result.fingerprint, null)
      assert.ok(result.restrictions.includes("provider_unavailable"))
      assert.equal(JSON.stringify(result).includes("sensitive upstream"), false)
    })
  }
  test("binding reservation and provider state changes prevent a valid preview fingerprint", async () => {
    assert.equal((await resolve({}, { ...profile, pendingTrialOperationId: "operation_1" })).eligible, false)
    const trial = subscription({ status: "trialing" })
    assert.equal((await resolve({ subscriptions: [[trial]], current: subscription({ status: "trialing", trial_end: seconds + 999 }) })).available, false)
    const first = await resolve()
    assert.equal(first.fingerprint, (await resolve()).fingerprint)
    assert.notEqual(first.fingerprint, (await resolve({}, { ...profile, billingAccessVersion: 4 })).fingerprint)
    assert.notEqual(first.fingerprint, (await resolve({ subscriptions: [[subscription({ trial_end: seconds + 100 })]] })).fingerprint)
  })
})