import { NextResponse } from "next/server"
import { z } from "zod"

import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"
import {
  confirmSelectedSpendClassifications,
  SpendClassificationReviewError,
} from "@/lib/spendClassification/review"

const bulkConfirmSchema = z.object({
  classificationIds: z.array(z.string().trim().min(1).max(128)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate classification IDs are not allowed"),
  categoryId: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(500).optional(),
}).strict()

function errorStatus(error: SpendClassificationReviewError): number {
  if (error.code === "classification_not_found") return 404
  if (error.code === "category_not_active" || error.code === "manual_assignment_protected") return 409
  return 400
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const parsed = bulkConfirmSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const classifications = await confirmSelectedSpendClassifications(userId, parsed.data)
    return NextResponse.json({
      classifications: classifications.map(({ id, status, origin, categoryId, updatedAt }) => ({
        id, status, origin, categoryId, updatedAt,
      })),
    })
  } catch (error) {
    if (error instanceof SpendClassificationReviewError) {
      return NextResponse.json({ error: error.code }, { status: errorStatus(error) })
    }
    console.error("[POST /api/spend-classification/review/bulk-confirm] Failed to confirm selected classifications")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
