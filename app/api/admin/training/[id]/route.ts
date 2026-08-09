import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { generateRequestId, getIpAddress, getUserAgent } from "@/lib/admin/request"
import { canEditTrainingDraft } from "@/lib/help/trainingWorkflow"
import { Prisma } from "@/lib/generated/prisma/client"

const ContentSchema = z.record(z.string(), z.unknown())

const UpdateTrainingSchema = z
  .object({
    title: z.string().trim().min(3).max(180).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(180)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    summary: z.string().trim().max(500).nullable().optional(),
    content: ContentSchema.optional(),
    audience: z.enum(["public", "signed_in"]).optional(),
    featureKey: z.string().trim().max(80).nullable().optional(),
    routeHint: z.string().trim().max(200).nullable().optional(),
    destinationKeys: z.array(z.string().trim().min(1).max(100)).max(100).nullable().optional(),
  })
  .strict()

function toGuardResponse(err: unknown): NextResponse {
  if (err instanceof AdminGuardError) {
    const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
    return NextResponse.json({ error: "Unauthorized" }, { status })
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    return toGuardResponse(err)
  }

  const { id } = await params
  const item = await prismaAdmin.trainingContent.findUnique({
    where: { id },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 5,
        select: {
          id: true,
          revisionNumber: true,
          snapshotState: true,
          changeNote: true,
          actorUserId: true,
          createdAt: true,
        },
      },
      destinationUsages: {
        orderBy: { destinationKey: "asc" },
        select: {
          id: true,
          destinationKey: true,
          validationStatus: true,
          lastValidatedAt: true,
        },
      },
    },
  })

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ item })
}

export async function PATCH(
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
  const parsed = UpdateTrainingSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existing = await prismaAdmin.trainingContent.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!canEditTrainingDraft(existing.lifecycleState)) {
    return NextResponse.json({ error: "Only draft guides can be edited" }, { status: 400 })
  }

  const payload = parsed.data

  try {
    const updated = await prismaAdmin.trainingContent.update({
      where: { id },
      data: {
        title: payload.title,
        slug: payload.slug,
        summary: payload.summary,
        content: payload.content != null ? (payload.content as Prisma.InputJsonValue) : undefined,
        audience: payload.audience,
        featureKey: payload.featureKey,
        routeHint: payload.routeHint,
        destinationKeys:
          payload.destinationKeys !== undefined
            ? payload.destinationKeys === null
              ? Prisma.JsonNull
              : (payload.destinationKeys as Prisma.InputJsonValue)
            : undefined,
        updatedBy: guardContext.userId,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        lifecycleState: true,
        audience: true,
        updatedAt: true,
      },
    })

    await logAdminEvent({
      actorUserId: guardContext.userId,
      actorEmail: guardContext.userEmail,
      platformRole: guardContext.platformRole.role,
      adminSessionId: guardContext.adminSession.id,
      action: "training_content_updated",
      targetType: "training_content",
      targetId: id,
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestId,
      success: true,
      details: {
        updatedFields: Object.keys(payload),
      },
    })

    return NextResponse.json({ item: updated })
  } catch (err) {
    console.error("[admin-training-update]", err)

    await logAdminEvent({
      actorUserId: guardContext.userId,
      actorEmail: guardContext.userEmail,
      platformRole: guardContext.platformRole.role,
      adminSessionId: guardContext.adminSession.id,
      action: "training_content_updated",
      targetType: "training_content",
      targetId: id,
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestId,
      success: false,
      reason: "Update failed",
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
