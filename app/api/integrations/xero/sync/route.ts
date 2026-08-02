/**
 * POST /api/integrations/xero/sync
 *
 * Manually triggers a sync for a specific Xero accounting connection.
 * The user must own the connection.
 *
 * Request body: { connectionId: string }
 * Response: SyncResult JSON
 */
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { triggerSyncNow } from "@/lib/providers/accounting/triggerSyncNow"
import { NextResponse } from "next/server"
import { z } from "zod"

// Paginated invoice/contact fetches against the provider can take a while —
// raise the duration cap so a slow-but-successful sync isn't killed mid-request.
export const maxDuration = 60

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

  // Verify ownership via RLS context
  const connection = await withUserContext(user.id, async (tx) =>
    tx.accountingConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, userId: true, provider: true, status: true },
    })
  )

  if (!connection || connection.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (connection.provider !== "xero") {
    return NextResponse.json({ error: "Connection is not a Xero connection" }, { status: 400 })
  }

  if (connection.status !== "active") {
    return NextResponse.json({ error: "Connection is not active" }, { status: 400 })
  }

  const result = await triggerSyncNow(connectionId, user.id)
  return NextResponse.json(result)
}
