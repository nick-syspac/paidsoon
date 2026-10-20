import { randomUUID } from "node:crypto"
import { withUserContext } from "@/lib/db/withUserContext"
import {
  createCommitGuardCashContextSchema,
  toCommitGuardCashContextDto,
  type CommitGuardCashContextDto,
  type CommitGuardCashContextInput,
} from "@/lib/commitguard/cashContext"
import { requestCommitGuardEvaluation } from "@/lib/commitguard/evaluationRequest"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"

export class CommitGuardCashContextConflict extends Error {
  constructor() {
    super("Cash context changed; reload before saving")
  }
}

const FIELDS = [
  "amountCents", "currency", "balanceAsOf", "weeklyOperatingExpensesCents",
  "weeklyExpensesCurrency", "weeklyExpensesAsOf", "taxProtectionCurrency",
] as const

const SELECT = {
  amountCents: true, currency: true, balanceAsOf: true,
  weeklyOperatingExpensesCents: true, weeklyExpensesCurrency: true,
  weeklyExpensesAsOf: true, taxProtectionCurrency: true, revision: true,
} as const

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  if (error.code === "P2002") return true
  if (error.code !== "P2010" || !("meta" in error) ||
    typeof error.meta !== "object" || error.meta === null) return false
  const meta = error.meta
  if ("code" in meta && meta.code === "23505") return true
  // Prisma 7 adapter-pg nests the original SQLSTATE in the driver error cause.
  if (!("driverAdapterError" in meta) || typeof meta.driverAdapterError !== "object" ||
    meta.driverAdapterError === null || !("cause" in meta.driverAdapterError)) return false
  const cause = meta.driverAdapterError.cause
  return typeof cause === "object" && cause !== null &&
    "originalCode" in cause && cause.originalCode === "23505"
}

/** Authenticated identity only. Mutation, audit, revision and request commit together. */
export async function saveCommitGuardCashContext(
  userId: string,
  input: CommitGuardCashContextInput,
  now: Date = new Date(),
): Promise<CommitGuardCashContextDto> {
  const parsed = createCommitGuardCashContextSchema(now).parse(input)
  return withUserContext(userId, async (tx) => {
    // Lock before any row access, including a missing row's first-create check.
    // Future D5/D7 writers must use this same key before work/financial locks.
    await lockCommitGuardTenant(tx, userId)
    await tx.$queryRaw`
      SELECT revision FROM public.commit_guard_cash_contexts
      WHERE user_id = ${userId} FOR UPDATE
    `
    const row = await tx.commitGuardCashContext.findUnique({ where: { userId }, select: SELECT })
    const current = toCommitGuardCashContextDto(row, now)
    if (parsed.expectedRevision !== current.revision) throw new CommitGuardCashContextConflict()

    const changedFields = FIELDS.filter((field) =>
      parsed[field] !== undefined && parsed[field] !== current[field])
    // A no-op still checks expectedRevision; it creates no row, audit or work.
    if (changedFields.length === 0) return current
    if (current.revision === 2_147_483_647) throw new CommitGuardCashContextConflict()

    const next = {
      ...current,
      ...Object.fromEntries(changedFields.map((field) => [field, parsed[field]])),
      revision: current.revision + 1,
    }
    const date = (value: string | null): Date | null => value === null ? null : new Date(value)
    const data = {
      amountCents: next.amountCents, currency: next.currency, balanceAsOf: date(next.balanceAsOf),
      weeklyOperatingExpensesCents: next.weeklyOperatingExpensesCents,
      weeklyExpensesCurrency: next.weeklyExpensesCurrency,
      weeklyExpensesAsOf: date(next.weeklyExpensesAsOf),
      taxProtectionCurrency: next.taxProtectionCurrency, revision: next.revision,
    }
    if (row) {
      const updated = await tx.commitGuardCashContext.updateMany({
        where: { userId, revision: parsed.expectedRevision }, data,
      })
      if (updated.count !== 1) throw new CommitGuardCashContextConflict()
    } else {
      try {
        // Like work requests, Prisma create() supplies createdAt despite its DB
        // default. The cash INSERT grant deliberately excludes created_at.
        await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO public.commit_guard_cash_contexts
            (id, user_id, amount_cents, currency, balance_as_of,
             weekly_operating_expenses_cents, weekly_expenses_currency,
             weekly_expenses_as_of, tax_protection_currency, revision, updated_at)
          VALUES (${randomUUID()}, ${userId}, ${data.amountCents}, ${data.currency},
            ${data.balanceAsOf}::date, ${data.weeklyOperatingExpensesCents},
            ${data.weeklyExpensesCurrency}, ${data.weeklyExpensesAsOf}::date,
            ${data.taxProtectionCurrency}, ${data.revision}, ${now})
          RETURNING id
        `
      } catch (error) {
        // Translate only the initial cash INSERT; do not swallow audit/work failures.
        if (isUniqueConflict(error)) throw new CommitGuardCashContextConflict()
        throw error
      }
    }

    await requestCommitGuardEvaluation(tx, userId)
    await tx.commitmentEvent.create({
      data: {
        userId, actorId: userId, eventType: "COMMITGUARD_CASH_CONTEXT_UPDATED",
        title: "Cash context updated", message: "Owner-attested cash inputs changed",
        metadata: { changedFields },
      },
      select: { id: true },
    })
    return toCommitGuardCashContextDto(data, now)
  })
}