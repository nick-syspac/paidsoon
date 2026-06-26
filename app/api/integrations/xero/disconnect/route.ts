/**
 * POST /api/integrations/xero/disconnect
 *
 * Disconnects a Xero accounting connection.
 * - Verifies user owns the connection
 * - Calls revokeToken (best-effort — does not fail if revocation errors)
 * - Marks connection status as 'disconnected'
 * - Transitions any active TrackedInvoices from this connection to 'paused'
 *   by clearing nextEmailAt (stops reminder emails)
 *
 * Request body: { connectionId: string }
 */
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { decryptToken } from "@/lib/providers/accounting/crypto"
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

  let encryptedRefreshToken: string | null = null

  try {
    await withUserContext(user.id, async (tx) => {
      // Verify ownership and fetch token for revocation
      const connection = await tx.accountingConnection.findUnique({
        where: { id: connectionId },
        select: { userId: true, status: true, encryptedRefreshToken: true, provider: true },
      })

      if (!connection || connection.userId !== user.id) {
        throw Object.assign(new Error("NOT_FOUND"), { status: 404 })
      }

      encryptedRefreshToken = connection.encryptedRefreshToken

      // Mark as disconnected
      await tx.accountingConnection.update({
        where: { id: connectionId },
        data: { status: "disconnected" },
      })

      // Pause active invoices from this connection (clear nextEmailAt)
      // by finding all ProviderInvoiceMappings for this connection and
      // setting nextEmailAt = null on the linked TrackedInvoices
      const mappings = await tx.providerInvoiceMapping.findMany({
        where: { accountingConnectionId: connectionId },
        select: { trackedInvoiceId: true },
      })

      if (mappings.length > 0) {
        const trackedIds = mappings.map((m) => m.trackedInvoiceId)
        await tx.trackedInvoice.updateMany({
          where: {
            id: { in: trackedIds },
            userId: user.id,
          },
          data: { nextEmailAt: null },
        })
      }
    })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if ("status" in err && (err as { status: number }).status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
    }
    console.error("[xero/disconnect] error", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  // Revoke the refresh token at Xero (best-effort, after DB update)
  if (encryptedRefreshToken) {
    try {
      const provider = getAccountingProvider("xero")
      const refreshToken = decryptToken(encryptedRefreshToken)
      await provider.revokeToken(refreshToken)
    } catch (err) {
      // Best-effort — token revocation failure does not block disconnect
      console.warn("[xero/disconnect] revokeToken failed", err)
    }
  }

  return NextResponse.json({ success: true })
}
