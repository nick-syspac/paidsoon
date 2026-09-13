import { NextResponse } from "next/server"
import { z } from "zod"

import { processDepositReminder } from "@/lib/depositGuard/reminderDelivery"

const bodySchema = z.object({
  reminderId: z.string().min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.INTERNAL_JOBS_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    const result = await processDepositReminder(parsed.data.reminderId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/internal/jobs/send-deposit-reminder] Failed to send DepositGuard reminder", error)
    return NextResponse.json({ status: "failed", reason: "deposit_reminder_send_failed" }, { status: 500 })
  }
}
