import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { Prisma } from "@/lib/generated/prisma/client"
import { lockSpendClassificationTenant } from "@/lib/spendClassification/locks"
import { normalizeSpendCategoryName } from "@/lib/spendClassification/resolver"

export type SpendClassificationReviewErrorCode =
  | "classification_not_found"
  | "category_not_active"
  | "invalid_bulk_selection"
  | "invalid_rule_criteria"
  | "manual_assignment_protected"
  | "invalid_transfer_source"
  | "transfer_has_linked_refunds"
  | "invalid_refund_source"
  | "invalid_refund_target"
  | "refund_currency_mismatch"
  | "refund_exceeds_original"

export class SpendClassificationReviewError extends Error {
  constructor(public readonly code: SpendClassificationReviewErrorCode) {
    super(code)
    this.name = "SpendClassificationReviewError"
  }
}

export type FutureSpendRuleInput =
  | { ruleType: "merchant"; merchantName: string; name?: string; priority?: number }
  | { ruleType: "text_match"; phrase: string; name?: string; priority?: number }

export const SPEND_CLASSIFICATION_REVIEW_STATUSES = [
  "pending", "queued", "processing", "suggested", "confirmed", "needs_review", "excluded",
] as const
export type SpendClassificationReviewStatus = typeof SPEND_CLASSIFICATION_REVIEW_STATUSES[number]

export async function listSpendClassificationReview(
  userId: string,
  input: { status?: SpendClassificationReviewStatus; limit: number; offset: number },
) {
  return withUserContext(userId, async (tx) => tx.spendClassification.findMany({
    where: { userId, ...(input.status ? { status: input.status } : {}) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: input.offset,
    take: input.limit,
    select: {
      id: true,
      sourceType: true,
      sourceRecordId: true,
      status: true,
      origin: true,
      categoryId: true,
      refundForClassificationId: true,
      confidence: true,
      probabilities: true,
      model: true,
      ruleId: true,
      attemptCount: true,
      lastErrorCode: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true, status: true } },
      rule: { select: { id: true, name: true, ruleType: true, matchConfig: true } },
      refundFor: {
        select: {
          id: true,
          sourceType: true,
          category: { select: { id: true, name: true } },
          importedBill: { select: { supplierName: true, documentNumber: true, amountCents: true, currency: true } },
          importedBankTransaction: { select: { counterpartyName: true, description: true, amountCents: true, currency: true } },
        },
      },
      importedBill: {
        select: {
          id: true,
          supplierName: true,
          documentNumber: true,
          amountCents: true,
          currency: true,
          status: true,
          dueDate: true,
          paidDate: true,
          expenseAccountCode: true,
          expenseAccountName: true,
          createdAt: true,
          accountingConnection: { select: { provider: true, organisationName: true } },
        },
      },
      importedBankTransaction: {
        select: {
          id: true,
          description: true,
          counterpartyName: true,
          amountCents: true,
          currency: true,
          direction: true,
          transactionDate: true,
          expenseAccountCode: true,
          expenseAccountName: true,
          createdAt: true,
          accountingConnection: { select: { provider: true, organisationName: true } },
        },
      },
    },
  }))
}

async function requireActiveCategory(tx: PrismaTx, userId: string, categoryId: string): Promise<void> {
  const category = await tx.spendCategory.findFirst({
    where: { userId, id: categoryId, status: "active" },
    select: { id: true },
  })
  if (!category) throw new SpendClassificationReviewError("category_not_active")
}

async function recordManualAssignment(
  tx: PrismaTx,
  userId: string,
  classification: { id: string; categoryId: string | null; origin: string | null; refundForClassificationId?: string | null },
  input: { categoryId: string; reason?: string | null; createdRuleId?: string },
) {
  const oldCategoryId = classification.categoryId
  const oldOrigin = classification.origin
  const updated = await tx.spendClassification.update({
    where: { id: classification.id },
    data: {
      categoryId: input.categoryId,
      status: "confirmed",
      origin: "manual",
      ruleId: null,
      confidence: null,
      probabilities: Prisma.JsonNull,
      model: null,
      refundForClassificationId: null,
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      claimedAt: null,
      updatedBy: userId,
    },
  })
  await tx.spendClassificationClaim.deleteMany({ where: { userId, classificationId: classification.id } })
  if (classification.refundForClassificationId) {
    await tx.spendClassificationEvent.create({
      data: {
        userId,
        classificationId: classification.id,
        eventType: "classification_refund_unlinked",
        actorId: userId,
        oldCategoryId,
        reason: input.reason?.trim() || "Refund link removed by category correction.",
        metadata: { refundTargetClassificationId: classification.refundForClassificationId, replacedByCategoryAssignment: true } satisfies Prisma.InputJsonValue,
      },
    })
  }
  await tx.spendClassificationEvent.create({
    data: {
      userId,
      classificationId: classification.id,
      eventType: "classification_manually_confirmed",
      actorId: userId,
      oldCategoryId,
      newCategoryId: input.categoryId,
      reason: input.reason?.trim() || null,
      metadata: {
        oldOrigin,
        newOrigin: "manual",
        ...(input.createdRuleId ? { futureRuleId: input.createdRuleId, futureOnly: true } : {}),
      } satisfies Prisma.InputJsonValue,
    },
  })
  return updated
}

export async function markSpendClassificationAsTransfer(
  userId: string,
  input: { classificationId: string; reason?: string | null },
) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const existing = await tx.spendClassification.findFirst({
      where: { userId, id: input.classificationId },
      select: {
        id: true,
        categoryId: true,
        status: true,
        origin: true,
        refundForClassificationId: true,
        sourceType: true,
        refunds: { select: { id: true }, take: 1 },
      },
    })
    if (!existing) throw new SpendClassificationReviewError("classification_not_found")
    if (existing.sourceType !== "imported_bank_transaction") {
      throw new SpendClassificationReviewError("invalid_transfer_source")
    }
    if (existing.refundForClassificationId || existing.refunds.length > 0) {
      throw new SpendClassificationReviewError("transfer_has_linked_refunds")
    }

    const updated = await tx.spendClassification.update({
      where: { id: existing.id },
      data: {
        categoryId: null,
        status: "excluded",
        origin: "manual",
        ruleId: null,
        confidence: null,
        probabilities: Prisma.JsonNull,
        model: null,
        attemptCount: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
        claimedAt: null,
        updatedBy: userId,
      },
    })
    await tx.spendClassificationClaim.deleteMany({ where: { userId, classificationId: existing.id } })
    await tx.spendClassificationEvent.create({
      data: {
        userId,
        classificationId: existing.id,
        eventType: "classification_marked_internal_transfer",
        actorId: userId,
        oldCategoryId: existing.categoryId,
        reason: input.reason?.trim() || null,
        metadata: {
          oldStatus: existing.status,
          oldOrigin: existing.origin,
          classification: "internal_transfer",
          newStatus: "excluded",
          newOrigin: "manual",
        } satisfies Prisma.InputJsonValue,
      },
    })
    return updated
  })
}

export async function linkSpendRefund(
  userId: string,
  input: { refundClassificationId: string; originalClassificationId: string },
) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const refund = await tx.spendClassification.findFirst({
      where: { userId, id: input.refundClassificationId },
      select: {
        id: true,
        status: true,
        origin: true,
        categoryId: true,
        refundForClassificationId: true,
        importedBankTransaction: { select: { direction: true, amountCents: true, currency: true } },
      },
    })
    if (!refund) throw new SpendClassificationReviewError("classification_not_found")
    if (!refund.importedBankTransaction || refund.importedBankTransaction.direction !== "inflow" || refund.status === "excluded") {
      throw new SpendClassificationReviewError("invalid_refund_source")
    }

    const original = await tx.spendClassification.findFirst({
      where: { userId, id: input.originalClassificationId },
      select: {
        id: true,
        status: true,
        categoryId: true,
        sourceType: true,
        importedBill: { select: { amountCents: true, currency: true, status: true } },
        importedBankTransaction: { select: { amountCents: true, currency: true, direction: true } },
      },
    })
    if (!original || original.id === refund.id || original.status !== "confirmed" || !original.categoryId) {
      throw new SpendClassificationReviewError("invalid_refund_target")
    }
    const originalAmount = original.sourceType === "imported_bill"
      ? original.importedBill && !["draft", "voided"].includes(original.importedBill.status.toLowerCase())
        ? Math.abs(original.importedBill.amountCents)
        : null
      : original.importedBankTransaction?.direction === "outflow"
        ? Math.abs(original.importedBankTransaction.amountCents)
        : null
    const originalCurrency = original.sourceType === "imported_bill"
      ? original.importedBill?.currency
      : original.importedBankTransaction?.currency
    if (originalAmount === null || !originalCurrency) {
      throw new SpendClassificationReviewError("invalid_refund_target")
    }
    if (originalCurrency.trim().toUpperCase() !== refund.importedBankTransaction.currency.trim().toUpperCase()) {
      throw new SpendClassificationReviewError("refund_currency_mismatch")
    }

    const existingRefunds = await tx.spendClassification.findMany({
      where: {
        userId,
        refundForClassificationId: original.id,
        id: { not: refund.id },
      },
      select: { importedBankTransaction: { select: { amountCents: true } } },
    })
    const alreadyRefundedCents = existingRefunds.reduce(
      (sum, row) => sum + Math.abs(row.importedBankTransaction?.amountCents ?? 0),
      0,
    )
    if (alreadyRefundedCents + Math.abs(refund.importedBankTransaction.amountCents) > originalAmount) {
      throw new SpendClassificationReviewError("refund_exceeds_original")
    }

    const oldRefundTarget = refund.refundForClassificationId
    const updated = await tx.spendClassification.update({
      where: { id: refund.id },
      data: {
        categoryId: null,
        refundForClassificationId: original.id,
        status: "confirmed",
        origin: "manual",
        ruleId: null,
        confidence: null,
        probabilities: Prisma.JsonNull,
        model: null,
        attemptCount: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
        claimedAt: null,
        updatedBy: userId,
      },
    })
    await tx.spendClassificationClaim.deleteMany({ where: { userId, classificationId: refund.id } })
    await tx.spendClassificationEvent.create({
      data: {
        userId,
        classificationId: refund.id,
        eventType: "classification_refund_linked",
        actorId: userId,
        oldCategoryId: refund.categoryId,
        newCategoryId: original.categoryId,
        reason: "User explicitly linked imported refund to original spend.",
        metadata: {
          priorRefundTargetClassificationId: oldRefundTarget,
          refundTargetClassificationId: original.id,
          originalSourceType: original.sourceType,
          refundSourceType: "imported_bank_transaction",
        } satisfies Prisma.InputJsonValue,
      },
    })
    return updated
  })
}

export async function listSpendRefundCandidates(userId: string, refundClassificationId: string) {
  return withUserContext(userId, async (tx) => {
    const refund = await tx.spendClassification.findFirst({
      where: { userId, id: refundClassificationId },
      select: { id: true, status: true, importedBankTransaction: { select: { direction: true, amountCents: true, currency: true } } },
    })
    if (!refund) throw new SpendClassificationReviewError("classification_not_found")
    if (!refund.importedBankTransaction || refund.importedBankTransaction.direction !== "inflow" || refund.status === "excluded") {
      throw new SpendClassificationReviewError("invalid_refund_source")
    }

    const candidates = await tx.spendClassification.findMany({
      where: {
        userId,
        id: { not: refund.id },
        status: "confirmed",
        categoryId: { not: null },
        refundForClassificationId: null,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        sourceType: true,
        category: { select: { id: true, name: true } },
        importedBill: { select: { supplierName: true, amountCents: true, currency: true, status: true, documentNumber: true } },
        importedBankTransaction: { select: { counterpartyName: true, description: true, amountCents: true, currency: true, direction: true } },
      },
    })
    const candidateIds = candidates.map(({ id }) => id)
    const linkedRefunds = candidateIds.length === 0
      ? []
      : await tx.spendClassification.findMany({
          where: { userId, refundForClassificationId: { in: candidateIds } },
          select: { refundForClassificationId: true, importedBankTransaction: { select: { amountCents: true } } },
        })
    const refundedCentsByCandidate = new Map<string, number>()
    for (const linkedRefund of linkedRefunds) {
      const targetId = linkedRefund.refundForClassificationId
      if (!targetId) continue
      refundedCentsByCandidate.set(
        targetId,
        (refundedCentsByCandidate.get(targetId) ?? 0) + Math.abs(linkedRefund.importedBankTransaction?.amountCents ?? 0),
      )
    }

    return candidates.flatMap((candidate) => {
      const source = candidate.sourceType === "imported_bill"
        ? candidate.importedBill && !["draft", "voided"].includes(candidate.importedBill.status.toLowerCase())
          ? {
              sourceType: "imported_bill" as const,
              merchantName: candidate.importedBill.supplierName,
              description: candidate.importedBill.documentNumber,
              amountCents: Math.abs(candidate.importedBill.amountCents),
              currency: candidate.importedBill.currency,
              direction: "outflow" as const,
            }
          : null
        : candidate.importedBankTransaction?.direction === "outflow"
          ? {
              sourceType: "imported_bank_transaction" as const,
              merchantName: candidate.importedBankTransaction.counterpartyName,
              description: candidate.importedBankTransaction.description,
              amountCents: Math.abs(candidate.importedBankTransaction.amountCents),
              currency: candidate.importedBankTransaction.currency,
              direction: candidate.importedBankTransaction.direction,
            }
          : null
      if (!source || source.currency.trim().toUpperCase() !== refund.importedBankTransaction!.currency.trim().toUpperCase()) {
        return []
      }
      const remainingCents = source.amountCents - (refundedCentsByCandidate.get(candidate.id) ?? 0)
      if (remainingCents < Math.abs(refund.importedBankTransaction!.amountCents)) return []
      return [{
        id: candidate.id,
        sourceType: source.sourceType,
        merchantName: source.merchantName,
        description: source.description,
        amountCents: source.amountCents,
        remainingCents,
        currency: source.currency,
        category: candidate.category,
      }]
    })
  })
}

export async function unlinkSpendRefund(userId: string, refundClassificationId: string) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const existing = await tx.spendClassification.findFirst({
      where: { userId, id: refundClassificationId },
      select: { id: true, status: true, origin: true, categoryId: true, refundForClassificationId: true, updatedAt: true },
    })
    if (!existing) throw new SpendClassificationReviewError("classification_not_found")
    if (!existing.refundForClassificationId) return existing
    const updated = await tx.spendClassification.update({
      where: { id: existing.id },
      data: {
        refundForClassificationId: null,
        categoryId: null,
        status: "needs_review",
        origin: null,
        updatedBy: userId,
      },
    })
    await tx.spendClassificationEvent.create({
      data: {
        userId,
        classificationId: existing.id,
        eventType: "classification_refund_unlinked",
        actorId: userId,
        oldCategoryId: existing.categoryId,
        reason: "User removed the imported refund link.",
        metadata: { refundTargetClassificationId: existing.refundForClassificationId } satisfies Prisma.InputJsonValue,
      },
    })
    return updated
  })
}

async function createFutureRule(
  tx: PrismaTx,
  userId: string,
  categoryId: string,
  input: FutureSpendRuleInput,
) {
  const rawCriteria = input.ruleType === "merchant" ? input.merchantName : input.phrase
  const normalizedCriteria = normalizeSpendCategoryName(rawCriteria)
  if (!normalizedCriteria) throw new SpendClassificationReviewError("invalid_rule_criteria")
  const name = input.name?.trim() || (input.ruleType === "merchant"
    ? `Merchant: ${rawCriteria.trim()}`
    : `Text: ${rawCriteria.trim()}`)
  const matchConfig = input.ruleType === "merchant"
    ? { merchantName: normalizedCriteria }
    : { phrase: normalizedCriteria }
  return tx.spendClassificationRule.create({
    data: {
      userId,
      name,
      ruleType: input.ruleType,
      categoryId,
      priority: input.priority ?? 100,
      enabled: true,
      matchConfig: matchConfig as Prisma.InputJsonValue,
      createdBy: userId,
      updatedBy: userId,
    },
  })
}

export async function correctSpendClassification(
  userId: string,
  input: {
    classificationId: string
    categoryId: string
    reason?: string | null
    createRule?: FutureSpendRuleInput
  },
) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const classification = await tx.spendClassification.findFirst({
      where: { userId, id: input.classificationId },
      select: { id: true, categoryId: true, origin: true, refundForClassificationId: true },
    })
    if (!classification) throw new SpendClassificationReviewError("classification_not_found")
    await requireActiveCategory(tx, userId, input.categoryId)
    const createdRule = input.createRule
      ? await createFutureRule(tx, userId, input.categoryId, input.createRule)
      : null
    return recordManualAssignment(tx, userId, classification, {
      categoryId: input.categoryId,
      reason: input.reason,
      ...(createdRule ? { createdRuleId: createdRule.id } : {}),
    })
  })
}

export async function confirmSelectedSpendClassifications(
  userId: string,
  input: { classificationIds: string[]; categoryId: string; reason?: string | null },
) {
  if (input.classificationIds.length === 0 || input.classificationIds.length > 100 ||
    new Set(input.classificationIds).size !== input.classificationIds.length) {
    throw new SpendClassificationReviewError("invalid_bulk_selection")
  }
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    await requireActiveCategory(tx, userId, input.categoryId)
    const classifications = await tx.spendClassification.findMany({
      where: { userId, id: { in: input.classificationIds } },
      select: { id: true, categoryId: true, origin: true, refundForClassificationId: true },
    })
    if (classifications.length !== input.classificationIds.length) {
      throw new SpendClassificationReviewError("classification_not_found")
    }
    if (classifications.some(({ origin }) => origin === "manual")) {
      throw new SpendClassificationReviewError("manual_assignment_protected")
    }
    const byId = new Map(classifications.map((classification) => [classification.id, classification]))
    const updated = []
    for (const classificationId of input.classificationIds) {
      const classification = byId.get(classificationId)
      if (!classification) throw new SpendClassificationReviewError("classification_not_found")
      updated.push(await recordManualAssignment(tx, userId, classification, {
        categoryId: input.categoryId,
        reason: input.reason,
      }))
    }
    return updated
  })
}
