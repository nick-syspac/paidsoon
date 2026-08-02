import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"
import { startOfUtcDay } from "@/lib/dashboard/format"

export interface ReminderFunnelStep {
  id: "awaiting" | "sent" | "opened" | "clicked" | "paid"
  label: string
  /** null = not tracked yet (no fabricated numbers) */
  value: number | null
  note?: string
}

/**
 * Builds the "Reminder Activity" funnel. Open/click tracking isn't wired up
 * anywhere in the app (no Resend webhook, no tracking pixel — see
 * copilot-instructions.md "Scaffolded Features"), so those two steps report
 * `value: null` with an explanatory note rather than invented numbers.
 */
export function buildReminderFunnel(input: {
  activeInvoices: Pick<InvoiceWithRelations, "currentStage">[]
  paidInvoices: Pick<PaidInvoiceSummary, "updatedAt">[]
  remindersSentToday: number
  now?: Date
}): ReminderFunnelStep[] {
  const now = input.now ?? new Date()
  const todayStart = startOfUtcDay(now)

  const awaitingReminder = input.activeInvoices.filter((invoice) => invoice.currentStage === 0).length
  const paidToday = input.paidInvoices.filter((invoice) => new Date(invoice.updatedAt) >= todayStart).length

  return [
    { id: "awaiting", label: "Invoices awaiting reminder", value: awaitingReminder },
    { id: "sent", label: "Reminders sent today", value: input.remindersSentToday },
    { id: "opened", label: "Opened", value: null, note: "Open tracking isn't set up yet" },
    { id: "clicked", label: "Clicked", value: null, note: "Click tracking isn't set up yet" },
    { id: "paid", label: "Paid", value: paidToday },
  ]
}
