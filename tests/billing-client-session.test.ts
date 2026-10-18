import { before, mock, test } from "node:test"
import assert from "node:assert/strict"
import { billingClientScope } from "@/lib/billing/billingClientScope"

const sessionId = "96ea5264-fbe7-4d46-9086-e9244675c511"
let claims: unknown = { sub: "owner", session_id: sessionId }
let error: unknown = null
let scope: typeof import("@/lib/billing/billingClientSession").getBillingClientScope
before(async () => {
  await mock.module("server-only", { namedExports: {} })
  await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims }, error }) } }) } })
  ;({ getBillingClientScope: scope } = await import("@/lib/billing/billingClientSession"))
})
test("only verified matching subject/session claims supply the opaque browser scope", async () => {
  assert.equal(await scope("owner"), billingClientScope("owner", sessionId))
  assert.equal(await scope("foreign"), "")
})
test("missing, malformed and errored session claims fail closed", async () => {
  for (const value of [null, {}, { sub: "owner" }, { sub: "owner", session_id: "bad" }]) {
    claims = value
    assert.equal(await scope("owner"), "")
  }
  claims = { sub: "owner", session_id: sessionId }
  error = new Error("unavailable")
  assert.equal(await scope("owner"), "")
})