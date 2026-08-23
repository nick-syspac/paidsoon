import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"
import { logAdminEvent } from "@/lib/admin/audit"
import { sendFollowUpEmail, resolveFreelancerName } from "@/lib/email/send"
import {
  ActionReasonSchema,
  guardErrorResponse,
  requireSupportActionContext,
} from "@/lib/admin/supportActions"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

const BodySchema = z
  .object({
    invoiceId: z.string().min(1),
    stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    reason: ActionReasonSchema,
  })
  .strict()

type Params = { params: Promise<{ userId: string }> }

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  let guard
  try {
    guard = await requireSupportActionContext(req)
  } catch (err) {
    return guardErrorResponse(err)
  }

  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { userId } = await params
  const { invoiceId, stage, reason } = parsed.data

  const invoice = await prismaAdmin.trackedInvoice.findFirst({
    where: { id: invoiceId, userId },
    include: {
      userProfile: { select: { displayName: true } },
    },
  })

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  const supabaseAdmin = createClient(
    getPublicSupabaseEnvironment().publicUrl,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const freelancerEmail = userData?.user?.email ?? ""
  const freelancerName = resolveFreelancerName(
    invoice.userProfile?.displayName,
    userData?.user?.user_metadata?.full_name,
    userData?.user?.email,
  )

  const resendMessageId = await sendFollowUpEmail(invoice, stage, freelancerEmail, freelancerName)
  const success = resendMessageId !== null

  await logAdminEvent({
    actorUserId: guard.ctx.userId,
    actorEmail: guard.ctx.userEmail,
    platformRole: guard.ctx.platformRole.role,
    adminDeviceId: guard.ctx.adminSession.adminDeviceId,
    action: "trigger_email",
    targetType: "tracked_invoice",
    targetId: invoice.id,
    targetUserId: userId,
    resourceId: invoice.id,
    reason,
    ipAddress: guard.requestMeta.ipAddress,
    userAgent: guard.requestMeta.userAgent,
    requestId: guard.requestMeta.requestId,
    success,
    details: {
      stage,
      resendMessageId,
    },
  })

  if (!success) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 502 })
  }

  return NextResponse.json({ success: true, resendMessageId })
}
