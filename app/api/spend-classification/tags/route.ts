import { NextResponse } from "next/server"
import { z } from "zod"

import { createSpendTag, listSpendTags, SpendTagError } from "@/lib/spendClassification/tags"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const createTagSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict()

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

function tagErrorStatus(error: SpendTagError): number {
  if (error.code === "tag_not_found") return 404
  if (error.code === "tag_name_required") return 400
  return 409
}

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const tags = await listSpendTags(userId)
    return NextResponse.json({ tags: tags.map(toTagResponse) })
  } catch {
    console.error("[GET /api/spend-classification/tags] Failed to load tags")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const parsed = createTagSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const tag = await createSpendTag(userId, parsed.data.name)
    return NextResponse.json({ tag: toTagResponse(tag) }, { status: 201 })
  } catch (error) {
    if (error instanceof SpendTagError) {
      return NextResponse.json({ error: error.code }, { status: tagErrorStatus(error) })
    }
    console.error("[POST /api/spend-classification/tags] Failed to create tag")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
