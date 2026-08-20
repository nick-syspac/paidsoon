import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const raw = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const disputeResolvedAt = new Date()

  const result = await withUserContext(user.id, async (tx) => {
    const invoice = await tx.trackedInvoice.findFirst({
      where: { id, userId: user.id, status: "disputed" },
    })
    if (!invoice) return { ok: false as const }

    await tx.trackedInvoice.update({
      where: { id },
      data: {
        status: "pending",
        // resolution note (if provided) replaces the original dispute note; otherwise it's cleared
        disputeNote: parsed.data.note ?? null,
        disputeResolvedAt,
      },
    })
    return { ok: true as const }
  })

  if (!result.ok) return NextResponse.json({ error: "Not found or not disputed" }, { status: 404 })
  return NextResponse.json({ success: true })
}
