import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import Stripe from "stripe"

const WEBHOOK_SECRET = "whsec_deposit_test"

let webhookCreateCalls: Array<{ data: Record<string, unknown> }> = []
let webhookCreateShouldThrowCode: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let processDepositPaymentWebhook: any

const stripe = new Stripe("sk_test_dummy", { apiVersion: "2026-05-27.dahlia" })

function makeSignedPayload(event: unknown): { payload: string; signature: string } {
  const payload = JSON.stringify(event)
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  })

  return { payload, signature }
}

describe("Deposit payment webhooks", () => {
  before(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = WEBHOOK_SECRET

    await mock.module("@/lib/db/admin", {
      exports: {
        prismaAdmin: {
          depositPaymentWebhookEvent: {
            create: async (args: { data: Record<string, unknown> }) => {
              if (webhookCreateShouldThrowCode) {
                throw { code: webhookCreateShouldThrowCode }
              }
              webhookCreateCalls.push(args)
              return {}
            },
          },
        },
      },
    })

    ;({ processDepositPaymentWebhook } = await import("@/lib/depositGuard/payments/webhooks"))
  })

  beforeEach(() => {
    webhookCreateCalls = []
    webhookCreateShouldThrowCode = null
  })

  test("accepts valid Stripe signature and persists idempotency row", async () => {
    const { payload, signature } = makeSignedPayload({
      id: "evt_deposit_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
          metadata: {
            userId: "user_1",
            jobId: "job_1",
            requestId: "req_1",
          },
        },
      },
    })

    const result = await processDepositPaymentWebhook({
      provider: "stripe_connect",
      payload,
      signature,
    })

    assert.equal(result.status, 200)
    assert.equal(result.body.received, true)
    assert.equal(result.body.acknowledged, true)
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(
      webhookCreateCalls[0]?.data.processingStatus,
      "processed",
    )
  })

  test("returns deduped response on duplicate provider event", async () => {
    webhookCreateShouldThrowCode = "P2002"

    const { payload, signature } = makeSignedPayload({
      id: "evt_deposit_dup",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_dup", metadata: {} } },
    })

    const result = await processDepositPaymentWebhook({
      provider: "stripe_connect",
      payload,
      signature,
    })

    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { received: true, deduped: true })
  })

  test("rejects invalid signatures", async () => {
    const payload = JSON.stringify({
      id: "evt_bad_sig",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_bad", metadata: {} } },
    })

    const result = await processDepositPaymentWebhook({
      provider: "stripe_connect",
      payload,
      signature: "invalid",
    })

    assert.equal(result.status, 400)
    assert.deepEqual(result.body, { error: "Invalid signature" })
    assert.equal(webhookCreateCalls.length, 0)
  })

  test("records unsupported but verified event types as skipped", async () => {
    const { payload, signature } = makeSignedPayload({
      id: "evt_deposit_unknown",
      type: "charge.updated",
      data: { object: { id: "ch_1", metadata: {} } },
    })

    const result = await processDepositPaymentWebhook({
      provider: "stripe_connect",
      payload,
      signature,
    })

    assert.equal(result.status, 200)
    assert.equal(result.body.received, true)
    assert.equal(result.body.ignored, true)
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookCreateCalls[0]?.data.processingStatus, "skipped")
  })
})
