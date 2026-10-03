import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"
import { lockSpendClassificationTenant } from "@/lib/spendClassification/locks"
import { normalizeSpendCategoryName } from "@/lib/spendClassification/categories"

export type SpendTagErrorCode =
  | "tag_name_required"
  | "tag_name_taken"
  | "tag_not_found"
  | "tag_not_active"
  | "classification_not_found"

export class SpendTagError extends Error {
  constructor(public readonly code: SpendTagErrorCode) {
    super(code)
    this.name = "SpendTagError"
  }
}

export async function listSpendTags(userId: string) {
  return withUserContext(userId, async (tx) => tx.spendTag.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  }))
}

async function writeTagEvent(
  tx: PrismaTx,
  userId: string,
  eventType: string,
  metadata: Prisma.InputJsonValue,
  classificationId?: string,
): Promise<void> {
  await tx.spendClassificationEvent.create({
    data: {
      userId,
      classificationId: classificationId ?? null,
      eventType,
      actorId: userId,
      metadata,
    },
  })
}

export async function createSpendTag(userId: string, name: string) {
  const displayName = name.normalize("NFKC").trim().replace(/\s+/gu, " ")
  const normalizedName = normalizeSpendCategoryName(name)
  if (!normalizedName) throw new SpendTagError("tag_name_required")

  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const existing = await tx.spendTag.findFirst({
      where: { userId, normalizedName },
      select: { id: true },
    })
    if (existing) throw new SpendTagError("tag_name_taken")

    const tag = await tx.spendTag.create({
      data: { userId, name: displayName, normalizedName },
    })
    await writeTagEvent(tx, userId, "tag_created", { tagId: tag.id, name: tag.name })
    return tag
  })
}

export async function retireSpendTag(userId: string, tagId: string) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const tag = await tx.spendTag.findFirst({ where: { userId, id: tagId } })
    if (!tag) throw new SpendTagError("tag_not_found")
    if (tag.status !== "active") throw new SpendTagError("tag_not_active")

    const retired = await tx.spendTag.update({
      where: { id: tagId },
      data: { status: "retired" },
    })
    await writeTagEvent(tx, userId, "tag_retired", { tagId, name: tag.name })
    return retired
  })
}

export async function setSpendClassificationTag(
  userId: string,
  input: { classificationId: string; tagId: string; assigned: boolean },
): Promise<boolean> {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    const classification = await tx.spendClassification.findFirst({
      where: { userId, id: input.classificationId },
      select: { id: true },
    })
    if (!classification) throw new SpendTagError("classification_not_found")

    const tag = await tx.spendTag.findFirst({
      where: { userId, id: input.tagId },
      select: { id: true, name: true, status: true },
    })
    if (!tag) throw new SpendTagError("tag_not_found")
    if (input.assigned && tag.status !== "active") throw new SpendTagError("tag_not_active")

    const existing = await tx.spendClassificationTag.findFirst({
      where: { userId, classificationId: input.classificationId, tagId: input.tagId },
    })
    if (input.assigned) {
      if (existing) return false
      await tx.spendClassificationTag.create({
        data: {
          userId,
          classificationId: input.classificationId,
          tagId: input.tagId,
        },
      })
      await writeTagEvent(
        tx,
        userId,
        "tag_assigned",
        { tagId: tag.id, tagName: tag.name },
        input.classificationId,
      )
      return true
    }

    if (!existing) return false
    await tx.spendClassificationTag.deleteMany({
      where: { userId, classificationId: input.classificationId, tagId: input.tagId },
    })
    await writeTagEvent(
      tx,
      userId,
      "tag_removed",
      { tagId: tag.id, tagName: tag.name },
      input.classificationId,
    )
    return true
  })
}