/**
 * Shared invoice status/stage label maps — single source of truth for
 * `InvoiceTable.tsx` and the invoice-export reminder_status/status columns
 * (openspec/changes/add-invoice-export design.md § Decisions), so the two
 * surfaces can never present different wording for the same state.
 */

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Active", color: "bg-green-100 text-green-800" },
  paused: { label: "Paused", color: "bg-yellow-100 text-yellow-800" },
  snoozed: { label: "Snoozed", color: "bg-blue-100 text-blue-800" },
  sequence_complete: { label: "Sequence done", color: "bg-gray-100 text-gray-600" },
  paid: { label: "Paid", color: "bg-green-100 text-green-800" },
  manually_resolved: { label: "Resolved", color: "bg-gray-100 text-gray-500" },
  disputed: { label: "Disputed", color: "bg-red-100 text-red-800" },
}

export const STAGE_LABELS: Record<number, string> = {
  0: "Queued",
  1: "1 of 3 sent",
  2: "2 of 3 sent",
  3: "3 of 3 sent",
}
