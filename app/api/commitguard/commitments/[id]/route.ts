import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { listCommitments, updateCommitment } from "@/lib/commitguard/service"
import { CommitmentMutationConflict } from "@/lib/commitguard/commitmentMutation"
import { CommitmentFrequencyWriteSchema, CommitmentRecurrenceRuleWriteSchema } from "@/lib/commitguard/commitmentSchedule"
import { createClient } from "@/lib/supabase/server"
import { CommitmentDateInputSchema } from "@/lib/commitguard/commitmentEditor"

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
    frequency: CommitmentFrequencyWriteSchema.optional(),
    nextDueDate: CommitmentDateInputSchema.optional().nullable(),
    startDate: CommitmentDateInputSchema.optional().nullable(),
    endDate: CommitmentDateInputSchema.optional().nullable(),
    recurrenceRule: CommitmentRecurrenceRuleWriteSchema,
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
    confidence: z.enum(["confirmed", "high", "medium", "low"]).optional(),
    noticePeriodDays: z.number().int().min(0).max(365).optional().nullable(),
    renewalDate: CommitmentDateInputSchema.optional().nullable(),
    autoRenew: z.boolean().optional(),
    cancellable: z.boolean().optional(),
    essentiality: z.enum(["critical", "essential", "operational", "discretionary"]).optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    linkedSpendInsightId: z.string().trim().min(1).optional().nullable(),
    linkedCostGuardAlertId: z.string().trim().min(1).optional().nullable(),
  })
  .strict()

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
export const PATCH = withSubscriptionAccess(PATCHHandler)
async function GETHandler(
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

async function PATCHHandler(
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

    const { userId: _tenant, ...commitment } = result.commitment
    return NextResponse.json({ commitment, audit: result.audit })
  } catch (error) {
    if (error instanceof CommitmentMutationConflict) {
      return NextResponse.json({ error: error.message, reason: error.reason }, { status: 409 })
    }
    if (error instanceof Error && error.message === "Upgrade required") {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    console.error("[PATCH /api/commitguard/commitments/[id]] Failed to update commitment", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
