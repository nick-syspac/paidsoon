import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import {
  toCommitGuardCashContextDto,
  type CommitGuardCashContextDto,
} from "@/lib/commitguard/cashContext"

/**
 * Read-only D2 fact loader. userId is the authenticated caller's identity, never
 * request-body input. Entry-point access guards belong to the calling route/job;
 * this loader has no Tax Buffer, settings-default, or entitlement dependency.
 */
export async function loadCommitGuardCashContext(
  userId: string,
  now: Date = new Date(),
): Promise<CommitGuardCashContextDto> {
  return withUserContext(userId, (tx) => loadCommitGuardCashContextInTransaction(tx, userId, now))
}

/** Same read-only projection inside a summary's coherent tenant snapshot. */
export async function loadCommitGuardCashContextInTransaction(
  tx: PrismaTx, userId: string, now: Date,
): Promise<CommitGuardCashContextDto> {
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
    return toCommitGuardCashContextDto(row, now)
}