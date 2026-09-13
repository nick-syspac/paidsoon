export interface DepositGuardEventSummary {
  id: string
  eventType: string
  jobId: string | null
  depositRequestId: string | null
  depositPaymentId: string | null
  actorUserId: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface DepositGuardTimelineEntry {
  id: string
  title: string
  description: string | null
  timestamp: Date
  kind: "job" | "request" | "reminder" | "payment" | "milestone" | "system"
}

function formatMoney(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildEventDescription(event: DepositGuardEventSummary): string | null {
  const metadata = event.metadata ?? {}

  switch (event.eventType) {
    case "job_created":
      return "DepositGuard job created from the guided workflow."
    case "deposit_calculated": {
      const required = formatMoney(metadata.requiredDepositAmountCents)
      const total = formatMoney(metadata.totalAmountCents)
      if (!required && !total) return "Deposit totals were recalculated on the server."
      return [required ? `Required deposit ${required}` : null, total ? `job total ${total}` : null]
        .filter(Boolean)
        .join(" · ")
    }
    case "request_created": {
      const total = formatMoney(metadata.totalAmountCents)
      return total ? `Request drafted for ${total}.` : "Deposit request drafted."
    }
    case "request_sent":
      return "Request moved out of draft and marked as sent."
    case "request_viewed":
      return "Customer opened the payment request."
    case "request_cancelled":
      return "Pending reminders were cancelled for this request."
    case "reminder_scheduled": {
      const reminderType = typeof metadata.reminderType === "string" ? titleCase(metadata.reminderType) : "Reminder"
      const scheduledForValue = metadata.scheduledFor
      const scheduledFor =
        typeof scheduledForValue === "string" || scheduledForValue instanceof Date
          ? formatDateTime(scheduledForValue)
          : null
      return scheduledFor ? `${reminderType} scheduled for ${scheduledFor}.` : `${reminderType} scheduled.`
    }
    case "reminder_sent": {
      const reminderType = typeof metadata.reminderType === "string" ? titleCase(metadata.reminderType) : "Reminder"
      return `${reminderType} reminder delivered.`
    }
    case "payment_recorded": {
      const amount = formatMoney(metadata.amountCents)
      const method = typeof metadata.method === "string" ? metadata.method : null
      if (!amount && !method) return "A payment was recorded."
      return [amount ? `Payment ${amount}` : null, method ? `via ${method}` : null].filter(Boolean).join(" · ")
    }
    case "payment_confirmed": {
      const amount = formatMoney(metadata.amountCents)
      return amount ? `Payment ${amount} confirmed.` : "Payment confirmed."
    }
    case "payment_failed": {
      const reason = typeof metadata.reason === "string" ? metadata.reason : null
      return reason ? `Payment failed: ${reason}.` : "Payment failed."
    }
    case "milestone_created": {
      const sequence = typeof metadata.sequence === "number" ? `#${metadata.sequence}` : ""
      const amount = formatMoney(metadata.amountCents)
      return [sequence ? `Milestone ${sequence}` : "Milestone created", amount ? `for ${amount}` : null]
        .filter(Boolean)
        .join(" · ")
    }
    case "milestone_requested": {
      const sequence = typeof metadata.sequence === "number" ? `#${metadata.sequence}` : null
      return sequence ? `Request generated from milestone ${sequence}.` : "Request generated from milestone."
    }
    case "job_unblocked":
      return "Required deposit threshold reached; commencement is no longer blocked."
    case "job_completed":
      return "Job was marked complete."
    default:
      return null
  }
}

export function buildDepositGuardTimelineEntries(
  events: DepositGuardEventSummary[],
): DepositGuardTimelineEntry[] {
  return events.map((event) => {
    let kind: DepositGuardTimelineEntry["kind"] = "system"
    if (event.eventType.startsWith("request_")) kind = "request"
    else if (event.eventType.startsWith("reminder_")) kind = "reminder"
    else if (event.eventType.startsWith("payment_")) kind = "payment"
    else if (event.eventType.startsWith("milestone_")) kind = "milestone"
    else if (event.eventType.startsWith("job_")) kind = "job"

    return {
      id: event.id,
      title: titleCase(event.eventType),
      description: buildEventDescription(event),
      timestamp: event.createdAt,
      kind,
    }
  })
}