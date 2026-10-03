import { NextResponse } from "next/server"
import { z } from "zod"

import {
  setSpendClassificationRuleEnabled,
  SpendRuleError,
  type SpendRuleErrorCode,
} from "@/lib/spendClassification/rules"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const ruleIdSchema = z.string().trim().min(1).max(128)
const updateRuleSchema = z.object({ enabled: z.boolean() }).strict()

function toRuleResponse(rule: {
  id: string
  name: string
  ruleType: string
  categoryId: string
  priority: number
  enabled: boolean
  matchConfig: unknown
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: rule.id,
    name: rule.name,
    ruleType: rule.ruleType,
    categoryId: rule.categoryId,
    priority: rule.priority,
    enabled: rule.enabled,
    matchConfig: rule.matchConfig,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }
}

function ruleErrorStatus(code: SpendRuleErrorCode): number {
  if (code === "rule_not_found") return 404
  if (code === "category_not_active" || code === "duplicate_source_mapping") return 409
  return 400
}

export async function PATCH(request: Request, context: { params: Promise<{ ruleId: string }> }): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = await context.params
  const parsedId = ruleIdSchema.safeParse(params.ruleId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 })
  const payload = await request.json().catch(() => null)
  const parsed = updateRuleSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const rule = await setSpendClassificationRuleEnabled(userId, parsedId.data, parsed.data.enabled)
    return NextResponse.json({ rule: toRuleResponse(rule) })
  } catch (error) {
    if (error instanceof SpendRuleError) {
      return NextResponse.json({ error: error.code }, { status: ruleErrorStatus(error.code) })
    }
    console.error("[PATCH /api/spend-classification/rules/[ruleId]] Failed to update rule")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
