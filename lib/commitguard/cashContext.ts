import { z } from "zod"

// Cents-based v1 only: never infer a currency or perform FX conversion.
export const COMMIT_GUARD_CURRENCIES = [
  "aud", "usd", "nzd", "gbp", "eur", "cad", "sgd", "hkd",
] as const

export const CommitGuardCurrencySchema = z.enum(COMMIT_GUARD_CURRENCIES)
export type CommitGuardCurrency = z.infer<typeof CommitGuardCurrencySchema>
export type CommitGuardInputFreshness = "missing" | "fresh" | "stale"

const intCents = z.number().int().min(-2_147_483_648).max(2_147_483_647)
const revision = z.number().int().min(0).max(2_147_483_647)
const DAY_MS = 86_400_000

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function attestationDate(now: Date) {
  const today = utcDate(now)
  // z.iso.date rejects rollover dates (including invalid leap days) and timestamps.
  return z.iso.date().refine((value) => value <= today, {
    message: "Date must not be in the future",
  })
}

function cashContextFields(now: Date) {
  return {
    amountCents: intCents.nullable(),
    currency: CommitGuardCurrencySchema.nullable(),
    balanceAsOf: attestationDate(now).nullable(),
    weeklyOperatingExpensesCents: intCents.min(0).nullable(),
    weeklyExpensesCurrency: CommitGuardCurrencySchema.nullable(),
    weeklyExpensesAsOf: attestationDate(now).nullable(),
    taxProtectionCurrency: CommitGuardCurrencySchema.nullable(),
  }
}

const ATTESTATION_GROUPS = [
  ["amountCents", "currency", "balanceAsOf"],
  ["weeklyOperatingExpensesCents", "weeklyExpensesCurrency", "weeklyExpensesAsOf"],
] as const

function validateGroups(
  value: Partial<Record<(typeof ATTESTATION_GROUPS)[number][number], unknown>>,
  ctx: z.RefinementCtx,
): void {
  for (const group of ATTESTATION_GROUPS) {
    const values = group.map((field) => value[field])
    const omitted = values.every((item) => item === undefined)
    const cleared = values.every((item) => item === null)
    const supplied = values.every((item) => item !== undefined && item !== null)
    if (!omitted && !cleared && !supplied) {
      for (const field of group) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Supply all three fields together, or null all three to clear",
        })
      }
    }
  }
}

/**
 * Pure PUT contract for the subsequent mutation task. Omitted groups are unchanged;
 * three explicit nulls clear a group. Clearing/changing cash never changes expenses
 * or the tax attestation. No identity, source, timestamps, or job state is accepted.
 * The caller captures one clock value for validation and the resulting DTO.
 */
export function createCommitGuardCashContextSchema(
  now: Date = new Date(),
): z.ZodType<CommitGuardCashContextInput> {
  return z.object({
    ...z.object(cashContextFields(now)).partial().shape,
    expectedRevision: revision,
  }).strict().superRefine(validateGroups)
}

export interface CommitGuardCashContextInput {
  expectedRevision: number
  amountCents?: number | null
  currency?: CommitGuardCurrency | null
  balanceAsOf?: string | null
  weeklyOperatingExpensesCents?: number | null
  weeklyExpensesCurrency?: CommitGuardCurrency | null
  weeklyExpensesAsOf?: string | null
  taxProtectionCurrency?: CommitGuardCurrency | null
}

export interface CommitGuardCashContextRecord {
  amountCents: number | null
  currency: string | null
  balanceAsOf: Date | null
  weeklyOperatingExpensesCents: number | null
  weeklyExpensesCurrency: string | null
  weeklyExpensesAsOf: Date | null
  taxProtectionCurrency: string | null
  revision: number
}

export interface CommitGuardCashContextDto {
  amountCents: number | null
  currency: CommitGuardCurrency | null
  balanceAsOf: string | null
  weeklyOperatingExpensesCents: number | null
  weeklyExpensesCurrency: CommitGuardCurrency | null
  weeklyExpensesAsOf: string | null
  taxProtectionCurrency: CommitGuardCurrency | null
  revision: number
  asOf: string
  source: "owner_entered"
  freshness: CommitGuardInputFreshness
  weeklyExpensesFreshness: CommitGuardInputFreshness
}

/** Elapsed UTC calendar days, not elapsed hours; day seven is still usable. */
export function getCommitGuardInputFreshness(
  asOf: string | null,
  now: Date = new Date(),
): CommitGuardInputFreshness {
  if (asOf === null) return "missing"
  const date = attestationDate(now).parse(asOf)
  const days = (Date.parse(utcDate(now)) - Date.parse(date)) / DAY_MS
  return days <= 7 ? "fresh" : "stale"
}

/** Explicit projection: stale amounts stay visible; missing amounts never become zero. */
export function toCommitGuardCashContextDto(
  row: CommitGuardCashContextRecord | null,
  now: Date = new Date(),
): CommitGuardCashContextDto {
  const fields = z.object({ ...cashContextFields(now), revision }).strict()
    .superRefine(validateGroups).parse({
      amountCents: row?.amountCents ?? null,
      currency: row?.currency ?? null,
      balanceAsOf: row?.balanceAsOf ? utcDate(row.balanceAsOf) : null,
      weeklyOperatingExpensesCents: row?.weeklyOperatingExpensesCents ?? null,
      weeklyExpensesCurrency: row?.weeklyExpensesCurrency ?? null,
      weeklyExpensesAsOf: row?.weeklyExpensesAsOf ? utcDate(row.weeklyExpensesAsOf) : null,
      taxProtectionCurrency: row?.taxProtectionCurrency ?? null,
      // No row means the initial revision, not a fabricated saved cash attestation.
      revision: row?.revision ?? 0,
    })

  return {
    ...fields,
    asOf: utcDate(now),
    source: "owner_entered",
    freshness: getCommitGuardInputFreshness(fields.balanceAsOf, now),
    weeklyExpensesFreshness: getCommitGuardInputFreshness(fields.weeklyExpensesAsOf, now),
  }
}