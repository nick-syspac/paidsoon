import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { CreateArrangementSchema } from "@/lib/arrangements"

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = CreateArrangementSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const invoices = await tx.trackedInvoice.findMany({
      where: {
        id: { in: parsed.data.invoiceIds },
        userId: user.id,
        status: { in: ["pending", "paused", "snoozed", "sequence_complete"] },
      },
      select: {
        id: true,
        userId: true,
        clientEmail: true,
        clientName: true,
        currency: true,
      },
    })

    if (invoices.length !== parsed.data.invoiceIds.length) {
      return { ok: false as const, status: 404, error: "One or more invoices were not found" }
    }

    const debtorEmails = new Set(invoices.map((invoice) => invoice.clientEmail.toLowerCase()))
    if (debtorEmails.size !== 1) {
      return {
        ok: false as const,
        status: 422,
        error: "All invoices must belong to the same client for one arrangement",
      }
    }

    const currencies = new Set(invoices.map((invoice) => invoice.currency.toLowerCase()))
    if (currencies.size !== 1) {
      return {
        ok: false as const,
        status: 422,
        error: "All invoices in an arrangement must use the same currency",
      }
    }

    const debtorEmail = invoices[0].clientEmail
    const arrangement = await tx.arrangement.create({
      data: {
        userId: user.id,
        debtorEmail,
        debtorName: invoices[0].clientName,
        arrangementType: parsed.data.arrangementType,
        status: "active",
        promisedPayBy: parsed.data.promisedPayBy ? new Date(parsed.data.promisedPayBy) : null,
        agreedAmount: parsed.data.agreedAmount ?? null,
        currency: (parsed.data.currency ?? invoices[0].currency).toLowerCase(),
        planSchedule: parsed.data.planSchedule,
        termsNotes: parsed.data.termsNotes?.trim() ?? null,
        expiresAt: parsed.data.promisedPayBy ? new Date(parsed.data.promisedPayBy) : null,
        coverages: {
          createMany: {
            data: invoices.map((invoice) => ({
              trackedInvoiceId: invoice.id,
              userId: user.id,
              debtorEmail,
            })),
          },
        },
      },
      include: {
        coverages: {
          select: { trackedInvoiceId: true },
        },
      },
    })

    return {
      ok: true as const,
      arrangement: {
        id: arrangement.id,
        status: arrangement.status,
        arrangementType: arrangement.arrangementType,
        debtorEmail: arrangement.debtorEmail,
        invoiceIds: arrangement.coverages.map((coverage) => coverage.trackedInvoiceId),
      },
    }
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ arrangement: result.arrangement }, { status: 201 })
}
