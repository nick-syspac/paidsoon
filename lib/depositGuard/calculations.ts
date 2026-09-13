export type DepositCalculationRounding = "nearest" | "up" | "down"
export type DepositSourceTaxMode = "inclusive" | "exclusive"
export type DepositType = "none" | "percentage" | "fixed"

export interface CalculateRequiredDepositInput {
  depositType: DepositType
  depositPercentage?: number
  depositFixedAmountCents?: number
  sourceAmountCents: number
  taxAmountCents?: number
  sourceTaxMode: DepositSourceTaxMode
  amountPaidCents?: number
  roundingMode?: DepositCalculationRounding
}

export interface DepositCalculationResult {
  sourceAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  requiredDepositAmountCents: number
  amountPaidCents: number
  outstandingAmountCents: number
  commencementBlocked: boolean
}

function assertInt(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer in cents`)
  }
}

function assertNonNegative(value: number, field: string): void {
  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to 0`)
  }
}

function normalizeTaxAmount(input: CalculateRequiredDepositInput): number {
  const taxAmountCents = input.taxAmountCents ?? 0
  assertInt(taxAmountCents, "taxAmountCents")
  assertNonNegative(taxAmountCents, "taxAmountCents")
  return taxAmountCents
}

function resolveTotalAmountCents(input: CalculateRequiredDepositInput): {
  sourceAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
} {
  assertInt(input.sourceAmountCents, "sourceAmountCents")
  assertNonNegative(input.sourceAmountCents, "sourceAmountCents")

  const taxAmountCents = normalizeTaxAmount(input)
  const totalAmountCents =
    input.sourceTaxMode === "exclusive"
      ? input.sourceAmountCents + taxAmountCents
      : input.sourceAmountCents

  return {
    sourceAmountCents: input.sourceAmountCents,
    taxAmountCents,
    totalAmountCents,
  }
}

function percentageToPerHundredThousand(percentage: number): bigint {
  if (!Number.isFinite(percentage)) {
    throw new Error("depositPercentage must be a finite number")
  }
  if (percentage < 0 || percentage > 100) {
    throw new Error("depositPercentage must be between 0 and 100")
  }

  // Supports up to 3 decimal places for percentage input.
  const scaled = Math.round(percentage * 1000)
  return BigInt(scaled)
}

function divideWithRounding(
  numerator: bigint,
  denominator: bigint,
  mode: DepositCalculationRounding,
): bigint {
  const zero = BigInt(0)
  const one = BigInt(1)
  const two = BigInt(2)
  const quotient = numerator / denominator
  const remainder = numerator % denominator

  if (remainder === zero) return quotient
  if (mode === "down") return quotient
  if (mode === "up") return quotient + one

  return remainder * two >= denominator ? quotient + one : quotient
}

function calculatePercentageDepositCents(
  totalAmountCents: number,
  percentage: number,
  roundingMode: DepositCalculationRounding,
): number {
  const perHundredThousand = percentageToPerHundredThousand(percentage)
  const numerator = BigInt(totalAmountCents) * perHundredThousand
  const rounded = divideWithRounding(numerator, BigInt(100_000), roundingMode)
  return Number(rounded)
}

function calculateRequiredDepositAmountCents(
  input: CalculateRequiredDepositInput,
  totalAmountCents: number,
): number {
  const roundingMode = input.roundingMode ?? "nearest"

  switch (input.depositType) {
    case "none":
      return 0
    case "fixed": {
      const fixed = input.depositFixedAmountCents ?? 0
      assertInt(fixed, "depositFixedAmountCents")
      assertNonNegative(fixed, "depositFixedAmountCents")
      return fixed
    }
    case "percentage": {
      return calculatePercentageDepositCents(
        totalAmountCents,
        input.depositPercentage ?? 0,
        roundingMode,
      )
    }
  }
}

export function calculateRequiredDeposit(
  input: CalculateRequiredDepositInput,
): DepositCalculationResult {
  const { sourceAmountCents, taxAmountCents, totalAmountCents } =
    resolveTotalAmountCents(input)

  const requiredDepositAmountCents = calculateRequiredDepositAmountCents(
    input,
    totalAmountCents,
  )

  if (requiredDepositAmountCents > totalAmountCents) {
    throw new Error("Required deposit cannot exceed total amount")
  }

  const amountPaidCents = input.amountPaidCents ?? 0
  assertInt(amountPaidCents, "amountPaidCents")
  assertNonNegative(amountPaidCents, "amountPaidCents")

  const outstandingAmountCents = Math.max(
    0,
    totalAmountCents - amountPaidCents,
  )
  const commencementBlocked =
    requiredDepositAmountCents > 0 && amountPaidCents < requiredDepositAmountCents

  return {
    sourceAmountCents,
    taxAmountCents,
    totalAmountCents,
    requiredDepositAmountCents,
    amountPaidCents,
    outstandingAmountCents,
    commencementBlocked,
  }
}
