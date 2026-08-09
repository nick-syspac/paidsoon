import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { generateRequestId, getIpAddress, getUserAgent } from "@/lib/admin/request"
import { Prisma } from "@/lib/generated/prisma/client"

const RestoreSchema = z
  .object({
    revisionId: z.string().min(1),
    changeNote: z.string().trim().min(3).max(240).optional(),
  })
  .strict()

const SnapshotSchema = z
  .object({
    title: z.string().min(3).max(180),
    slug: z.string().min(2).max(180),
    summary: z.string().max(500).nullable().optional(),
    content: z.record(z.string(), z.unknown()),
    audience: z.enum(["public", "signed_in"]),
    featureKey: z.string().max(80).nullable().optional(),
    routeHint: z.string().max(200).nullable().optional(),
    destinationKeys: z.array(z.string().min(1).max(100)).nullable().optional(),
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

  const parsed = RestoreSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const { revisionId, changeNote } = parsed.data

  const revision = await prismaAdmin.trainingRevision.findUnique({
    where: { id: revisionId },
  })

  if (!revision || revision.trainingContentId !== id) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 })
  }

  const snapshotParsed = SnapshotSchema.safeParse(revision.snapshot)
  if (!snapshotParsed.success) {
    return NextResponse.json({ error: "Revision snapshot is not restorable" }, { status: 400 })
  }

  const snapshot = snapshotParsed.data

  const restored = await prismaAdmin.$transaction(async (tx) => {
    const latestRevision = await tx.trainingRevision.findFirst({
      where: { trainingContentId: id },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    })

    const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1

    const next = await tx.trainingContent.update({
      where: { id },
      data: {
        title: snapshot.title,
        slug: snapshot.slug,
        summary: snapshot.summary ?? null,
        content: snapshot.content as Prisma.InputJsonValue,
        audience: snapshot.audience,
        featureKey: snapshot.featureKey ?? null,
        routeHint: snapshot.routeHint ?? null,
        destinationKeys:
          snapshot.destinationKeys === null || snapshot.destinationKeys === undefined
            ? Prisma.JsonNull
            : (snapshot.destinationKeys as Prisma.InputJsonValue),
        lifecycleState: "draft",
        publishedAt: null,
        updatedBy: guardContext.userId,
      },
    })

    await tx.trainingRevision.create({
      data: {
        trainingContentId: id,
        revisionNumber,
        snapshotState: "draft",
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
        changeNote: changeNote ?? `Restored from revision ${revision.revisionNumber}`,
        actorUserId: guardContext.userId,
        restoredFromRevisionId: revision.id,
      },
    })

    return next
  })

  await logAdminEvent({
    actorUserId: guardContext.userId,
    actorEmail: guardContext.userEmail,
    platformRole: guardContext.platformRole.role,
    adminSessionId: guardContext.adminSession.id,
    action: "training_restored",
    targetType: "training_content",
    targetId: id,
    resourceId: revision.id,
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    requestId,
    success: true,
    details: {
      restoredFromRevisionId: revision.id,
      restoredFromRevisionNumber: revision.revisionNumber,
      nextState: restored.lifecycleState,
    },
  })

  return NextResponse.json({
    item: {
      id: restored.id,
      slug: restored.slug,
      title: restored.title,
      lifecycleState: restored.lifecycleState,
      audience: restored.audience,
      publishedAt: restored.publishedAt?.toISOString() ?? null,
      updatedAt: restored.updatedAt.toISOString(),
    },
  })
}
