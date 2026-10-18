import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"

let facts: EffectiveAccessSnapshot
let accessReads = 0
let contextReads = 0
let sends = 0
let writes = 0
let revokeBeforeSend = false
let expireBeforeSend = false
let requestStatus = "requested"
let reminderStatus = "pending"
let processDepositReminder: typeof import("@/lib/depositGuard/reminderDelivery").processDepositReminder
let requestJevSuggestionForSpend: typeof import("@/lib/spendClassification/jevRequest").requestJevSuggestionForSpend

before(async () => {
  await mock.module("server-only", { namedExports: {} })
  await mock.module("@/lib/billing/effectiveAccessSystem", { namedExports: {
    getEffectiveAccessForSystem: async (userId: string) => {
      assert.equal(userId, "tenant")
      accessReads += 1
      if (accessReads === 2 && expireBeforeSend) facts.grant!.expiresAt = new Date(0)
      if (accessReads === 2 && revokeBeforeSend) facts.grant!.revokedAt = new Date()
      return resolveEffectiveAccess(facts, new Date())
    },
  } })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    depositReminder: {
      findUnique: async () => ({
        id: "reminder", userId: "tenant", reminderType: "initial_request",
        scheduledFor: new Date(0), deliveryStatus: reminderStatus,
        depositRequest: {
          id: "request", jobId: "job", status: requestStatus,
          description: "Deposit", totalAmountCents: 100, currency: "aud", dueDate: new Date(),
          job: { userProfile: { displayName: "Owner" }, customer: { financialContact: { name: "Client", email: "client@example.invalid" } } },
        },
      }),
      update: async ({ data }: { data: { deliveryStatus: string } }) => { writes += 1; reminderStatus = data.deliveryStatus },
    },
    depositGuardEvent: { create: async () => { writes += 1 } },
  } } })
  await mock.module("@/lib/email/sendDepositReminder", { namedExports: {
    sendDepositReminderEmail: async () => { sends += 1; return "message" },
  } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, callback: (tx: unknown) => unknown) => {
      assert.equal(userId, "tenant")
      contextReads += 1
      return callback({
        spendClassificationSetting: { findUnique: async () => ({ enabled: true }) },
        spendClassification: { findFirst: async () => ({ id: "classification" }) },
        importedBill: { findFirst: async () => ({ supplierName: "Hosting", currency: "AUD" }) },
        spendCategory: { findMany: async () => [{ id: "software", name: "Software", description: null }] },
      })
    },
  } })
  await mock.module("@/lib/spendClassification/jevClient", { namedExports: {
    classifySpendWithJev: async () => { sends += 1; return {} },
  } })
  ;({ processDepositReminder } = await import("@/lib/depositGuard/reminderDelivery"))
  ;({ requestJevSuggestionForSpend } = await import("@/lib/spendClassification/jevRequest"))
})

beforeEach(() => {
  facts = {
    profile: { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 0 },
    grant: { plan: "small_business", startsAt: new Date(0), expiresAt: new Date("2099-01-01"), revokedAt: null },
    billingRisks: [],
  }
  accessReads = contextReads = sends = writes = 0
  revokeBeforeSend = expireBeforeSend = false
  requestStatus = "requested"
  reminderStatus = "pending"
})

const workflows = [
  { name: "deposit reminder", run: () => processDepositReminder("reminder"), success: "sent" },
  { name: "spend classification", run: () => requestJevSuggestionForSpend("tenant", "imported_bill", "bill"), success: "requested" },
]

for (const workflow of workflows) {
  test(`${workflow.name}: valid grant authorizes despite inactive raw Essentials`, async () => {
    assert.equal((await workflow.run()).status, workflow.success)
    assert.equal(sends, 1)
    assert.equal(accessReads, 2)
  })

  for (const mode of ["expired", "revoked", "unpaid", "risk", "missing", "send_expiry", "send_revocation"] as const) {
    test(`${workflow.name}: ${mode} returns a structured skip without provider sends or success writes`, async () => {
      if (mode === "expired") facts.grant!.expiresAt = new Date(0)
      if (mode === "revoked") facts.grant!.revokedAt = new Date()
      if (mode === "unpaid") facts.profile!.subscriptionStatus = "unpaid"
      if (mode === "risk") facts.billingRisks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
      if (mode === "missing") facts.profile = null
      expireBeforeSend = mode === "send_expiry"
      revokeBeforeSend = mode === "send_revocation"
      assert.deepEqual(await workflow.run(), { status: "skipped", reason: "no_access" })
      assert.equal(sends + writes, 0)
      assert.equal(reminderStatus, "pending")
      if (accessReads === 1) assert.equal(contextReads, 0)
    })
  }
}

test("deposit reminders retain the automatic-reminder feature gate for initial requests", async () => {
  facts.grant!.plan = "essentials"
  assert.deepEqual(await processDepositReminder("reminder"), { status: "skipped", reason: "feature_not_available" })
  assert.equal(sends + writes, 0)
})

test("paid deposit request cleanup remains available without subscription access", async () => {
  facts.grant!.expiresAt = new Date(0)
  requestStatus = "paid"
  assert.deepEqual(await processDepositReminder("reminder"), { status: "skipped", reason: "request_paid" })
  assert.equal(reminderStatus, "cancelled")
  assert.equal(writes, 1)
  assert.equal(sends + accessReads, 0)
})