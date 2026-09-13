import assert from "node:assert/strict"
import test from "node:test"

import { getDepositPaymentProvider } from "@/lib/depositGuard/payments"

test("manual external link provider returns setup-required when URL is missing", async () => {
  const provider = getDepositPaymentProvider("manual_external_link")
  const result = await provider.createPaymentRequest({
    userId: "user-1",
    jobId: "job-1",
    requestId: "request-1",
    amountCents: 10_000,
    currency: "aud",
  })

  assert.equal(result.availability, "unavailable")
  assert.equal(result.reasonCode, "setup_required")
})

test("manual external link provider returns available when URL is provided", async () => {
  const provider = getDepositPaymentProvider("manual_external_link")
  const result = await provider.createPaymentRequest({
    userId: "user-1",
    jobId: "job-1",
    requestId: "request-1",
    amountCents: 10_000,
    currency: "aud",
    externalPaymentUrl: "https://pay.example.test/request/abc",
  })

  assert.equal(result.availability, "available")
  assert.equal(result.externalPaymentReference, "manual-link:request-1")
  assert.equal(result.externalPaymentUrl, "https://pay.example.test/request/abc")
})

test("stripe provider is an explicit placeholder until connected-account flow ships", async () => {
  const provider = getDepositPaymentProvider("stripe_connect")
  const result = await provider.createPaymentRequest({
    userId: "user-1",
    jobId: "job-1",
    requestId: "request-1",
    amountCents: 10_000,
    currency: "aud",
  })

  assert.equal(result.availability, "unavailable")
  assert.equal(result.reasonCode, "setup_required")
})
