/**
 * POST /api/integrations/myob/select-org
 *
 * Finalises a MYOB connection after the user picks a company file from the
 * selection UI shown when more than one company file was reachable by the
 * OAuth token (see /api/integrations/myob/callback).
 */
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
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

interface PendingMyobSelection {
  userId: string
  organisations: Array<{ id: string; name: string }>
  encryptedAccessToken: string
  encryptedRefreshToken: string
  tokenExpiresAt: string
  scopes: string
}

function redirectWithCode(code: string): NextResponse {
  return NextResponse.redirect(
    `${APP_URL}/dashboard/settings/connections?source=myob&code=${encodeURIComponent(code)}`
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
  const cookieName = `myob_pending_${key}`
  const cookieStore = await cookies()
  const pendingRaw = cookieStore.get(cookieName)?.value
  if (!pendingRaw) {
    return redirectWithCode("selection_expired")
  }

  let pending: PendingMyobSelection
  try {
    pending = JSON.parse(pendingRaw) as PendingMyobSelection
  } catch {
    cookieStore.delete(cookieName)
    return redirectWithCode("invalid_selection")
  }

  if (pending.userId !== user.id) {
    cookieStore.delete(cookieName)
    return redirectWithCode("invalid_selection")
  }

  const companyFile = pending.organisations.find((entry) => entry.id === organisationId)
  if (!companyFile) {
    return redirectWithCode("invalid_selection")
  }

  let connectionId: string | null = null
  try {
    await withUserContext(user.id, async (tx) => {
      const connection = await tx.accountingConnection.upsert({
        where: {
          userId_provider_organisationId: {
            userId: user.id,
            provider: "myob",
            organisationId: companyFile.id,
          },
        },
        update: {
          organisationName: companyFile.name,
          encryptedAccessToken: pending.encryptedAccessToken,
          encryptedRefreshToken: pending.encryptedRefreshToken,
          tokenExpiresAt: new Date(pending.tokenExpiresAt),
          scopes: pending.scopes,
          status: "pending_first_sync",
          lastSyncedAt: null,
        },
        create: {
          userId: user.id,
          provider: "myob",
          organisationId: companyFile.id,
          organisationName: companyFile.name,
          encryptedAccessToken: pending.encryptedAccessToken,
          encryptedRefreshToken: pending.encryptedRefreshToken,
          tokenExpiresAt: new Date(pending.tokenExpiresAt),
          scopes: pending.scopes,
          status: "pending_first_sync",
        },
      })

      connectionId = connection.id
    })
  } catch {
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
