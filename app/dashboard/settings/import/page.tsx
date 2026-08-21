import { redirect } from "next/navigation"

import { InvoiceImportClient } from "@/components/settings/InvoiceImportClient"
import { withUserContext } from "@/lib/db/withUserContext"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function ImportSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const batches = await withUserContext(user.id, (tx) =>
    tx.invoiceImportBatch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        status: true,
        duplicateMode: true,
        rowsTotal: true,
        rowsValid: true,
        rowsWarning: true,
        rowsFailed: true,
        rowsSkipped: true,
        createdAt: true,
        validatedAt: true,
        completedAt: true,
      },
    }),
  )

  return (
    <InvoiceImportClient
      initialBatches={batches.map((batch) => ({
        ...batch,
        createdAt: batch.createdAt.toISOString(),
        validatedAt: batch.validatedAt?.toISOString() ?? null,
        completedAt: batch.completedAt?.toISOString() ?? null,
      }))}
    />
  )
}
