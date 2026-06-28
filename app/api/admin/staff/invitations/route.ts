import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import * as crypto from "crypto"
import { Resend } from "resend"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const resend = new Resend(process.env.RESEND_API_KEY)
const INVITATION_TTL_HOURS = 72

const RequestSchema = z.object({
  email: z.email(),
  role: z.enum(["platform_admin", "platform_support"]),
})

/**
 * POST /api/admin/staff/invitations
 *
 * Create a staff invitation. Requires platform_owner or platform_admin role.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  // platform_owner role cannot be assigned via invitation (Design D8)
  // Only platform_admin and platform_support are allowed — enforced by schema above.

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { email, role } = parsed.data

  // Check for existing pending invitation for this email
  const existingInvitation = await prismaAdmin.staffInvitation.findFirst({
    where: { email, status: "pending", expiresAt: { gt: new Date() } },
  })
  if (existingInvitation) {
    return NextResponse.json({ error: "A pending invitation already exists for this email" }, { status: 409 })
  }

  const token = crypto.randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 60 * 60 * 1000)

  const invitation = await prismaAdmin.staffInvitation.create({
    data: {
      email,
      role,
      token,
      status: "pending",
      createdBy: ctx.userId,
      expiresAt,
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  })

  // Send invitation email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const acceptUrl = `${appUrl}/admin/invitations/accept?token=${token}`

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@paidsoon.io",
    to: email,
    subject: "You've been invited to join PaidSoon platform team",
    html: `
      <p>You have been invited to join the PaidSoon platform team as <strong>${role}</strong>.</p>
      <p>Click the link below to accept your invitation (expires in ${INVITATION_TTL_HOURS} hours):</p>
      <p><a href="${acceptUrl}">${acceptUrl}</a></p>
      <p>If you did not expect this invitation, please ignore this email.</p>
    `,
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    action: "staff_invited",
    targetType: "staff_invitation",
    targetId: invitation.id,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ invitation }, { status: 201 })
}
