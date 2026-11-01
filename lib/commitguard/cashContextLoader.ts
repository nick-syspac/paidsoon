import { getTxUserProfile } from "@/lib/db/txUserProfile"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import {
  toCommitGuardCashContextDto,
  type CommitGuardCashContextDto,
  type CommitGuardCashContextRecord,
} from "@/lib/commitguard/cashContext"

export interface AccountDisplayPolicy {
  accountDisplayRevision: number
  accountDisplayFromDate: Date | null
  accountDisplayTimeZone: string | null
}

function normalizePolicy(policy: Partial<AccountDisplayPolicy> | null | undefined): AccountDisplayPolicy {
  return {
    accountDisplayRevision: policy?.accountDisplayRevision ?? 0,
    accountDisplayFromDate: policy?.accountDisplayFromDate ?? null,
    accountDisplayTimeZone: policy?.accountDisplayTimeZone ?? "Australia/Melbourne",
  }
}

function cutoffDateKey(value: Date | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function filterCurrentAccountDisplayRows<T extends Record<string, unknown> & {
  accountDisplayRevision?: number | null
  accountDisplayFromDate?: Date | null
  accountDisplayTimeZone?: string | null
}>(rows: T[], policy: Partial<AccountDisplayPolicy> | null | undefined): T[] {
  const effectivePolicy = normalizePolicy(policy)
  const cutoffKey = cutoffDateKey(effectivePolicy.accountDisplayFromDate)

  return rows.filter((row) => {
    const recordRevision = row.accountDisplayRevision ?? null
    const recordDate = row.accountDisplayFromDate ?? null
    const recordTimeZone = row.accountDisplayTimeZone ?? null

    if (recordRevision === null) {
      return effectivePolicy.accountDisplayRevision === 0 && cutoffKey === null && (recordDate === null || recordDate === undefined)
    }

    if (recordRevision !== effectivePolicy.accountDisplayRevision) return false
    if (effectivePolicy.accountDisplayFromDate === null) {
      return recordDate === null && recordTimeZone === null
    }

    const normalizedRecordDate = recordDate ? cutoffDateKey(recordDate) : null
    if (normalizedRecordDate !== cutoffKey) return false
    if (recordTimeZone !== null && effectivePolicy.accountDisplayTimeZone && recordTimeZone !== effectivePolicy.accountDisplayTimeZone) {
      return false
    }
    return true
  })
}

export function filterCurrentCashContextRow(
  row: CommitGuardCashContextRecord | null,
  policy: Partial<AccountDisplayPolicy> | null | undefined,
): CommitGuardCashContextRecord | null {
  const effectivePolicy = normalizePolicy(policy)
  const cutoffKey = cutoffDateKey(effectivePolicy.accountDisplayFromDate)
  if (!cutoffKey || row === null) return row

  const filtered: CommitGuardCashContextRecord = { ...row }
  const balanceAsOf = filtered.balanceAsOf ?? null
  const weeklyExpensesAsOf = filtered.weeklyExpensesAsOf ?? null
  const staleBalance = balanceAsOf !== null && cutoffDateKey(balanceAsOf) !== null && cutoffDateKey(balanceAsOf)! < cutoffKey
  const staleWeeklyExpenses = weeklyExpensesAsOf !== null && cutoffDateKey(weeklyExpensesAsOf) !== null && cutoffDateKey(weeklyExpensesAsOf)! < cutoffKey

  if (staleBalance) {
    filtered.amountCents = null
    filtered.currency = null
    filtered.balanceAsOf = null
  }
  if (staleWeeklyExpenses) {
    filtered.weeklyOperatingExpensesCents = null
    filtered.weeklyExpensesCurrency = null
    filtered.weeklyExpensesAsOf = null
  }

  const hasCurrentBalance = filtered.amountCents !== null || filtered.currency !== null || filtered.balanceAsOf !== null
  const hasCurrentWeekly = filtered.weeklyOperatingExpensesCents !== null || filtered.weeklyExpensesCurrency !== null || filtered.weeklyExpensesAsOf !== null
  if (!hasCurrentBalance && !hasCurrentWeekly) {
    filtered.taxProtectionCurrency = null
    return null
  }

  return filtered
}

/**
 * Read-only D2 fact loader. userId is the authenticated caller's identity, never
 * request-body input. Entry-point access guards belong to the calling route/job;
 * this loader has no Tax Buffer, settings-default, or entitlement dependency.
 */
export async function loadCommitGuardCashContext(
  userId: string,
  now: Date = new Date(),
  accountDisplayPolicy?: Partial<AccountDisplayPolicy> | null,
): Promise<CommitGuardCashContextDto> {
  return withUserContext(userId, (tx) => loadCommitGuardCashContextInTransaction(tx, userId, now, accountDisplayPolicy))
}

/** Same read-only projection inside a summary's coherent tenant snapshot. */
export async function loadCommitGuardCashContextInTransaction(
  tx: PrismaTx,
  userId: string,
  now: Date,
  accountDisplayPolicy?: Partial<AccountDisplayPolicy> | null,
): Promise<CommitGuardCashContextDto> {
    const userProfile = getTxUserProfile(tx)
    const effectivePolicy = normalizePolicy(accountDisplayPolicy ?? (userProfile ? await userProfile.findUnique({
      where: { userId },
      select: {
        accountDisplayFromDate: true,
        accountDisplayRevision: true,
        accountDisplayTimeZone: true,
      },
    }) : null))
    const row = await tx.commitGuardCashContext.findUnique({
      where: { userId },
      select: {
        amountCents: true,
        currency: true,
        balanceAsOf: true,
        weeklyOperatingExpensesCents: true,
        weeklyExpensesCurrency: true,
        weeklyExpensesAsOf: true,
        taxProtectionCurrency: true,
        revision: true,
      },
    })
    return toCommitGuardCashContextDto(filterCurrentCashContextRow(row, effectivePolicy), now)
}