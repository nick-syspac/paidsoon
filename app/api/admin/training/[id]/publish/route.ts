import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { generateRequestId, getIpAddress, getUserAgent } from "@/lib/admin/request"
import { canPublishTraining } from "@/lib/help/trainingWorkflow"
import type { Prisma } from "@/lib/generated/prisma/client"

const PublishSchema = z
  .object({
    changeNote: z.string().trim().min(3).max(240).optional(),
  })
  .strict()

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

  const parsed = PublishSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params

  const existing = await prismaAdmin.trainingContent.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!canPublishTraining(existing.lifecycleState)) {
    return NextResponse.json({ error: "Only review guides can be published" }, { status: 400 })
  }

  const updated = await prismaAdmin.$transaction(async (tx) => {
    const latestRevision = await tx.trainingRevision.findFirst({
      where: { trainingContentId: id },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    })

    const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1

    const next = await tx.trainingContent.update({
      where: { id },
      data: {
        lifecycleState: "published",
        publishedAt: new Date(),
        updatedBy: guardContext.userId,
      },
    })

    await tx.trainingRevision.create({
      data: {
        trainingContentId: id,
        revisionNumber,
        snapshotState: "published",
        snapshot: {
          title: next.title,
          slug: next.slug,
          summary: next.summary,
          content: next.content,
          audience: next.audience,
          featureKey: next.featureKey,
          routeHint: next.routeHint,
          destinationKeys: next.destinationKeys,
        } as Prisma.InputJsonValue,
        changeNote: parsed.data.changeNote ?? "Published",
        actorUserId: guardContext.userId,
      },
    })

    return next
  })

  await logAdminEvent({
    actorUserId: guardContext.userId,
    actorEmail: guardContext.userEmail,
    platformRole: guardContext.platformRole.role,
    adminSessionId: guardContext.adminSession.id,
    action: "training_published",
    targetType: "training_content",
    targetId: id,
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    requestId,
    success: true,
    details: {
      previousState: existing.lifecycleState,
      nextState: updated.lifecycleState,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
      changeNote: parsed.data.changeNote ?? null,
    },
  })

  return NextResponse.json({
    item: {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      lifecycleState: updated.lifecycleState,
      audience: updated.audience,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
}
