import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
        rowsSkipped: true,
        rowsFailed: true,
        failureReason: true,
        createdAt: true,
        validatedAt: true,
        startedAt: true,
        completedAt: true,
      },
    }),
  )

  return NextResponse.json({ batches })
}
