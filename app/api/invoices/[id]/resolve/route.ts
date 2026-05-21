import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

// POST /api/invoices/[id]/resolve
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const invoice = await prisma.trackedInvoice.findFirst({
    where: { id, userId: user.id },
  })
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.trackedInvoice.update({
    where: { id },
    data: { status: "manually_resolved" },
  })

  return NextResponse.json({ success: true })
}
