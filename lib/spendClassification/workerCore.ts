import { randomUUID } from "node:crypto"

import type { JevClassification } from "@/lib/spendClassification/jevClient"
import type { ImportedSpendSourceType } from "@/lib/spendClassification/assignments"
import { toSafeJevFailure, type JevFailure } from "@/lib/spendClassification/retryPolicy"

export const SPEND_CLASSIFICATION_BATCH_LIMIT = 25
export const SPEND_CLASSIFICATION_CONCURRENCY = 3

export type SpendClassificationClaim = {
  userId: string
  classificationId: string
  sourceType: ImportedSpendSourceType
  sourceRecordId: string
  sourceFingerprint: string
  claimToken: string
}

export type SpendClassificationWorkerStore = {
  acquireLease(ownerToken: string): Promise<boolean>
  claimBatch(limit: number): Promise<SpendClassificationClaim[]>
  complete(claim: SpendClassificationClaim, result: JevClassification): Promise<"suggested" | "needs_review" | "stale">
  failClaim(claim: SpendClassificationClaim, failure: JevFailure): Promise<"retry_scheduled" | "needs_review" | "stale">
  releaseClaim(claim: SpendClassificationClaim, nextStatus: "queued" | "pending"): Promise<void>
  releaseLease(ownerToken: string): Promise<void>
}

export type SpendClassificationWorkerCounters = {
  leaseAcquired: boolean
  claimed: number
  completed: number
  needsReview: number
  retryScheduled: number
  stale: number
  failed: number
  skipped: number
}

/** Orchestrates a bounded batch; persistence and external requests are injected. */
export async function runSpendClassificationWorker(options: {
  store: SpendClassificationWorkerStore
  request: (claim: SpendClassificationClaim) => Promise<
    | { status: "requested"; result: JevClassification }
    | { status: "opted_out" | "not_eligible" }
  >
  createOwnerToken?: () => string
}): Promise<SpendClassificationWorkerCounters> {
  const counters: SpendClassificationWorkerCounters = {
    leaseAcquired: false,
    claimed: 0,
    completed: 0,
    needsReview: 0,
    retryScheduled: 0,
    stale: 0,
    failed: 0,
    skipped: 0,
  }
  const ownerToken = (options.createOwnerToken ?? randomUUID)()
  if (!await options.store.acquireLease(ownerToken)) return counters

  counters.leaseAcquired = true
  try {
    const claims = await options.store.claimBatch(SPEND_CLASSIFICATION_BATCH_LIMIT)
    counters.claimed = claims.length
    let cursor = 0

    const processNext = async (): Promise<void> => {
      while (cursor < claims.length) {
        const claim = claims[cursor++]
        try {
          const request = await options.request(claim)
          if (request.status !== "requested") {
            await options.store.releaseClaim(claim, "pending")
            counters.skipped += 1
            continue
          }
          const completion = await options.store.complete(claim, request.result)
          if (completion === "suggested") counters.completed += 1
          else if (completion === "needs_review") counters.needsReview += 1
          else counters.stale += 1
        } catch (error) {
          // Persist only the safe error class; provider error text can contain request context.
          const failureOutcome = await options.store.failClaim(claim, toSafeJevFailure(error)).catch(() => "stale" as const)
          if (failureOutcome === "retry_scheduled") counters.retryScheduled += 1
          else if (failureOutcome === "needs_review") counters.needsReview += 1
          else counters.stale += 1
          counters.failed += 1
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(SPEND_CLASSIFICATION_CONCURRENCY, claims.length) }, () => processNext()),
    )
    return counters
  } finally {
    await options.store.releaseLease(ownerToken)
  }
}
