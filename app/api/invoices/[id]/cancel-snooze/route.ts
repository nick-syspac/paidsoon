import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

// POST /api/invoices/[id]/cancel-snooze — manually end an in-progress snooze early
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await withUserContext(user.id, async (tx) => {
    const invoice = await tx.trackedInvoice.findFirst({
      where: { id, userId: user.id, status: "snoozed" },
    })
    if (!invoice) return { ok: false as const }

    await tx.trackedInvoice.update({
      where: { id },
      data: { status: "pending", snoozedUntil: null },
    })
    return { ok: true as const }
  })

  if (!result.ok) return NextResponse.json({ error: "Not found or not snoozed" }, { status: 404 })
  return NextResponse.json({ success: true })
}
