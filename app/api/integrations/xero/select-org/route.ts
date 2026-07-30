import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { countActiveInvoiceSources, getInvoiceSourceLimitForTier } from "@/lib/billing"
import { syncConnection } from "@/lib/providers/accounting/sync"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

// This route runs an inline first sync (paginated invoice/contact fetches)
// before redirecting — raise the duration cap so it isn't killed mid-request.
export const maxDuration = 60

const selectOrgSchema = z.object({
  key: z.string().min(1),
  organisationId: z.string().min(1),
})

interface PendingXeroSelection {
  userId: string
  organisations: Array<{ id: string; name: string }>
  encryptedAccessToken: string
  encryptedRefreshToken: string
  tokenExpiresAt: string
  scopes: string
}

function redirectWithCode(code: string): NextResponse {
  return NextResponse.redirect(
    `${APP_URL}/dashboard/settings/connections?source=xero&code=${encodeURIComponent(code)}`
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${APP_URL}/sign-in`)
  }

  const formData = await request.formData()
  const parsed = selectOrgSchema.safeParse({
    key: formData.get("key"),
    organisationId: formData.get("organisationId"),
  })

  if (!parsed.success) {
    return redirectWithCode("invalid_selection")
  }

  const { key, organisationId } = parsed.data
  const cookieName = `xero_pending_${key}`
  const cookieStore = await cookies()
  const pendingRaw = cookieStore.get(cookieName)?.value
  if (!pendingRaw) {
    return redirectWithCode("selection_expired")
  }

  let pending: PendingXeroSelection
  try {
    pending = JSON.parse(pendingRaw) as PendingXeroSelection
  } catch {
    cookieStore.delete(cookieName)
    return redirectWithCode("invalid_selection")
  }

  if (pending.userId !== user.id) {
    cookieStore.delete(cookieName)
    return redirectWithCode("invalid_selection")
  }

  const organisation = pending.organisations.find((entry) => entry.id === organisationId)
  if (!organisation) {
    return redirectWithCode("invalid_selection")
  }

  let connectionId: string | null = null
  try {
    await withUserContext(user.id, async (tx) => {
      const existing = await tx.accountingConnection.findUnique({
        where: {
          userId_provider_organisationId: {
            userId: user.id,
            provider: "xero",
            organisationId: organisation.id,
          },
        },
        select: { id: true },
      })

      if (!existing) {
        const profile = await tx.userProfile.findUnique({
          where: { userId: user.id },
          select: { subscriptionTier: true },
        })
        const maxConnections = getInvoiceSourceLimitForTier(profile?.subscriptionTier)
        const activeConnections = await countActiveInvoiceSources(tx, user.id)
        if (activeConnections >= maxConnections) {
          throw new Error("CONNECTION_LIMIT_REACHED")
        }
      }

      const connection = await tx.accountingConnection.upsert({
        where: {
          userId_provider_organisationId: {
            userId: user.id,
            provider: "xero",
            organisationId: organisation.id,
          },
        },
        update: {
          organisationName: organisation.name,
          encryptedAccessToken: pending.encryptedAccessToken,
          encryptedRefreshToken: pending.encryptedRefreshToken,
          tokenExpiresAt: new Date(pending.tokenExpiresAt),
          scopes: pending.scopes,
          status: "pending_first_sync",
          lastSyncedAt: null,
        },
        create: {
          userId: user.id,
          provider: "xero",
          organisationId: organisation.id,
          organisationName: organisation.name,
          encryptedAccessToken: pending.encryptedAccessToken,
          encryptedRefreshToken: pending.encryptedRefreshToken,
          tokenExpiresAt: new Date(pending.tokenExpiresAt),
          scopes: pending.scopes,
          status: "pending_first_sync",
        },
      })

      connectionId = connection.id
    })
  } catch (err) {
    if (err instanceof Error && err.message === "CONNECTION_LIMIT_REACHED") {
      return redirectWithCode("connection_limit_reached")
    }
    return redirectWithCode("connection_save_failed")
  }

  cookieStore.delete(cookieName)

  if (connectionId) {
    try {
      await syncConnection(connectionId)
    } catch {
      // Sync is best-effort; callback UX should still return the user to settings.
    }
  }

  return redirectWithCode("connected")
}
