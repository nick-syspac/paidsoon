import { withUserContext } from "@/lib/db/withUserContext"
import { requireDepositGuardPaymentSchedulesAccess } from "@/lib/depositGuard/entitlements"
import { calculateDepositGuardMilestoneAmountCents } from "@/lib/depositGuard/milestonesCore"

type MilestoneStatus =
  | "planned"
  | "ready"
  | "requested"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"

export interface DepositMilestoneSummary {
  id: string
  userId: string
  jobId: string
  name: string
  description: string | null
  sequence: number
  amountType: "percentage" | "fixed"
  percentage: number | null
  fixedAmountCents: number | null
  calculatedAmountCents: number
  triggerType: "manual" | "date" | "work_status"
  targetDate: Date | null
  status: MilestoneStatus
  depositRequestId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateDepositMilestoneInput {
  jobId: string
  name: string
  description?: string | null
  sequence: number
  amountType: "percentage" | "fixed"
  percentage?: number | null
  fixedAmountCents?: number | null
  triggerType?: "manual" | "date" | "work_status"
  targetDate?: Date | null
}

export interface UpdateDepositMilestoneInput {
  name?: string
  description?: string | null
  sequence?: number
  amountType?: "percentage" | "fixed"
  percentage?: number | null
  fixedAmountCents?: number | null
  triggerType?: "manual" | "date" | "work_status"
  targetDate?: Date | null
  status?: MilestoneStatus
}

function toSummary(row: DepositMilestoneSummary): DepositMilestoneSummary {
  return row
}

export async function listDepositGuardMilestones(
  userId: string,
  options: { jobId?: string } = {},
): Promise<DepositMilestoneSummary[]> {
  await requireDepositGuardPaymentSchedulesAccess(userId)

  return withUserContext(userId, async (tx) => {
    const rows = await tx.paymentMilestone.findMany({
      where: {
        userId,
        ...(options.jobId ? { jobId: options.jobId } : {}),
      },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        userId: true,
        jobId: true,
        name: true,
        description: true,
        sequence: true,
        amountType: true,
        percentage: true,
        fixedAmountCents: true,
        calculatedAmountCents: true,
        triggerType: true,
        targetDate: true,
        status: true,
        depositRequestId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return rows.map((row) =>
      toSummary({
        ...row,
        percentage: row.percentage === null ? null : Number(row.percentage),
      }),
    )
  })
}

export async function createDepositGuardMilestone(
  userId: string,
  input: CreateDepositMilestoneInput,
): Promise<DepositMilestoneSummary> {
  await requireDepositGuardPaymentSchedulesAccess(userId)

  return withUserContext(userId, async (tx) => {
    const job = await tx.depositGuardJob.findFirst({
      where: { id: input.jobId, userId, archivedAt: null },
      select: { id: true, totalAmountCents: true },
    })
    if (!job) throw new Error("DepositGuard job not found")

    const calculatedAmountCents = calculateDepositGuardMilestoneAmountCents({
      totalAmountCents: job.totalAmountCents,
      amountType: input.amountType,
      percentage: input.percentage,
      fixedAmountCents: input.fixedAmountCents,
    })

    const created = await tx.paymentMilestone.create({
      data: {
        userId,
        jobId: job.id,
        name: input.name,
        description: input.description ?? null,
        sequence: input.sequence,
        amountType: input.amountType,
        percentage: input.amountType === "percentage" ? input.percentage ?? 0 : null,
        fixedAmountCents: input.amountType === "fixed" ? input.fixedAmountCents ?? 0 : null,
        calculatedAmountCents,
        triggerType: input.triggerType ?? "manual",
        targetDate: input.targetDate ?? null,
        status: "planned",
      },
      select: {
        id: true,
        userId: true,
        jobId: true,
        name: true,
        description: true,
        sequence: true,
        amountType: true,
        percentage: true,
        fixedAmountCents: true,
        calculatedAmountCents: true,
        triggerType: true,
        targetDate: true,
        status: true,
        depositRequestId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await tx.depositGuardEvent.create({
      data: {
        userId,
        jobId: created.jobId,
        eventType: "milestone_created",
        metadata: {
          milestoneId: created.id,
          sequence: created.sequence,
          amountCents: created.calculatedAmountCents,
        } as never,
      },
    })

    return toSummary({
      ...created,
      percentage: created.percentage === null ? null : Number(created.percentage),
    })
  })
}

export async function updateDepositGuardMilestone(
  userId: string,
  milestoneId: string,
  input: UpdateDepositMilestoneInput,
): Promise<DepositMilestoneSummary | null> {
  await requireDepositGuardPaymentSchedulesAccess(userId)

  return withUserContext(userId, async (tx) => {
    const existing = await tx.paymentMilestone.findFirst({
      where: { id: milestoneId, userId },
      select: {
        id: true,
        jobId: true,
        amountType: true,
        percentage: true,
        fixedAmountCents: true,
      },
    })
    if (!existing) return null

    const job = await tx.depositGuardJob.findFirst({
      where: { id: existing.jobId, userId },
      select: { totalAmountCents: true },
    })
    if (!job) return null

    const amountType = input.amountType ?? existing.amountType
    const percentage = input.percentage ?? Number(existing.percentage ?? 0)
    const fixedAmountCents = input.fixedAmountCents ?? existing.fixedAmountCents ?? 0

    const calculatedAmountCents = calculateDepositGuardMilestoneAmountCents({
      totalAmountCents: job.totalAmountCents,
      amountType,
      percentage,
      fixedAmountCents,
    })

    const updated = await tx.paymentMilestone.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        sequence: input.sequence,
        amountType,
        percentage: amountType === "percentage" ? percentage : null,
        fixedAmountCents: amountType === "fixed" ? fixedAmountCents : null,
        calculatedAmountCents,
        triggerType: input.triggerType,
        targetDate: input.targetDate,
        status: input.status,
      },
      select: {
        id: true,
        userId: true,
        jobId: true,
        name: true,
        description: true,
        sequence: true,
        amountType: true,
        percentage: true,
        fixedAmountCents: true,
        calculatedAmountCents: true,
        triggerType: true,
        targetDate: true,
        status: true,
        depositRequestId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return toSummary({
      ...updated,
      percentage: updated.percentage === null ? null : Number(updated.percentage),
    })
  })
}

export async function deleteDepositGuardMilestone(
  userId: string,
  milestoneId: string,
): Promise<boolean> {
  await requireDepositGuardPaymentSchedulesAccess(userId)

  return withUserContext(userId, async (tx) => {
    const deleted = await tx.paymentMilestone.deleteMany({
      where: { id: milestoneId, userId },
    })

    return deleted.count > 0
  })
}

export async function generateDepositRequestFromMilestone(
  userId: string,
  milestoneId: string,
  input: {
    dueDate?: Date
    actorUserId?: string | null
  },
): Promise<{ milestone: DepositMilestoneSummary; requestId: string } | null> {
  await requireDepositGuardPaymentSchedulesAccess(userId)

  return withUserContext(userId, async (tx) => {
    const milestone = await tx.paymentMilestone.findFirst({
      where: { id: milestoneId, userId },
      select: {
        id: true,
        userId: true,
        jobId: true,
        name: true,
        description: true,
        sequence: true,
        amountType: true,
        percentage: true,
        fixedAmountCents: true,
        calculatedAmountCents: true,
        triggerType: true,
        targetDate: true,
        status: true,
        depositRequestId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!milestone) return null

    if (milestone.depositRequestId) {
      throw new Error("Milestone already has a generated request")
    }

    const job = await tx.depositGuardJob.findFirst({
      where: { id: milestone.jobId, userId, archivedAt: null },
      select: { id: true, customerId: true, currency: true },
    })
    if (!job) throw new Error("DepositGuard job not found")

    const dueDate = input.dueDate ?? milestone.targetDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const request = await tx.depositRequest.create({
      data: {
        userId,
        jobId: job.id,
        customerId: job.customerId,
        requestType: "progress_payment",
        description: milestone.description ?? `Milestone ${milestone.sequence}: ${milestone.name}`,
        amountCents: milestone.calculatedAmountCents,
        taxAmountCents: 0,
        totalAmountCents: milestone.calculatedAmountCents,
        currency: job.currency,
        dueDate,
        status: "draft",
        createdBy: input.actorUserId ?? userId,
      },
      select: { id: true },
    })

    const updatedMilestone = await tx.paymentMilestone.update({
      where: { id: milestone.id },
      data: {
        status: "requested",
        depositRequestId: request.id,
      },
      select: {
        id: true,
        userId: true,
        jobId: true,
        name: true,
        description: true,
        sequence: true,
        amountType: true,
        percentage: true,
        fixedAmountCents: true,
        calculatedAmountCents: true,
        triggerType: true,
        targetDate: true,
        status: true,
        depositRequestId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await tx.depositGuardEvent.create({
      data: {
        userId,
        jobId: job.id,
        depositRequestId: request.id,
        actorUserId: input.actorUserId ?? userId,
        eventType: "milestone_requested",
        metadata: {
          milestoneId: milestone.id,
          sequence: milestone.sequence,
        } as never,
      },
    })

    return {
      milestone: toSummary({
        ...updatedMilestone,
        percentage:
          updatedMilestone.percentage === null
            ? null
            : Number(updatedMilestone.percentage),
      }),
      requestId: request.id,
    }
  })
}
