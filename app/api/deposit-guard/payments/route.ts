import { NextResponse } from "next/server"
import { z } from "zod"

import { recordManualDepositPayment } from "@/lib/depositGuard/service"
import { createClient } from "@/lib/supabase/server"

const recordPaymentSchema = z
  .object({
    jobId: z.string().trim().min(1),
    requestId: z.string().trim().min(1).optional().nullable(),
    amountCents: z.number().int().min(0),
    currency: z.string().trim().length(3),
    paymentMethod: z.string().trim().min(1).max(100),
    idempotencyKey: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).optional().nullable(),
    paidAt: z.string().datetime().optional(),
  })
  .strict()

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = recordPaymentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await recordManualDepositPayment(user.id, {
      jobId: parsed.data.jobId,
      requestId: parsed.data.requestId ?? null,
      amountCents: parsed.data.amountCents,
      currency: parsed.data.currency.toLowerCase(),
      paymentMethod: parsed.data.paymentMethod,
      idempotencyKey: parsed.data.idempotencyKey,
      recordedBy: user.id,
      notes: parsed.data.notes ?? null,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
    })

    return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Upgrade required") {
        return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/deposit-guard/payments] Failed to record payment", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
