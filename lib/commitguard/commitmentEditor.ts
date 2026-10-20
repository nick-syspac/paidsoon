import { z } from "zod"
import type { WorkspaceCommitment } from "@/lib/commitguard/workspace"

// ISO-only validation prevents Date's silent rollover of e.g. February 30.
export const CommitmentDateInputSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value))

export type EditableCommitment = Pick<WorkspaceCommitment,
  "id" | "name" | "category" | "amountCents" | "frequency" | "nextDueDate" | "confidence" | "status">
  & Partial<Omit<WorkspaceCommitment, "id" | "name" | "category" | "amountCents" | "frequency" | "nextDueDate" | "confidence" | "status">>

export function commitmentEditDraft(row: EditableCommitment): Record<string, string> {
  return {
    name: row.name, category: row.category, amountCents: (row.amountCents / 100).toFixed(2), currency: row.currency ?? "aud",
    frequency: row.frequency, nextDueDate: row.nextDueDate?.slice(0, 10) ?? "",
    startDate: row.startDate?.slice(0, 10) ?? "", endDate: row.endDate?.slice(0, 10) ?? "",
    renewalDate: row.renewalDate?.slice(0, 10) ?? "", noticePeriodDays: row.noticePeriodDays?.toString() ?? "",
    confidence: row.confidence, essentiality: row.essentiality ?? "operational", source: row.source ?? "manual",
    autoRenew: String(row.autoRenew ?? false), cancellable: String(row.cancellable ?? true),
    description: row.description ?? "", supplierName: row.supplierName ?? "", notes: row.notes ?? "",
  }
}

/** Send only deliberate edits, so unrelated changes preserve legacy recurrence,
 * timestamps and values. Re-fetch after a conflict does not discard this draft. */
export function commitmentDraftPatch(row: EditableCommitment, draft: Record<string, string>): {
  patch: Record<string, unknown>; errors: Record<string, string>
} {
  const original = commitmentEditDraft(row)
  const patch: Record<string, unknown> = {}, errors: Record<string, string> = {}
  for (const [field, value] of Object.entries(draft)) {
    if (value === original[field]) continue
    if (["startDate", "endDate", "nextDueDate", "renewalDate"].includes(field)) {
      if (!value) patch[field] = null
      else {
        const date = z.iso.date().safeParse(value)
        if (!date.success) errors[field] = "Enter a valid UTC calendar date."
        else patch[field] = `${value}T00:00:00.000Z`
      }
    } else if (field === "amountCents") {
      if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100)) || Math.round(Number(value) * 100) > 2147483647) {
        errors[field] = "Enter a non-negative amount with at most two decimal places within the supported range."
      } else patch[field] = Math.round(Number(value) * 100)
    } else if (field === "noticePeriodDays") {
      if (value === "") patch[field] = null
      else if (!/^\d+$/.test(value) || Number(value) > 365) errors[field] = "Enter a whole number from 0 to 365, or clear it."
      else patch[field] = Number(value)
    } else if (field === "autoRenew" || field === "cancellable") patch[field] = value === "true"
    else if (["description", "supplierName", "notes"].includes(field)) patch[field] = value || null
    else patch[field] = value
  }
  return { patch, errors }
}

export function commitmentMutationErrors(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return {}
  const error = payload.error
  if (!error || typeof error !== "object" || !("fieldErrors" in error) || !error.fieldErrors || typeof error.fieldErrors !== "object") return {}
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([field, messages]) => [field,
    Array.isArray(messages) ? messages.filter((message) => typeof message === "string").join(" ") : ""]))
}