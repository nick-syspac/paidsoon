import type { PrismaTx } from "@/lib/db/withUserContext"
import { withUserContext } from "@/lib/db/withUserContext"
import { requireDepositGuardRequestAccess } from "@/lib/depositGuard/entitlements"
import { cancelPendingDepositRequestReminders } from "@/lib/depositGuard/reminders"
import {
  derivePaymentStatusFromSignals,
  deriveCommencementState,
  deriveDepositRequestStatusForPayment,
  type DepositRequestLifecycleAction,
} from "@/lib/depositGuard/status"
import { traceEvent } from "@/lib/diagnostics/server"

export { deriveCommencementState, deriveDepositRequestStatusForPayment } from "@/lib/depositGuard/status"

function assertCents(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer in cents`)
  }
  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to 0`)
  }
}

export interface DepositGuardEventInput {
  userId: string
  jobId?: string | null
  depositRequestId?: string | null
  depositPaymentId?: string | null
  actorUserId?: string | null
  eventType:
    | "job_created"
    | "deposit_calculated"
    | "request_created"
    | "request_sent"
    | "request_viewed"
    | "reminder_scheduled"
    | "reminder_sent"
    | "payment_recorded"
    | "payment_confirmed"
    | "payment_failed"
    | "job_unblocked"
    | "milestone_created"
    | "milestone_requested"
    | "request_cancelled"
    | "job_completed"
  metadata?: Record<string, unknown>
}

export type { DepositRequestLifecycleAction } from "@/lib/depositGuard/status"

async function emitDepositGuardEvent(
  tx: PrismaTx,
  input: DepositGuardEventInput,
): Promise<void> {
  await tx.depositGuardEvent.create({
    data: {
      userId: input.userId,
      jobId: input.jobId ?? null,
      depositRequestId: input.depositRequestId ?? null,
      depositPaymentId: input.depositPaymentId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      metadata: (input.metadata ?? null) as never,
    },
  })

  traceEvent(() => ({
    level: "info",
    stage: "deposit_guard.event",
    subsystem: "depositguard",
    component: "lib/depositGuard/service",
    operation: "deposit_guard.event.persisted",
    event: "success",
    traceId: input.userId,
    outputs: {
      eventType: input.eventType,
      jobId: input.jobId ?? null,
      depositRequestId: input.depositRequestId ?? null,
      depositPaymentId: input.depositPaymentId ?? null,
    },
  }))
}

export async function syncDepositRequestPaymentState(
  tx: PrismaTx,
  input: {
    userId: string
    requestId: string
    actorUserId?: string | null
  },
): Promise<
  | {
      request: {
        id: string
        status: string
        paidAt: Date | null
      }
      changed: boolean
    }
  | null
> {
  const request = await tx.depositRequest.findFirst({
    where: { id: input.requestId, userId: input.userId },
    select: { id: true, status: true, totalAmountCents: true, paidAt: true, jobId: true },
  })
  if (!request) return null

  const sum = await tx.depositPayment.aggregate({
    where: {
      userId: input.userId,
      depositRequestId: input.requestId,
      status: "confirmed",
    },
    _sum: { amountCents: true },
  })

  const confirmedPaidCents = sum._sum.amountCents ?? 0
  const nextStatus = deriveDepositRequestStatusForPayment({
    previousStatus: request.status,
    totalAmountCents: request.totalAmountCents,
    confirmedPaidCents,
  })

  if (nextStatus === request.status) {
    return {
      request: {
        id: request.id,
        status: request.status,
        paidAt: request.paidAt,
      },
      changed: false,
    }
  }

  const updated = await tx.depositRequest.update({
    where: { id: request.id },
    data: {
      status: nextStatus,
      paidAt: nextStatus === "paid" ? new Date() : null,
    },
    select: { id: true, status: true, paidAt: true },
  })

  if (nextStatus === "paid") {
    await emitDepositGuardEvent(tx, {
      userId: input.userId,
      jobId: request.jobId,
      depositRequestId: request.id,
      actorUserId: input.actorUserId,
      eventType: "payment_confirmed",
      metadata: {
        source: "request_status_sync",
      },
    })
  }

  return { request: updated, changed: true }
}

export async function syncDepositGuardJobLifecycle(
  tx: PrismaTx,
  input: {
    userId: string
    jobId: string
    actorUserId?: string | null
  },
): Promise<
  | {
      job: {
        id: string
        workStatus: string
        paymentStatus: string
        commencementBlocked: boolean
        amountPaidCents: number
        outstandingAmountCents: number
      }
      changed: boolean
    }
  | null
> {
  const job = await tx.depositGuardJob.findFirst({
    where: { id: input.jobId, userId: input.userId },
    select: {
      id: true,
      workStatus: true,
      paymentStatus: true,
      commencementBlocked: true,
      totalAmountCents: true,
      requiredDepositAmountCents: true,
      amountPaidCents: true,
    },
  })
  if (!job) return null

  const [jobPaidAggregate, requestStatusGroups] = await Promise.all([
    tx.depositPayment.aggregate({
      where: {
        userId: input.userId,
        jobId: input.jobId,
        status: "confirmed",
      },
      _sum: { amountCents: true },
    }),
    tx.depositRequest.groupBy({
      by: ["status"],
      where: { userId: input.userId, jobId: input.jobId },
      _count: { _all: true },
    }),
  ])

  const amountPaidCents = jobPaidAggregate._sum.amountCents ?? 0
  const outstandingAmountCents = Math.max(0, job.totalAmountCents - amountPaidCents)
  const requestedCount = requestStatusGroups
    .filter((group) => group.status === "requested")
    .reduce((sum, group) => sum + group._count._all, 0)
  const viewedCount = requestStatusGroups
    .filter((group) => group.status === "viewed")
    .reduce((sum, group) => sum + group._count._all, 0)
  const overdueCount = requestStatusGroups
    .filter((group) => group.status === "overdue")
    .reduce((sum, group) => sum + group._count._all, 0)

  const nextPaymentStatus = derivePaymentStatusFromSignals({
    amountPaidCents,
    totalAmountCents: job.totalAmountCents,
    anyRequested: requestedCount > 0,
    anyViewed: viewedCount > 0,
    anyOverdue: overdueCount > 0,
  })

  const commencement = deriveCommencementState({
    previousWorkStatus: job.workStatus,
    requiredDepositAmountCents: job.requiredDepositAmountCents,
    amountPaidCents,
  })

  const changed =
    job.paymentStatus !== nextPaymentStatus ||
    job.workStatus !== commencement.workStatus ||
    job.commencementBlocked !== commencement.commencementBlocked ||
    job.amountPaidCents !== amountPaidCents ||
    outstandingAmountCents !== Math.max(0, job.totalAmountCents - job.amountPaidCents)

  if (!changed) {
    return {
      job: {
        id: job.id,
        workStatus: job.workStatus,
        paymentStatus: job.paymentStatus,
        commencementBlocked: job.commencementBlocked,
        amountPaidCents: job.amountPaidCents,
        outstandingAmountCents: Math.max(0, job.totalAmountCents - job.amountPaidCents),
      },
      changed: false,
    }
  }

  const updated = await tx.depositGuardJob.update({
    where: { id: job.id },
    data: {
      amountPaidCents,
      outstandingAmountCents,
      paymentStatus: nextPaymentStatus,
      workStatus: commencement.workStatus,
      commencementBlocked: commencement.commencementBlocked,
    },
    select: {
      id: true,
      workStatus: true,
      paymentStatus: true,
      commencementBlocked: true,
      amountPaidCents: true,
      outstandingAmountCents: true,
    },
  })

  if (commencement.changedToUnblocked) {
    await emitDepositGuardEvent(tx, {
      userId: input.userId,
      jobId: job.id,
      actorUserId: input.actorUserId,
      eventType: "job_unblocked",
      metadata: {
        requiredDepositAmountCents: job.requiredDepositAmountCents,
        amountPaidCents,
      },
    })
  }

  return { job: updated, changed: true }
}

export async function applyDepositRequestLifecycleAction(
  tx: PrismaTx,
  input: {
    userId: string
    requestId: string
    action: DepositRequestLifecycleAction
    actorUserId?: string | null
    now?: Date
  },
): Promise<
  | {
      id: string
      status: string
      sentAt: Date | null
      firstViewedAt: Date | null
      lastViewedAt: Date | null
      cancelledAt: Date | null
      paidAt: Date | null
    }
  | null
> {
  const request = await tx.depositRequest.findFirst({
    where: { id: input.requestId, userId: input.userId },
    select: {
      id: true,
      jobId: true,
      status: true,
      dueDate: true,
      sentAt: true,
      firstViewedAt: true,
      lastViewedAt: true,
      paidAt: true,
      cancelledAt: true,
    },
  })
  if (!request) return null

  const now = input.now ?? new Date()

  if (input.action === "mark_requested") {
    if (request.status !== "draft") {
      throw new Error("Only draft requests can be marked requested")
    }

    const updated = await tx.depositRequest.update({
      where: { id: request.id },
      data: {
        status: "requested",
        sentAt: now,
      },
      select: {
        id: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        cancelledAt: true,
        paidAt: true,
      },
    })

    await emitDepositGuardEvent(tx, {
      userId: input.userId,
      jobId: request.jobId,
      depositRequestId: request.id,
      actorUserId: input.actorUserId,
      eventType: "request_sent",
    })

    await syncDepositGuardJobLifecycle(tx, {
      userId: input.userId,
      jobId: request.jobId,
      actorUserId: input.actorUserId,
    })

    return updated
  }

  if (input.action === "mark_viewed") {
    if (request.status === "cancelled" || request.status === "expired" || request.status === "failed") {
      throw new Error("Cancelled, expired, or failed requests cannot be viewed")
    }

    const shouldFlipStatus = request.status === "requested"
    const updated = await tx.depositRequest.update({
      where: { id: request.id },
      data: {
        status: shouldFlipStatus ? "viewed" : undefined,
        firstViewedAt: request.firstViewedAt ?? now,
        lastViewedAt: now,
      },
      select: {
        id: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        cancelledAt: true,
        paidAt: true,
      },
    })

    await emitDepositGuardEvent(tx, {
      userId: input.userId,
      jobId: request.jobId,
      depositRequestId: request.id,
      actorUserId: input.actorUserId,
      eventType: "request_viewed",
    })

    await syncDepositGuardJobLifecycle(tx, {
      userId: input.userId,
      jobId: request.jobId,
      actorUserId: input.actorUserId,
    })

    return updated
  }

  if (input.action === "mark_overdue") {
    if (request.status !== "requested" && request.status !== "viewed" && request.status !== "partially_paid") {
      throw new Error("Only pending requests can transition to overdue")
    }
    if (request.dueDate > now) {
      throw new Error("Request due date has not passed")
    }

    const updated = await tx.depositRequest.update({
      where: { id: request.id },
      data: { status: "overdue" },
      select: {
        id: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        cancelledAt: true,
        paidAt: true,
      },
    })

    await syncDepositGuardJobLifecycle(tx, {
      userId: input.userId,
      jobId: request.jobId,
      actorUserId: input.actorUserId,
    })

    return updated
  }

  if (input.action === "cancel") {
    if (request.status === "paid") {
      throw new Error("Paid requests cannot be cancelled")
    }

    const updated = await tx.depositRequest.update({
      where: { id: request.id },
      data: {
        status: "cancelled",
        cancelledAt: now,
      },
      select: {
        id: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        cancelledAt: true,
        paidAt: true,
      },
    })

    await cancelPendingDepositRequestReminders(tx, {
      requestId: request.id,
      reason: "request_cancelled",
    })

    await emitDepositGuardEvent(tx, {
      userId: input.userId,
      jobId: request.jobId,
      depositRequestId: request.id,
      actorUserId: input.actorUserId,
      eventType: "request_cancelled",
    })

    await syncDepositGuardJobLifecycle(tx, {
      userId: input.userId,
      jobId: request.jobId,
      actorUserId: input.actorUserId,
    })

    return updated
  }

  if (input.action === "mark_paid") {
    const synced = await syncDepositRequestPaymentState(tx, {
      userId: input.userId,
      requestId: request.id,
      actorUserId: input.actorUserId,
    })

    if (!synced) return null

    await cancelPendingDepositRequestReminders(tx, {
      requestId: request.id,
      reason: "request_paid",
    })

    await syncDepositGuardJobLifecycle(tx, {
      userId: input.userId,
      jobId: request.jobId,
      actorUserId: input.actorUserId,
    })

    const refreshed = await tx.depositRequest.findFirst({
      where: { id: request.id, userId: input.userId },
      select: {
        id: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        cancelledAt: true,
        paidAt: true,
      },
    })

    return refreshed
  }

  return null
}

export async function recordManualDepositPayment(
  userId: string,
  input: {
    jobId: string
    requestId?: string | null
    amountCents: number
    currency: string
    paymentMethod: string
    idempotencyKey: string
    recordedBy?: string | null
    notes?: string | null
    paidAt?: Date
  },
): Promise<{
  payment: {
    id: string
    status: string
    amountCents: number
    currency: string
    paidAt: Date | null
  }
  idempotentReplay: boolean
}> {
  await requireDepositGuardRequestAccess(userId)

  assertCents(input.amountCents, "amountCents")
  if (!input.currency.trim()) throw new Error("currency is required")
  if (!input.paymentMethod.trim()) throw new Error("paymentMethod is required")
  if (!input.idempotencyKey.trim()) throw new Error("idempotencyKey is required")

  return withUserContext(userId, async (tx) => {
    const job = await tx.depositGuardJob.findFirst({
      where: { id: input.jobId, userId },
      select: { id: true, userId: true, currency: true, paymentStatus: true },
    })
    if (!job) throw new Error("DepositGuard job not found")

    if (input.requestId) {
      const request = await tx.depositRequest.findFirst({
        where: { id: input.requestId, userId, jobId: input.jobId },
        select: { id: true, currency: true, status: true },
      })
      if (!request) throw new Error("Deposit request not found")
      if (request.status === "cancelled" || request.status === "failed" || request.status === "expired") {
        throw new Error("Cannot apply payment to cancelled, failed, or expired request")
      }
      if (request.currency.toLowerCase() !== input.currency.toLowerCase()) {
        throw new Error("Currency mismatch between payment and request")
      }
    }

    if (job.currency.toLowerCase() !== input.currency.toLowerCase()) {
      throw new Error("Currency mismatch between payment and job")
    }

    const existing = await tx.depositPayment.findFirst({
      where: {
        userId,
        jobId: input.jobId,
        paymentProvider: "manual",
        externalPaymentId: input.idempotencyKey,
      },
      select: {
        id: true,
        status: true,
        amountCents: true,
        currency: true,
        paidAt: true,
      },
    })

    if (existing) {
      return {
        payment: existing,
        idempotentReplay: true,
      }
    }

    const payment = await tx.depositPayment.create({
      data: {
        userId,
        jobId: input.jobId,
        depositRequestId: input.requestId ?? null,
        amountCents: input.amountCents,
        currency: input.currency.toLowerCase(),
        paymentMethod: input.paymentMethod,
        paymentProvider: "manual",
        externalPaymentId: input.idempotencyKey,
        status: "confirmed",
        paidAt: input.paidAt ?? new Date(),
        recordedBy: input.recordedBy ?? null,
        notes: input.notes ?? null,
      },
      select: {
        id: true,
        status: true,
        amountCents: true,
        currency: true,
        paidAt: true,
      },
    })

    await emitDepositGuardEvent(tx, {
      userId,
      jobId: input.jobId,
      depositRequestId: input.requestId ?? null,
      depositPaymentId: payment.id,
      actorUserId: input.recordedBy ?? null,
      eventType: "payment_recorded",
      metadata: {
        amountCents: payment.amountCents,
        method: input.paymentMethod,
        provider: "manual",
      },
    })

    await emitDepositGuardEvent(tx, {
      userId,
      jobId: input.jobId,
      depositRequestId: input.requestId ?? null,
      depositPaymentId: payment.id,
      actorUserId: input.recordedBy ?? null,
      eventType: "payment_confirmed",
      metadata: {
        amountCents: payment.amountCents,
        provider: "manual",
      },
    })

    if (input.requestId) {
      await syncDepositRequestPaymentState(tx, {
        userId,
        requestId: input.requestId,
        actorUserId: input.recordedBy ?? null,
      })
    }

    await syncDepositGuardJobLifecycle(tx, {
      userId,
      jobId: input.jobId,
      actorUserId: input.recordedBy ?? null,
    })

    return {
      payment,
      idempotentReplay: false,
    }
  })
}
