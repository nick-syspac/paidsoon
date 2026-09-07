/**
 * scripts/reset-myob-connection.ts
 *
 * Admin/support utility to reset a user's MYOB accounting connection(s)
 * on their behalf. Uses `prismaAdmin` because this runs out-of-band by an
 * operator, not on behalf of a signed-in request — there is no user session
 * to scope RLS with `withUserContext`.
 *
 * Two modes:
 *   - soft reset (default): mirrors what the user's own "Disconnect" button
 *     does — sets AccountingConnection.status = 'disconnected' and clears
 *     nextEmailAt on linked TrackedInvoices. The user can then reconnect via
 *     the normal MYOB OAuth flow.
 *   - hard delete (HARD_DELETE=true): fully removes the connection and its
 *     sync history/mappings so the next connect starts completely clean.
 *     Use this only when the soft reset isn't enough (e.g. a corrupted
 *     connection that fails to reconnect due to the unique
 *     [userId, provider, organisationId] constraint).
 *
 * Usage:
 *   USER_EMAIL=user@example.com npm run reset:myob-connection
 *   USER_ID=clxxxxxxxx npm run reset:myob-connection
 *   HARD_DELETE=true USER_EMAIL=user@example.com npm run reset:myob-connection
 *
 * Required env vars:
 *   One of USER_EMAIL or USER_ID
 *   SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD — canonical database inputs
 *   SUPABASE_SECRET_KEY — only required when using USER_EMAIL
 *
 * Optional env vars:
 *   HARD_DELETE — "true" to fully delete the connection instead of soft-disconnecting
 */

import "./_loadEnv"
import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"

const USER_EMAIL = process.env.USER_EMAIL
const USER_ID = process.env.USER_ID
const HARD_DELETE = process.env.HARD_DELETE === "true"

if (!USER_EMAIL && !USER_ID) {
  console.error("Error: one of USER_EMAIL or USER_ID environment variables is required")
  process.exit(1)
}

async function resolveUserId(): Promise<string> {
  if (USER_ID) return USER_ID

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required to resolve USER_EMAIL")
    process.exit(1)
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.error("Error listing users:", error.message)
    process.exit(1)
  }

  const user = data.users.find((u) => u.email?.toLowerCase() === USER_EMAIL!.toLowerCase())
  if (!user) {
    console.error(`No Supabase user found with email: ${USER_EMAIL}`)
    process.exit(1)
  }

  return user.id
}

async function main() {
  const userId = await resolveUserId()

  const connections = await prismaAdmin.accountingConnection.findMany({
    where: { userId, provider: "myob" },
    select: { id: true, organisationName: true, status: true },
  })

  if (connections.length === 0) {
    console.log(`No MYOB connections found for user ${userId}.`)
    return
  }

  console.log(
    `Found ${connections.length} MYOB connection(s) for user ${userId}. Mode: ${
      HARD_DELETE ? "HARD DELETE" : "soft disconnect"
    }`
  )

  for (const connection of connections) {
    console.log(`  - ${connection.id} (${connection.organisationName}, status=${connection.status})`)

    const linkedTrackedInvoiceIds = (
      await prismaAdmin.trackedInvoice.findMany({
        where: { financialInvoice: { accountingConnectionId: connection.id } },
        select: { id: true },
      })
    ).map((invoice) => invoice.id)

    await prismaAdmin.$transaction(async (tx) => {
      if (linkedTrackedInvoiceIds.length > 0) {
        await tx.trackedInvoice.updateMany({
          where: { id: { in: linkedTrackedInvoiceIds }, userId },
          data: { nextEmailAt: null },
        })
      }

      if (HARD_DELETE) {
        await tx.emailLog.deleteMany({ where: { trackedInvoiceId: { in: linkedTrackedInvoiceIds } } })
        await tx.promiseToPay.deleteMany({ where: { trackedInvoiceId: { in: linkedTrackedInvoiceIds } } })
        await tx.arrangementInvoiceCoverage.deleteMany({ where: { trackedInvoiceId: { in: linkedTrackedInvoiceIds } } })
        await tx.invoicePayment.deleteMany({ where: { trackedInvoiceId: { in: linkedTrackedInvoiceIds } } })
        await tx.trackedInvoice.deleteMany({ where: { id: { in: linkedTrackedInvoiceIds } } })
        await tx.financialPayment.deleteMany({ where: { accountingConnectionId: connection.id } })
        await tx.financialInvoice.deleteMany({ where: { accountingConnectionId: connection.id } })
        await tx.financialContact.deleteMany({ where: { accountingConnectionId: connection.id } })
        await tx.accountingSyncRun.deleteMany({ where: { accountingConnectionId: connection.id } })
        await tx.accountingConnection.delete({ where: { id: connection.id } })
      } else {
        await tx.accountingConnection.update({
          where: { id: connection.id },
          data: { status: "disconnected" },
        })
      }
    })
  }

  console.log("Done.")
}

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
