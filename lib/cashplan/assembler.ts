import { buildCashPlanAnchor, type CashPlanAnchor } from "@/lib/cashplan/calendar"
import type { CommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import { CommitGuardCurrencySchema, getCommitGuardInputFreshness } from "@/lib/commitguard/cashContext"

/** Read-only 8.1 configuration/cash boundary, shared by the bounded fact assembler.
 * Overrides and snapshot writes are deliberately outside this input selection. */
export interface CashPlanConfiguration {
  currency: string
  timezone: string
  horizonWeeks: number
  bufferTargetCents: number
}

export interface CashPlanSelectedPlan extends CashPlanConfiguration {
  id: string
  name: string
  updatedAt: Date
}

export interface CashPlanSelectedSettings extends CashPlanConfiguration {
  id: string
  planId: string | null
  updatedAt: Date
  alertThresholdCents?: number
  reviewRole?: string
}

export type CashPlanInputReason =
  | "missing_plan" | "unsupported_horizon" | "unsupported_timezone"
  | "unsupported_currency" | "missing_balance" | "stale_balance"
  | "cash_currency_mismatch" | "unreconciled_balance_age"

export interface CashPlanAssemblyInputs {
  plan: CashPlanSelectedPlan | null
  settings: CashPlanSelectedSettings | null
  settingsSource: "plan_settings" | "global_settings" | "plan" | null
  configuration: CashPlanConfiguration | null
  evaluatedAt: string
  anchor: CashPlanAnchor | null
  cashContext: CommitGuardCashContextDto
  startingBalance: {
    amountCents: number | null
    currency: string | null
    balanceAsOf: string | null
    evaluationDate: string
    source: "owner_entered"
    cashInputRevision: number
    estimate: true
  }
  quality: { state: "available" | "preliminary" | "unavailable"; reasons: CashPlanInputReason[] }
}

export function assembleCashPlanInputs(input: {
  plan: CashPlanSelectedPlan | null
  settings: CashPlanSelectedSettings | null
  cashContext: CommitGuardCashContextDto
  now: Date
}): CashPlanAssemblyInputs {
  const { plan, cashContext, now } = input
  // A pure caller cannot accidentally apply settings belonging to another plan.
  const settings = plan && (input.settings?.planId === plan.id || input.settings?.planId === null)
    ? input.settings : null
  const selected = plan ? settings ?? plan : null
  const configuration = selected ? {
    currency: selected.currency.toLowerCase(), timezone: selected.timezone,
    horizonWeeks: selected.horizonWeeks, bufferTargetCents: selected.bufferTargetCents,
  } : null
  const reasons: CashPlanInputReason[] = []
  let anchor: CashPlanAnchor | null = null
  if (!configuration) reasons.push("missing_plan")
  else {
    if (configuration.horizonWeeks !== 13) reasons.push("unsupported_horizon")
    if (!CommitGuardCurrencySchema.safeParse(configuration.currency).success) reasons.push("unsupported_currency")
    try { anchor = buildCashPlanAnchor(now, configuration.timezone) }
    catch (error) {
      if (!(error instanceof RangeError)) throw error
      reasons.push("unsupported_timezone")
    }
  }
  const evaluationDate = anchor?.date ?? now.toISOString().slice(0, 10)
  const freshness = getCommitGuardInputFreshness(cashContext.balanceAsOf, now)
  if (cashContext.amountCents === null || cashContext.currency === null || freshness === "missing") {
    reasons.push("missing_balance")
  } else {
    if (freshness === "stale") reasons.push("stale_balance")
    if (configuration && cashContext.currency !== configuration.currency) reasons.push("cash_currency_mismatch")
    if (freshness === "fresh" && cashContext.balanceAsOf! < evaluationDate) reasons.push("unreconciled_balance_age")
  }
  const unavailable = reasons.some((reason) => reason !== "unreconciled_balance_age")
  return {
    plan, settings, configuration,
    settingsSource: !plan ? null : settings ? settings.planId === null ? "global_settings" : "plan_settings" : "plan",
    evaluatedAt: now.toISOString(), anchor, cashContext,
    startingBalance: {
      // Gross attested cash, never free cash, reserves or a historical snapshot.
      amountCents: unavailable ? null : cashContext.amountCents,
      currency: configuration?.currency ?? null,
      balanceAsOf: cashContext.balanceAsOf, evaluationDate, source: "owner_entered",
      cashInputRevision: cashContext.revision, estimate: true,
    },
    quality: { state: unavailable ? "unavailable" : reasons.length ? "preliminary" : "available", reasons },
  }
}