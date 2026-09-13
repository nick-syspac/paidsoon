import { createHash, randomBytes } from "node:crypto"

import { withUserContext } from "@/lib/db/withUserContext"
import { requireDepositGuardRequestAccess } from "@/lib/depositGuard/entitlements"
import { DepositGuardAccessError } from "@/lib/depositGuard/jobs"
import { seedDepositRequestReminders } from "@/lib/depositGuard/reminders"
import { applyDepositRequestLifecycleAction, syncDepositGuardJobLifecycle } from "@/lib/depositGuard/service"

export interface CreateDepositRequestInput {
  jobId: string
  requestType: "deposit" | "progress_payment" | "final_payment"
  description?: string | null
  amountCents: number
  taxAmountCents?: number | null
  totalAmountCents: number
  currency: string
  dueDate: Date
  createdBy?: string | null
}

export interface DepositRequestSummary {
  id: string
  jobId: string
  customerId: string | null
  requestType: string
  description: string | null
  amountCents: number
  taxAmountCents: number | null
  totalAmountCents: number
  currency: string
  dueDate: Date
  status: string
  sentAt: Date | null
  firstViewedAt: Date | null
  lastViewedAt: Date | null
  paidAt: Date | null
  cancelledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const DEFAULT_REMINDER_POLICY = {
  autoReminderEnabled: true,
  initialReminderOffsetDays: 0,
  beforeDueOffsetDays: 1,
  overdue3Enabled: true,
  overdue7Enabled: true,
} as const

function toSummary(row: DepositRequestSummary): DepositRequestSummary {
  return row
}

function hashPublicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function assertCents(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer in cents`)
  }
}

export async function listDepositRequests(
  userId: string,
  options: { jobId?: string } = {},
): Promise<DepositRequestSummary[]> {
  await requireDepositGuardRequestAccess(userId)

  return withUserContext(userId, async (tx) => {
    const rows = await tx.depositRequest.findMany({
      where: {
        userId,
        ...(options.jobId ? { jobId: options.jobId } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        jobId: true,
        customerId: true,
        requestType: true,
        description: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return rows.map((row) => toSummary(row))
  })
}

export async function createDepositRequest(
  userId: string,
  input: CreateDepositRequestInput,
): Promise<DepositRequestSummary> {
  await requireDepositGuardRequestAccess(userId)
  assertCents(input.amountCents, "amountCents")
  assertCents(input.totalAmountCents, "totalAmountCents")
  if (input.taxAmountCents != null) assertCents(input.taxAmountCents, "taxAmountCents")

  return withUserContext(userId, async (tx) => {
    const job = await tx.depositGuardJob.findFirst({
      where: { id: input.jobId, userId, archivedAt: null },
      select: { id: true, customerId: true, currency: true },
    })
    if (!job) {
      throw new Error("DepositGuard job not found")
    }

    if (job.currency.toLowerCase() !== input.currency.toLowerCase()) {
      throw new Error("Currency mismatch between request and job")
    }

    const request = await tx.depositRequest.create({
      data: {
        userId,
        jobId: job.id,
        customerId: job.customerId,
        requestType: input.requestType,
        description: input.description ?? null,
        amountCents: input.amountCents,
        taxAmountCents: input.taxAmountCents ?? null,
        totalAmountCents: input.totalAmountCents,
        currency: input.currency.toLowerCase(),
        dueDate: input.dueDate,
        status: "draft",
        createdBy: input.createdBy ?? userId,
      },
      select: {
        id: true,
        jobId: true,
        customerId: true,
        requestType: true,
        description: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const reminderSettings = await tx.depositGuardSetting.findUnique({
      where: { userId },
      select: {
        autoReminderEnabled: true,
        initialReminderOffsetDays: true,
        beforeDueOffsetDays: true,
        overdue3Enabled: true,
        overdue7Enabled: true,
      },
    })

    await seedDepositRequestReminders(tx, {
      userId,
      requestId: request.id,
      createdAt: request.createdAt,
      dueDate: request.dueDate,
      policy: reminderSettings ?? DEFAULT_REMINDER_POLICY,
      actorUserId: input.createdBy ?? userId,
    })

    await tx.depositGuardEvent.create({
      data: {
        userId,
        jobId: job.id,
        depositRequestId: request.id,
        actorUserId: input.createdBy ?? userId,
        eventType: "request_created",
        metadata: {
          requestType: request.requestType,
          totalAmountCents: request.totalAmountCents,
        } as never,
      },
    })

    await syncDepositGuardJobLifecycle(tx, { userId, jobId: job.id, actorUserId: input.createdBy ?? userId })

    return toSummary(request)
  })
}

export async function updateDepositRequestDueDate(
  userId: string,
  requestId: string,
  dueDate: Date,
): Promise<DepositRequestSummary | null> {
  await requireDepositGuardRequestAccess(userId)

  return withUserContext(userId, async (tx) => {
    const existing = await tx.depositRequest.findFirst({
      where: { id: requestId, userId },
      select: { id: true, status: true },
    })
    if (!existing) return null
    if (existing.status === "paid" || existing.status === "cancelled") {
      throw new Error("Paid or cancelled requests cannot be edited")
    }

    const updated = await tx.depositRequest.update({
      where: { id: requestId },
      data: { dueDate },
      select: {
        id: true,
        jobId: true,
        customerId: true,
        requestType: true,
        description: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return toSummary(updated)
  })
}

export async function sendDepositRequest(
  userId: string,
  requestId: string,
  actorUserId?: string | null,
): Promise<DepositRequestSummary | null> {
  await requireDepositGuardRequestAccess(userId)

  return withUserContext(userId, async (tx) => {
    const updated = await applyDepositRequestLifecycleAction(tx, {
      userId,
      requestId,
      action: "mark_requested",
      actorUserId,
    })

    if (!updated) return null

    const request = await tx.depositRequest.findFirst({
      where: { id: requestId, userId },
      select: {
        id: true,
        jobId: true,
        customerId: true,
        requestType: true,
        description: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return request ? toSummary(request) : null
  })
}

export async function resendDepositRequest(
  userId: string,
  requestId: string,
  actorUserId?: string | null,
): Promise<DepositRequestSummary | null> {
  await requireDepositGuardRequestAccess(userId)

  return withUserContext(userId, async (tx) => {
    const existing = await tx.depositRequest.findFirst({
      where: { id: requestId, userId },
      select: { id: true, status: true, jobId: true },
    })
    if (!existing) return null

    if (
      existing.status !== "requested" &&
      existing.status !== "viewed" &&
      existing.status !== "overdue" &&
      existing.status !== "partially_paid"
    ) {
      throw new Error("Only previously sent requests can be resent")
    }

    await tx.depositRequest.update({
      where: { id: requestId },
      data: {
        status: "requested",
        sentAt: new Date(),
      },
    })

    await tx.depositGuardEvent.create({
      data: {
        userId,
        jobId: existing.jobId,
        depositRequestId: existing.id,
        actorUserId: actorUserId ?? null,
        eventType: "request_sent",
        metadata: {
          resend: true,
        } as never,
      },
    })

    await syncDepositGuardJobLifecycle(tx, {
      userId,
      jobId: existing.jobId,
      actorUserId,
    })

    const request = await tx.depositRequest.findFirst({
      where: { id: requestId, userId },
      select: {
        id: true,
        jobId: true,
        customerId: true,
        requestType: true,
        description: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return request ? toSummary(request) : null
  })
}

export async function cancelDepositRequest(
  userId: string,
  requestId: string,
  actorUserId?: string | null,
): Promise<DepositRequestSummary | null> {
  await requireDepositGuardRequestAccess(userId)

  return withUserContext(userId, async (tx) => {
    const updated = await applyDepositRequestLifecycleAction(tx, {
      userId,
      requestId,
      action: "cancel",
      actorUserId,
    })

    if (!updated) return null

    const request = await tx.depositRequest.findFirst({
      where: { id: requestId, userId },
      select: {
        id: true,
        jobId: true,
        customerId: true,
        requestType: true,
        description: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        status: true,
        sentAt: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return request ? toSummary(request) : null
  })
}

export async function issueDepositRequestPublicLink(
  userId: string,
  requestId: string,
  origin: string,
  actorUserId?: string | null,
): Promise<{ requestId: string; token: string; url: string; expiresAt: Date } | null> {
  await requireDepositGuardRequestAccess(userId)

  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    throw new Error("Invalid origin")
  }

  return withUserContext(userId, async (tx) => {
    const request = await tx.depositRequest.findFirst({
      where: { id: requestId, userId },
      select: { id: true, status: true },
    })
    if (!request) return null

    if (request.status === "cancelled" || request.status === "failed") {
      throw new Error("Cannot issue a public link for this request")
    }

    const token = randomBytes(24).toString("base64url")
    const tokenHash = hashPublicToken(token)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)

    await tx.depositRequest.update({
      where: { id: request.id },
      data: {
        publicTokenHash: tokenHash,
        tokenExpiresAt: expiresAt,
      },
    })

    await tx.depositGuardEvent.create({
      data: {
        userId,
        depositRequestId: request.id,
        actorUserId: actorUserId ?? null,
        eventType: "request_sent",
        metadata: {
          publicLinkIssued: true,
        } as never,
      },
    })

    const baseOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin
    return {
      requestId: request.id,
      token,
      url: `${baseOrigin}/pay/deposit/${token}`,
      expiresAt,
    }
  })
}

export function toRequestAccessError(error: unknown): DepositGuardAccessError | null {
  if (!(error instanceof Error)) return null
  if (error.message === "Upgrade required") {
    return new DepositGuardAccessError("upgrade_required", "Upgrade required")
  }

  return null
}
