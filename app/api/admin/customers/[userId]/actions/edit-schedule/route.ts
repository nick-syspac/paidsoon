import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { logAdminEvent } from "@/lib/admin/audit"
import {
  ActionReasonSchema,
  guardErrorResponse,
  requireSupportActionContext,
} from "@/lib/admin/supportActions"

const BodySchema = z
  .object({
    email1DaysAfterDue: z.number().int().min(0).max(120),
    email2DaysAfterDue: z.number().int().min(0).max(180),
    email3DaysAfterDue: z.number().int().min(0).max(365),
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
  const { reason, email1DaysAfterDue, email2DaysAfterDue, email3DaysAfterDue } = parsed.data

  const previous = await prismaAdmin.schedule.findUnique({
    where: { userId },
    select: {
      id: true,
      email1DaysAfterDue: true,
      email2DaysAfterDue: true,
      email3DaysAfterDue: true,
    },
  })

  const updated = await prismaAdmin.schedule.upsert({
    where: { userId },
    create: {
      userId,
      email1DaysAfterDue,
      email2DaysAfterDue,
      email3DaysAfterDue,
    },
    update: {
      email1DaysAfterDue,
      email2DaysAfterDue,
      email3DaysAfterDue,
    },
    select: {
      id: true,
      email1DaysAfterDue: true,
      email2DaysAfterDue: true,
      email3DaysAfterDue: true,
    },
  })

  await logAdminEvent({
    actorUserId: guard.ctx.userId,
    actorEmail: guard.ctx.userEmail,
    platformRole: guard.ctx.platformRole.role,
    adminDeviceId: guard.ctx.adminSession.adminDeviceId,
    action: "update_schedule",
    targetType: "user_profile",
    targetId: userId,
    targetUserId: userId,
    resourceId: updated.id,
    reason,
    ipAddress: guard.requestMeta.ipAddress,
    userAgent: guard.requestMeta.userAgent,
    requestId: guard.requestMeta.requestId,
    success: true,
    details: {
      old: previous
        ? {
            email1DaysAfterDue: previous.email1DaysAfterDue,
            email2DaysAfterDue: previous.email2DaysAfterDue,
            email3DaysAfterDue: previous.email3DaysAfterDue,
          }
        : null,
      next: {
        email1DaysAfterDue: updated.email1DaysAfterDue,
        email2DaysAfterDue: updated.email2DaysAfterDue,
        email3DaysAfterDue: updated.email3DaysAfterDue,
      },
    },
  })

  return NextResponse.json({ success: true, schedule: updated })
}
