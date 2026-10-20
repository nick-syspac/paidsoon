import { z } from "zod"
import {
  CommitGuardCurrencySchema,
  createCommitGuardCashContextSchema,
  type CommitGuardCashContextDto,
  type CommitGuardCashContextInput,
} from "@/lib/commitguard/cashContext"

export interface CashContextDraft {
  amount: string
  currency: string
  balanceAsOf: string
  weeklyAmount: string
  weeklyCurrency: string
  weeklyAsOf: string
  taxCurrency: string
}

export type CashContextErrors = Partial<Record<keyof CashContextDraft, string>>

/** Decimal text to cents without floating point rounding or exponent notation. */
export function parseCashContextAmount(text: string, nonnegative = false): number | null {
  const value = text.trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value) || value.length > 32) return null
  const negative = value.startsWith("-")
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".")
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))
  const signed = negative ? -cents : cents
  if (signed < BigInt(-2_147_483_648) || signed > BigInt(2_147_483_647) || (nonnegative && signed < BigInt(0))) return null
  return Number(signed)
}

function decimal(cents: number | null): string {
  if (cents === null) return ""
  const absolute = Math.abs(cents)
  return `${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

export function cashContextDraft(dto: CommitGuardCashContextDto): CashContextDraft {
  return {
    amount: decimal(dto.amountCents), currency: dto.currency ?? "", balanceAsOf: dto.balanceAsOf ?? "",
    weeklyAmount: decimal(dto.weeklyOperatingExpensesCents), weeklyCurrency: dto.weeklyExpensesCurrency ?? "",
    weeklyAsOf: dto.weeklyExpensesAsOf ?? "", taxCurrency: dto.taxProtectionCurrency ?? "",
  }
}

export function validateCashContextDraft(
  draft: CashContextDraft, expectedRevision: number, now: Date,
): { input: CommitGuardCashContextInput; errors?: never } | { errors: CashContextErrors; input?: never } {
  const errors: CashContextErrors = {}
  const input: CommitGuardCashContextInput = { expectedRevision }
  const groups = [
    ["amount", "currency", "balanceAsOf", "amountCents", "currency", "balanceAsOf", false],
    ["weeklyAmount", "weeklyCurrency", "weeklyAsOf", "weeklyOperatingExpensesCents", "weeklyExpensesCurrency", "weeklyExpensesAsOf", true],
  ] as const
  for (const [amountKey, currencyKey, dateKey, centsField, currencyField, dateField, nonnegative] of groups) {
    const empty = !draft[amountKey].trim() && !draft[currencyKey] && !draft[dateKey]
    const amount = empty ? null : parseCashContextAmount(draft[amountKey], nonnegative)
    const currency = empty ? null : CommitGuardCurrencySchema.safeParse(draft[currencyKey])
    const date = empty ? null : z.iso.date().refine((value) => value <= now.toISOString().slice(0, 10)).safeParse(draft[dateKey])
    if (!empty) {
      if (amount === null) errors[amountKey] = nonnegative
        ? "Enter a nonnegative amount with at most two decimal places, up to 21474836.47."
        : "Enter an amount with at most two decimal places, from -21474836.48 to 21474836.47."
      if (!currency?.success) errors[currencyKey] = "Choose a supported currency."
      if (!date?.success) errors[dateKey] = "Enter a real UTC date no later than today."
    }
    input[centsField] = amount
    input[currencyField] = currency?.success ? currency.data : null
    input[dateField] = date?.success ? date.data : null
  }
  const tax = draft.taxCurrency === "" ? null : CommitGuardCurrencySchema.safeParse(draft.taxCurrency)
  if (tax && !tax.success) errors.taxCurrency = "Choose a supported currency or leave the attestation unset."
  input.taxProtectionCurrency = tax?.success ? tax.data : null
  if (Object.keys(errors).length) return { errors }
  return { input: createCommitGuardCashContextSchema(now).parse(input) }
}

const cents = z.number().int().min(-2_147_483_648).max(2_147_483_647)
const responseSchema = z.object({ cashContext: z.object({
  amountCents: cents.nullable(), currency: CommitGuardCurrencySchema.nullable(), balanceAsOf: z.iso.date().nullable(),
  weeklyOperatingExpensesCents: cents.min(0).nullable(), weeklyExpensesCurrency: CommitGuardCurrencySchema.nullable(),
  weeklyExpensesAsOf: z.iso.date().nullable(), taxProtectionCurrency: CommitGuardCurrencySchema.nullable(),
  revision: z.number().int().min(0).max(2_147_483_647), asOf: z.iso.date(), source: z.literal("owner_entered"),
  freshness: z.enum(["missing", "fresh", "stale"]), weeklyExpensesFreshness: z.enum(["missing", "fresh", "stale"]),
}).strict() })

export type CashContextRequest = (url: string, init?: RequestInit) => Promise<Response>
export class CashContextRequestError extends Error {
  constructor(public readonly status: number) {
    super(status === 409 ? "Cash inputs changed elsewhere." : "Cash inputs could not be loaded or saved.")
  }
}

/** No retries: a failed read must never replay a successful PUT. */
export async function requestCashContext(
  request: CashContextRequest, input?: CommitGuardCashContextInput,
): Promise<CommitGuardCashContextDto> {
  const response = await request("/api/commitguard/cash-context", input ? {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store",
  } : { cache: "no-store" })
  if (!response.ok) throw new CashContextRequestError(response.status)
  const dto = responseSchema.parse(await response.json()).cashContext
  createCommitGuardCashContextSchema(new Date(`${dto.asOf}T00:00:00Z`)).parse({
    expectedRevision: dto.revision, amountCents: dto.amountCents, currency: dto.currency, balanceAsOf: dto.balanceAsOf,
    weeklyOperatingExpensesCents: dto.weeklyOperatingExpensesCents, weeklyExpensesCurrency: dto.weeklyExpensesCurrency,
    weeklyExpensesAsOf: dto.weeklyExpensesAsOf, taxProtectionCurrency: dto.taxProtectionCurrency,
  })
  return dto
}

export type CashContextSaveResult =
  | { kind: "conflict" }
  | { kind: "failed" }
  | { kind: "saved"; context: CommitGuardCashContextDto; savedRevision: number; refreshFailed: boolean }

export async function saveCashContextDraft(
  request: CashContextRequest, input: CommitGuardCashContextInput,
  onSaved: (context: CommitGuardCashContextDto) => void, refresh: () => void | Promise<void>,
): Promise<CashContextSaveResult> {
  let saved: CommitGuardCashContextDto
  try { saved = await requestCashContext(request, input) } catch (error) {
    return { kind: error instanceof CashContextRequestError && error.status === 409 ? "conflict" : "failed" }
  }
  onSaved(saved)
  let loaded = saved
  let refreshFailed = false
  try {
    loaded = await requestCashContext(request)
  } catch { refreshFailed = true }
  // Independent read failure must not skip coherent workspace/server refresh.
  // Neither read path can ever replay the successful PUT.
  try { await refresh() } catch { refreshFailed = true }
  return { kind: "saved", context: loaded, savedRevision: saved.revision, refreshFailed }
}