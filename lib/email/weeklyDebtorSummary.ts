import { buildAgeingBuckets, buildCashWaitingSummary } from "@/lib/dashboard/ageing"
import { buildBiggestDebtors, type DebtorSummary } from "@/lib/dashboard/biggestDebtors"
import { formatCents, formatShortDate, startOfUtcDay } from "@/lib/dashboard/format"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import { groupByCurrency } from "@/lib/dashboard/currencyGrouping"
import type { LedgerPayment } from "@/lib/invoices/payments"

export type WeeklyDebtorSummaryInvoice = Pick<
  InvoiceWithRelations,
  "clientEmail" | "clientName" | "amountDue" | "currency" | "dueDate" | "status"
> & { payments: LedgerPayment[] }

export interface WeeklyDebtorSummaryPayload {
  asOf: Date
  overdueInvoiceCount: number
  debtorCount: number
  currencySections: WeeklyDebtorSummaryCurrencySection[]
}

export interface WeeklyDebtorSummaryCurrencySection {
  currency: string
  overdueInvoiceCount: number
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

  const debtorCount = new Set(overdueInvoices.map((invoice) => invoice.clientEmail.toLowerCase())).size
  const currencySections = groupByCurrency(overdueInvoices).map(({ currency: sectionCurrency, items }) => {
    const ageingBuckets = buildAgeingBuckets(items, asOf)
    const cashWaiting = buildCashWaitingSummary(ageingBuckets)

    return {
      currency: sectionCurrency,
      overdueInvoiceCount: items.length,
      totalOutstanding: cashWaiting.outstanding,
      cashWaiting,
      biggestDebtors: buildBiggestDebtors(items, asOf, 5),
    }
  })

  return {
    asOf,
    overdueInvoiceCount: overdueInvoices.length,
    debtorCount,
    currencySections,
  }
}

export function buildWeeklyDebtorSummaryEmail(input: {
  tenantName: string
  payload: WeeklyDebtorSummaryPayload
}): WeeklyDebtorSummaryEmailContent {
  const asOfLabel = formatShortDate(input.payload.asOf)
  const subject = `Weekly debtor summary for ${input.tenantName}`
  const currencySectionsHtml =
    input.payload.currencySections.length > 0
      ? input.payload.currencySections
          .map((section) => {
            const debtorLines =
              section.biggestDebtors.length > 0
                ? section.biggestDebtors
                    .map(
                      (debtor, index) =>
                        `<li><strong>${index + 1}. ${escapeHtml(debtor.clientName)}</strong> (${escapeHtml(
                          debtor.clientEmail,
                        )}) — ${escapeHtml(formatCurrency(debtor.amountOwed, debtor.currency))} across ${debtor.invoiceCount} invoice${debtor.invoiceCount === 1 ? "" : "s"}; oldest ${debtor.maxDaysOverdue} day${debtor.maxDaysOverdue === 1 ? "" : "s"} overdue</li>`,
                    )
                    .join("")
                : "<li>No overdue invoices right now.</li>"

            return `
              <section>
                <h3>${escapeHtml(section.currency.toUpperCase())}</h3>
                <ul>
                  <li><strong>${section.overdueInvoiceCount}</strong> overdue invoice${section.overdueInvoiceCount === 1 ? "" : "s"}</li>
                  <li><strong>${escapeHtml(formatCurrency(section.totalOutstanding, section.currency))}</strong> outstanding</li>
                </ul>
                <p>Ageing snapshot: current ${escapeHtml(formatCurrency(section.cashWaiting.current, section.currency))}, 1-30 ${escapeHtml(formatCurrency(section.cashWaiting.d1to30, section.currency))}, 31-60 ${escapeHtml(formatCurrency(section.cashWaiting.d31to60, section.currency))}, 60+ ${escapeHtml(formatCurrency(section.cashWaiting.d60plus, section.currency))}.</p>
                <p>Top debtors:</p>
                <ol>${debtorLines}</ol>
              </section>
            `
          })
          .join("")
      : "<p>No overdue invoices right now.</p>"

  const html = `
    <p>Hi ${escapeHtml(input.tenantName)},</p>
    <p>Here is your weekly debtor summary as of ${escapeHtml(asOfLabel)}.</p>
    <ul>
      <li><strong>${input.payload.overdueInvoiceCount}</strong> overdue invoice${input.payload.overdueInvoiceCount === 1 ? "" : "s"}</li>
      <li><strong>${input.payload.debtorCount}</strong> debtor${input.payload.debtorCount === 1 ? "" : "s"}</li>
    </ul>
    ${currencySectionsHtml}
    <p>Thanks,<br>PaidSoon</p>
  `

  const textLines = [
    `Hi ${input.tenantName},`,
    "",
    `Here is your weekly debtor summary as of ${asOfLabel}.`,
    `Overdue invoices: ${input.payload.overdueInvoiceCount}`,
    `Debtors: ${input.payload.debtorCount}`,
    "",
    ...input.payload.currencySections.flatMap((section) => [
      `${section.currency.toUpperCase()}:`,
      `Overdue invoices: ${section.overdueInvoiceCount}`,
      `Outstanding: ${formatCurrency(section.totalOutstanding, section.currency)}`,
      `Ageing snapshot: current ${formatCurrency(section.cashWaiting.current, section.currency)}, 1-30 ${formatCurrency(section.cashWaiting.d1to30, section.currency)}, 31-60 ${formatCurrency(section.cashWaiting.d31to60, section.currency)}, 60+ ${formatCurrency(section.cashWaiting.d60plus, section.currency)}`,
      "Top debtors:",
      ...(section.biggestDebtors.length > 0
        ? section.biggestDebtors.map(
            (debtor, index) =>
              `${index + 1}. ${debtor.clientName} (${debtor.clientEmail}) - ${formatCurrency(debtor.amountOwed, debtor.currency)} across ${debtor.invoiceCount} invoice${debtor.invoiceCount === 1 ? "" : "s"}; oldest ${debtor.maxDaysOverdue} day${debtor.maxDaysOverdue === 1 ? "" : "s"} overdue`,
          )
        : ["No overdue invoices right now."]),
      "",
    ]),
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