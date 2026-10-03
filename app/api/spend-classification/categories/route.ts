import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createSpendCategory,
  provisionDefaultSpendCategories,
  SpendCategoryError,
} from "@/lib/spendClassification/categories"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
}).strict()

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

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const categories = await provisionDefaultSpendCategories(userId)
    return NextResponse.json({ categories: categories.map(toCategoryResponse) })
  } catch {
    console.error("[GET /api/spend-classification/categories] Failed to load categories")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const category = await createSpendCategory(userId, parsed.data)
    return NextResponse.json({ category: toCategoryResponse(category) }, { status: 201 })
  } catch (error) {
    if (error instanceof SpendCategoryError) {
      return NextResponse.json({ error: error.code }, { status: categoryErrorStatus(error) })
    }
    console.error("[POST /api/spend-classification/categories] Failed to create category")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
