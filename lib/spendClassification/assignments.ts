import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"
import { lockSpendClassificationTenant } from "@/lib/spendClassification/locks"

export type ImportedSpendSourceType = "imported_bill" | "imported_bank_transaction"
export type AutomaticClassificationOrigin = "source_mapping" | "rule" | "jev"
export type SpendClassificationStatus =
  | "pending"
  | "queued"
  | "processing"
  | "suggested"
  | "confirmed"
  | "needs_review"
  | "excluded"

export type UpsertSpendClassificationInput = {
  sourceType: ImportedSpendSourceType
  sourceRecordId: string
  status: SpendClassificationStatus
  origin?: AutomaticClassificationOrigin | null
  categoryId?: string | null
  ruleId?: string | null
  confidence?: number | null
  model?: string | null
  sourceFingerprint?: string | null
}

export type SpendAssignmentErrorCode =
  | "source_record_not_found"
  | "classification_not_found"
  | "category_not_active"

export class SpendAssignmentError extends Error {
  constructor(public readonly code: SpendAssignmentErrorCode) {
    super(code)
    this.name = "SpendAssignmentError"
  }
}

async function requireActiveCategory(tx: PrismaTx, userId: string, categoryId: string): Promise<void> {
  const category = await tx.spendCategory.findFirst({
    where: { userId, id: categoryId, status: "active" },
    select: { id: true },
  })
  if (!category) throw new SpendAssignmentError("category_not_active")
}

async function writeClassificationEvent(
  tx: PrismaTx,
  userId: string,
  input: {
    classificationId?: string | null
    eventType: string
    oldCategoryId?: string | null
    newCategoryId?: string | null
    reason?: string | null
    metadata?: Prisma.InputJsonValue
  },
): Promise<void> {
  await tx.spendClassificationEvent.create({
    data: {
      userId,
      classificationId: input.classificationId ?? null,
      eventType: input.eventType,
      actorId: userId,
      oldCategoryId: input.oldCategoryId ?? null,
      newCategoryId: input.newCategoryId ?? null,
      reason: input.reason?.trim() || null,
      metadata: input.metadata,
    },
  })
}

async function requireSourceRecord(
  tx: PrismaTx,
  userId: string,
  sourceType: ImportedSpendSourceType,
  sourceRecordId: string,
): Promise<void> {
  const source = sourceType === "imported_bill"
    ? await tx.importedBill.findFirst({ where: { id: sourceRecordId, userId }, select: { id: true } })
    : await tx.importedBankTransaction.findFirst({ where: { id: sourceRecordId, userId }, select: { id: true } })
  if (!source) throw new SpendAssignmentError("source_record_not_found")
}

export async function upsertSpendClassification(
  userId: string,
  input: UpsertSpendClassificationInput,
) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    await requireSourceRecord(tx, userId, input.sourceType, input.sourceRecordId)
    if (input.categoryId) await requireActiveCategory(tx, userId, input.categoryId)

    const existing = await tx.spendClassification.findFirst({
      where: { userId, sourceType: input.sourceType, sourceRecordId: input.sourceRecordId },
    })
    // Re-imports and background resolution must never replace a tenant's manual decision.
    if (existing?.origin === "manual") return existing

    const values = {
      categoryId: input.categoryId ?? null,
      status: input.status,
      origin: input.origin ?? null,
      ruleId: input.ruleId ?? null,
      confidence: input.confidence ?? null,
      model: input.model ?? null,
      sourceFingerprint: input.sourceFingerprint ?? null,
      updatedBy: userId,
    }

    if (!existing) {
      const classification = await tx.spendClassification.create({
        data: {
          userId,
          sourceType: input.sourceType,
          sourceRecordId: input.sourceRecordId,
          importedBillId: input.sourceType === "imported_bill" ? input.sourceRecordId : null,
          importedBankTransactionId:
            input.sourceType === "imported_bank_transaction" ? input.sourceRecordId : null,
          ...values,
          createdBy: userId,
        },
      })
      await writeClassificationEvent(tx, userId, {
        classificationId: classification.id,
        eventType: "classification_initialized",
        newCategoryId: classification.categoryId,
        metadata: { status: classification.status, origin: classification.origin },
      })
      return classification
    }

    const unchanged =
      existing.categoryId === values.categoryId &&
      existing.status === values.status &&
      existing.origin === values.origin &&
      existing.ruleId === values.ruleId &&
      existing.confidence === values.confidence &&
      existing.model === values.model &&
      existing.sourceFingerprint === values.sourceFingerprint
    if (unchanged) return existing

    const classification = await tx.spendClassification.update({
      where: { id: existing.id },
      data: {
        ...values,
        ...(existing.sourceFingerprint !== values.sourceFingerprint
          ? { attemptCount: 0, nextAttemptAt: null, lastErrorCode: null, claimedAt: null }
          : {}),
      },
    })
    await writeClassificationEvent(tx, userId, {
      classificationId: classification.id,
      eventType: "classification_automatically_updated",
      oldCategoryId: existing.categoryId,
      newCategoryId: classification.categoryId,
      metadata: {
        oldStatus: existing.status,
        newStatus: classification.status,
        oldOrigin: existing.origin,
        newOrigin: classification.origin,
      },
    })
    return classification
  })
}

export async function assignManualSpendCategory(
  userId: string,
  input: { classificationId: string; categoryId: string; reason?: string | null },
) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const existing = await tx.spendClassification.findFirst({
      where: { userId, id: input.classificationId },
    })
    if (!existing) throw new SpendAssignmentError("classification_not_found")
    await requireActiveCategory(tx, userId, input.categoryId)

    if (
      existing.origin === "manual" &&
      existing.categoryId === input.categoryId &&
      existing.status === "confirmed"
    ) {
      return existing
    }

    const classification = await tx.spendClassification.update({
      where: { id: existing.id },
      data: {
        categoryId: input.categoryId,
        status: "confirmed",
        origin: "manual",
        ruleId: null,
        confidence: null,
        model: null,
        updatedBy: userId,
      },
    })
    await writeClassificationEvent(tx, userId, {
      classificationId: classification.id,
      eventType: "classification_manually_confirmed",
      oldCategoryId: existing.categoryId,
      newCategoryId: input.categoryId,
      reason: input.reason,
      metadata: { oldOrigin: existing.origin, newOrigin: "manual" },
    })
    return classification
  })
}