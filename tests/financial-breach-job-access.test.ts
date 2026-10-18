import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"

let facts: EffectiveAccessSnapshot
let promiseWrites: Array<Record<string, unknown>> = []
let arrangementUpdates = 0
let counts = 0
let sends = 0
let deniedAtSend = false
let promiseStatus = "active"
let breachNotifiedAt: Date | null = null
let sweep: typeof import("@/lib/email/breachSweep").runPromiseAndArrangementBreachSweep

before(async () => {
  await mock.module("@/lib/billing/effectiveAccessSystem", { namedExports: {
    getEffectiveAccessForSystem: async () => resolveEffectiveAccess(facts, new Date()),
    getEffectiveAccessForUsersForSystem: async (ids: string[]) => new Map(ids.map((id) => [id, resolveEffectiveAccess(facts, new Date())])),
  } })
  await mock.module("@supabase/supabase-js", { namedExports: {
    createClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.invalid" } } }) } } }),
  } })
  await mock.module("@/lib/email/send", { namedExports: {
    resolveFreelancerName: () => "Owner",
    sendP2PNotification: async () => {
      if (deniedAtSend) return { status: "skipped", reason: "no_access" }
      sends += 1
      return { status: "sent" }
    },
  } })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    promiseToPay: {
      findMany: async ({ where }: { where: { status: { in: string[] }; breachNotifiedAt: null } }) => {
        assert.deepEqual(where.status, { in: ["active", "broken"] })
        assert.equal(where.breachNotifiedAt, null)
        return where.status.in.includes(promiseStatus) && breachNotifiedAt === null
          ? [{ id: "promise", trackedInvoice: { userId: "tenant", userProfile: { displayName: "Owner" }, financialInvoice: { contact: { emailLower: "client@example.invalid" } } } }]
          : []
      },
      count: async () => { counts += 1; return 1 },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        promiseWrites.push(data)
        if (typeof data.status === "string") promiseStatus = data.status
        if (data.breachNotifiedAt instanceof Date) breachNotifiedAt = data.breachNotifiedAt
      },
    },
    arrangement: {
      findMany: async () => [{ id: "arrangement", promisedPayBy: null }],
      update: async () => { arrangementUpdates += 1 },
    },
  } } })
  sweep = (await import("@/lib/email/breachSweep")).runPromiseAndArrangementBreachSweep
})

beforeEach(() => {
  facts = {
    profile: { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 0 },
    grant: { plan: "small_business", startsAt: new Date(0), expiresAt: new Date("2099-01-01"), revokedAt: null }, billingRisks: [],
  }
  sends = counts = arrangementUpdates = 0
  promiseWrites = []
  deniedAtSend = false
  promiseStatus = "active"
  breachNotifiedAt = null
})

test("grant-backed breach workflow computes and sends, recording notification success only after send", async () => {
  assert.equal((await sweep()).brokenPromises, 1)
  assert.equal(sends, 1)
  assert.deepEqual(promiseWrites[0], { status: "broken" })
  assert.ok(promiseWrites[1].breachNotifiedAt instanceof Date)
})

for (const mode of ["expired", "revoked", "restricted"] as const) {
  test(`${mode} breach grant skips computation/notification while operational arrangement expiry remains available`, async () => {
    if (mode === "expired") facts.grant!.expiresAt = new Date(0)
    if (mode === "revoked") facts.grant!.revokedAt = new Date()
    if (mode === "restricted") facts.profile!.subscriptionStatus = "unpaid"
    const result = await sweep()
    assert.equal(result.skipped, 1)
    assert.equal(result.brokenPromises, 0)
    assert.equal(counts + sends + promiseWrites.length, 0)
    assert.equal(arrangementUpdates, 1)
  })
}

test("expiry at final dispatch never records breachNotifiedAt success", async () => {
  deniedAtSend = true
  assert.equal((await sweep()).skipped, 1)
  assert.equal(sends, 0)
  assert.equal(promiseWrites.length, 1)
  assert.equal(promiseWrites[0].breachNotifiedAt, undefined)
})

test("an unnotified broken promise resumes after access restoration and is not sent again after success", async () => {
  deniedAtSend = true
  assert.equal((await sweep()).skipped, 1)
  assert.equal(promiseStatus, "broken")
  assert.equal(breachNotifiedAt, null)

  deniedAtSend = false
  assert.equal((await sweep()).brokenPromises, 1)
  assert.equal(sends, 1)
  assert.ok(promiseWrites.at(-1)?.breachNotifiedAt instanceof Date)

  assert.equal((await sweep()).brokenPromises, 0)
  assert.equal(sends, 1)
})