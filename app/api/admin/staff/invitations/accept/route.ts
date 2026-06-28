import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const RequestSchema = z.object({
  token: z.string().min(1),
})

/**
 * POST /api/admin/staff/invitations/accept
 *
 * Accept a staff invitation. The accepting user must have a valid Supabase
 * session. This creates a PlatformRole for them with the invited role.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  // Require Supabase session
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required", code: "unauthenticated" }, { status: 401 })
  }

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

  const { token } = parsed.data

  const invitation = await prismaAdmin.staffInvitation.findUnique({
    where: { token },
  })

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found", code: "not_found" }, { status: 404 })
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "Invitation has already been used", code: "invitation_used" }, { status: 410 })
  }

  if (invitation.expiresAt < new Date()) {
    await prismaAdmin.staffInvitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    })
    return NextResponse.json({ error: "Invitation has expired", code: "invitation_expired" }, { status: 410 })
  }

  // Ensure the accepting user's email matches the invitation email
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This invitation is for a different email address", code: "email_mismatch" },
      { status: 403 }
    )
  }

  // Check if user already has a platform role
  const existingRole = await prismaAdmin.platformRole.findUnique({
    where: { userId: user.id },
  })
  if (existingRole) {
    return NextResponse.json({ error: "You already have a platform role", code: "role_exists" }, { status: 409 })
  }

  // Create PlatformRole and mark invitation accepted
  const [platformRole] = await prismaAdmin.$transaction([
    prismaAdmin.platformRole.create({
      data: {
        userId: user.id,
        role: invitation.role,
        status: "active",
        createdBy: invitation.createdBy,
      },
    }),
    prismaAdmin.staffInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
      },
    }),
  ])

  await logAdminEvent({
    actorUserId: invitation.createdBy,
    actorEmail: invitation.email,
    platformRole: invitation.role,
    action: "role_assigned",
    targetType: "platform_role",
    targetId: platformRole.id,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ role: platformRole.role }, { status: 201 })
}
