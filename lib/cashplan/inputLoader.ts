import { assembleCashPlanInputs, type CashPlanAssemblyInputs } from "@/lib/cashplan/assembler"
import { loadCommitGuardCashContextInTransaction } from "@/lib/commitguard/cashContextLoader"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"

const configurationSelect = {
  currency: true, timezone: true, horizonWeeks: true, bufferTargetCents: true,
  updatedAt: true,
} as const
const latestFirst = [{ createdAt: "desc" }, { id: "desc" }] as const

export class CashPlanNotFoundError extends Error {
  readonly status = 404
  constructor() { super("Not found") }
}

/** Caller supplies authenticated identity and enforces CashPlan access. No GET
 * defaults, snapshots, or other financial writes; no dependency on Tax Buffer. */
export async function loadCashPlanInputs(
  userId: string, options: { planId?: string; now?: Date } = {},
): Promise<CashPlanAssemblyInputs> {
  const now = options.now ?? new Date()
  return withUserContext(userId, (tx) => loadCashPlanInputsInTransaction(tx, userId, { ...options, now }))
}

export async function loadCashPlanInputsInTransaction(
  tx: PrismaTx, userId: string, options: { planId?: string; now: Date },
): Promise<CashPlanAssemblyInputs> {
  const plan = await tx.cashPlan.findFirst({
    where: { userId, ...(options.planId === undefined ? {} : { id: options.planId }) },
    orderBy: [...latestFirst],
    select: { id: true, name: true, ...configurationSelect },
  })
  // Explicit requested IDs must not fall through to another plan or global defaults.
  if (options.planId !== undefined && !plan) throw new CashPlanNotFoundError()
  let settings = plan ? await tx.cashPlanSetting.findFirst({
    where: { userId, planId: plan.id }, orderBy: [...latestFirst],
    select: { id: true, planId: true, ...configurationSelect, alertThresholdCents: true, reviewRole: true },
  }) : null
  if (plan && !settings) settings = await tx.cashPlanSetting.findFirst({
    where: { userId, planId: null }, orderBy: [...latestFirst],
    select: { id: true, planId: true, ...configurationSelect, alertThresholdCents: true, reviewRole: true },
  })
  const cashContext = await loadCommitGuardCashContextInTransaction(tx, userId, options.now)
  return assembleCashPlanInputs({ plan, settings, cashContext, now: options.now })
}