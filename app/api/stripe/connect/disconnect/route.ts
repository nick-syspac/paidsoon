import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connection = await prisma.invoiceConnection.findFirst({
    where: { userId: user.id, provider: "stripe", isActive: true },
  })

  if (!connection) {
    return NextResponse.json({ error: "No active connection" }, { status: 404 })
  }

  // Deactivate connection and pause all pending invoices for this connection
  await prisma.$transaction([
    prisma.invoiceConnection.update({
      where: { id: connection.id },
      data: { isActive: false },
    }),
    prisma.trackedInvoice.updateMany({
      where: {
        invoiceConnectionId: connection.id,
        status: { in: ["pending", "snoozed"] },
      },
      data: { status: "paused" },
    }),
  ])

  return NextResponse.json({ success: true })
}
