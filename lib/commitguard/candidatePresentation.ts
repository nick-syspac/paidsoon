import { z } from "zod"
import { CommitmentFrequencyWriteSchema } from "@/lib/commitguard/commitmentSchedule"

/** Shared boundary for route and direct service callers. Evidence currency,
 * supplier and notes are deliberately not new editable candidate fields. */
export const CandidatePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  typicalAmountCents: z.number().int().min(0).max(2_147_483_647).optional(),
  frequency: CommitmentFrequencyWriteSchema.optional(),
  suggestedDueDate: z.iso.date().optional(),
  confidence: z.enum(["confirmed", "high", "medium", "low"]).optional(),
  source: z.enum(["manual", "accounting_integration", "bank_transaction_pattern", "spendleak", "costguard", "import", "system_inferred"]).optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, { message: "Choose at least one correction" })

export function safeCandidateDate(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== "string") return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
}

export function formatCandidateMoney(cents: number, currency: string | undefined): string {
  if (!currency || !/^[a-z]{3}$/i.test(currency) || !Number.isFinite(cents)) return "Amount/currency needs review"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(),
    minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Allowlist source evidence: never forward arbitrary provider JSON or tenant IDs. */
export function safeCandidateEvidence(value: unknown): {
  sampleCount: number; sourceKind: string; observations: Array<{ sourceId: string; date: string | null; amountCents: number; currency: string }>
} {
  const evidence = object(value)
  return {
    sampleCount: typeof evidence.sampleCount === "number" ? evidence.sampleCount : 0,
    sourceKind: typeof evidence.sourceKind === "string" ? evidence.sourceKind : "unknown",
    observations: (Array.isArray(evidence.observations) ? evidence.observations : []).map((value) => {
      const row = object(value)
      return { sourceId: typeof row.sourceId === "string" ? row.sourceId : "Unknown source",
        date: safeCandidateDate(row.date), amountCents: typeof row.amountCents === "number" ? row.amountCents : 0,
        currency: typeof row.currency === "string" ? row.currency : "" }
    }),
  }
}

export type CandidateDisplay = {
  id: string; name: string; category: string; frequency: string; typicalAmountCents: number;
  confidence: string; source: string; status: string; currency?: string; supplierName?: string | null;
  suggestedDueDate?: string | null; latestObservedAt?: string | null; recurrenceAnchor?: string | null;
  evidence?: unknown; evidenceReviewRequired?: boolean; conversionReviewRequired?: boolean;
}