export function calculateDepositGuardMilestoneAmountCents(input: {
  totalAmountCents: number
  amountType: "percentage" | "fixed"
  percentage?: number | null
  fixedAmountCents?: number | null
}): number {
  if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents < 0) {
    throw new Error("totalAmountCents must be a non-negative integer in cents")
  }

  if (input.amountType === "fixed") {
    const fixed = input.fixedAmountCents ?? 0
    if (!Number.isInteger(fixed) || fixed < 0) {
      throw new Error("fixedAmountCents must be a non-negative integer in cents")
    }
    if (fixed > input.totalAmountCents) {
      throw new Error("Milestone amount cannot exceed job total")
    }
    return fixed
  }

  const percentage = input.percentage ?? 0
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error("percentage must be between 0 and 100")
  }

  const scaled = Math.round(percentage * 1000)
  const numerator = BigInt(input.totalAmountCents) * BigInt(scaled)
  const amount = Number((numerator + 50_000n) / 100_000n)
  if (amount > input.totalAmountCents) {
    throw new Error("Milestone amount cannot exceed job total")
  }
  return amount
}