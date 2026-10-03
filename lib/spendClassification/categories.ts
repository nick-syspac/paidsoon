import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"
import { lockSpendClassificationTenant } from "@/lib/spendClassification/locks"
import { normalizeSpendCategoryName } from "@/lib/spendClassification/resolver"

export { normalizeSpendCategoryName } from "@/lib/spendClassification/resolver"

export const MAX_ACTIVE_SPEND_CATEGORIES = 255

export const DEFAULT_SPEND_CATEGORIES = [
  { key: "software_cloud", name: "Software & Cloud" },
  { key: "professional_services", name: "Professional Services" },
  { key: "payroll_contractors", name: "Payroll & Contractors" },
  { key: "marketing_sales", name: "Marketing & Sales" },
  { key: "office_supplies", name: "Office & Supplies" },
  { key: "travel_transport", name: "Travel & Transport" },
  { key: "facilities_equipment", name: "Facilities & Equipment" },
  { key: "banking_insurance", name: "Banking & Insurance" },
  { key: "taxes_government", name: "Taxes & Government" },
  { key: "other", name: "Other", isSystem: true },
] as const

export type SpendCategoryErrorCode =
  | "category_name_required"
  | "category_name_taken"
  | "category_limit_reached"
  | "category_not_found"
  | "category_reserved"
  | "category_not_active"
  | "category_merge_self"

export class SpendCategoryError extends Error {
  constructor(public readonly code: SpendCategoryErrorCode) {
    super(code)
    this.name = "SpendCategoryError"
  }
}

async function writeCategoryEvent(
  tx: PrismaTx,
  userId: string,
  eventType: string,
  options: {
    oldCategoryId?: string | null
    newCategoryId?: string | null
    metadata?: Prisma.InputJsonValue
  } = {},
): Promise<void> {
  await tx.spendClassificationEvent.create({
    data: {
      userId,
      eventType,
      actorId: userId,
      oldCategoryId: options.oldCategoryId ?? null,
      newCategoryId: options.newCategoryId ?? null,
      metadata: options.metadata,
    },
  })
}

function assertCategoryName(name: string): string {
  const normalizedName = normalizeSpendCategoryName(name)
  if (!normalizedName) throw new SpendCategoryError("category_name_required")
  return normalizedName
}

function assertNotReserved(category: { isSystem: boolean; key: string | null }): void {
  if (category.isSystem && category.key === "other") {
    throw new SpendCategoryError("category_reserved")
  }
}

async function ensureDefaultSpendCategories(tx: PrismaTx, userId: string) {
  const existing = await tx.spendCategory.findMany({
    where: { userId, key: { in: DEFAULT_SPEND_CATEGORIES.map(({ key }) => key) } },
    select: { key: true },
  })
  const existingKeys = new Set(existing.flatMap(({ key }) => (key ? [key] : [])))
  const missingDefaults = DEFAULT_SPEND_CATEGORIES.filter(({ key }) => !existingKeys.has(key))

  if (missingDefaults.length > 0) {
    await tx.spendCategory.createMany({
      data: missingDefaults.map((category) => ({
        userId,
        key: category.key,
        name: category.name,
        normalizedName: normalizeSpendCategoryName(category.name),
        isSystem: "isSystem" in category && category.isSystem,
      })),
    })

    const provisioned = await tx.spendCategory.findMany({
      where: { userId, key: { in: missingDefaults.map(({ key }) => key) } },
    })
    const provisionedByKey = new Map(provisioned.map((category) => [category.key, category]))
    for (const category of missingDefaults) {
      const row = provisionedByKey.get(category.key)
      if (!row) throw new Error("Default spend category provisioning was incomplete")
      await writeCategoryEvent(tx, userId, "category_default_provisioned", {
        newCategoryId: row.id,
        metadata: { key: category.key, name: category.name },
      })
    }
  }

  return tx.spendCategory.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })
}

export async function provisionDefaultSpendCategories(userId: string) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    return ensureDefaultSpendCategories(tx, userId)
  })
}

export async function createSpendCategory(
  userId: string,
  input: { name: string; description?: string | null },
) {
  const normalizedName = assertCategoryName(input.name)

  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)
    await ensureDefaultSpendCategories(tx, userId)

    const existing = await tx.spendCategory.findFirst({
      where: { userId, normalizedName },
      select: { id: true },
    })
    if (existing) throw new SpendCategoryError("category_name_taken")

    const activeCount = await tx.spendCategory.count({ where: { userId, status: "active" } })
    if (activeCount >= MAX_ACTIVE_SPEND_CATEGORIES) {
      throw new SpendCategoryError("category_limit_reached")
    }

    const category = await tx.spendCategory.create({
      data: {
        userId,
        name: input.name.normalize("NFKC").trim().replace(/\s+/gu, " "),
        normalizedName,
        description: input.description?.trim() || null,
      },
    })
    await writeCategoryEvent(tx, userId, "category_created", {
      newCategoryId: category.id,
      metadata: { name: category.name },
    })
    return category
  })
}

export async function renameSpendCategory(userId: string, categoryId: string, name: string) {
  const normalizedName = assertCategoryName(name)

  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)

    const category = await tx.spendCategory.findFirst({ where: { id: categoryId, userId } })
    if (!category) throw new SpendCategoryError("category_not_found")
    assertNotReserved(category)

    const conflictingCategory = await tx.spendCategory.findFirst({
      where: { userId, normalizedName, id: { not: categoryId } },
      select: { id: true },
    })
    if (conflictingCategory) throw new SpendCategoryError("category_name_taken")

    const displayName = name.normalize("NFKC").trim().replace(/\s+/gu, " ")
    if (category.name === displayName) return category

    const updated = await tx.spendCategory.update({
      where: { id: categoryId },
      data: { name: displayName, normalizedName },
    })
    await writeCategoryEvent(tx, userId, "category_renamed", {
      oldCategoryId: categoryId,
      newCategoryId: categoryId,
      metadata: { oldName: category.name, newName: displayName },
    })
    return updated
  })
}

export async function retireSpendCategory(userId: string, categoryId: string) {
  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)

    const category = await tx.spendCategory.findFirst({ where: { id: categoryId, userId } })
    if (!category) throw new SpendCategoryError("category_not_found")
    assertNotReserved(category)
    if (category.status !== "active") throw new SpendCategoryError("category_not_active")

    const updated = await tx.spendCategory.update({
      where: { id: categoryId },
      data: { status: "retired" },
    })
    await writeCategoryEvent(tx, userId, "category_retired", {
      oldCategoryId: categoryId,
      metadata: { name: category.name },
    })
    return updated
  })
}

export async function mergeSpendCategories(userId: string, sourceCategoryId: string, targetCategoryId: string) {
  if (sourceCategoryId === targetCategoryId) throw new SpendCategoryError("category_merge_self")

  return withUserContext(userId, async (tx) => {
    await lockSpendClassificationTenant(tx, userId)

    const categories = await tx.spendCategory.findMany({
      where: { userId, id: { in: [sourceCategoryId, targetCategoryId] } },
    })
    const source = categories.find(({ id }) => id === sourceCategoryId)
    const target = categories.find(({ id }) => id === targetCategoryId)
    if (!source || !target) throw new SpendCategoryError("category_not_found")
    assertNotReserved(source)
    if (source.status !== "active" || target.status !== "active") {
      throw new SpendCategoryError("category_not_active")
    }

    const updated = await tx.spendCategory.update({
      where: { id: sourceCategoryId },
      data: { status: "merged", mergedIntoCategoryId: targetCategoryId },
    })
    await writeCategoryEvent(tx, userId, "category_merged", {
      oldCategoryId: sourceCategoryId,
      newCategoryId: targetCategoryId,
      metadata: { sourceName: source.name, targetName: target.name },
    })
    return updated
  })
}