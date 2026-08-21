import { NextResponse } from "next/server"

import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ profileId: string }> }

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { profileId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const existing = await tx.invoiceImportMappingProfile.findFirst({
      where: { id: profileId, userId: user.id },
      select: { id: true },
    })
    if (!existing) return { ok: false as const }

    await tx.invoiceImportMappingProfile.delete({ where: { id: profileId } })
    return { ok: true as const }
  })

  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
