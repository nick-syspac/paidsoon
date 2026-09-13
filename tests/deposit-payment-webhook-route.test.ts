import assert from "node:assert/strict"
import test from "node:test"

import { POST } from "@/app/api/webhooks/deposit-payments/route"

test("deposit payment webhook route rejects invalid provider query", async () => {
  const request = new Request(
    "http://localhost:3000/api/webhooks/deposit-payments?provider=unknown",
    {
      method: "POST",
      body: "{}",
    },
  )

  const response = await POST(request)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.deepEqual(body, { error: "Invalid provider" })
})
