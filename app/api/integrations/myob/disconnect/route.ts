/**
 * POST /api/integrations/myob/disconnect
 *
 * Disconnects a MYOB accounting connection.
 * - Verifies user owns the connection
 * - Marks connection status as 'disconnected'
 * - Pauses active TrackedInvoices linked to this connection (clears nextEmailAt)
 *
 * MYOB has no token revocation endpoint so revokeToken is a no-op.
 *
 * Request body: { connectionId: string }
 */
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
  connectionId: z.string().min(1),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { connectionId } = parsed.data

  try {
    await withUserContext(user.id, async (tx) => {
      const connection = await tx.accountingConnection.findUnique({
        where: { id: connectionId },
        select: { userId: true, status: true },
      })

      if (!connection || connection.userId !== user.id) {
        throw Object.assign(new Error("NOT_FOUND"), { status: 404 })
      }

      await tx.accountingConnection.update({
        where: { id: connectionId },
        data: { status: "disconnected" },
      })

      // Pause active invoices from this connection via the canonical link.
      await tx.trackedInvoice.updateMany({
        where: {
          userId: user.id,
          financialInvoice: { accountingConnectionId: connectionId },
        },
        data: { nextEmailAt: null },
      })
    })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ("status" in err && (err as { status: number }).status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
    }
    console.error("[myob/disconnect] error", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
