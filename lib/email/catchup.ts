import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getProvider } from "@/lib/providers"
import { getInvoiceLimitForTier } from "@/lib/billing"
import { computeNextEmailAt } from "@/lib/email/schedule"
import type { NormalizedInvoice } from "@/lib/providers/types"

/**
 * Scan all active Stripe connections for overdue invoices not yet tracked.
 * Creates new TrackedInvoice records, respecting per-tier limits.
 */
export async function runCatchUpScan() {
  const connections = await prisma.invoiceConnection.findMany({
    where: { isActive: true, provider: "stripe" },
    include: { userProfile: { select: { subscriptionTier: true } } },
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

    const tierLimit = getInvoiceLimitForTier(connection.userProfile.subscriptionTier)

    for (const invoice of overdueInvoices) {
      // Idempotency check
      const existing = await prisma.trackedInvoice.findFirst({
        where: {
          externalId: invoice.externalId,
          provider: "stripe",
          userId: connection.userId,
        },
      })
      if (existing) continue

      // Tier limit check
      const activeCount = await prisma.trackedInvoice.count({
        where: {
          userId: connection.userId,
          status: { in: ["pending", "snoozed"] },
        },
      })
      if (activeCount >= tierLimit) continue

      const schedule = await prisma.schedule.findUnique({
        where: { userId: connection.userId },
      })
      const nextEmailAt = computeNextEmailAt(
        invoice.dueDate,
        1,
        schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }
      )

      await prisma.trackedInvoice.create({
        data: {
          userId: connection.userId,
          invoiceConnectionId: connection.id,
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
  }
}
