import { buildAgeingBuckets, buildCashWaitingSummary } from "@/lib/dashboard/ageing"
import { buildBiggestDebtors, type DebtorSummary } from "@/lib/dashboard/biggestDebtors"
import { formatCents, formatShortDate, startOfUtcDay } from "@/lib/dashboard/format"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

export type WeeklyDebtorSummaryInvoice = Pick<
  InvoiceWithRelations,
  "clientEmail" | "clientName" | "amountDue" | "currency" | "dueDate" | "status"
>

export interface WeeklyDebtorSummaryPayload {
  asOf: Date
  overdueInvoiceCount: number
  debtorCount: number
  currency: string
  totalOutstanding: number
  cashWaiting: ReturnType<typeof buildCashWaitingSummary>
  biggestDebtors: DebtorSummary[]
}

export interface WeeklyDebtorSummaryEmailContent {
  subject: string
  html: string
  text: string
}

const ACTIVE_OVERDUE_STATUSES = new Set([
  "pending",
  "paused",
  "snoozed",
  "sequence_complete",
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatCurrency(amountDue: number, currency: string): string {
  return formatCents(amountDue, currency)
}

export function buildWeeklyDebtorSummaryPayload(
  invoices: WeeklyDebtorSummaryInvoice[],
  asOf: Date = new Date(),
): WeeklyDebtorSummaryPayload {
  const overdueInvoices = invoices.filter((invoice) => {
    if (!ACTIVE_OVERDUE_STATUSES.has(invoice.status)) return false
    return new Date(invoice.dueDate) <= asOf
  })

  const currency = overdueInvoices[0]?.currency ?? invoices[0]?.currency ?? "usd"
  const biggestDebtors = buildBiggestDebtors(overdueInvoices, asOf, 5)
  const ageingBuckets = buildAgeingBuckets(overdueInvoices, asOf)
  const cashWaiting = buildCashWaitingSummary(ageingBuckets)
  const debtorCount = new Set(overdueInvoices.map((invoice) => invoice.clientEmail.toLowerCase())).size

  return {
    asOf,
    overdueInvoiceCount: overdueInvoices.length,
    debtorCount,
    currency,
    totalOutstanding: cashWaiting.outstanding,
    cashWaiting,
    biggestDebtors,
  }
}

export function buildWeeklyDebtorSummaryEmail(input: {
  tenantName: string
  payload: WeeklyDebtorSummaryPayload
}): WeeklyDebtorSummaryEmailContent {
  const asOfLabel = formatShortDate(input.payload.asOf)
  const subject = `Weekly debtor summary for ${input.tenantName}`
  const totalOutstandingLabel = formatCurrency(input.payload.totalOutstanding, input.payload.currency)

  const debtorLines =
    input.payload.biggestDebtors.length > 0
      ? input.payload.biggestDebtors
          .map(
            (debtor, index) =>
              `<li><strong>${index + 1}. ${escapeHtml(debtor.clientName)}</strong> (${escapeHtml(
                debtor.clientEmail,
              )}) — ${escapeHtml(formatCurrency(debtor.amountOwed, debtor.currency))} across ${debtor.invoiceCount} invoice${debtor.invoiceCount === 1 ? "" : "s"}; oldest ${debtor.maxDaysOverdue} day${debtor.maxDaysOverdue === 1 ? "" : "s"} overdue</li>`,
          )
          .join("")
      : "<li>No overdue invoices right now.</li>"

  const bucketSummary = input.payload.cashWaiting
  const html = `
    <p>Hi ${escapeHtml(input.tenantName)},</p>
    <p>Here is your weekly debtor summary as of ${escapeHtml(asOfLabel)}.</p>
    <ul>
      <li><strong>${input.payload.overdueInvoiceCount}</strong> overdue invoice${input.payload.overdueInvoiceCount === 1 ? "" : "s"}</li>
      <li><strong>${input.payload.debtorCount}</strong> debtor${input.payload.debtorCount === 1 ? "" : "s"}</li>
      <li><strong>${escapeHtml(totalOutstandingLabel)}</strong> outstanding</li>
    </ul>
    <p>Ageing snapshot: current ${escapeHtml(formatCurrency(bucketSummary.current, input.payload.currency))}, 1-30 ${escapeHtml(formatCurrency(bucketSummary.d1to30, input.payload.currency))}, 31-60 ${escapeHtml(formatCurrency(bucketSummary.d31to60, input.payload.currency))}, 60+ ${escapeHtml(formatCurrency(bucketSummary.d60plus, input.payload.currency))}.</p>
    <p>Top debtors:</p>
    <ol>${debtorLines}</ol>
    <p>Thanks,<br>PaidSoon</p>
  `

  const textLines = [
    `Hi ${input.tenantName},`,
    "",
    `Here is your weekly debtor summary as of ${asOfLabel}.`,
    `Overdue invoices: ${input.payload.overdueInvoiceCount}`,
    `Debtors: ${input.payload.debtorCount}`,
    `Outstanding: ${totalOutstandingLabel}`,
    `Ageing snapshot: current ${formatCurrency(bucketSummary.current, input.payload.currency)}, 1-30 ${formatCurrency(bucketSummary.d1to30, input.payload.currency)}, 31-60 ${formatCurrency(bucketSummary.d31to60, input.payload.currency)}, 60+ ${formatCurrency(bucketSummary.d60plus, input.payload.currency)}`,
    "",
    "Top debtors:",
    ...input.payload.biggestDebtors.map(
      (debtor, index) =>
        `${index + 1}. ${debtor.clientName} (${debtor.clientEmail}) - ${formatCurrency(debtor.amountOwed, debtor.currency)} across ${debtor.invoiceCount} invoice${debtor.invoiceCount === 1 ? "" : "s"}; oldest ${debtor.maxDaysOverdue} day${debtor.maxDaysOverdue === 1 ? "" : "s"} overdue`,
    ),
    input.payload.biggestDebtors.length === 0 ? "No overdue invoices right now." : undefined,
    "",
    "Thanks,",
    "PaidSoon",
  ].filter((line): line is string => line !== undefined)

  return {
    subject,
    html,
    text: textLines.join("\n"),
  }
}

export function getWeeklyDebtorSummaryWeekStart(asOf: Date = new Date()): Date {
  const weekStart = startOfUtcDay(asOf)
  const day = weekStart.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  weekStart.setUTCDate(weekStart.getUTCDate() + offset)
  return weekStart
}