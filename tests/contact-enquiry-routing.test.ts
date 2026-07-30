import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import {
  CONTACT_ENQUIRY_RECIPIENTS,
  type ContactEnquiryType,
} from "@/lib/email/contactEnquiryRouting"

let sendResult: string | null = "msg_123"
let sendCalls: Array<{
  name: string
  email: string
  enquiryType: ContactEnquiryType
  message: string
}> = []

let verifyResult:
  | { success: true }
  | { success: false; error: string; status: 400 | 503 } = { success: true }
let verifyCalls: Array<string | null | undefined> = []

let contactPost: ((req: Request) => Promise<Response>) | null = null

function makeValidPayload(enquiryType: ContactEnquiryType) {
  return {
    name: "Taylor Smith",
    email: "taylor@example.com",
    enquiryType,
    message: "Hello from a test enquiry.",
    cfToken: "turnstile-token",
  }
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("Contact enquiry routing configuration", () => {
  test("maps each supported enquiry type to the expected recipient", () => {
    assert.deepStrictEqual(CONTACT_ENQUIRY_RECIPIENTS, {
      Sales: "sales@paidsoon.com.au",
      Support: "support@paidsoon.com.au",
      "Accounting Partnerships": "partnerships@padisoon.com.au",
    })
  })
})

describe("POST /api/contact", () => {
  before(async () => {
    await mock.module("@/lib/auth/verifyTurnstile", {
      namedExports: {
        verifyTurnstile: async (token: string | null | undefined) => {
          verifyCalls.push(token)
          return verifyResult
        },
      },
    })

    await mock.module("@/lib/email/send", {
      namedExports: {
        sendContactEnquiryEmail: async (payload: {
          name: string
          email: string
          enquiryType: ContactEnquiryType
          message: string
        }) => {
          sendCalls.push(payload)
          return sendResult
        },
      },
    })

    ;({ POST: contactPost } = await import("@/app/api/contact/route"))
  })

  beforeEach(() => {
    sendResult = "msg_123"
    sendCalls = []
    verifyResult = { success: true }
    verifyCalls = []
  })

  test("routes accepted enquiry types and returns success", async () => {
    if (!contactPost) throw new Error("route not loaded")

    const types: ContactEnquiryType[] = [
      "Sales",
      "Support",
      "Accounting Partnerships",
    ]

    for (const enquiryType of types) {
      const res = await contactPost(makeJsonRequest(makeValidPayload(enquiryType)))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.deepStrictEqual(body, { success: true })
    }

    assert.strictEqual(sendCalls.length, 3)
    assert.deepStrictEqual(
      sendCalls.map((call) => call.enquiryType),
      types,
    )
  })

  test("rejects unsupported enquiry types and does not send email", async () => {
    if (!contactPost) throw new Error("route not loaded")

    const res = await contactPost(
      makeJsonRequest({
        ...makeValidPayload("Sales"),
        enquiryType: "Demo",
      }),
    )

    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.error, "Invalid request payload")
    assert.strictEqual(verifyCalls.length, 0)
    assert.strictEqual(sendCalls.length, 0)
  })

  test("rejects missing Turnstile token and does not verify or send", async () => {
    if (!contactPost) throw new Error("route not loaded")

    const payload = makeValidPayload("Sales")
    const { cfToken: _unusedToken, ...withoutToken } = payload

    const res = await contactPost(makeJsonRequest(withoutToken))

    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.error, "Invalid request payload")
    assert.strictEqual(verifyCalls.length, 0)
    assert.strictEqual(sendCalls.length, 0)
  })

  test("rejects invalid Turnstile token and skips email send", async () => {
    if (!contactPost) throw new Error("route not loaded")

    verifyResult = {
      success: false,
      error: "Security check failed. Please try again.",
      status: 400,
    }

    const res = await contactPost(makeJsonRequest(makeValidPayload("Support")))

    assert.strictEqual(res.status, 400)
    const body = await res.json()
    assert.strictEqual(body.error, "Security check failed. Please try again.")
    assert.strictEqual(verifyCalls.length, 1)
    assert.strictEqual(sendCalls.length, 0)
  })

  test("fails closed when Turnstile verification service is unavailable", async () => {
    if (!contactPost) throw new Error("route not loaded")

    verifyResult = {
      success: false,
      error: "Security check failed. Please try again.",
      status: 503,
    }

    const res = await contactPost(makeJsonRequest(makeValidPayload("Sales")))

    assert.strictEqual(res.status, 503)
    const body = await res.json()
    assert.strictEqual(body.error, "Security check failed. Please try again.")
    assert.strictEqual(verifyCalls.length, 1)
    assert.strictEqual(sendCalls.length, 0)
  })

  test("returns explicit delivery failure when send operation fails", async () => {
    if (!contactPost) throw new Error("route not loaded")

    sendResult = null

    const res = await contactPost(makeJsonRequest(makeValidPayload("Support")))

    assert.strictEqual(res.status, 502)
    const body = await res.json()
    assert.strictEqual(body.error, "Unable to send contact enquiry")
    assert.strictEqual(sendCalls.length, 1)
  })
})
