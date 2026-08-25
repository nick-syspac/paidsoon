import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"
import { z } from "zod/v4"
import { endSupportImpersonation } from "@/lib/admin/session"
import { sendSupportAccessNotificationEmail } from "@/lib/email/send"

const EndBodySchema = z
  .object({
    reason: z.enum(["manual", "timeout"]).optional().default("manual"),
  })
  .strict()

/**
 * POST /api/admin/impersonation/end
 *
 * End impersonation. Handles two modes:
 *
 * Legacy — tenant sidebar impersonation:
 *   Clears AdminSession.impersonatedTenantId.
 *
 * Support console — read-only customer view:
 *   Clears AdminSession.impersonatedUserId, calculates duration, logs impersonate_end.
 *   Returns redirectUrl to /admin/customers/[userId] (the customer's admin profile).
 *
 * Requires full admin elevation.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  const rawBody = await req.json().catch(() => ({}))
  const parsedBody = EndBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // ---------------------------------------------------------------------------
  // Support console end (impersonatedUserId is set)
  // ---------------------------------------------------------------------------
  if (ctx.adminSession.impersonatedUserId != null) {
    const targetUserId = ctx.adminSession.impersonatedUserId
    const timedOut = parsedBody.data.reason === "timeout"
    const endedAt = new Date()

    const summary = await endSupportImpersonation({
      adminSessionId: ctx.adminSession.id,
      adminUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      targetUserId,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      timedOut,
      requestMeta: {
        ipAddress,
        userAgent,
        requestId,
      },
    })

    if (summary.notifyCustomer) {
      const [profile, authUser] = await Promise.all([
        prismaAdmin.userProfile.findUnique({
          where: { userId: targetUserId },
          select: { displayName: true },
        }),
        prismaAdmin.$queryRaw<Array<{ email: string }>>`
          SELECT email FROM auth.users WHERE id = ${targetUserId}
        `,
      ])

      const targetEmail = authUser[0]?.email ?? null
      if (targetEmail) {
        const notificationMessageId = await sendSupportAccessNotificationEmail({
          customerEmail: targetEmail,
          customerName: profile?.displayName,
          staffEmail: ctx.userEmail,
          startedAt: ctx.adminSession.startedAt,
          endedAt,
        })

        await logAdminEvent({
          actorUserId: ctx.userId,
          actorEmail: ctx.userEmail,
          platformRole: ctx.platformRole.role,
          adminDeviceId: ctx.adminSession.adminDeviceId,
          adminSessionId: ctx.adminSession.id,
          action: timedOut ? "impersonate_timeout" : "impersonate_end",
          targetType: "user_profile",
          targetId: targetUserId,
          targetUserId,
          ipAddress,
          userAgent,
          requestId: `${requestId}-notification`,
          success: notificationMessageId !== null,
          details: {
            notifyCustomer: true,
            notificationSent: notificationMessageId !== null,
            notificationMessageId,
            durationSeconds: summary.durationSeconds,
            actionCount: summary.actionCount,
          },
        })
      }
    }

    const redirectUrl = `/admin/customers/${targetUserId}`
    return NextResponse.json({ impersonating: null, redirectUrl, timedOut })
  }

  // ---------------------------------------------------------------------------
  // Legacy tenant end
  // ---------------------------------------------------------------------------
  const previousTenantId = ctx.adminSession.impersonatedTenantId

  await prismaAdmin.adminSession.update({
    where: { id: ctx.adminSession.id },
    data: { impersonatedTenantId: null },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: ctx.adminSession.adminDeviceId,
    action: "impersonation_ended",
    targetType: "user_profile",
    targetId: previousTenantId ?? undefined,
    tenantId: previousTenantId ?? undefined,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ impersonating: null })
}
