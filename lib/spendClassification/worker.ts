import "server-only"

import { randomUUID } from "node:crypto"

import { prismaAdmin } from "@/lib/db/admin"
import { Prisma } from "@/lib/generated/prisma/client"
import type { JevClassification } from "@/lib/spendClassification/jevClient"
import { requestJevSuggestionForSpend } from "@/lib/spendClassification/jevRequest"
import type { ImportedSpendSourceType } from "@/lib/spendClassification/assignments"
import { decideJevFailure, type JevFailure } from "@/lib/spendClassification/retryPolicy"
import {
  SPEND_CLASSIFICATION_BATCH_LIMIT,
  runSpendClassificationWorker,
  type SpendClassificationClaim,
  type SpendClassificationWorkerStore,
} from "@/lib/spendClassification/workerCore"

const RUN_LEASE_MS = 5 * 60 * 1000
const CLAIM_LEASE_MS = 5 * 60 * 1000
const CONFIDENCE_REVIEW_FLOOR = 0.6
const PROBABILITY_MARGIN_REVIEW_FLOOR = 0.15

type ClaimRow = {
  user_id: string
  id: string
  source_type: string
  source_record_id: string
  source_fingerprint: string
}

function sourceType(value: string): ImportedSpendSourceType | null {
  return value === "imported_bill" || value === "imported_bank_transaction" ? value : null
}

function getReviewStatus(result: JevClassification, isOther: boolean): "suggested" | "needs_review" {
  const probabilities = Object.values(result.probabilities).filter(Number.isFinite).sort((a, b) => b - a)
  const margin = probabilities[0] === undefined ? -1 : probabilities[0] - (probabilities[1] ?? 0)
  const tied = probabilities.length > 1 && probabilities[0] === probabilities[1]
  return !isOther && !tied && result.confidence >= CONFIDENCE_REVIEW_FLOOR &&
    margin >= PROBABILITY_MARGIN_REVIEW_FLOOR
    ? "suggested"
    : "needs_review"
}

function createWorkerStore(): SpendClassificationWorkerStore {
  return {
    async acquireLease(ownerToken) {
      // Documented system-worker access: this global coordination row is not tenant-facing.
      const rows = await prismaAdmin.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO spend_classification_worker_leases (id, owner_token, lease_expires_at, updated_at)
         VALUES ('singleton', $1, NOW() + ($2 * INTERVAL '1 millisecond'), NOW())
         ON CONFLICT (id) DO UPDATE
           SET owner_token = EXCLUDED.owner_token,
               lease_expires_at = EXCLUDED.lease_expires_at,
               updated_at = NOW()
           WHERE spend_classification_worker_leases.lease_expires_at <= NOW()
         RETURNING id`,
        ownerToken,
        RUN_LEASE_MS,
      )
      return rows.length === 1
    },

    async claimBatch(limit) {
      const boundedLimit = Math.min(Math.max(0, limit), SPEND_CLASSIFICATION_BATCH_LIMIT)
      if (boundedLimit === 0) return []
      return prismaAdmin.$transaction(async (tx) => {
        // Documented system-worker access: candidates are selected across opted-in
        // tenants, but every claim and completion retains the database owner ID.
        const candidates = await tx.$queryRawUnsafe<ClaimRow[]>(
          `SELECT c.user_id, c.id, c.source_type, c.source_record_id, c.source_fingerprint
           FROM spend_classifications AS c
           INNER JOIN spend_classification_settings AS s
             ON s.user_id = c.user_id AND s.enabled = TRUE
           LEFT JOIN spend_classification_claims AS claim
             ON claim.user_id = c.user_id AND claim.classification_id = c.id
           WHERE c.status IN ('queued', 'processing')
             AND c.origin IS DISTINCT FROM 'manual'
             AND c.source_fingerprint IS NOT NULL
             AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= NOW())
             AND (claim.classification_id IS NULL OR claim.lease_expires_at <= NOW())
           ORDER BY c.created_at ASC, c.id ASC
           FOR UPDATE OF c SKIP LOCKED
           LIMIT $1`,
          boundedLimit,
        )
        const claims: SpendClassificationClaim[] = []
        for (const row of candidates) {
          const type = sourceType(row.source_type)
          if (!type) continue
          const claimToken = randomUUID()
          const claimCount = await tx.$executeRawUnsafe(
            `INSERT INTO spend_classification_claims
               (user_id, classification_id, claim_token, source_fingerprint, lease_expires_at, claimed_at)
             VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'), NOW())
             ON CONFLICT (user_id, classification_id) DO UPDATE
               SET claim_token = EXCLUDED.claim_token,
                   source_fingerprint = EXCLUDED.source_fingerprint,
                   lease_expires_at = EXCLUDED.lease_expires_at,
                   claimed_at = NOW()
             WHERE spend_classification_claims.lease_expires_at <= NOW()`,
            row.user_id,
            row.id,
            claimToken,
            row.source_fingerprint,
            CLAIM_LEASE_MS,
          )
          if (claimCount !== 1) continue
          const updated = await tx.$executeRawUnsafe(
            `UPDATE spend_classifications AS c
             SET status = 'processing', claimed_at = NOW(), updated_at = NOW()
             WHERE c.user_id = $1 AND c.id = $2
               AND c.status IN ('queued', 'processing')
               AND c.origin IS DISTINCT FROM 'manual'
               AND c.source_fingerprint = $3
               AND EXISTS (
                 SELECT 1 FROM spend_classification_settings AS s
                 WHERE s.user_id = c.user_id AND s.enabled = TRUE
               )`,
            row.user_id,
            row.id,
            row.source_fingerprint,
          )
          if (updated !== 1) {
            await tx.$executeRawUnsafe(
              `DELETE FROM spend_classification_claims WHERE user_id = $1 AND classification_id = $2 AND claim_token = $3`,
              row.user_id,
              row.id,
              claimToken,
            )
            continue
          }
          claims.push({
            userId: row.user_id,
            classificationId: row.id,
            sourceType: type,
            sourceRecordId: row.source_record_id,
            sourceFingerprint: row.source_fingerprint,
            claimToken,
          })
        }
        return claims
      })
    },

    async complete(claim, result) {
      return prismaAdmin.$transaction(async (tx) => {
        // Serialize with user corrections and import handoff for this tenant.
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          `spend-category:${claim.userId}`,
        )
        const activeCategory = await tx.spendCategory.findFirst({
          where: { userId: claim.userId, id: result.categoryId, status: "active" },
          select: { id: true, key: true },
        })
        const categoryUsable = Boolean(activeCategory)
        const status = categoryUsable
          ? getReviewStatus(result, activeCategory?.key === "other")
          : "needs_review"
        const update = await tx.spendClassification.updateMany({
          where: {
            userId: claim.userId,
            id: claim.classificationId,
            sourceFingerprint: claim.sourceFingerprint,
            status: "processing",
            OR: [{ origin: null }, { origin: { not: "manual" } }],
            workerClaim: { is: { claimToken: claim.claimToken, sourceFingerprint: claim.sourceFingerprint } },
          },
          data: {
            status,
            categoryId: categoryUsable ? result.categoryId : null,
            origin: "jev",
            confidence: result.confidence,
            probabilities: result.probabilities as Prisma.InputJsonValue,
            model: result.model,
            claimedAt: null,
            nextAttemptAt: null,
            lastErrorCode: null,
            updatedAt: new Date(),
          },
        })
        if (update.count === 1) {
          await tx.spendClassificationEvent.create({
            data: {
              userId: claim.userId,
              classificationId: claim.classificationId,
              eventType: status === "suggested" ? "classification_jev_suggested" : "classification_jev_needs_review",
              actorId: null,
              newCategoryId: categoryUsable ? result.categoryId : null,
              metadata: {
                model: result.model,
                confidence: result.confidence,
                probabilities: result.probabilities,
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                sourceFingerprint: claim.sourceFingerprint,
              },
            },
          })
        }
        await tx.spendClassificationClaim.deleteMany({
          where: { userId: claim.userId, classificationId: claim.classificationId, claimToken: claim.claimToken },
        })
        if (update.count !== 1) return "stale"
        return status
      })
    },

    async failClaim(claim, failure: JevFailure) {
      return prismaAdmin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          `spend-category:${claim.userId}`,
        )
        const where: Prisma.SpendClassificationWhereInput = {
          userId: claim.userId,
          id: claim.classificationId,
          sourceFingerprint: claim.sourceFingerprint,
          status: "processing",
          OR: [{ origin: null }, { origin: { not: "manual" } }],
          workerClaim: { is: { claimToken: claim.claimToken, sourceFingerprint: claim.sourceFingerprint } },
        }
        const current = await tx.spendClassification.findFirst({
          where,
          select: { attemptCount: true },
        })
        if (!current) {
          await tx.spendClassificationClaim.deleteMany({
            where: { userId: claim.userId, classificationId: claim.classificationId, claimToken: claim.claimToken },
          })
          return "stale"
        }

        const decision = decideJevFailure({ attemptCount: current.attemptCount, failure })
        const update = await tx.spendClassification.updateMany({
          where,
          data: {
            status: decision.status === "retry" ? "queued" : "needs_review",
            categoryId: null,
            origin: null,
            confidence: null,
            probabilities: Prisma.JsonNull,
            model: null,
            attemptCount: decision.attemptCount,
            nextAttemptAt: decision.status === "retry" ? decision.nextAttemptAt : null,
            lastErrorCode: decision.errorCode,
            claimedAt: null,
            updatedAt: new Date(),
          },
        })
        if (update.count === 1) {
          await tx.spendClassificationEvent.create({
            data: {
              userId: claim.userId,
              classificationId: claim.classificationId,
              eventType: decision.status === "retry" ? "classification_jev_retry_scheduled" : "classification_jev_failed",
              actorId: null,
              metadata: {
                errorCode: decision.errorCode,
                attemptCount: decision.attemptCount,
                nextAttemptAt: decision.status === "retry" ? decision.nextAttemptAt.toISOString() : null,
              },
            },
          })
        }
        await tx.spendClassificationClaim.deleteMany({
          where: { userId: claim.userId, classificationId: claim.classificationId, claimToken: claim.claimToken },
        })
        if (update.count !== 1) return "stale"
        return decision.status === "retry" ? "retry_scheduled" : "needs_review"
      })
    },

    async releaseClaim(claim, nextStatus) {
      await prismaAdmin.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          `spend-category:${claim.userId}`,
        )
        await tx.spendClassification.updateMany({
          where: {
            userId: claim.userId,
            id: claim.classificationId,
            sourceFingerprint: claim.sourceFingerprint,
            status: "processing",
            OR: [{ origin: null }, { origin: { not: "manual" } }],
            workerClaim: { is: { claimToken: claim.claimToken } },
          },
          data: { status: nextStatus, claimedAt: null, updatedAt: new Date() },
        })
        await tx.spendClassificationClaim.deleteMany({
          where: { userId: claim.userId, classificationId: claim.classificationId, claimToken: claim.claimToken },
        })
      })
    },

    async releaseLease(ownerToken) {
      await prismaAdmin.$executeRawUnsafe(
        `UPDATE spend_classification_worker_leases
         SET lease_expires_at = NOW(), updated_at = NOW()
         WHERE id = 'singleton' AND owner_token = $1`,
        ownerToken,
      )
    },
  }
}

/** Runs the bounded service worker; callers must authenticate the cron trigger. */
export async function runSpendClassificationBatch(): Promise<
  Awaited<ReturnType<typeof runSpendClassificationWorker>>
> {
  return runSpendClassificationWorker({
    store: createWorkerStore(),
    request: async (claim) => {
      const response = await requestJevSuggestionForSpend(
        claim.userId,
        claim.sourceType,
        claim.sourceRecordId,
      )
      return response.status === "requested"
        ? { status: "requested", result: response.result }
        : { status: response.status }
    },
  })
}
