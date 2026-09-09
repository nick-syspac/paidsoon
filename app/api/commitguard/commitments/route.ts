import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { createCommitment, listCommitments } from "@/lib/commitguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  sortBy: z.enum(["nextDueDate", "amountCents", "updatedAt"]).default("nextDueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
})

const CreateCommitmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().nullable(),
    category: z.string().trim().min(1).max(80),
    amountCents: z.number().int().min(0),
    currency: z.string().trim().min(3).max(8),
    frequency: z.enum([
      "one_off",
      "weekly",
      "fortnightly",
      "monthly",
      "quarterly",
      "six_monthly",
      "annual",
      "custom",
    ]),
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

export async function GET(request: Request): Promise<NextResponse> {
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

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    currency: searchParams.get("currency") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? "nextDueDate",
    sortOrder: searchParams.get("sortOrder") ?? "asc",
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const commitments = await listCommitments(user.id)
    const statusFilter = parsed.data.status?.toLowerCase()
    const searchFilter = parsed.data.search?.toLowerCase()
    const currencyFilter = parsed.data.currency?.toLowerCase()

    const filtered = commitments
      .filter((commitment) => {
        if (statusFilter && commitment.status !== statusFilter) return false
        if (currencyFilter && commitment.currency.toLowerCase() !== currencyFilter) return false
        if (searchFilter) {
          const haystack = [
            commitment.name,
            commitment.category,
            commitment.supplierName ?? "",
            commitment.notes ?? "",
          ]
            .join(" ")
            .toLowerCase()
          if (!haystack.includes(searchFilter)) return false
        }

        return true
      })
      .sort((left, right) => {
        const direction = parsed.data.sortOrder === "asc" ? 1 : -1
        if (parsed.data.sortBy === "amountCents") {
          return (left.amountCents - right.amountCents) * direction
        }

        if (parsed.data.sortBy === "updatedAt") {
          return (left.updatedAt.getTime() - right.updatedAt.getTime()) * direction
        }

        const leftDue = left.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
        const rightDue = right.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
        return (leftDue - rightDue) * direction
      })

    return NextResponse.json({ commitments: filtered })
  } catch (error) {
    console.error("[GET /api/commitguard/commitments] Failed to list commitments", error)
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

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = CreateCommitmentSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await createCommitment(user.id, parsed.data)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (error.message === "Upgrade required" || error.message === "Commitment limit reached")) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    console.error("[POST /api/commitguard/commitments] Failed to create commitment", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
