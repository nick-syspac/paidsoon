import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createSourceAccountMapping,
  createSpendClassificationRule,
  listSpendClassificationRules,
  SpendRuleError,
} from "@/lib/spendClassification/rules"
import { getAuthenticatedSpendClassificationUserId } from "@/lib/spendClassification/api"

const identifier = z.string().trim().min(1).max(128)
const priority = z.number().int().min(-2_147_483_648).max(2_147_483_647).optional()
const ruleInputSchema = z.discriminatedUnion("ruleType", [
  z.object({
    ruleType: z.literal("source_account"),
    accountingConnectionId: identifier,
    expenseAccountCode: z.string().trim().max(100).optional(),
    expenseAccountName: z.string().trim().max(160).optional(),
    categoryId: identifier,
    name: z.string().trim().min(1).max(100).optional(),
    priority,
  }).strict(),
  z.object({
    ruleType: z.literal("merchant"),
    merchantName: z.string().trim().min(1).max(160),
    categoryId: identifier,
    name: z.string().trim().min(1).max(100).optional(),
    priority,
  }).strict(),
  z.object({
    ruleType: z.literal("text_match"),
    phrase: z.string().trim().min(1).max(160),
    categoryId: identifier,
    name: z.string().trim().min(1).max(100).optional(),
    priority,
  }).strict(),
]).superRefine((value, context) => {
  if (value.ruleType === "source_account" &&
    !value.expenseAccountCode?.trim() && !value.expenseAccountName?.trim()) {
    context.addIssue({ code: "custom", message: "An expense account code or name is required" })
  }
})

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
  category?: { name: string; status: string }
}) {
  return {
    id: rule.id,
    name: rule.name,
    ruleType: rule.ruleType,
    categoryId: rule.categoryId,
    categoryName: rule.category?.name,
    categoryStatus: rule.category?.status,
    priority: rule.priority,
    enabled: rule.enabled,
    matchConfig: rule.matchConfig,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }
}

function ruleErrorStatus(error: SpendRuleError): number {
  if (error.code === "accounting_connection_not_found" || error.code === "rule_not_found") return 404
  if (error.code === "invalid_match_criteria") return 400
  return 409
}

export async function GET(): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const rules = await listSpendClassificationRules(userId)
    return NextResponse.json({ rules: rules.map(toRuleResponse) })
  } catch {
    console.error("[GET /api/spend-classification/rules] Failed to load rules")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getAuthenticatedSpendClassificationUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const parsed = ruleInputSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const rule = parsed.data.ruleType === "source_account"
      ? await createSourceAccountMapping(userId, parsed.data)
      : await createSpendClassificationRule(userId, parsed.data)
    return NextResponse.json({ rule: toRuleResponse(rule) }, { status: 201 })
  } catch (error) {
    if (error instanceof SpendRuleError) {
      return NextResponse.json({ error: error.code }, { status: ruleErrorStatus(error) })
    }
    console.error("[POST /api/spend-classification/rules] Failed to create rule")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
