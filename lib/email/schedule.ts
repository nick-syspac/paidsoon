import { z } from "zod"

export interface ScheduleConfig {
  email1DaysAfterDue: number
  email2DaysAfterDue: number
  email3DaysAfterDue: number
}

const CadenceOverrideSchema = z.object({
  email1DaysAfterDue: z.number().int().min(0),
  email2DaysAfterDue: z.number().int().min(0),
  email3DaysAfterDue: z.number().int().min(0),
})

/**
 * Resolves the day-offset schedule to use for a given invoice: a Customer's
 * `cadenceOverride` (if present and well-formed) takes precedence over the
 * tenant's default `Schedule`. Malformed or partial overrides are ignored
 * rather than throwing, since this runs in the reminder cron.
 */
export function resolveScheduleConfig(
  schedule: ScheduleConfig,
  cadenceOverride: unknown,
): ScheduleConfig {
  if (cadenceOverride == null) return schedule
  const parsed = CadenceOverrideSchema.safeParse(cadenceOverride)
  return parsed.success ? parsed.data : schedule
}

/**
 * Decides whether an invoice's linked Customer allows automated chasing.
 * A `null`/`undefined` customer (no Customer record linked yet) is always
 * allowed. Customers who opted out (`neverAutoChase`) or unsubscribed
 * entirely (`unsubscribed`) are excluded.
 */
export function shouldAutoChaseCustomer(
  customer: { neverAutoChase: boolean; unsubscribed: boolean } | null | undefined,
): boolean {
  if (!customer) return true
  return !customer.neverAutoChase && !customer.unsubscribed
}

/**
 * Compute the date when the next email (at given stage) should be sent.
 * Stage 1 = use email1DaysAfterDue, etc.
 */
export function computeNextEmailAt(
  dueDate: Date,
  stage: 1 | 2 | 3,
  schedule: ScheduleConfig
): Date {
  const daysMap: Record<1 | 2 | 3, number> = {
    1: schedule.email1DaysAfterDue,
    2: schedule.email2DaysAfterDue,
    3: schedule.email3DaysAfterDue,
  }
  const days = daysMap[stage]
  const result = new Date(dueDate)
  result.setDate(result.getDate() + days)
  return result
}

