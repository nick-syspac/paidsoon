import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { listCommitments, updateCommitment } from "@/lib/commitguard/service"
import { createClient } from "@/lib/supabase/server"

const ParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const UpdateCommitmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    category: z.string().trim().min(1).max(80).optional(),
    amountCents: z.number().int().min(0).optional(),
    currency: z.string().trim().min(3).max(8).optional(),
    frequency: z
      .enum(["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual", "custom"])
      .optional(),
    nextDueDate: z.coerce.date().optional().nullable(),
    startDate: z.coerce.date().optional().nullable(),
    endDate: z.coerce.date().optional().nullable(),
    recurrenceRule: z.unknown().optional(),
    supplierName: z.string().trim().max(120).optional().nullable(),
    supplierId: z.string().trim().max(120).optional().nullable(),
    accountId: z.string().trim().max(120).optional().nullable(),
    source: z
      .enum([
        "manual",
        "accounting_integration",
        "bank_transaction_pattern",
        "spendleak",
        "costguard",
        "import",
        "system_inferred",
      ])
      .optional(),
    status: z.enum(["active", "upcoming", "ending", "cancelled", "expired", "paused", "review"]).optional(),
    confidence: z.enum(["confirmed", "high", "medium", "low"]).optional(),
    noticePeriodDays: z.number().int().min(0).max(365).optional().nullable(),
    renewalDate: z.coerce.date().optional().nullable(),
    autoRenew: z.boolean().optional(),
    cancellable: z.boolean().optional(),
    essentiality: z.enum(["critical", "essential", "operational", "discretionary"]).optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    linkedSpendInsightId: z.string().trim().min(1).optional().nullable(),
    linkedCostGuardAlertId: z.string().trim().min(1).optional().nullable(),
  })
  .strict()

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const params = await context.params
  const parsedParams = ParamsSchema.safeParse(params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  try {
    const commitments = await listCommitments(user.id)
    const commitment = commitments.find((item) => item.id === parsedParams.data.id)
    if (!commitment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ commitment })
  } catch (error) {
    console.error("[GET /api/commitguard/commitments/[id]] Failed to load commitment", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const params = await context.params
  const parsedParams = ParamsSchema.safeParse(params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  const parsedBody = UpdateCommitmentSchema.safeParse(payload)
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const result = await updateCommitment(user.id, parsedParams.data.id, parsedBody.data)
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[PATCH /api/commitguard/commitments/[id]] Failed to update commitment", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
