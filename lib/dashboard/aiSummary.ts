import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"
import { daysBetween, formatCents, startOfUtcDay } from "@/lib/dashboard/format"
import { formatAudCents } from "@/lib/dashboard/spendleakPresentation"
import { computeOutstanding } from "@/lib/invoices/payments"

export interface AiSummaryLine {
  id: string
  text: string
}

export interface AiSpendLeakSummaryInput {
  hasAccess: boolean
  hasAccountingConnection: boolean
  findingCount: number
  statusTitle: string
  topModuleTitle: string | null
  topModuleFindingCount: number
  topModuleAnnualCents: number
}

/**
 * Builds the "AI Summary" widget's lines. This is a deterministic,
 * template-based summary over real numbers already computed elsewhere on
 * the dashboard — not an actual model call (no new AI provider dependency;
 * see copilot-instructions.md "Never introduce a new provider ... without
 * documenting why"). Every line is only shown when there's real data behind
 * it — nothing is fabricated.
 */
export function buildAiSummary(input: {
  displayName: string | null
  activeInvoices: InvoiceWithRelations[]
  paidInvoices: Pick<PaidInvoiceSummary, "amountDue" | "currency" | "updatedAt">[]
  brokenPromiseCountsByDebtor: Record<string, number>
  spendLeak?: AiSpendLeakSummaryInput
  now?: Date
}): AiSummaryLine[] {
  const now = input.now ?? new Date()
  const todayStart = startOfUtcDay(now)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

  const name = input.displayName?.trim() || "there"
  const hour = now.getUTCHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  const currency = input.activeInvoices[0]?.currency ?? input.paidInvoices[0]?.currency ?? "usd"
  const outstandingCount = input.activeInvoices.length
  const outstandingTotal = input.activeInvoices.reduce(
    (sum, invoice) => sum + computeOutstanding(invoice, invoice.payments),
    0,
  )

  const newlyOverdueCount = input.activeInvoices.filter((invoice) => {
    const due = new Date(invoice.dueDate)
    return due >= todayStart && due <= now
  }).length

  const paidYesterday = input.paidInvoices.filter((invoice) => {
    const paidAt = new Date(invoice.updatedAt)
    return paidAt >= yesterdayStart && paidAt < todayStart
  })
  const paidYesterdayTotal = paidYesterday.reduce((sum, invoice) => sum + invoice.amountDue, 0)

  const overdueInvoices = input.activeInvoices
    .map((invoice) => ({
      invoice,
      days: daysBetween(new Date(invoice.dueDate), now),
      outstanding: computeOutstanding(invoice, invoice.payments),
    }))
    .filter((entry) => entry.days > 0)
  const largestOverdue = overdueInvoices.length
    ? overdueInvoices.reduce((max, entry) => (entry.outstanding > max.outstanding ? entry : max))
    : null

  const likelyToPayDebtors = new Set<string>()
  for (const invoice of input.activeInvoices) {
    for (const promise of invoice.promisesToPay) {
      if (promise.status !== "active") continue
      const daysUntil = (new Date(promise.promisedPayBy).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (daysUntil < 0 || daysUntil > 7) continue
      const brokenCount = input.brokenPromiseCountsByDebtor[invoice.clientEmail.toLowerCase()] ?? 0
      if (brokenCount === 0) likelyToPayDebtors.add(invoice.clientEmail.toLowerCase())
    }
  }

  const lines: AiSummaryLine[] = [{ id: "greeting", text: `${greeting} ${name}.` }]

  lines.push(
    outstandingCount > 0
      ? {
          id: "outstanding",
          text: `You have ${outstandingCount} outstanding invoice${outstandingCount === 1 ? "" : "s"} worth ${formatCents(outstandingTotal, currency)}.`,
        }
      : { id: "outstanding", text: "You have no outstanding invoices right now — nice and clear." },
  )

  if (newlyOverdueCount > 0) {
    lines.push({
      id: "newly_overdue",
      text: `${newlyOverdueCount} invoice${newlyOverdueCount === 1 ? "" : "s"} became overdue today.`,
    })
  }

  if (paidYesterday.length > 0) {
    lines.push({
      id: "paid_yesterday",
      text: `${paidYesterday.length} customer${paidYesterday.length === 1 ? "" : "s"} paid yesterday, bringing in ${formatCents(paidYesterdayTotal, currency)}.`,
    })
  }

  if (largestOverdue) {
    lines.push({
      id: "largest_overdue",
      text: `Your largest overdue invoice is ${formatCents(largestOverdue.outstanding, largestOverdue.invoice.currency)} and is now ${largestOverdue.days} days overdue.`,
    })
  }

  if (likelyToPayDebtors.size > 0) {
    lines.push({
      id: "likely_to_pay",
      text: `Based on payment history, ${likelyToPayDebtors.size} customer${likelyToPayDebtors.size === 1 ? "" : "s"} ${likelyToPayDebtors.size === 1 ? "is" : "are"} likely to pay this week without further reminders.`,
    })
  }

  if (input.spendLeak) {
    const spendLeak = input.spendLeak
    if (!spendLeak.hasAccess) {
      lines.push({
        id: "spendleak_locked",
        text: "SpendLeak is locked on your current tier, so this summary includes receivables only.",
      })
    } else if (!spendLeak.hasAccountingConnection) {
      lines.push({
        id: "spendleak_connect",
        text: "Connect Xero or MYOB to activate SpendLeak signals in this summary.",
      })
    } else if (spendLeak.findingCount === 0) {
      lines.push({
        id: "spendleak_empty",
        text: `${spendLeak.statusTitle}: no spend findings are currently flagged.`,
      })
    } else if (spendLeak.topModuleTitle) {
      lines.push({
        id: "spendleak_top_module",
        text:
          spendLeak.topModuleAnnualCents > 0
            ? `SpendLeak flagged ${spendLeak.findingCount} finding${spendLeak.findingCount === 1 ? "" : "s"}; strongest signal is ${spendLeak.topModuleTitle} (${spendLeak.topModuleFindingCount}) with up to ${formatAudCents(spendLeak.topModuleAnnualCents)} annual impact.`
            : `SpendLeak flagged ${spendLeak.findingCount} finding${spendLeak.findingCount === 1 ? "" : "s"}; strongest signal is ${spendLeak.topModuleTitle} (${spendLeak.topModuleFindingCount}).`,
      })
    }
  }

  return lines
}
