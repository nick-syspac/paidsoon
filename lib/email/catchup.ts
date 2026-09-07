import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getProvider } from "@/lib/providers"
import { computeNextEmailAt } from "@/lib/email/schedule"
import { findOrCreateCustomer } from "@/lib/db/customers"
import { upsertFinancialInvoice } from "@/lib/financial/ingest"
import type { NormalizedInvoice } from "@/lib/providers/types"

/**
 * Scan all active Stripe connections for overdue invoices not yet tracked.
 * Creates new TrackedInvoice records for every synced invoice, regardless of
 * the account's chase-volume allowance — allowance only governs whether
 * follow-up begins, enforced at send time by the cron
 * (app/api/cron/send-emails/route.ts), not at ingest.
 */
export async function runCatchUpScan() {
  const connections = await prisma.invoiceConnection.findMany({
    where: { isActive: true, provider: "stripe" },
  })

  const provider = getProvider("stripe")

  for (const connection of connections) {
    if (!connection.stripeConnectAccountId) continue

    let overdueInvoices: NormalizedInvoice[] = []
    try {
      overdueInvoices = await provider.getOverdueInvoices({
        stripeConnectAccountId: connection.stripeConnectAccountId,
      })
    } catch (err) {
      console.error(`Catch-up scan failed for connection ${connection.id}:`, err)
      continue
    }

    for (const invoice of overdueInvoices) {
      // Idempotency check against the canonical source key
      const existing = await prisma.financialInvoice.findUnique({
        where: {
          userId_sourceSystem_sourceId: {
            userId: connection.userId,
            sourceSystem: "stripe",
            sourceId: invoice.externalId,
          },
        },
        select: { id: true },
      })
      if (existing) continue

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
        "stripe",
      )

      const { invoice: financialInvoice } = await upsertFinancialInvoice(prisma, {
        userId: connection.userId,
        sourceSystem: "stripe",
        sourceId: invoice.externalId,
        contactId: customer.financialContactId,
        amountDueCents: invoice.amountDue,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        paymentUrl: invoice.paymentUrl ?? null,
      })

      await prisma.trackedInvoice.create({
        data: {
          userId: connection.userId,
          invoiceConnectionId: connection.id,
          financialInvoiceId: financialInvoice.id,
          customerId: customer.id,
          status: "pending",
          currentStage: 0,
          nextEmailAt,
        },
      })
    }
  }
}
