import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const arrangement = await withUserContext(user.id, async (tx) => {
    // Explicit userId re-check alongside the RLS-scoped query (defense in
    // depth per backend-api.instructions.md): never leak existence of an
    // arrangement belonging to another user.
    return tx.arrangement.findFirst({
      where: { id, userId: user.id },
      include: {
        coverages: {
          orderBy: { createdAt: "asc" },
          include: {
            trackedInvoice: {
              select: {
                id: true,
                clientName: true,
                clientEmail: true,
                amountDue: true,
                currency: true,
                status: true,
              },
            },
          },
        },
      },
    })
  })

  if (!arrangement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    arrangement: {
      id: arrangement.id,
      arrangementType: arrangement.arrangementType,
      status: arrangement.status,
      promisedPayBy: arrangement.promisedPayBy,
      agreedAmount: arrangement.agreedAmount,
      currency: arrangement.currency,
      planSchedule: arrangement.planSchedule,
      termsNotes: arrangement.termsNotes,
      expiresAt: arrangement.expiresAt,
      breachedAt: arrangement.breachedAt,
      fulfilledAt: arrangement.fulfilledAt,
      createdAt: arrangement.createdAt,
      coverages: arrangement.coverages.map((coverage) => ({
        invoiceId: coverage.trackedInvoiceId,
        clientName: coverage.trackedInvoice.clientName,
        clientEmail: coverage.trackedInvoice.clientEmail,
        amountDue: coverage.trackedInvoice.amountDue,
        currency: coverage.trackedInvoice.currency,
        status: coverage.trackedInvoice.status,
      })),
    },
  })
}
