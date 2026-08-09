import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"

function toGuardResponse(err: unknown): NextResponse {
  if (err instanceof AdminGuardError) {
    const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
    return NextResponse.json({ error: "Unauthorized" }, { status })
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    return toGuardResponse(err)
  }

  const { id } = await params

  const content = await prismaAdmin.trainingContent.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!content) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const items = await prismaAdmin.trainingRevision.findMany({
    where: { trainingContentId: id },
    orderBy: [{ revisionNumber: "desc" }],
    select: {
      id: true,
      revisionNumber: true,
      snapshotState: true,
      changeNote: true,
      actorUserId: true,
      restoredFromRevisionId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ items })
}
