import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createDepositRequest,
  listDepositRequests,
  toRequestAccessError,
} from "@/lib/depositGuard/requests"
import { createClient } from "@/lib/supabase/server"

const querySchema = z.object({
  jobId: z.string().trim().min(1).optional(),
})

const createRequestSchema = z
  .object({
    jobId: z.string().trim().min(1),
    requestType: z.enum(["deposit", "progress_payment", "final_payment"]),
    description: z.string().trim().max(2000).optional().nullable(),
    amountCents: z.number().int().min(0),
    taxAmountCents: z.number().int().min(0).optional().nullable(),
    totalAmountCents: z.number().int().min(0),
    currency: z.string().trim().length(3),
    dueDate: z.string().datetime(),
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

  const parsedQuery = querySchema.safeParse({
    jobId: new URL(request.url).searchParams.get("jobId") ?? undefined,
  })
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 })
  }

  try {
    const requests = await listDepositRequests(user.id, parsedQuery.data)
    return NextResponse.json({ requests })
  } catch (error) {
    const accessError = toRequestAccessError(error)
    if (accessError) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    console.error("[GET /api/deposit-guard/requests] Failed to list requests", error)
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

  const parsed = createRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const depositRequest = await createDepositRequest(user.id, {
      ...parsed.data,
      currency: parsed.data.currency.toLowerCase(),
      dueDate: new Date(parsed.data.dueDate),
      createdBy: user.id,
    })

    return NextResponse.json({ request: depositRequest }, { status: 201 })
  } catch (error) {
    const accessError = toRequestAccessError(error)
    if (accessError) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/deposit-guard/requests] Failed to create request", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
