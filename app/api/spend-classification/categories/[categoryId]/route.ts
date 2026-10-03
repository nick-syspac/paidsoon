import { NextResponse } from "next/server"
import { z } from "zod"

import {
  mergeSpendCategories,
  renameSpendCategory,
  retireSpendCategory,
  SpendCategoryError,
} from "@/lib/spendClassification/categories"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const categoryIdSchema = z.string().trim().min(1).max(128)
const updateCategorySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("retire") }).strict(),
  z.object({ action: z.literal("merge"), targetCategoryId: z.string().trim().min(1).max(128) }).strict(),
])

function toCategoryResponse(category: {
  id: string
  key: string | null
  name: string
  description: string | null
  isSystem: boolean
  status: string
  mergedIntoCategoryId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: category.id,
    key: category.key,
    name: category.name,
    description: category.description,
    isSystem: category.isSystem,
    status: category.status,
    mergedIntoCategoryId: category.mergedIntoCategoryId,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }
}

function categoryErrorStatus(error: SpendCategoryError): number {
  if (error.code === "category_not_found") return 404
  if (error.code === "category_name_required") return 400
  return 409
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = await context.params
  const parsedId = categoryIdSchema.safeParse(params.categoryId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid category ID" }, { status: 400 })

  const payload = await request.json().catch(() => null)
  const parsed = updateCategorySchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const category = parsed.data.action === "rename"
      ? await renameSpendCategory(userId, parsedId.data, parsed.data.name)
      : parsed.data.action === "retire"
        ? await retireSpendCategory(userId, parsedId.data)
        : await mergeSpendCategories(userId, parsedId.data, parsed.data.targetCategoryId)
    return NextResponse.json({ category: toCategoryResponse(category) })
  } catch (error) {
    if (error instanceof SpendCategoryError) {
      return NextResponse.json({ error: error.code }, { status: categoryErrorStatus(error) })
    }
    console.error("[PATCH /api/spend-classification/categories/[categoryId]] Failed to update category")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
