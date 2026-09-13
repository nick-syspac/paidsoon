export type DepositRequestLifecycleAction =
  | "mark_requested"
  | "mark_viewed"
  | "mark_paid"
  | "mark_overdue"
  | "cancel"

function assertCents(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer in cents`)
  }
  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to 0`)
  }
}

export function derivePaymentStatusFromSignals(input: {
  amountPaidCents: number
  totalAmountCents: number
  anyRequested: boolean
  anyViewed: boolean
  anyOverdue: boolean
}):
  | "not_requested"
  | "requested"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue" {
  if (input.amountPaidCents >= input.totalAmountCents) return "paid"
  if (input.amountPaidCents > 0) return "partially_paid"
  if (input.anyOverdue) return "overdue"
  if (input.anyViewed) return "viewed"
  if (input.anyRequested) return "requested"
  return "not_requested"
}

export function deriveDepositRequestStatusForPayment(input: {
  previousStatus:
    | "draft"
    | "requested"
    | "viewed"
    | "partially_paid"
    | "paid"
    | "overdue"
    | "cancelled"
    | "expired"
    | "failed"
  totalAmountCents: number
  confirmedPaidCents: number
}):
  | "draft"
  | "requested"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"
  | "expired"
  | "failed" {
  assertCents(input.totalAmountCents, "totalAmountCents")
  assertCents(input.confirmedPaidCents, "confirmedPaidCents")

  if (
    input.previousStatus === "cancelled" ||
    input.previousStatus === "expired" ||
    input.previousStatus === "failed"
  ) {
    return input.previousStatus
  }

  if (input.confirmedPaidCents >= input.totalAmountCents) return "paid"
  if (input.confirmedPaidCents > 0) return "partially_paid"

  return input.previousStatus
}

export function deriveCommencementState(input: {
  previousWorkStatus: "draft" | "awaiting_deposit" | "ready_to_start" | "in_progress" | "completed" | "cancelled"
  requiredDepositAmountCents: number
  amountPaidCents: number
}): {
  workStatus: "draft" | "awaiting_deposit" | "ready_to_start" | "in_progress" | "completed" | "cancelled"
  commencementBlocked: boolean
  changedToUnblocked: boolean
} {
  const terminal =
    input.previousWorkStatus === "completed" || input.previousWorkStatus === "cancelled"
  if (terminal) {
    return {
      workStatus: input.previousWorkStatus,
      commencementBlocked: false,
      changedToUnblocked: false,
    }
  }

  assertCents(input.requiredDepositAmountCents, "requiredDepositAmountCents")
  assertCents(input.amountPaidCents, "amountPaidCents")

  const shouldBlock =
    input.requiredDepositAmountCents > 0 &&
    input.amountPaidCents < input.requiredDepositAmountCents

  if (shouldBlock) {
    return {
      workStatus: "awaiting_deposit",
      commencementBlocked: true,
      changedToUnblocked: false,
    }
  }

  const wasBlocked =
    input.previousWorkStatus === "draft" ||
    input.previousWorkStatus === "awaiting_deposit"

  return {
    workStatus: wasBlocked ? "ready_to_start" : input.previousWorkStatus,
    commencementBlocked: false,
    changedToUnblocked: wasBlocked,
  }
}
