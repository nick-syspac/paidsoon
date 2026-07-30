/**
 * Diagnostic types for the admin support engine.
 */

export type DiagnosticSeverity = "error" | "warning" | "info"

export interface DiagnosticAction {
  /** Unique slug for the action endpoint, e.g. "reset-email-from" */
  actionSlug: string
  label: string
  description: string
  /** Optional payload to send with the action */
  payload?: Record<string, unknown>
}

export interface Diagnostic {
  /** Unique slug matching the runbook slug, e.g. "custom-from-unverified" */
  slug: string
  severity: DiagnosticSeverity
  title: string
  description: string
  /** Slug used to link to the runbook page */
  runbookSlug: string
  /** Optional corrective actions available for this diagnostic */
  actions: DiagnosticAction[]
}
