import { z } from "zod"

export const AlertEntityIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const AlertQuerySchema = z.object({
  page: z.string().regex(/^-?\d+$/).max(16).transform(Number).refine(Number.isSafeInteger)
    .transform((page) => Math.max(1, page)).default(1),
  eventId: AlertEntityIdSchema.optional(),
}).strict()
export const ALERT_PAGE_SIZE = 12
export type AlertRelevance = "active" | "resolved" | "superseded" | "suspended" | "historical"
export interface CommitGuardAlertDTO {
  id: string; title: string; severity: "critical" | "warning" | "watch" | "info"
  occurredAt: string | null; resolvedAt: string | null; relevance: AlertRelevance
  impact: string; context: string; href: string | null; action: string | null
}
export interface CommitGuardAlertPageDTO {
  alerts: CommitGuardAlertDTO[]; page: number; totalPages: number; total: number
  evaluation: { lastEvaluatedAt: string | null; available: boolean }
  eventFound: boolean
}
export function alertTimestamp(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== "string") return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
export function alertDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parsed = z.iso.date().safeParse(value)
  return parsed.success ? parsed.data : null
}
export function alertMoney(value: unknown, currency: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
    typeof currency !== "string" || !/^(aud|usd|nzd|gbp|eur|cad|sgd|hkd)$/i.test(currency)) return "Impact unavailable"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(),
    currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)
}
/** Preserve other workspace parameters, never interpolate a supplied URL. */
export function alertPageHref(params: Record<string, string | string[] | undefined>, page: number): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key !== "alertPage" && key !== "eventId" && typeof value === "string") query.set(key, value)
  }
  query.set("alertPage", String(page))
  return `/dashboard/commitguard?${query}#commitguard-alerts`
}