import type { PrismaTx } from "@/lib/db/withUserContext"
import { withUserContext } from "@/lib/db/withUserContext"
import {
  calculateRequiredDeposit,
  type DepositCalculationRounding,
  type DepositSourceTaxMode,
  type DepositType,
} from "@/lib/depositGuard/calculations"
import { getDepositGuardEntitlements } from "@/lib/depositGuard/entitlements"
import { deriveCommencementState } from "@/lib/depositGuard/service"

export type DepositGuardAccessErrorCode =
  | "upgrade_required"
  | "preview_only"
  | "active_job_limit_reached"

export class DepositGuardAccessError extends Error {
  constructor(
    public readonly code: DepositGuardAccessErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "DepositGuardAccessError"
  }
}

export interface CreateDepositGuardJobInput {
  customerId?: string | null
  externalQuoteId?: string | null
  externalQuoteNumber?: string | null
  accountingProvider?: string | null
  name: string
  description?: string | null
  reference?: string | null
  currency: string
  quotedAmountCents?: number | null
  sourceAmountCents: number
  taxAmountCents?: number | null
  sourceTaxMode: DepositSourceTaxMode
  depositType: DepositType
  depositPercentage?: number | null
  depositFixedAmountCents?: number | null
  roundingMode?: DepositCalculationRounding
  expectedStartDate?: Date | null
  expectedCompletionDate?: Date | null
  createdBy?: string | null
}

export interface UpdateDepositGuardJobInput {
  customerId?: string | null
  externalQuoteId?: string | null
  externalQuoteNumber?: string | null
  accountingProvider?: string | null
  name?: string
  description?: string | null
  reference?: string | null
  currency?: string
  quotedAmountCents?: number | null
  sourceAmountCents?: number
  taxAmountCents?: number | null
  sourceTaxMode?: DepositSourceTaxMode
  depositType?: DepositType
  depositPercentage?: number | null
  depositFixedAmountCents?: number | null
  roundingMode?: DepositCalculationRounding
  expectedStartDate?: Date | null
  expectedCompletionDate?: Date | null
}

export interface DepositGuardJobSummary {
  id: string
  customerId: string | null
  name: string
  description: string | null
  reference: string | null
  currency: string
  totalAmountCents: number
  requiredDepositAmountCents: number
  amountPaidCents: number
  outstandingAmountCents: number
  workStatus: string
  paymentStatus: string
  commencementBlocked: boolean
  expectedStartDate: Date | null
  expectedCompletionDate: Date | null
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
}

function toSummary(row: {
  id: string
  customerId: string | null
  name: string
  description: string | null
  reference: string | null
  currency: string
  totalAmountCents: number
  requiredDepositAmountCents: number
  amountPaidCents: number
  outstandingAmountCents: number
  workStatus: string
  paymentStatus: string
  commencementBlocked: boolean
  expectedStartDate: Date | null
  expectedCompletionDate: Date | null
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
}): DepositGuardJobSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    description: row.description,
    reference: row.reference,
    currency: row.currency,
    totalAmountCents: row.totalAmountCents,
    requiredDepositAmountCents: row.requiredDepositAmountCents,
    amountPaidCents: row.amountPaidCents,
    outstandingAmountCents: row.outstandingAmountCents,
    workStatus: row.workStatus,
    paymentStatus: row.paymentStatus,
    commencementBlocked: row.commencementBlocked,
    expectedStartDate: row.expectedStartDate,
    expectedCompletionDate: row.expectedCompletionDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  }
}

async function ensureAccess(userId: string): Promise<void> {
  const entitlements = await getDepositGuardEntitlements(userId)
  if (!entitlements.hasAccess) {
    throw new DepositGuardAccessError("upgrade_required", "Upgrade required")
  }
}

async function ensureOperationalAccess(userId: string): Promise<{ activeJobsLimit: number }> {
  const entitlements = await getDepositGuardEntitlements(userId)
  if (!entitlements.hasAccess) {
    throw new DepositGuardAccessError("upgrade_required", "Upgrade required")
  }
  if (!entitlements.canCreateRequests) {
    throw new DepositGuardAccessError(
      "preview_only",
      "Preview mode only. Upgrade required for DepositGuard operations.",
    )
  }

  return { activeJobsLimit: entitlements.activeJobsLimit }
}

async function emitEvent(
  tx: PrismaTx,
  input: {
    userId: string
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
    jobId?: string | null
    actorUserId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await tx.depositGuardEvent.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      jobId: input.jobId ?? null,
      actorUserId: input.actorUserId ?? null,
      metadata: (input.metadata ?? null) as never,
    },
  })
}

export async function listDepositGuardJobs(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<DepositGuardJobSummary[]> {
  await ensureAccess(userId)

  return withUserContext(userId, async (tx) => {
    const rows = await tx.depositGuardJob.findMany({
      where: {
        userId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        customerId: true,
        name: true,
        description: true,
        reference: true,
        currency: true,
        totalAmountCents: true,
        requiredDepositAmountCents: true,
        amountPaidCents: true,
        outstandingAmountCents: true,
        workStatus: true,
        paymentStatus: true,
        commencementBlocked: true,
        expectedStartDate: true,
        expectedCompletionDate: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
      },
    })

    return rows.map((row) => toSummary(row))
  })
}

export async function createDepositGuardJob(
  userId: string,
  input: CreateDepositGuardJobInput,
): Promise<DepositGuardJobSummary> {
  const { activeJobsLimit } = await ensureOperationalAccess(userId)

  return withUserContext(userId, async (tx) => {
    const activeJobsCount = await tx.depositGuardJob.count({
      where: { userId, archivedAt: null },
    })
    if (activeJobsCount >= activeJobsLimit) {
      throw new DepositGuardAccessError(
        "active_job_limit_reached",
        "DepositGuard active job limit reached",
      )
    }

    const calculation = calculateRequiredDeposit({
      depositType: input.depositType,
      depositPercentage: input.depositPercentage ?? undefined,
      depositFixedAmountCents: input.depositFixedAmountCents ?? undefined,
      sourceAmountCents: input.sourceAmountCents,
      taxAmountCents: input.taxAmountCents ?? undefined,
      sourceTaxMode: input.sourceTaxMode,
      roundingMode: input.roundingMode,
      amountPaidCents: 0,
    })

    const commencement = deriveCommencementState({
      previousWorkStatus: "draft",
      requiredDepositAmountCents: calculation.requiredDepositAmountCents,
      amountPaidCents: 0,
    })

    const row = await tx.depositGuardJob.create({
      data: {
        userId,
        customerId: input.customerId ?? null,
        externalQuoteId: input.externalQuoteId ?? null,
        externalQuoteNumber: input.externalQuoteNumber ?? null,
        accountingProvider: input.accountingProvider ?? null,
        name: input.name,
        description: input.description ?? null,
        reference: input.reference ?? null,
        currency: input.currency.toLowerCase(),
        quotedAmountCents: input.quotedAmountCents ?? null,
        taxAmountCents: calculation.taxAmountCents,
        totalAmountCents: calculation.totalAmountCents,
        depositType: input.depositType,
        depositPercentage: input.depositPercentage ?? null,
        depositFixedAmountCents: input.depositFixedAmountCents ?? null,
        requiredDepositAmountCents: calculation.requiredDepositAmountCents,
        amountPaidCents: 0,
        outstandingAmountCents: calculation.outstandingAmountCents,
        workStatus: commencement.workStatus,
        paymentStatus: "not_requested",
        commencementBlocked: commencement.commencementBlocked,
        expectedStartDate: input.expectedStartDate ?? null,
        expectedCompletionDate: input.expectedCompletionDate ?? null,
        createdBy: input.createdBy ?? userId,
      },
      select: {
        id: true,
        customerId: true,
        name: true,
        description: true,
        reference: true,
        currency: true,
        totalAmountCents: true,
        requiredDepositAmountCents: true,
        amountPaidCents: true,
        outstandingAmountCents: true,
        workStatus: true,
        paymentStatus: true,
        commencementBlocked: true,
        expectedStartDate: true,
        expectedCompletionDate: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
      },
    })

    await emitEvent(tx, {
      userId,
      jobId: row.id,
      actorUserId: input.createdBy ?? userId,
      eventType: "job_created",
      metadata: {
        totalAmountCents: row.totalAmountCents,
      },
    })

    await emitEvent(tx, {
      userId,
      jobId: row.id,
      actorUserId: input.createdBy ?? userId,
      eventType: "deposit_calculated",
      metadata: {
        requiredDepositAmountCents: row.requiredDepositAmountCents,
        depositType: input.depositType,
      },
    })

    return toSummary(row)
  })
}

export async function updateDepositGuardJob(
  userId: string,
  jobId: string,
  input: UpdateDepositGuardJobInput,
): Promise<DepositGuardJobSummary | null> {
  await ensureOperationalAccess(userId)

  return withUserContext(userId, async (tx) => {
    const existing = await tx.depositGuardJob.findFirst({
      where: { id: jobId, userId, archivedAt: null },
      select: {
        id: true,
        customerId: true,
        externalQuoteId: true,
        externalQuoteNumber: true,
        accountingProvider: true,
        name: true,
        description: true,
        reference: true,
        currency: true,
        quotedAmountCents: true,
        totalAmountCents: true,
        taxAmountCents: true,
        depositType: true,
        depositPercentage: true,
        depositFixedAmountCents: true,
        requiredDepositAmountCents: true,
        amountPaidCents: true,
        workStatus: true,
      },
    })
    if (!existing) return null

    const sourceAmountCents = input.sourceAmountCents ?? existing.totalAmountCents
    const sourceTaxMode: DepositSourceTaxMode = input.sourceTaxMode ?? "inclusive"
    const depositType = input.depositType ?? existing.depositType
    const depositPercentage = input.depositPercentage ?? Number(existing.depositPercentage ?? 0)
    const depositFixedAmountCents =
      input.depositFixedAmountCents ?? existing.depositFixedAmountCents ?? undefined

    const calculation = calculateRequiredDeposit({
      depositType,
      depositPercentage,
      depositFixedAmountCents,
      sourceAmountCents,
      taxAmountCents: input.taxAmountCents ?? existing.taxAmountCents ?? 0,
      sourceTaxMode,
      roundingMode: input.roundingMode,
      amountPaidCents: existing.amountPaidCents,
    })

    const commencement = deriveCommencementState({
      previousWorkStatus: existing.workStatus,
      requiredDepositAmountCents: calculation.requiredDepositAmountCents,
      amountPaidCents: existing.amountPaidCents,
    })

    const updated = await tx.depositGuardJob.update({
      where: { id: existing.id },
      data: {
        customerId: input.customerId,
        externalQuoteId: input.externalQuoteId,
        externalQuoteNumber: input.externalQuoteNumber,
        accountingProvider: input.accountingProvider,
        name: input.name,
        description: input.description,
        reference: input.reference,
        currency: input.currency?.toLowerCase(),
        quotedAmountCents: input.quotedAmountCents,
        taxAmountCents: calculation.taxAmountCents,
        totalAmountCents: calculation.totalAmountCents,
        depositType,
        depositPercentage,
        depositFixedAmountCents: depositFixedAmountCents ?? null,
        requiredDepositAmountCents: calculation.requiredDepositAmountCents,
        outstandingAmountCents: calculation.outstandingAmountCents,
        workStatus: commencement.workStatus,
        commencementBlocked: commencement.commencementBlocked,
        expectedStartDate: input.expectedStartDate,
        expectedCompletionDate: input.expectedCompletionDate,
      },
      select: {
        id: true,
        customerId: true,
        name: true,
        description: true,
        reference: true,
        currency: true,
        totalAmountCents: true,
        requiredDepositAmountCents: true,
        amountPaidCents: true,
        outstandingAmountCents: true,
        workStatus: true,
        paymentStatus: true,
        commencementBlocked: true,
        expectedStartDate: true,
        expectedCompletionDate: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
      },
    })

    return toSummary(updated)
  })
}

export async function archiveDepositGuardJob(
  userId: string,
  jobId: string,
): Promise<{ id: string; archivedAt: Date } | null> {
  await ensureOperationalAccess(userId)

  return withUserContext(userId, async (tx) => {
    const existing = await tx.depositGuardJob.findFirst({
      where: { id: jobId, userId, archivedAt: null },
      select: { id: true },
    })
    if (!existing) return null

    const archivedAt = new Date()
    const archived = await tx.depositGuardJob.update({
      where: { id: existing.id },
      data: {
        archivedAt,
        workStatus: "cancelled",
        paymentStatus: "cancelled",
        commencementBlocked: false,
      },
      select: { id: true, archivedAt: true },
    })

    return {
      id: archived.id,
      archivedAt: archived.archivedAt ?? archivedAt,
    }
  })
}
