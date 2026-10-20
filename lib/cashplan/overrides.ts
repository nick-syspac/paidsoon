import { z } from "zod"
import type { CashPlanAnchor } from "@/lib/cashplan/calendar"
import { getCashPlanWeekIndex } from "@/lib/cashplan/calendar"

export interface CashPlanStoredOverride {
  id: string
  planId: string
  entityType: string
  entityId: string
  amountCents: number | null
  plannedDate: Date | null
  effectiveFrom: Date | null
  expiresAt: Date | null
  sourceType: string
  sourceId: string | null
  updatedAt: Date
}

export interface CashPlanOverrideTarget {
  id: string
  kind: "inflow" | "outflow"
  amountCents: number
  dueDate: string
  weekIndex: number | null
  included?: boolean
  appliedOverrideId?: string
}

export interface CashPlanPlannedReview {
  id: string
  kind: "inflow" | "outflow"
  amountCents: number | null
  plannedDate: string | null
  state: "scheduled" | "timing_review" | "outside_window" | "excluded"
}

const validDate = (date: Date | null): date is Date => date instanceof Date && Number.isFinite(date.getTime())
const validPlannedDate = (date: Date): boolean => validDate(date) &&
  date.toISOString().endsWith("T00:00:00.000Z") && z.iso.date().safeParse(date.toISOString().slice(0, 10)).success
const amount = z.number().int().min(0).max(2_147_483_647)

/** Overrides are replacements of exact current targets, not a source registry.
 * Validate before selecting a winner: an invalid newer row cannot hide an older
 * valid correction. Zero explicitly excludes; null leaves the target amount. */
export function applyCashPlanOverrides<T extends CashPlanOverrideTarget>(input: {
  planId: string; now: Date; anchor: CashPlanAnchor; targets: readonly T[]
  overrides: readonly CashPlanStoredOverride[]
}): {
  targets: T[]; manual: Array<CashPlanOverrideTarget & { sourceUpdatedAt: string; sourceId: string }>
  plannedItems: CashPlanPlannedReview[]; issues: Array<{ reason: "override_review" | "timing_review"; sourceId: string }>
} {
  const targets = input.targets.map((row) => ({ ...row }))
  const manual: ReturnType<typeof applyCashPlanOverrides<T>>["manual"] = []
  const plannedItems: CashPlanPlannedReview[] = []
  const issues: ReturnType<typeof applyCashPlanOverrides<T>>["issues"] = []
  const seen = new Set<string>()
  const rows = [...input.overrides].sort((a, b) =>
    (validDate(b.updatedAt) ? b.updatedAt.getTime() : -Infinity) -
    (validDate(a.updatedAt) ? a.updatedAt.getTime() : -Infinity) || b.id.localeCompare(a.id))
  for (const row of rows) {
    // Both loader and pure boundary enforce the selected plan. The plan itself
    // has already been selected through the tenant context.
    if (row.planId !== input.planId) continue
    const target = targets.find((fact) => fact.id === row.entityId && fact.kind === row.entityType)
    const standalone = !target && row.sourceType === "manual" &&
      !/^(commitguard|imported_bill|manual):/.test(row.entityId)
    if (!row.id.trim() || !row.entityId.trim() || !["inflow", "outflow"].includes(row.entityType) ||
      (!target && !standalone) || !validDate(row.updatedAt) ||
      (row.amountCents !== null && !amount.safeParse(row.amountCents).success) ||
      (row.plannedDate !== null && !validPlannedDate(row.plannedDate)) ||
      (row.effectiveFrom !== null && !validDate(row.effectiveFrom)) ||
      (row.expiresAt !== null && !validDate(row.expiresAt)) ||
      (row.effectiveFrom && row.expiresAt && row.effectiveFrom >= row.expiresAt)) {
      issues.push({ reason: "override_review", sourceId: row.id }); continue
    }
    if ((row.effectiveFrom && row.effectiveFrom > input.now) || (row.expiresAt && row.expiresAt <= input.now)) continue
    if (standalone && row.amountCents === null) {
      if (!row.plannedDate) {
        plannedItems.push({ id: row.id, kind: row.entityType as "inflow" | "outflow", amountCents: null,
          plannedDate: null, state: "timing_review" })
        issues.push({ reason: "timing_review", sourceId: row.id })
      }
      issues.push({ reason: "override_review", sourceId: row.id }); continue
    }
    const key = JSON.stringify([row.entityType, row.entityId])
    if (seen.has(key)) continue
    seen.add(key)
    if (target) {
      target.amountCents = row.amountCents ?? target.amountCents
      if (row.plannedDate) {
        target.dueDate = row.plannedDate.toISOString().slice(0, 10)
        target.weekIndex = getCashPlanWeekIndex(target.dueDate, input.anchor)
      }
      target.included = target.weekIndex !== null && target.amountCents > 0
      target.appliedOverrideId = row.id
      continue
    }
    const kind = row.entityType as "inflow" | "outflow"
    const plannedDate = row.plannedDate?.toISOString().slice(0, 10) ?? null
    const weekIndex = plannedDate ? getCashPlanWeekIndex(plannedDate, input.anchor) : null
    plannedItems.push({ id: row.id, kind, amountCents: row.amountCents, plannedDate,
      state: !plannedDate ? "timing_review" : row.amountCents === 0 ? "excluded" :
        weekIndex === null ? "outside_window" : "scheduled" })
    if (!plannedDate) { issues.push({ reason: "timing_review", sourceId: row.id }); continue }
    manual.push({ id: `manual:${kind}:${row.entityId}`, kind, amountCents: row.amountCents!, dueDate: plannedDate,
      weekIndex, included: weekIndex !== null && row.amountCents! > 0, appliedOverrideId: row.id,
      sourceUpdatedAt: row.updatedAt.toISOString(), sourceId: row.entityId })
  }
  return { targets, manual, plannedItems, issues }
}