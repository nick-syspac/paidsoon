/**
 * Route handler tests for the Resend delivery-status webhook
 * (app/api/webhooks/resend/route.ts). Covers signature verification failure,
 * successful EmailLog status updates, and safe handling of events with no
 * matching EmailLog row. Uses Node's built-in mock.module() to stub
 * prismaAdmin — no real DB or Resend network calls are made.
 */
import { describe, test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "crypto"

const WEBHOOK_SECRET = `whsec_${Buffer.from("test-secret-bytes").toString("base64")}`

let updateManyCalls: Array<{ where: unknown; data: unknown }> = []
const KNOWN_MESSAGE_IDS = new Set(["re_123", "re_456"])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resendRoute: any

describe("Resend webhook route", () => {
  before(async () => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          emailLog: {
            updateMany: async (args: { where: { resendMessageId: string }; data: unknown }) => {
              updateManyCalls.push(args)
              return { count: KNOWN_MESSAGE_IDS.has(args.where.resendMessageId) ? 1 : 0 }
            },
          },
        },
      },
    })

    ;({ POST: resendRoute } = await import("@/app/api/webhooks/resend/route"))
  })

  beforeEach(() => {
    updateManyCalls = []
  })

  function signedRequest(body: string, opts?: { badSignature?: boolean }): Request {
    const svixId = "msg_test123"
    const svixTimestamp = String(Math.floor(Date.now() / 1000))
    const secretBytes = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64")
    const signedContent = `${svixId}.${svixTimestamp}.${body}`
    const signature = opts?.badSignature
      ? "bogus-signature=="
      : createHmac("sha256", secretBytes).update(signedContent).digest("base64")

    return new Request("http://localhost:3000/api/webhooks/resend", {
      method: "POST",
      body,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": `v1,${signature}`,
      },
    })
  }

  test("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_123" } })
    const res = await resendRoute(signedRequest(body, { badSignature: true }))

    assert.equal(res.status, 400)
    assert.equal(updateManyCalls.length, 0)
  })

  test("updates the matching EmailLog status on a verified delivered event", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_123" } })
    const res = await resendRoute(signedRequest(body))

    assert.equal(res.status, 200)
    assert.equal(updateManyCalls.length, 1)
    assert.deepEqual(updateManyCalls[0], {
      where: { resendMessageId: "re_123" },
      data: { status: "delivered" },
    })
  })

  test("updates status to bounced on a verified bounce event", async () => {
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: "re_456" } })
    const res = await resendRoute(signedRequest(body))

    assert.equal(res.status, 200)
    assert.deepEqual(updateManyCalls[0], {
      where: { resendMessageId: "re_456" },
      data: { status: "bounced" },
    })
  })

  test("returns success without erroring for an event type it doesn't track", async () => {
    const body = JSON.stringify({ type: "email.opened", data: { email_id: "re_789" } })
    const res = await resendRoute(signedRequest(body))

    assert.equal(res.status, 200)
    assert.equal(updateManyCalls.length, 0)
  })

  test("returns success when no EmailLog row matches the message id", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re-unknown" } })
    const res = await resendRoute(signedRequest(body))

    assert.equal(res.status, 200)
    assert.equal(updateManyCalls.length, 1)
  })
})
