import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { generateRequestId, getIpAddress, getUserAgent } from "@/lib/admin/request"
import { canSubmitTrainingForReview } from "@/lib/help/trainingWorkflow"

function toGuardResponse(err: unknown): NextResponse {
  if (err instanceof AdminGuardError) {
    const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
    return NextResponse.json({ error: "Unauthorized" }, { status })
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = generateRequestId()

  let guardContext: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    guardContext = await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    return toGuardResponse(err)
  }

  const { id } = await params

  const item = await prismaAdmin.trainingContent.findUnique({ where: { id } })
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!canSubmitTrainingForReview(item.lifecycleState)) {
    return NextResponse.json({ error: "Only draft guides can be submitted" }, { status: 400 })
  }

  const updated = await prismaAdmin.trainingContent.update({
    where: { id },
    data: {
      lifecycleState: "review",
      updatedBy: guardContext.userId,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      lifecycleState: true,
      updatedAt: true,
    },
  })

  await logAdminEvent({
    actorUserId: guardContext.userId,
    actorEmail: guardContext.userEmail,
    platformRole: guardContext.platformRole.role,
    adminSessionId: guardContext.adminSession.id,
    action: "training_submitted_for_review",
    targetType: "training_content",
    targetId: id,
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    requestId,
    success: true,
    details: {
      previousState: item.lifecycleState,
      nextState: updated.lifecycleState,
    },
  })

  return NextResponse.json({ item: updated })
}
