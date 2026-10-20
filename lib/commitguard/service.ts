import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { Prisma } from "@/lib/generated/prisma/client"
import { requireFeature } from "@/lib/billing"
import {
  getCommitGuardEntitlements,
  requireCommitGuardCoreAccess,
} from "@/lib/commitguard/entitlements"
import {
  buildCommitmentProtection,
  type CommitmentProtectionProjection,
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
} from "@/lib/commitguard/types"
import { CommitGuardSettingsSchema, type CommitGuardSettingsInput } from "@/lib/commitguard/settingsSchema"
import { requestCommitGuardEvaluation } from "@/lib/commitguard/evaluationRequest"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import { z } from "zod"
import { lockCommitmentForMutation, planCommitmentTransition, commitmentChangedFields } from "@/lib/commitguard/commitmentMutation"
import { validateCommitmentScheduleWrite } from "@/lib/commitguard/commitmentSchedule"
import { loadCommitGuardCashContextInTransaction } from "@/lib/commitguard/cashContextLoader"
import { loadCommitGuardProtectionFactsInTransaction } from "@/lib/commitguard/protectionFactsLoader"
import { loadCommitGuardCoverageInputsInTransaction } from "@/lib/commitguard/coverageService"
import { buildCommitGuardSummary, buildCommitGuardCashPlanAdapter,
  type CommitGuardSummaryInput, type CommitGuardSummary } from "@/lib/commitguard/summary"

export type { CommitGuardSummary } from "@/lib/commitguard/summary"

const DEFAULT_RENEWAL_WARNING_DAYS = [90, 60, 30, 14, 7]

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
  archivedAt?: Date | null
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
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toSettingsSnapshot(row: {
  enabled: boolean
  defaultHorizonDays: number
  safetyBufferMode: string
  safetyBufferFixedCents: number
  safetyBufferCurrency: string | null
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
    safetyBufferCurrency: row.safetyBufferCurrency ?? null,
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
        safetyBufferCurrency: true,
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
  input: CommitGuardSettingsInput,
): Promise<CommitGuardSettingsSnapshot> {
  await requireCommitGuardCoreAccess(userId)
  input = CommitGuardSettingsSchema.parse(input)
  return withUserContext(userId, async (tx) => {
    // Same lock as cash-context writes: policy, revision and pending evaluation
    // commit together, without racing a cash attestation or another policy write.
    await lockCommitGuardTenant(tx, userId)
    const previous = await tx.commitGuardSetting.findUnique({ where: { userId } })
    if (previous) {
      const current = toSettingsSnapshot(previous)
      const proposed = toSettingsSnapshot({ ...previous, ...Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ) })
      // Compare effective policy before writing, preserving updatedAt on retries
      // (including legacy warning lists that normalize to the same defaults).
      if (JSON.stringify(current) === JSON.stringify(proposed)) return current
    }
    const settings = await tx.commitGuardSetting.upsert({
      where: { userId },
      create: {
        userId,
        enabled: input.enabled ?? false,
        defaultHorizonDays: input.defaultHorizonDays ?? 30,
        safetyBufferMode: normalizeSafetyBufferMode(input.safetyBufferMode),
        safetyBufferFixedCents: input.safetyBufferFixedCents ?? 0,
        safetyBufferCurrency: input.safetyBufferCurrency ?? null,
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
            : input.safetyBufferFixedCents,
        safetyBufferCurrency: input.safetyBufferCurrency,
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
        safetyBufferCurrency: true,
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

    const snapshot = toSettingsSnapshot(settings)
    if (previous === null || JSON.stringify(toSettingsSnapshot(previous)) !== JSON.stringify(snapshot)) {
      await requestCommitGuardEvaluation(tx, userId)
    }
    return snapshot
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
  await requireCommitGuardCoreAccess(userId)

  validateCommitmentScheduleWrite(input)
  return withUserContext(userId, async (tx) => {
    // Manual creation and detection conversion share this transaction lock.
    // Refresh access after waiting; count and create must stay in this boundary.
    await lockCommitGuardTenant(tx, userId)
    const entitlements = await getCommitGuardEntitlements(userId)
    if (!entitlements.hasCoreAccess) throw new Error("Upgrade required")
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
        recurrenceRule: input.recurrenceRule === null ? Prisma.DbNull : undefined,
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

    await requestCommitGuardEvaluation(tx, userId)
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
): Promise<{ commitment: CommitmentSnapshot; audit: CommitGuardAuditPayload | null } | null> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const existing = await lockCommitmentForMutation(tx, userId, commitmentId)
    if (!existing) return null

    if (input.status !== undefined) {
      throw new z.ZodError([{ code: "custom", path: ["status"], message: "Use lifecycle actions to change status." }])
    }
    validateCommitmentScheduleWrite(input, existing)
    const data = {
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
        recurrenceRule: input.recurrenceRule === null ? Prisma.DbNull : undefined,
        supplierName: input.supplierName,
        supplierId: input.supplierId,
        accountId: input.accountId,
        source: input.source ? normalizeCommitmentSource(input.source) : undefined,
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
      }
    const proposed = { ...existing, ...Object.fromEntries(Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value === Prisma.DbNull ? null : value])) }
    const changedFields = commitmentChangedFields(existing, proposed, Object.keys(data))
    if (Object.keys(changedFields).length === 0) return { commitment: toCommitmentSnapshot(existing), audit: null }
    const row = await tx.commitment.update({
      where: { id: existing.id, userId },
      data,
    })

    const audit: CommitGuardAuditPayload = {
      eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_UPDATED,
      title: "Commitment updated",
      message: `${row.name} has been updated.`,
      commitmentId: row.id,
      metadata: {
        changedFields,
      },
    }

    // Every actual edit invalidates the input revision, independently of the
    // amount-alert threshold/preferences and its early return below.
    const inputRevision = await requestCommitGuardEvaluation(tx, userId)
    await tx.commitmentEvent.create({
      data: {
        userId,
        commitmentId: row.id,
        eventType: audit.eventType,
        severity: "info",
        title: audit.title,
        message: audit.message,
        inputRevision,
        metadata: { ...audit.metadata, currency: row.currency, previousCurrency: existing.currency } as never,
      },
    })

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
): Promise<{ commitment: CommitmentSnapshot; audit: CommitGuardAuditPayload | null } | null> {
  await requireCommitGuardCoreAccess(userId)
  return withUserContext(userId, async (tx) => {
    const existing = await lockCommitmentForMutation(tx, userId, commitmentId)
    if (!existing) return null

    const data = planCommitmentTransition(existing, action, new Date())
    if (data === null) return { commitment: toCommitmentSnapshot(existing), audit: null }
    const row = await tx.commitment.update({
      where: { id: existing.id, userId },
      data,
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
      metadata: { changedFields: commitmentChangedFields(existing, row, ["status", "confidence", "pausedAt", "cancelledAt"]) },
    }

    await requestCommitGuardEvaluation(tx, userId)
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

async function loadCommitGuardProtectionInputs(input: {
  userId: string
  now?: Date
  cashCurrency: string | null
}): Promise<{
  settings: CommitGuardSettingsSnapshot
  commitments: CommitmentSnapshot[]
  protection: CommitmentProtectionProjection
}> {
  await requireCommitGuardCoreAccess(input.userId)
  return withUserContext(input.userId, async (tx) => {
    const [saved, rows] = await Promise.all([
      readCommitGuardSettings(tx, input.userId),
      tx.commitment.findMany({ where: { userId: input.userId, archivedAt: null }, orderBy: { id: "asc" } }),
    ])
    const commitments = rows.map(toCommitmentSnapshot)
    const settings = saved.settings
    return { settings, commitments, protection: buildCommitmentProtection({
      commitments, now: input.now, cashCurrency: input.cashCurrency,
      selectedHorizonDays: settings.defaultHorizonDays,
    }) }
  }, { isolationLevel: "RepeatableRead" })
}

/** Task 3.3 component contract, not summary v2: preserves incompatible groups
 * and labels exclusions without asserting a consolidated free-cash amount.
 * Callers supply an explicit currency; saved cash/quality composition is task 3.7.
 */
export async function loadCommitGuardCommitmentProtection(input: {
  userId: string
  now?: Date
  cashCurrency: string | null
}): Promise<CommitmentProtectionProjection> {
  return (await loadCommitGuardProtectionInputs(input)).protection
}

// Canonical schema defaults, in memory ONLY. Reading a missing configuration
// must never enable the module or materialize a settings row.
async function readCommitGuardSettings(tx: PrismaTx, userId: string): Promise<{
  settings: CommitGuardSettingsSnapshot; calculationRevision: number
}> {
  const row = await tx.commitGuardSetting.findUnique({ where: { userId } })
  return row ? { settings: toSettingsSnapshot(row), calculationRevision: row.calculationRevision } : {
    calculationRevision: 0,
    settings: { enabled: false, defaultHorizonDays: 30, safetyBufferMode: "fixed_amount",
      safetyBufferFixedCents: 0, safetyBufferCurrency: null, safetyBufferPercent: null, safetyBufferWeeks: null,
      detectRecurringCommitments: false, detectionMinOccurrences: 3, detectionAmountVariancePercent: 12,
      detectionIntervalToleranceDays: 3, detectionConfidenceThreshold: "medium", alertCommitmentDueSoon: true,
      alertRenewalApproaching: true, alertNoticePeriodApproaching: true, alertCommitmentAmountChanged: true,
      alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: DEFAULT_RENEWAL_WARNING_DAYS },
  }
}

/** Shared saved-input loader for both GET contracts. All financial reads share
 * one repeatable-read RLS snapshot; access checks remain outside it. */
async function loadCommitGuardSummaryInput(input: { userId: string; now?: Date }): Promise<CommitGuardSummaryInput> {
  const now = input.now ?? new Date()
  await requireCommitGuardCoreAccess(input.userId)
  const taxEntitled = await requireFeature(input.userId, "tax_buffer_basic", { now })
  return withUserContext(input.userId, (tx) =>
    loadCommitGuardSummaryInputInTransaction(tx, input.userId, taxEntitled, now),
  { isolationLevel: "RepeatableRead" })
}

/** Read-only shared inputs. Job callers supply entitlement resolved by their
 * transaction boundary, not a queued tier or an independent permission read. */
export async function loadCommitGuardSummaryInputInTransaction(
  tx: PrismaTx, userId: string, taxEntitled: boolean, now: Date,
): Promise<CommitGuardSummaryInput> {
    const [{ settings, calculationRevision }, cashContext, rows] = await Promise.all([
      readCommitGuardSettings(tx, userId),
      loadCommitGuardCashContextInTransaction(tx, userId, now),
      tx.commitment.findMany({ where: { userId, archivedAt: null }, orderBy: { id: "asc" } }),
    ])
    const commitments = rows.map(toCommitmentSnapshot)
    const tax = await loadCommitGuardProtectionFactsInTransaction(tx, userId, taxEntitled, now, cashContext)
    const coverage = await loadCommitGuardCoverageInputsInTransaction(tx, userId, now, { commitments, facts: tax })
    return { settings, calculationRevision, cashContext, commitments, tax, coverage, now }
}

export async function summarizeCommitGuard(input: { userId: string; now?: Date }): Promise<CommitGuardSummary> {
  return buildCommitGuardSummary(await loadCommitGuardSummaryInput(input))
}

export async function loadCommitGuardCashPlanAdapter(input: { userId: string; now?: Date }): Promise<ReturnType<typeof buildCommitGuardCashPlanAdapter>> {
  const facts = await loadCommitGuardSummaryInput(input)
  return buildCommitGuardCashPlanAdapter(facts, buildCommitGuardSummary(facts))
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
