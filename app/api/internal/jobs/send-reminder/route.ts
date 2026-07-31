import { NextResponse } from "next/server"
import { z } from "zod"
import { sendReminderForInvoice } from "@/lib/email/sendReminderForInvoice"

const bodySchema = z.object({
  userId: z.string().min(1),
  trackedInvoiceId: z.string().min(1),
})

/**
 * Internal endpoint called by the Railway Celery `reminder_email` task for a
 * single claimed unit of work. Not part of the public API surface — secured
 * with INTERNAL_JOBS_SECRET (separate from CRON_SECRET, since the caller is
 * the Railway worker, not Vercel Cron).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.INTERNAL_JOBS_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const result = await sendReminderForInvoice(parsed.data.userId, parsed.data.trackedInvoiceId)
  return NextResponse.json(result)
}
