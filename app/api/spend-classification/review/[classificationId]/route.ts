import { NextResponse } from "next/server"
import { z } from "zod"

import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"
import {
  correctSpendClassification,
  linkSpendRefund,
  listSpendRefundCandidates,
  markSpendClassificationAsTransfer,
  SpendClassificationReviewError,
  unlinkSpendRefund,
} from "@/lib/spendClassification/review"

const identifier = z.string().trim().min(1).max(128)
const priority = z.number().int().min(-2_147_483_648).max(2_147_483_647).optional()
const createRuleSchema = z.discriminatedUnion("ruleType", [
  z.object({
    ruleType: z.literal("merchant"),
    merchantName: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(100).optional(),
    priority,
  }).strict(),
  z.object({
    ruleType: z.literal("text_match"),
    phrase: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(100).optional(),
    priority,
  }).strict(),
])
const correctionSchema = z.object({
  categoryId: identifier,
  reason: z.string().trim().max(500).optional(),
  createRule: createRuleSchema.optional(),
}).strict()
const specialActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_transfer"), reason: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal("link_refund"), originalClassificationId: identifier }).strict(),
  z.object({ action: z.literal("unlink_refund") }).strict(),
])
const patchSchema = z.union([correctionSchema, specialActionSchema])

function toAssignmentResponse(classification: {
  id: string
  status: string
  origin: string | null
  categoryId: string | null
  refundForClassificationId?: string | null
  updatedAt: Date
}) {
  return {
    id: classification.id,
    status: classification.status,
    origin: classification.origin,
    categoryId: classification.categoryId,
    ...(classification.refundForClassificationId !== undefined
      ? { refundForClassificationId: classification.refundForClassificationId }
      : {}),
    updatedAt: classification.updatedAt,
  }
}

function errorStatus(error: SpendClassificationReviewError): number {
  if (error.code === "classification_not_found") return 404
  if (error.code === "category_not_active") return 409
  if (error.code === "manual_assignment_protected") return 409
  if (error.code === "invalid_transfer_source") return 400
  return 409
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ classificationId: string }> },
): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = await context.params
  const parsedId = identifier.safeParse(params.classificationId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid classification ID" }, { status: 400 })
  try {
    const candidates = await listSpendRefundCandidates(userId, parsedId.data)
    return NextResponse.json({ candidates })
  } catch (error) {
    if (error instanceof SpendClassificationReviewError) {
      return NextResponse.json({ error: error.code }, { status: errorStatus(error) })
    }
    console.error("[GET /api/spend-classification/review/[classificationId]] Failed to load refund candidates")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ classificationId: string }> },
): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = await context.params
  const parsedId = identifier.safeParse(params.classificationId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid classification ID" }, { status: 400 })
  const payload = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const classification = "action" in parsed.data
      ? parsed.data.action === "mark_transfer"
        ? await markSpendClassificationAsTransfer(userId, {
            classificationId: parsedId.data,
            reason: parsed.data.reason,
          })
        : parsed.data.action === "link_refund"
          ? await linkSpendRefund(userId, {
              refundClassificationId: parsedId.data,
              originalClassificationId: parsed.data.originalClassificationId,
            })
          : await unlinkSpendRefund(userId, parsedId.data)
      : await correctSpendClassification(userId, {
          classificationId: parsedId.data,
          ...parsed.data,
        })
    return NextResponse.json({ classification: toAssignmentResponse(classification) })
  } catch (error) {
    if (error instanceof SpendClassificationReviewError) {
      return NextResponse.json({ error: error.code }, { status: errorStatus(error) })
    }
    console.error("[PATCH /api/spend-classification/review/[classificationId]] Failed to correct classification")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
