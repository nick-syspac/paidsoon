import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import {
  applyMarginRule,
  createOrUpdateMarginRule,
  listMarginRules,
  previewMarginRuleApplication,
} from "@/lib/marginguard/service"
import { normalizeMarginCostClass } from "@/lib/marginguard/classification"
import { createClient } from "@/lib/supabase/server"

const RuleSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(120),
    ruleType: z.enum(["supplier", "category", "account", "text_match", "recurring"]),
    classification: z.enum(["DIRECT_COST", "VARIABLE_COST", "OVERHEAD", "EXCLUDED", "UNCLASSIFIED"]),
    priority: z.number().int().min(1).max(10_000).default(100),
    enabled: z.boolean().default(true),
    matchConfig: z.object({
      supplierId: z.string().optional().nullable(),
      categoryKey: z.string().optional().nullable(),
      accountKey: z.string().optional().nullable(),
      includesText: z.string().optional().nullable(),
      recurringOnly: z.boolean().optional(),
    }),
  })
  .strict()

const ActionSchema = z
  .object({
    action: z.enum(["save", "preview", "apply"]),
    rule: RuleSchema,
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict()

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireMarginGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const rules = await listMarginRules(user.id)
    return NextResponse.json({ rules })
  } catch (error) {
    console.error("[GET /api/margin-guard/rules] Failed to load rules", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireMarginGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = ActionSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const rule = {
    ...parsed.data.rule,
    classification: normalizeMarginCostClass(parsed.data.rule.classification),
  }

  try {
    if (parsed.data.action === "preview") {
      const preview = await previewMarginRuleApplication(
        user.id,
        {
          id: rule.id ?? "preview",
          ruleType: rule.ruleType,
          classification: rule.classification,
          priority: rule.priority,
          enabled: rule.enabled,
          matchConfig: rule.matchConfig,
        },
        parsed.data.limit,
      )
      return NextResponse.json({ preview })
    }

    if (parsed.data.action === "apply") {
      if (!rule.id) {
        return NextResponse.json({ error: "rule.id is required for apply action" }, { status: 400 })
      }
      const result = await applyMarginRule(user.id, rule.id, user.id, parsed.data.limit)
      return NextResponse.json({ result })
    }

    const saved = await createOrUpdateMarginRule(user.id, {
      id: rule.id,
      name: rule.name,
      ruleType: rule.ruleType,
      classification: rule.classification,
      priority: rule.priority,
      enabled: rule.enabled,
      matchConfig: rule.matchConfig,
      actorId: user.id,
    })

    return NextResponse.json({ rule: saved })
  } catch (error) {
    console.error("[POST /api/margin-guard/rules] Failed to process rule action", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
