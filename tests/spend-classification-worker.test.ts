import assert from "node:assert/strict"
import { test } from "node:test"

import {
  SPEND_CLASSIFICATION_BATCH_LIMIT,
  SPEND_CLASSIFICATION_CONCURRENCY,
  runSpendClassificationWorker,
  type SpendClassificationClaim,
  type SpendClassificationWorkerStore,
} from "@/lib/spendClassification/workerCore"
import type { JevClassification } from "@/lib/spendClassification/jevClient"
import type { JevFailure } from "@/lib/spendClassification/retryPolicy"

type Assignment = { fingerprint: string; status: string; origin: string | null }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function makeClaim(index: number, fingerprint = "fingerprint-1"): SpendClassificationClaim {
  return {
    userId: "tenant-1",
    classificationId: `classification-${index}`,
    sourceType: "imported_bank_transaction",
    sourceRecordId: `transaction-${index}`,
    sourceFingerprint: fingerprint,
    claimToken: `token-${index}`,
  }
}

function makeResult(categoryId = "category-software"): JevClassification {
  return {
    categoryId,
    confidence: 0.9,
    probabilities: { "category-software": 0.9, "category-other": 0.1 },
    model: "jev-1.13.0",
    usage: { inputTokens: 8, outputTokens: 2 },
  }
}

function makeStore(claims: SpendClassificationClaim[]) {
  let leaseOwner: string | null = null
  const assignments = new Map<string, Assignment>(claims.map((claim) => [
    claim.classificationId,
    { fingerprint: claim.sourceFingerprint, status: "processing", origin: null },
  ]))
  const requests: string[] = []
  const completed: string[] = []
  const released: Array<{ id: string; status: "queued" | "pending" }> = []
  const failures: JevFailure[] = []
  let claimLimit = 0
  const store: SpendClassificationWorkerStore = {
    async acquireLease(ownerToken) {
      if (leaseOwner !== null) return false
      leaseOwner = ownerToken
      return true
    },
    async claimBatch(limit) {
      claimLimit = limit
      return claims.slice(0, limit)
    },
    async complete(claim, result) {
      assert.equal(result.model, "jev-1.13.0")
      const current = assignments.get(claim.classificationId)
      if (!current || current.status !== "processing" || current.origin === "manual" ||
        current.fingerprint !== claim.sourceFingerprint) return "stale"
      current.status = "suggested"
      current.origin = "jev"
      completed.push(claim.classificationId)
      return "suggested"
    },
    async failClaim(_claim, failure) {
      failures.push(failure)
      return failure.code === "network" ? "retry_scheduled" : "needs_review"
    },
    async releaseClaim(claim, nextStatus) {
      released.push({ id: claim.classificationId, status: nextStatus })
    },
    async releaseLease(ownerToken) {
      if (leaseOwner === ownerToken) leaseOwner = null
    },
  }
  return { store, assignments, requests, completed, released, failures, get claimLimit() { return claimLimit } }
}

test("only one overlapping invocation acquires the durable run lease", async () => {
  const firstStarted = deferred<void>()
  const finishFirst = deferred<void>()
  const claims = [makeClaim(1)]
  const fake = makeStore(claims)
  const firstRun = runSpendClassificationWorker({
    store: fake.store,
    createOwnerToken: () => "owner-1",
    request: async () => {
      firstStarted.resolve()
      await finishFirst.promise
      return { status: "requested", result: makeResult() }
    },
  })
  await firstStarted.promise

  const overlappingRun = await runSpendClassificationWorker({
    store: fake.store,
    createOwnerToken: () => "owner-2",
    request: async () => { throw new Error("must not run while lease is held") },
  })
  assert.equal(overlappingRun.leaseAcquired, false)
  assert.equal(overlappingRun.claimed, 0)

  finishFirst.resolve()
  const firstResult = await firstRun
  assert.equal(firstResult.leaseAcquired, true)
  assert.equal(firstResult.completed, 1)
})

test("caps each invocation at 25 claims and runs no more than three requests concurrently", async () => {
  const claims = Array.from({ length: 40 }, (_, index) => makeClaim(index))
  const fake = makeStore(claims)
  let active = 0
  let maximumActive = 0
  const result = await runSpendClassificationWorker({
    store: fake.store,
    createOwnerToken: () => "bounded-owner",
    request: async (claim) => {
      fake.requests.push(claim.classificationId)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      return { status: "requested", result: makeResult() }
    },
  })

  assert.equal(fake.claimLimit, SPEND_CLASSIFICATION_BATCH_LIMIT)
  assert.equal(result.claimed, 25)
  assert.equal(fake.requests.length, 25)
  assert.equal(result.completed, 25)
  assert.equal(maximumActive, SPEND_CLASSIFICATION_CONCURRENCY)
})

test("does not persist a delayed Jev result after the source fingerprint changes", async () => {
  const claim = makeClaim(1)
  const fake = makeStore([claim])
  const releaseRequest = deferred<void>()
  const run = runSpendClassificationWorker({
    store: fake.store,
    createOwnerToken: () => "stale-owner",
    request: async () => {
      await releaseRequest.promise
      return { status: "requested", result: makeResult() }
    },
  })
  fake.assignments.get(claim.classificationId)!.fingerprint = "new-source-fingerprint"
  releaseRequest.resolve()

  const result = await run
  assert.equal(result.stale, 1)
  assert.equal(result.completed, 0)
  assert.equal(fake.assignments.get(claim.classificationId)?.origin, null)
})

test("does not overwrite a manual correction made while the Jev request is in flight", async () => {
  const claim = makeClaim(1)
  const fake = makeStore([claim])
  const releaseRequest = deferred<void>()
  const run = runSpendClassificationWorker({
    store: fake.store,
    createOwnerToken: () => "manual-owner",
    request: async () => {
      await releaseRequest.promise
      return { status: "requested", result: makeResult() }
    },
  })
  const assignment = fake.assignments.get(claim.classificationId)!
  assignment.status = "confirmed"
  assignment.origin = "manual"
  assignment.fingerprint = "manual-source-fingerprint"
  releaseRequest.resolve()

  const result = await run
  assert.equal(result.stale, 1)
  assert.equal(result.completed, 0)
  assert.equal(assignment.status, "confirmed")
  assert.equal(assignment.origin, "manual")
})

test("records only safe failure codes and continues without failing the import-facing worker run", async () => {
  const fake = makeStore([makeClaim(1)])
  const result = await runSpendClassificationWorker({
    store: fake.store,
    createOwnerToken: () => "failure-owner",
    request: async () => { throw { code: "network", message: "private provider request payload" } },
  })

  assert.deepEqual(fake.failures, [{ code: "network" }])
  assert.equal(result.retryScheduled, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.leaseAcquired, true)
})
