import type { CommitGuardSummary } from "@/lib/commitguard/summary"

/** Stored amounts are cents, even for legacy currencies not supported for free
 * cash. Always show the source code and both decimal places; never guess FX. */
export function formatCommitGuardMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null || !Number.isSafeInteger(cents) || !currency || !/^[a-z]{3}$/i.test(currency)) return "Not available"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(),
    currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
}

/** One display contract for the page, overview and digest. No financial
 * recomputation, legacy horizon fallback, independent settings read or override. */
export interface CommitGuardSummaryPresentation {
  availableCash: string
  committedNext30Days: string
  protectedCash: string
  freeCash: string
  status: string
  quality: string
  reasons: { code: string; label: string }[]
  groups: {
    currency: string
    supportedForFreeCash: boolean
    horizons: { days: number; total: string; confirmed: string; probable: string; potential: string }[]
  }[]
  balanceDescription: string
  protectionDescription: string
}

export function presentCommitGuardSummary(summary: CommitGuardSummary): CommitGuardSummaryPresentation {
  const complete = summary.enabled && summary.quality.state === "complete"
  const groups = summary.horizonsByCurrency.map((group) => ({
    currency: group.currency,
    supportedForFreeCash: group.supportedForFreeCash,
    horizons: group.horizons.map((horizon) => ({
      days: horizon.days,
      total: formatCommitGuardMoney(horizon.totalCents, group.currency),
      confirmed: formatCommitGuardMoney(horizon.confirmedCents, group.currency),
      probable: formatCommitGuardMoney(horizon.probableCents, group.currency),
      potential: formatCommitGuardMoney(horizon.potentialCents, group.currency),
    })),
  }))
  const next30 = groups.flatMap((group) => group.horizons.filter((row) => row.days === 30).map((row) => row.total))
  return {
    availableCash: formatCommitGuardMoney(summary.cashContext.amountCents, summary.cashContext.currency),
    committedNext30Days: next30.length ? next30.join(" · ") : "Not available",
    protectedCash: formatCommitGuardMoney(complete ? summary.freeCash.protectedCashCents : null, summary.freeCash.currency),
    freeCash: formatCommitGuardMoney(complete ? summary.freeCash.freeCashCents : null, summary.freeCash.currency),
    status: complete && summary.freeCash.status ? summary.freeCash.status.replaceAll("_", " ") : "Not available",
    quality: summary.quality.state.replaceAll("_", " "),
    reasons: summary.quality.reasons.map((reason) => ({ code: reason, label: reason.replaceAll("_", " ") })),
    groups,
    balanceDescription: `Owner-entered gross cash · ${summary.cashContext.currency?.toUpperCase() ?? "Currency not available"} · Balance as of (UTC): ${summary.cashContext.balanceAsOf ?? "Not available"} · ${summary.cashContext.freshness}`,
    protectionDescription: `Protection uses the selected ${summary.selectedHorizonDays}-day horizon. The commitment hero and percentage buffer basis use 30 days. Confirmed, probable and potential commitments all count toward conservative protection. No currency conversion.`,
  }
}