import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { connectionId?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Keep backwards compatibility for callers that send no body.
  }

  const result = await withUserContext(user.id, async (tx) => {
    const connection = await tx.invoiceConnection.findFirst({
      where: {
        userId: user.id,
        provider: "stripe",
        isActive: true,
        ...(body.connectionId ? { id: body.connectionId } : {}),
      },
    })
    if (!connection) return { ok: false as const }

    // Already inside a transaction — sequential awaits replace prisma.$transaction([])
    await tx.invoiceConnection.update({
      where: { id: connection.id },
      data: { isActive: false },
    })
    await tx.trackedInvoice.updateMany({
      where: {
        invoiceConnectionId: connection.id,
        status: { in: ["pending", "snoozed"] },
      },
      data: { status: "paused" },
    })
    return { ok: true as const }
  })

  if (!result.ok) {
    return NextResponse.json({ error: "No active connection" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
