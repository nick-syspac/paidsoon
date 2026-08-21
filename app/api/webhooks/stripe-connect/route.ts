import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getProvider } from "@/lib/providers"
import { computeNextEmailAt } from "@/lib/email/schedule"
import { findOrCreateCustomer } from "@/lib/db/customers"
import { NextResponse } from "next/server"
import type { NormalizedInvoice } from "@/lib/providers/types"

export async function POST(request: Request) {
  const payload = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => { headers[key] = value })

  const provider = getProvider("stripe")

  const isValid = provider.verifyWebhookSignature(
    payload,
    headers,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET!
  )

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const event = provider.parseWebhookEvent(payload)

  if (event.type === "invoice.overdue" && event.invoice) {
    await handleOverdueInvoice(event.invoice, event.connectedAccountId)
  }

  if (event.type === "invoice.paid" && event.externalId) {
    await handleInvoicePaid(event.externalId, event.connectedAccountId)
  }

  return NextResponse.json({ received: true })
}

async function handleOverdueInvoice(
  invoice: NormalizedInvoice,
  connectedAccountId?: string
) {
  if (!connectedAccountId) return

  // Find the connection
  const connection = await prisma.invoiceConnection.findFirst({
    where: { stripeConnectAccountId: connectedAccountId, isActive: true },
  })
  if (!connection) return

  // Idempotency: skip if already tracked
  const existing = await prisma.trackedInvoice.findFirst({
    where: {
      externalId: invoice.externalId,
      provider: "stripe",
      userId: connection.userId,
    },
  })
  if (existing) return

  // Every synced invoice is created and stays visible regardless of the
  // account's chase-volume allowance — the allowance only governs whether
  // follow-up begins, enforced at send time by the cron
  // (app/api/cron/send-emails/route.ts), not at ingest.

  // Compute first email send date
  const schedule = await prisma.schedule.findUnique({
    where: { userId: connection.userId },
  })
  const nextEmailAt = computeNextEmailAt(
    invoice.dueDate,
    1,
    schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }
  )

  const customer = await findOrCreateCustomer(
    prisma,
    connection.userId,
    invoice.clientEmail,
    invoice.clientName,
  )

  await prisma.trackedInvoice.create({
    data: {
      userId: connection.userId,
      invoiceConnectionId: connection.id,
      customerId: customer.id,
      externalId: invoice.externalId,
      provider: "stripe",
      clientEmail: invoice.clientEmail,
      clientName: invoice.clientName,
      amountDue: invoice.amountDue,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      status: "pending",
      currentStage: 0,
      nextEmailAt,
    },
  })
}

async function handleInvoicePaid(
  externalId: string,
  connectedAccountId?: string
) {
  if (!connectedAccountId) return

  const connection = await prisma.invoiceConnection.findFirst({
    where: { stripeConnectAccountId: connectedAccountId, isActive: true },
  })
  if (!connection) return

  await prisma.trackedInvoice.updateMany({
    where: {
      externalId,
      provider: "stripe",
      userId: connection.userId,
      status: { not: "paid" },
    },
    data: { status: "paid" },
  })

  // Mark any active promise as kept — the client followed through.
  const paidInvoice = await prisma.trackedInvoice.findFirst({
    where: { externalId, provider: "stripe", userId: connection.userId },
    select: { id: true },
  })
  if (paidInvoice) {
    await prisma.promiseToPay.updateMany({
      where: { trackedInvoiceId: paidInvoice.id, status: "active" },
      data: { status: "kept" },
    })

    const linkedArrangements = await prisma.arrangementInvoiceCoverage.findMany({
      where: {
        trackedInvoiceId: paidInvoice.id,
        arrangement: { status: "active" },
      },
      select: { arrangementId: true },
      distinct: ["arrangementId"],
    })

    for (const coverage of linkedArrangements) {
      const unresolvedCoveredInvoices = await prisma.arrangementInvoiceCoverage.count({
        where: {
          arrangementId: coverage.arrangementId,
          trackedInvoice: { status: { notIn: ["paid", "manually_resolved"] } },
        },
      })

      if (unresolvedCoveredInvoices === 0) {
        await prisma.arrangement.updateMany({
          where: { id: coverage.arrangementId, status: "active" },
          data: { status: "fulfilled", fulfilledAt: new Date() },
        })
      }
    }
  }
}
