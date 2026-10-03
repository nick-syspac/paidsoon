import { NextResponse } from "next/server"
import { z } from "zod"

import { retireSpendTag, SpendTagError } from "@/lib/spendClassification/tags"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const tagIdSchema = z.string().trim().min(1).max(128)
const retireTagSchema = z.object({ action: z.literal("retire") }).strict()

function toTagResponse(tag: { id: string; name: string; normalizedName: string; status: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: tag.id,
    name: tag.name,
    normalizedName: tag.normalizedName,
    status: tag.status,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ tagId: string }> }): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = await context.params
  const parsedId = tagIdSchema.safeParse(params.tagId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid tag ID" }, { status: 400 })
  const payload = await request.json().catch(() => null)
  const parsed = retireTagSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const tag = await retireSpendTag(userId, parsedId.data)
    return NextResponse.json({ tag: toTagResponse(tag) })
  } catch (error) {
    if (error instanceof SpendTagError) {
      const status = error.code === "tag_not_found" ? 404 : 409
      return NextResponse.json({ error: error.code }, { status })
    }
    console.error("[PATCH /api/spend-classification/tags/[tagId]] Failed to retire tag")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
