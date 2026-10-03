import { NextResponse } from "next/server"
import { z } from "zod"

import {
  getSpendClassificationSetting,
  updateSpendClassificationSetting,
} from "@/lib/spendClassification/settings"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const updateSettingSchema = z.object({ enabled: z.boolean() }).strict()

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const setting = await getSpendClassificationSetting(userId)
    return NextResponse.json(setting)
  } catch {
    console.error("[GET /api/spend-classification/settings] Failed to load setting")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const parsed = updateSettingSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  try {
    const setting = await updateSpendClassificationSetting(userId, parsed.data.enabled)
    return NextResponse.json(setting)
  } catch {
    console.error("[PATCH /api/spend-classification/settings] Failed to update setting")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
