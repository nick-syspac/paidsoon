import { withUserContext } from "@/lib/db/withUserContext"
import { requireFeature } from "@/lib/billing"
import {
  getCommitGuardEntitlements,
  requireCommitGuardCoreAccess,
} from "@/lib/commitguard/entitlements"
import {
  buildCommitmentHorizonTotals,
  buildRenewalAssessments,
  calculateFreeCashBreakdown,
  resolveSafetyBufferCents,
  type CommitmentHorizonTotals,
  type FreeCashBreakdown,
  type RenewalAssessment,
} from "@/lib/commitguard/engine"
import {
  COMMIT_GUARD_EVENT_TYPES,
  buildCommitGuardEventDedupeKey,
} from "@/lib/commitguard/events"
import {
  normalizeCommitmentConfidence,
  normalizeCommitmentEssentiality,
  normalizeCommitmentFrequency,
  normalizeCommitmentSource,
  normalizeCommitmentStatus,
  normalizeSafetyBufferMode,
  type CommitmentSnapshot,
  type CommitGuardSettingsSnapshot,
  type SafetyBufferMode,
} from "@/lib/commitguard/types"
import { loadTaxBufferSummary } from "@/lib/taxBuffer/service"

const DEFAULT_RENEWAL_WARNING_DAYS = [90, 60, 30, 14, 7]
const MATERIAL_AMOUNT_DELTA_CENTS = 5_000
const MATERIAL_AMOUNT_DELTA_PERCENT = 0.15

export interface CommitGuardSummary {
  settings: CommitGuardSettingsSnapshot
  horizons: CommitmentHorizonTotals[]
  renewals: RenewalAssessment[]
  freeCash: FreeCashBreakdown
}

export interface UpsertCommitmentInput {
  name: string
  description?: string | null
  category: string
  amountCents: number
  currency: string
  frequency: string
  nextDueDate?: Date | null
  startDate?: Date | null
  endDate?: Date | null
  recurrenceRule?: unknown
  supplierName?: string | null
  supplierId?: string | null
  accountId?: string | null
  source?: string
  status?: string
  confidence?: string
  noticePeriodDays?: number | null
  renewalDate?: Date | null
  autoRenew?: boolean
  cancellable?: boolean
  essentiality?: string
  notes?: string | null
  linkedSpendInsightId?: string | null
  linkedCostGuardAlertId?: string | null
}

export interface CommitGuardAuditPayload {
  eventType: string
  title: string
  message: string
  commitmentId?: string
  detectionCandidateId?: string
  metadata?: Record<string, unknown>
}

function parseRenewalWarningDays(input: unknown): number[] {
  if (!Array.isArray(input)) return DEFAULT_RENEWAL_WARNING_DAYS

  const parsed = input
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item))

  return parsed.length > 0 ? parsed : DEFAULT_RENEWAL_WARNING_DAYS
}

function toCommitmentSnapshot(row: {
  id: string
  userId: string
  name: string
  description: string | null
  category: string
  amountCents: number
  currency: string
  frequency: string
  nextDueDate: Date | null
  startDate: Date | null
  endDate: Date | null
  recurrenceRule: unknown
  supplierName: string | null
  supplierId: string | null
  accountId: string | null
  source: string
  status: string
  confidence: string
  noticePeriodDays: number | null
  renewalDate: Date | null
  autoRenew: boolean
  cancellable: boolean
  essentiality: string
  notes: string | null
  linkedSpendInsightId: string | null
  linkedCostGuardAlertId: string | null
  createdAt: Date
  updatedAt: Date
}): CommitmentSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    category: row.category,
    amountCents: row.amountCents,
    currency: row.currency,
    frequency: normalizeCommitmentFrequency(row.frequency),
    nextDueDate: row.nextDueDate,
    startDate: row.startDate,
    endDate: row.endDate,
    recurrenceRule: row.recurrenceRule,
    supplierName: row.supplierName,
    supplierId: row.supplierId,
    accountId: row.accountId,
    source: normalizeCommitmentSource(row.source),
    status: normalizeCommitmentStatus(row.status),
    confidence: normalizeCommitmentConfidence(row.confidence),
    noticePeriodDays: row.noticePeriodDays,
    renewalDate: row.renewalDate,
    autoRenew: row.autoRenew,
    cancellable: row.cancellable,
    essentiality: normalizeCommitmentEssentiality(row.essentiality),
    notes: row.notes,
    linkedSpendInsightId: row.linkedSpendInsightId,
    linkedCostGuardAlertId: row.linkedCostGuardAlertId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSettingsSnapshot(row: {
  enabled: boolean
  defaultHorizonDays: number
  safetyBufferMode: string
  safetyBufferFixedCents: number
  safetyBufferPercent: number | null
  safetyBufferWeeks: number | null
  detectRecurringCommitments: boolean
  detectionMinOccurrences: number
  detectionAmountVariancePercent: number
  detectionIntervalToleranceDays: number
  detectionConfidenceThreshold: string
  alertCommitmentDueSoon: boolean
  alertRenewalApproaching: boolean
  alertNoticePeriodApproaching: boolean
  alertCommitmentAmountChanged: boolean
  alertCommitmentBufferLow: boolean
  alertCommitmentShortfall: boolean
  renewalWarningDays: unknown
}): CommitGuardSettingsSnapshot {
  return {
    enabled: row.enabled,
    defaultHorizonDays: row.defaultHorizonDays,
    safetyBufferMode: normalizeSafetyBufferMode(row.safetyBufferMode),
    safetyBufferFixedCents: row.safetyBufferFixedCents,
    safetyBufferPercent: row.safetyBufferPercent,
    safetyBufferWeeks: row.safetyBufferWeeks,
    detectRecurringCommitments: row.detectRecurringCommitments,
    detectionMinOccurrences: row.detectionMinOccurrences,
    detectionAmountVariancePercent: row.detectionAmountVariancePercent,
    detectionIntervalToleranceDays: row.detectionIntervalToleranceDays,
    detectionConfidenceThreshold: normalizeCommitmentConfidence(row.detectionConfidenceThreshold),
    alertCommitmentDueSoon: row.alertCommitmentDueSoon,
    alertRenewalApproaching: row.alertRenewalApproaching,
    alertNoticePeriodApproaching: row.alertNoticePeriodApproaching,
    alertCommitmentAmountChanged: row.alertCommitmentAmountChanged,
    alertCommitmentBufferLow: row.alertCommitmentBufferLow,
    alertCommitmentShortfall: row.alertCommitmentShortfall,
    renewalWarningDays: parseRenewalWarningDays(row.renewalWarningDays),
  }
}

export async function getCommitGuardSettings(userId: string): Promise<CommitGuardSettingsSnapshot> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const settings = await tx.commitGuardSetting.upsert({
      where: { userId },
      create: {
        userId,
        renewalWarningDays: DEFAULT_RENEWAL_WARNING_DAYS,
      },
      update: {},
      select: {
        enabled: true,
        defaultHorizonDays: true,
        safetyBufferMode: true,
        safetyBufferFixedCents: true,
        safetyBufferPercent: true,
        safetyBufferWeeks: true,
        detectRecurringCommitments: true,
        detectionMinOccurrences: true,
        detectionAmountVariancePercent: true,
        detectionIntervalToleranceDays: true,
        detectionConfidenceThreshold: true,
        alertCommitmentDueSoon: true,
        alertRenewalApproaching: true,
        alertNoticePeriodApproaching: true,
        alertCommitmentAmountChanged: true,
        alertCommitmentBufferLow: true,
        alertCommitmentShortfall: true,
        renewalWarningDays: true,
      },
    })

    return toSettingsSnapshot(settings)
  })
}

export async function saveCommitGuardSettings(
  userId: string,
  input: Partial<{
    enabled: boolean
    defaultHorizonDays: number
    safetyBufferMode: SafetyBufferMode
    safetyBufferFixedCents: number
    safetyBufferPercent: number | null
    safetyBufferWeeks: number | null
    detectRecurringCommitments: boolean
    detectionMinOccurrences: number
    detectionAmountVariancePercent: number
    detectionIntervalToleranceDays: number
    detectionConfidenceThreshold: string
    alertCommitmentDueSoon: boolean
    alertRenewalApproaching: boolean
    alertNoticePeriodApproaching: boolean
    alertCommitmentAmountChanged: boolean
    alertCommitmentBufferLow: boolean
    alertCommitmentShortfall: boolean
    renewalWarningDays: number[]
  }>,
): Promise<CommitGuardSettingsSnapshot> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const settings = await tx.commitGuardSetting.upsert({
      where: { userId },
      create: {
        userId,
        enabled: input.enabled ?? false,
        defaultHorizonDays: input.defaultHorizonDays ?? 30,
        safetyBufferMode: normalizeSafetyBufferMode(input.safetyBufferMode),
        safetyBufferFixedCents: Math.max(0, Math.round(input.safetyBufferFixedCents ?? 0)),
        safetyBufferPercent: input.safetyBufferPercent ?? null,
        safetyBufferWeeks: input.safetyBufferWeeks ?? null,
        detectRecurringCommitments: input.detectRecurringCommitments ?? false,
        detectionMinOccurrences: input.detectionMinOccurrences ?? 3,
        detectionAmountVariancePercent: input.detectionAmountVariancePercent ?? 12,
        detectionIntervalToleranceDays: input.detectionIntervalToleranceDays ?? 3,
        detectionConfidenceThreshold: normalizeCommitmentConfidence(input.detectionConfidenceThreshold),
        alertCommitmentDueSoon: input.alertCommitmentDueSoon ?? true,
        alertRenewalApproaching: input.alertRenewalApproaching ?? true,
        alertNoticePeriodApproaching: input.alertNoticePeriodApproaching ?? true,
        alertCommitmentAmountChanged: input.alertCommitmentAmountChanged ?? true,
        alertCommitmentBufferLow: input.alertCommitmentBufferLow ?? true,
        alertCommitmentShortfall: input.alertCommitmentShortfall ?? true,
        renewalWarningDays: input.renewalWarningDays ?? DEFAULT_RENEWAL_WARNING_DAYS,
      },
      update: {
        enabled: input.enabled,
        defaultHorizonDays: input.defaultHorizonDays,
        safetyBufferMode: input.safetyBufferMode
          ? normalizeSafetyBufferMode(input.safetyBufferMode)
          : undefined,
        safetyBufferFixedCents:
          input.safetyBufferFixedCents === undefined
            ? undefined
            : Math.max(0, Math.round(input.safetyBufferFixedCents)),
        safetyBufferPercent: input.safetyBufferPercent,
        safetyBufferWeeks: input.safetyBufferWeeks,
        detectRecurringCommitments: input.detectRecurringCommitments,
        detectionMinOccurrences: input.detectionMinOccurrences,
        detectionAmountVariancePercent: input.detectionAmountVariancePercent,
        detectionIntervalToleranceDays: input.detectionIntervalToleranceDays,
        detectionConfidenceThreshold: input.detectionConfidenceThreshold
          ? normalizeCommitmentConfidence(input.detectionConfidenceThreshold)
          : undefined,
        alertCommitmentDueSoon: input.alertCommitmentDueSoon,
        alertRenewalApproaching: input.alertRenewalApproaching,
        alertNoticePeriodApproaching: input.alertNoticePeriodApproaching,
        alertCommitmentAmountChanged: input.alertCommitmentAmountChanged,
        alertCommitmentBufferLow: input.alertCommitmentBufferLow,
        alertCommitmentShortfall: input.alertCommitmentShortfall,
        renewalWarningDays: input.renewalWarningDays,
      },
      select: {
        enabled: true,
        defaultHorizonDays: true,
        safetyBufferMode: true,
        safetyBufferFixedCents: true,
        safetyBufferPercent: true,
        safetyBufferWeeks: true,
        detectRecurringCommitments: true,
        detectionMinOccurrences: true,
        detectionAmountVariancePercent: true,
        detectionIntervalToleranceDays: true,
        detectionConfidenceThreshold: true,
        alertCommitmentDueSoon: true,
        alertRenewalApproaching: true,
        alertNoticePeriodApproaching: true,
        alertCommitmentAmountChanged: true,
        alertCommitmentBufferLow: true,
        alertCommitmentShortfall: true,
        renewalWarningDays: true,
      },
    })

    return toSettingsSnapshot(settings)
  })
}

export async function listCommitments(userId: string): Promise<CommitmentSnapshot[]> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const rows = await tx.commitment.findMany({
      where: { userId },
      orderBy: [{ nextDueDate: "asc" }, { createdAt: "asc" }],
    })

    return rows.map((row) => toCommitmentSnapshot(row))
  })
}

export async function createCommitment(userId: string, input: UpsertCommitmentInput): Promise<{
  commitment: CommitmentSnapshot
  audit: CommitGuardAuditPayload
}> {
  const entitlements = await getCommitGuardEntitlements(userId)
  if (!entitlements.hasCoreAccess) {
    throw new Error("Upgrade required")
  }

  return withUserContext(userId, async (tx) => {
    const currentCount = await tx.commitment.count({ where: { userId, archivedAt: null } })
    if (currentCount >= entitlements.commitmentsTrackedLimit) {
      throw new Error("Commitment limit reached")
    }

    const row = await tx.commitment.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        amountCents: Math.max(0, Math.round(input.amountCents)),
        currency: input.currency.toLowerCase(),
        frequency: normalizeCommitmentFrequency(input.frequency),
        nextDueDate: input.nextDueDate ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        recurrenceRule: input.recurrenceRule as never,
        supplierName: input.supplierName ?? null,
        supplierId: input.supplierId ?? null,
        accountId: input.accountId ?? null,
        source: normalizeCommitmentSource(input.source),
        status: normalizeCommitmentStatus(input.status),
        confidence: normalizeCommitmentConfidence(input.confidence),
        noticePeriodDays: input.noticePeriodDays ?? null,
        renewalDate: input.renewalDate ?? null,
        autoRenew: input.autoRenew ?? false,
        cancellable: input.cancellable ?? true,
        essentiality: normalizeCommitmentEssentiality(input.essentiality),
        notes: input.notes ?? null,
        linkedSpendInsightId: input.linkedSpendInsightId ?? null,
        linkedCostGuardAlertId: input.linkedCostGuardAlertId ?? null,
      },
    })

    const audit: CommitGuardAuditPayload = {
      eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED,
      title: "Commitment created",
      message: `${row.name} has been added to CommitGuard.`,
      commitmentId: row.id,
      metadata: {
        amountCents: row.amountCents,
        category: row.category,
        source: row.source,
      },
    }

    await tx.commitmentEvent.create({
      data: {
        userId,
        commitmentId: row.id,
        eventType: audit.eventType,
        severity: "info",
        title: audit.title,
        message: audit.message,
        metadata: audit.metadata as never,
      },
    })

    return {
      commitment: toCommitmentSnapshot(row),
      audit,
    }
  })
}

export async function updateCommitment(
  userId: string,
  commitmentId: string,
  input: Partial<UpsertCommitmentInput>,
): Promise<{ commitment: CommitmentSnapshot; audit: CommitGuardAuditPayload } | null> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const existing = await tx.commitment.findFirst({
      where: { id: commitmentId, userId },
    })
    if (!existing) return null

    const row = await tx.commitment.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        amountCents:
          input.amountCents === undefined ? undefined : Math.max(0, Math.round(input.amountCents)),
        currency: input.currency?.toLowerCase(),
        frequency: input.frequency ? normalizeCommitmentFrequency(input.frequency) : undefined,
        nextDueDate: input.nextDueDate,
        startDate: input.startDate,
        endDate: input.endDate,
        recurrenceRule: input.recurrenceRule as never,
        supplierName: input.supplierName,
        supplierId: input.supplierId,
        accountId: input.accountId,
        source: input.source ? normalizeCommitmentSource(input.source) : undefined,
        status: input.status ? normalizeCommitmentStatus(input.status) : undefined,
        confidence: input.confidence ? normalizeCommitmentConfidence(input.confidence) : undefined,
        noticePeriodDays: input.noticePeriodDays,
        renewalDate: input.renewalDate,
        autoRenew: input.autoRenew,
        cancellable: input.cancellable,
        essentiality: input.essentiality
          ? normalizeCommitmentEssentiality(input.essentiality)
          : undefined,
        notes: input.notes,
        linkedSpendInsightId: input.linkedSpendInsightId,
        linkedCostGuardAlertId: input.linkedCostGuardAlertId,
      },
    })

    const audit: CommitGuardAuditPayload = {
      eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_UPDATED,
      title: "Commitment updated",
      message: `${row.name} has been updated.`,
      commitmentId: row.id,
      metadata: {
        previousAmountCents: existing.amountCents,
        amountCents: row.amountCents,
        previousNextDueDate: existing.nextDueDate?.toISOString() ?? null,
        nextDueDate: row.nextDueDate?.toISOString() ?? null,
      },
    }

    await tx.commitmentEvent.create({
      data: {
        userId,
        commitmentId: row.id,
        eventType: audit.eventType,
        severity: "info",
        title: audit.title,
        message: audit.message,
        metadata: audit.metadata as never,
      },
    })

    const amountDeltaCents = Math.abs(row.amountCents - existing.amountCents)
    const amountDeltaBaseline = Math.max(existing.amountCents, 1)
    const amountDeltaPercent = amountDeltaCents / amountDeltaBaseline
    const isMaterialChange =
      amountDeltaCents >= MATERIAL_AMOUNT_DELTA_CENTS ||
      amountDeltaPercent >= MATERIAL_AMOUNT_DELTA_PERCENT

    if (isMaterialChange) {
      const settings = await tx.commitGuardSetting.findUnique({
        where: { userId },
        select: { alertCommitmentAmountChanged: true },
      })
      if (settings && !settings.alertCommitmentAmountChanged) {
        return {
          commitment: toCommitmentSnapshot(row),
          audit,
        }
      }

      const dedupeKey = buildCommitGuardEventDedupeKey({
        eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_AMOUNT_CHANGED,
        commitmentId: row.id,
        amountCents: row.amountCents,
      })

      if (dedupeKey) {
        await tx.commitmentEvent.upsert({
          where: {
            userId_dedupeKey: {
              userId,
              dedupeKey,
            },
          },
          update: {
            message: `${row.name} changed from ${existing.amountCents} to ${row.amountCents}.`,
            metadata: {
              previousAmountCents: existing.amountCents,
              currentAmountCents: row.amountCents,
              amountDeltaCents,
              amountDeltaPercent,
            } as never,
          },
          create: {
            userId,
            commitmentId: row.id,
            eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_AMOUNT_CHANGED,
            severity: amountDeltaPercent >= 0.35 ? "warning" : "watch",
            dedupeKey,
            title: "Commitment amount changed",
            message: `${row.name} changed from ${existing.amountCents} to ${row.amountCents}.`,
            metadata: {
              previousAmountCents: existing.amountCents,
              currentAmountCents: row.amountCents,
              amountDeltaCents,
              amountDeltaPercent,
            } as never,
          },
        })
      }
    }

    return {
      commitment: toCommitmentSnapshot(row),
      audit,
    }
  })
}

export async function transitionCommitment(
  userId: string,
  commitmentId: string,
  action: "pause" | "resume" | "cancel" | "confirm",
  actorId?: string | null,
): Promise<{ commitment: CommitmentSnapshot; audit: CommitGuardAuditPayload } | null> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const existing = await tx.commitment.findFirst({
      where: { id: commitmentId, userId },
    })
    if (!existing) return null

    const status =
      action === "pause"
        ? "paused"
        : action === "resume"
          ? "active"
          : action === "cancel"
            ? "cancelled"
            : existing.status

    const confidence = action === "confirm" ? "confirmed" : existing.confidence

    const row = await tx.commitment.update({
      where: { id: existing.id },
      data: {
        status,
        confidence,
        pausedAt: action === "pause" ? new Date() : action === "resume" ? null : undefined,
        cancelledAt: action === "cancel" ? new Date() : undefined,
      },
    })

    const eventType =
      action === "pause"
        ? COMMIT_GUARD_EVENT_TYPES.COMMITMENT_PAUSED
        : action === "resume"
          ? COMMIT_GUARD_EVENT_TYPES.COMMITMENT_RESUMED
          : action === "cancel"
            ? COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CANCELLED
            : COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CONFIRMED

    const actionPastTense =
      action === "pause"
        ? "paused"
        : action === "resume"
          ? "resumed"
          : action === "cancel"
            ? "cancelled"
            : "confirmed"

    const audit: CommitGuardAuditPayload = {
      eventType,
      title: `Commitment ${actionPastTense}`,
      message: `${row.name} has been ${actionPastTense}.`,
      commitmentId: row.id,
      metadata: { actorId: actorId ?? null },
    }

    await tx.commitmentEvent.create({
      data: {
        userId,
        commitmentId: row.id,
        eventType: audit.eventType,
        severity: action === "cancel" ? "warning" : "info",
        actorId: actorId ?? null,
        title: audit.title,
        message: audit.message,
        metadata: audit.metadata as never,
      },
    })

    return {
      commitment: toCommitmentSnapshot(row),
      audit,
    }
  })
}

export async function summarizeCommitGuard(input: {
  userId: string
  now?: Date
  cashAvailableCents: number | null
  taxProtectedCashCents?: number
  weeklyOperatingExpensesCents?: number
}): Promise<CommitGuardSummary> {
  await requireCommitGuardCoreAccess(input.userId)
  const { userId } = input

  let taxProtectedCashCents = Math.max(0, input.taxProtectedCashCents ?? 0)
  if (input.taxProtectedCashCents === undefined) {
    const hasTaxBuffer = await requireFeature(userId, "tax_buffer_basic")
    if (hasTaxBuffer) {
      const taxBufferSummary = await loadTaxBufferSummary(userId)
      taxProtectedCashCents = Math.max(0, taxBufferSummary.totalRequiredReserveCents)
    }
  }

  const [settings, commitments] = await Promise.all([
    getCommitGuardSettings(userId),
    listCommitments(userId),
  ])

  const horizons = buildCommitmentHorizonTotals({
    commitments,
    now: input.now,
  })

  const monthWindow = horizons.find((horizon) => horizon.days === 30)
  const committedCashCents = monthWindow?.totalCents ?? 0

  const safetyBufferCents = resolveSafetyBufferCents({
    settings,
    monthlyCommitmentsCents: committedCashCents,
    weeklyOperatingExpensesCents: Math.max(0, input.weeklyOperatingExpensesCents ?? 0),
  })

  const freeCash = calculateFreeCashBreakdown({
    cashAvailableCents: input.cashAvailableCents,
    committedCashCents,
    taxProtectedCashCents,
    safetyBufferCents,
  })

  const renewals = buildRenewalAssessments({
    commitments,
    now: input.now,
    warningDays: settings.renewalWarningDays,
  })

  return {
    settings,
    horizons,
    renewals,
    freeCash,
  }
}

export async function recordCommitGuardHealthEvents(input: {
  userId: string
  settings: CommitGuardSettingsSnapshot
  freeCash: FreeCashBreakdown
}): Promise<void> {
  const entitlements = await getCommitGuardEntitlements(input.userId)
  if (!entitlements.hasAdvancedAlertsAccess) return

  await withUserContext(input.userId, async (tx) => {
    if (input.freeCash.status === "shortfall" && input.settings.alertCommitmentShortfall) {
      const dedupeKey = buildCommitGuardEventDedupeKey({
        eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_SHORTFALL,
      })

      if (dedupeKey) {
        await tx.commitmentEvent.upsert({
          where: {
            userId_dedupeKey: {
              userId: input.userId,
              dedupeKey,
            },
          },
          update: {
            message: `Free cash shortfall detected: ${input.freeCash.freeCashCents ?? 0}.`,
            metadata: {
              freeCashCents: input.freeCash.freeCashCents,
              protectedCashCents: input.freeCash.protectedCashCents,
            } as never,
          },
          create: {
            userId: input.userId,
            eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_SHORTFALL,
            severity: "critical",
            dedupeKey,
            title: "Commitment shortfall detected",
            message: `Free cash shortfall detected: ${input.freeCash.freeCashCents ?? 0}.`,
            metadata: {
              freeCashCents: input.freeCash.freeCashCents,
              protectedCashCents: input.freeCash.protectedCashCents,
            } as never,
          },
        })
      }

      return
    }

    if (
      (input.freeCash.status === "at_risk" || input.freeCash.status === "watch") &&
      input.settings.alertCommitmentBufferLow
    ) {
      const dedupeKey = buildCommitGuardEventDedupeKey({
        eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_BUFFER_LOW,
      })

      if (dedupeKey) {
        await tx.commitmentEvent.upsert({
          where: {
            userId_dedupeKey: {
              userId: input.userId,
              dedupeKey,
            },
          },
          update: {
            message: `Safety buffer is low: ${input.freeCash.freeCashCents ?? 0} free cash remaining.`,
          },
          create: {
            userId: input.userId,
            eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_BUFFER_LOW,
            severity: input.freeCash.status === "at_risk" ? "warning" : "watch",
            dedupeKey,
            title: "Commitment safety buffer low",
            message: `Safety buffer is low: ${input.freeCash.freeCashCents ?? 0} free cash remaining.`,
            metadata: {
              freeCashCents: input.freeCash.freeCashCents,
              protectedCashCents: input.freeCash.protectedCashCents,
              safetyBufferCents: input.freeCash.safetyBufferCents,
            } as never,
          },
        })
      }
    }
  })
}

export async function recordCommitGuardTimelineEvents(input: {
  userId: string
  settings: CommitGuardSettingsSnapshot
  commitments: CommitmentSnapshot[]
  renewals: RenewalAssessment[]
  now?: Date
}): Promise<void> {
  const entitlements = await getCommitGuardEntitlements(input.userId)
  if (!entitlements.hasAdvancedAlertsAccess) return

  const now = input.now ?? new Date()
  const msPerDay = 24 * 60 * 60 * 1000

  await withUserContext(input.userId, async (tx) => {
    if (input.settings.alertCommitmentDueSoon) {
      const dueSoon = input.commitments.filter((commitment) => {
        if (!commitment.nextDueDate) return false
        const daysToDue = Math.floor((commitment.nextDueDate.getTime() - now.getTime()) / msPerDay)
        return daysToDue >= 0 && daysToDue <= 7 && commitment.status !== "cancelled"
      })

      for (const commitment of dueSoon) {
        const dedupeKey = buildCommitGuardEventDedupeKey({
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DUE_SOON,
          commitmentId: commitment.id,
          date: commitment.nextDueDate ?? now,
        })

        if (!dedupeKey) continue

        await tx.commitmentEvent.upsert({
          where: {
            userId_dedupeKey: {
              userId: input.userId,
              dedupeKey,
            },
          },
          update: {
            message: `${commitment.name} is due on ${commitment.nextDueDate?.toISOString().slice(0, 10) ?? "soon"}.`,
          },
          create: {
            userId: input.userId,
            commitmentId: commitment.id,
            eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DUE_SOON,
            severity: "watch",
            dedupeKey,
            title: "Commitment due soon",
            message: `${commitment.name} is due on ${commitment.nextDueDate?.toISOString().slice(0, 10) ?? "soon"}.`,
          },
        })
      }
    }

    for (const renewal of input.renewals) {
      if (
        input.settings.alertRenewalApproaching &&
        renewal.daysToNoticeClose > 0 &&
        renewal.daysToNoticeClose <= Math.max(...input.settings.renewalWarningDays)
      ) {
        const dedupeKey = buildCommitGuardEventDedupeKey({
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_RENEWAL_APPROACHING,
          commitmentId: renewal.commitmentId,
          date: renewal.renewalDate,
          windowDays: renewal.daysToNoticeClose,
        })

        if (dedupeKey) {
          await tx.commitmentEvent.upsert({
            where: {
              userId_dedupeKey: {
                userId: input.userId,
                dedupeKey,
              },
            },
            update: {
              message: `${renewal.name} renews on ${renewal.renewalDate.toISOString().slice(0, 10)}.`,
            },
            create: {
              userId: input.userId,
              commitmentId: renewal.commitmentId,
              eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_RENEWAL_APPROACHING,
              severity:
                renewal.severity === "urgent"
                  ? "critical"
                  : renewal.severity === "action_required"
                    ? "warning"
                    : renewal.severity === "watch"
                      ? "watch"
                      : "info",
              dedupeKey,
              title: "Commitment renewal approaching",
              message: `${renewal.name} renews on ${renewal.renewalDate.toISOString().slice(0, 10)}.`,
              metadata: {
                noticeCloseDate: renewal.noticeCloseDate.toISOString(),
                daysToNoticeClose: renewal.daysToNoticeClose,
              } as never,
            },
          })
        }
      }

      if (input.settings.alertNoticePeriodApproaching && renewal.daysToNoticeClose <= 7) {
        const dedupeKey = buildCommitGuardEventDedupeKey({
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_NOTICE_PERIOD_APPROACHING,
          commitmentId: renewal.commitmentId,
          date: renewal.noticeCloseDate,
          windowDays: renewal.daysToNoticeClose,
        })

        if (dedupeKey) {
          await tx.commitmentEvent.upsert({
            where: {
              userId_dedupeKey: {
                userId: input.userId,
                dedupeKey,
              },
            },
            update: {
              message: `${renewal.name} notice period closes on ${renewal.noticeCloseDate.toISOString().slice(0, 10)}.`,
            },
            create: {
              userId: input.userId,
              commitmentId: renewal.commitmentId,
              eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_NOTICE_PERIOD_APPROACHING,
              severity: renewal.daysToNoticeClose <= 0 ? "critical" : "warning",
              dedupeKey,
              title: "Commitment notice period approaching",
              message: `${renewal.name} notice period closes on ${renewal.noticeCloseDate.toISOString().slice(0, 10)}.`,
              metadata: {
                renewalDate: renewal.renewalDate.toISOString(),
                daysToNoticeClose: renewal.daysToNoticeClose,
              } as never,
            },
          })
        }
      }
    }
  })
}
