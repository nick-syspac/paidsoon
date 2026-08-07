import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { generateRequestId, getIpAddress, getUserAgent } from "@/lib/admin/request"
import { Prisma } from "@/lib/generated/prisma/client"

const ListQuerySchema = z.object({
  state: z.enum(["draft", "review", "published"]).optional(),
  audience: z.enum(["public", "signed_in"]).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
})

const ContentSchema = z.record(z.string(), z.unknown())

const CreateTrainingSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9-]+$/),
  summary: z.string().trim().max(500).optional(),
  content: ContentSchema,
  audience: z.enum(["public", "signed_in"]).default("signed_in"),
  featureKey: z.string().trim().max(80).optional(),
  routeHint: z.string().trim().max(200).optional(),
  destinationKeys: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
})

function toGuardResponse(err: unknown): NextResponse {
  if (err instanceof AdminGuardError) {
    const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
    return NextResponse.json({ error: "Unauthorized" }, { status })
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let guardContext: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    guardContext = await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    return toGuardResponse(err)
  }

  const parsed = ListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { state, audience, q, limit } = parsed.data

  const where: Prisma.TrainingContentWhereInput = {}
  if (state) where.lifecycleState = state
  if (audience) where.audience = audience
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ]
  }

  const items = await prismaAdmin.trainingContent.findMany({
    where,
    take: limit ?? 50,
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      lifecycleState: true,
      audience: true,
      featureKey: true,
      routeHint: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
    },
  })

  await logAdminEvent({
    actorUserId: guardContext.userId,
    actorEmail: guardContext.userEmail,
    platformRole: guardContext.platformRole.role,
    adminSessionId: guardContext.adminSession.id,
    action: "tenant_viewed",
    targetType: "training_content",
    ipAddress: getIpAddress(request),
    userAgent: getUserAgent(request),
    requestId: generateRequestId(),
    success: true,
    details: {
      state: state ?? null,
      audience: audience ?? null,
      hasQuery: !!q,
      count: items.length,
    },
  })

  return NextResponse.json({ items })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId()
  let guardContext: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    guardContext = await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    return toGuardResponse(err)
  }

  const parsed = CreateTrainingSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    await logAdminEvent({
      actorUserId: guardContext.userId,
      actorEmail: guardContext.userEmail,
      platformRole: guardContext.platformRole.role,
      adminSessionId: guardContext.adminSession.id,
      action: "training_content_created",
      targetType: "training_content",
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestId,
      success: false,
      reason: "Validation failed",
    })

    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const data = parsed.data
    const created = await prismaAdmin.trainingContent.create({
      data: {
        slug: data.slug,
        title: data.title,
        summary: data.summary ?? null,
        content: data.content as Prisma.InputJsonValue,
        lifecycleState: "draft",
        audience: data.audience,
        featureKey: data.featureKey ?? null,
        routeHint: data.routeHint ?? null,
        destinationKeys:
          data.destinationKeys != null
            ? (data.destinationKeys as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        createdBy: guardContext.userId,
        updatedBy: guardContext.userId,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        lifecycleState: true,
        audience: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await logAdminEvent({
      actorUserId: guardContext.userId,
      actorEmail: guardContext.userEmail,
      platformRole: guardContext.platformRole.role,
      adminSessionId: guardContext.adminSession.id,
      action: "training_content_created",
      targetType: "training_content",
      targetId: created.id,
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestId,
      success: true,
      details: {
        slug: created.slug,
        audience: created.audience,
        lifecycleState: created.lifecycleState,
      },
    })

    return NextResponse.json({ item: created }, { status: 201 })
  } catch (err) {
    console.error("[admin-training-create]", err)

    await logAdminEvent({
      actorUserId: guardContext.userId,
      actorEmail: guardContext.userEmail,
      platformRole: guardContext.platformRole.role,
      adminSessionId: guardContext.adminSession.id,
      action: "training_content_created",
      targetType: "training_content",
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestId,
      success: false,
      reason: "Create failed",
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
