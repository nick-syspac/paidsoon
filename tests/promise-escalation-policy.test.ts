import test from "node:test"
import assert from "node:assert/strict"
import {
  applyTimingEscalation,
  applyToneEscalationStage,
  buildBrokenPromiseDebtorCounts,
  promiseDebtorKey,
  resolvePromiseEscalationPolicy,
  shouldBlockClientPromise,
} from "@/lib/promiseEscalationPolicy"

test("resolvePromiseEscalationPolicy returns safe defaults", () => {
  const policy = resolvePromiseEscalationPolicy(null)
  assert.deepStrictEqual(policy, {
    retryLimit: 2,
    escalationThreshold: 2,
    timingEscalationEnabled: false,
    toneEscalationEnabled: false,
  })
})

test("resolvePromiseEscalationPolicy clamps retry and threshold to minimum 1", () => {
  const policy = resolvePromiseEscalationPolicy({
    retryLimit: 0,
    escalationThreshold: 0,
    timingEscalationEnabled: true,
    toneEscalationEnabled: true,
  })
  assert.equal(policy.retryLimit, 1)
  assert.equal(policy.escalationThreshold, 1)
})

test("shouldBlockClientPromise blocks once broken count reaches retry limit", () => {
  assert.equal(shouldBlockClientPromise(1, 2), false)
  assert.equal(shouldBlockClientPromise(2, 2), true)
  assert.equal(shouldBlockClientPromise(3, 2), true)
})

test("applyToneEscalationStage escalates to next stage for high-risk debtors", () => {
  const policy = resolvePromiseEscalationPolicy({
    retryLimit: 2,
    escalationThreshold: 2,
    timingEscalationEnabled: false,
    toneEscalationEnabled: true,
  })

  assert.equal(applyToneEscalationStage(1, 2, policy), 2)
  assert.equal(applyToneEscalationStage(2, 3, policy), 3)
  assert.equal(applyToneEscalationStage(3, 5, policy), 3)
})

test("applyTimingEscalation brings next email earlier for high-risk debtors", () => {
  const policy = resolvePromiseEscalationPolicy({
    retryLimit: 2,
    escalationThreshold: 2,
    timingEscalationEnabled: true,
    toneEscalationEnabled: false,
  })

  const base = new Date("2026-06-10T00:00:00.000Z")
  const escalated = applyTimingEscalation(base, 2, policy)
  assert.equal(escalated.toISOString(), "2026-06-08T00:00:00.000Z")
})

test("buildBrokenPromiseDebtorCounts is tenant scoped by user+debtor key", () => {
  const counts = buildBrokenPromiseDebtorCounts([
    { userId: "u1", clientEmail: "debtor@example.com" },
    { userId: "u1", clientEmail: "debtor@example.com" },
    { userId: "u2", clientEmail: "debtor@example.com" },
    { userId: "u1", clientEmail: "other@example.com" },
  ])

  assert.equal(counts.get(promiseDebtorKey("u1", "debtor@example.com")), 2)
  assert.equal(counts.get(promiseDebtorKey("u2", "debtor@example.com")), 1)
  assert.equal(counts.get(promiseDebtorKey("u1", "other@example.com")), 1)
})
