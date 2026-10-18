import { z } from "zod"

const ELAPSED_DAY_MS = 24 * 60 * 60 * 1000
export const APPLICATION_TRIAL_HORIZON_DAYS = 730

export const trialAccessPlanSchema = z.enum([
  "essentials",
  "business_control",
  "small_business",
  "business_pro",
])
export const trialAccessDaysSchema = z.union([
  z.literal(7), z.literal(14), z.literal(30),
])
export const trialAccessReasonSchema = z.string().trim().min(1).max(1000)

function isTimeZone(value: string): boolean {
  // Intl also accepts fixed-offset zones on newer runtimes; require a named zone.
  if (/^[+-]/.test(value)) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

export const trialAccessTimeZoneSchema = z.string().refine(isTimeZone, {
  message: "A valid IANA timezone is required",
})

// Do not rely on Date.parse alone: JavaScript silently rolls invalid days over.
const OFFSET_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/

interface OffsetInstant {
  milliseconds: number
  offsetSeconds: number | null
}

function parseOffsetInstant(value: string): OffsetInstant | null {
  const parts = OFFSET_ISO.exec(value)
  if (!parts) return null
  const [, year, month, day, hour, minute, second, , offset] = parts
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (m < 1 || m > 12 || d < 1 || d > monthDays[m - 1] ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) {
    return null
  }
  let offsetSeconds: number | null = null
  if (offset !== "Z") {
    const hours = Number(offset.slice(1, 3))
    const minutes = Number(offset.slice(4, 6))
    if (hours > 23 || minutes > 59) return null
    offsetSeconds = (offset[0] === "-" ? -1 : 1) * (hours * 3600 + minutes * 60)
  }
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? { milliseconds, offsetSeconds } : null
}

/** Offset at the instant, so a DST overlap is disambiguated rather than guessed. */
function zoneOffsetSeconds(milliseconds: number, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone, timeZoneName: "longOffset",
  }).formatToParts(milliseconds).find((part) => part.type === "timeZoneName")?.value
  if (name === "GMT") return 0
  const parts = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(name ?? "")
  if (!parts) throw new RangeError("Unable to resolve timezone offset")
  return (parts[1] === "-" ? -1 : 1) *
    (Number(parts[2]) * 3600 + Number(parts[3]) * 60 + Number(parts[4] ?? 0))
}

export const trialAccessExpirySchema = z.string().refine(
  (value) => parseOffsetInstant(value) !== null,
  { message: "Expiry must be a valid ISO date/time with explicit Z or offset" },
)

const envelope = {
  operationId: z.uuid(),
  reason: trialAccessReasonSchema,
  notify: z.boolean().default(false),
  timeZone: trialAccessTimeZoneSchema,
  expectedVersion: z.number().int().nonnegative(),
}

const extensionSchema = z.strictObject({
  ...envelope,
  action: z.literal("extend_or_grant"),
  days: trialAccessDaysSchema.optional(),
  expiresAt: trialAccessExpirySchema.optional(),
  plan: trialAccessPlanSchema.optional(),
}).superRefine((input, ctx) => {
  if ((input.days === undefined) === (input.expiresAt === undefined)) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Provide exactly one of days or expiresAt" })
  }
  if (input.expiresAt !== undefined && isTimeZone(input.timeZone)) {
    const instant = parseOffsetInstant(input.expiresAt)
    if (instant && instant.offsetSeconds !== null &&
        instant.offsetSeconds !== zoneOffsetSeconds(instant.milliseconds, input.timeZone)) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry offset does not match the timezone at that instant" })
    }
  }
}).transform((input) => ({
  ...input,
  ...(input.expiresAt === undefined ? {} : {
    expiresAt: new Date(Math.floor(Date.parse(input.expiresAt) / 1000) * 1000).toISOString(),
  }),
}))

export const trialAccessPreviewSchema = z.union([
  extensionSchema,
  z.strictObject({ ...envelope, action: z.literal("revoke_grant") }),
])

export const trialAccessConfirmationSchema = z.strictObject({
  operationId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
})

export type TrialAccessPreviewInput = z.output<typeof trialAccessPreviewSchema>
export type TrialAccessExtensionInput = Extract<TrialAccessPreviewInput, { action: "extend_or_grant" }>
export type TrialAccessConfirmationInput = z.output<typeof trialAccessConfirmationSchema>
export type TrialAccessMutationSource = "admin_grant" | "stripe_trial"

/** Source comes from server preflight, never from the public request envelope. */
export function validateTrialAccessSource(
  input: TrialAccessPreviewInput,
  source: TrialAccessMutationSource,
): TrialAccessPreviewInput {
  return trialAccessPreviewSchema.superRefine((value, ctx) => {
    if (value.action !== "extend_or_grant") return
    if (source === "admin_grant" && value.plan === undefined) {
      ctx.addIssue({ code: "custom", path: ["plan"], message: "An application grant requires a public plan" })
    }
    if (source === "stripe_trial" && value.plan !== undefined) {
      ctx.addIssue({ code: "custom", path: ["plan"], message: "A Stripe extension cannot change the plan" })
    }
  }).parse(input)
}

export interface TrialExpiryContext {
  now: Date
  currentEffectiveTrialExpiry: Date | null
  source: TrialAccessMutationSource
}

function dateMilliseconds(value: Date): number {
  const milliseconds = value.getTime()
  if (!Number.isFinite(milliseconds)) throw new RangeError("Invalid server date")
  return milliseconds
}

/** Recheck at confirmation with fresh server now; never move the frozen target. */
export function validateFrozenTrialExpiry(expiresAt: Date, context: TrialExpiryContext): Date {
  const target = Math.floor(dateMilliseconds(expiresAt) / 1000) * 1000
  const now = dateMilliseconds(context.now)
  const current = context.currentEffectiveTrialExpiry === null
    ? null : dateMilliseconds(context.currentEffectiveTrialExpiry)
  if (target <= now) throw new RangeError("Expiry must be in the future")
  if (current !== null && target <= current) {
    throw new RangeError("Expiry must be strictly later than the current effective trial expiry")
  }
  if (context.source === "admin_grant" &&
      target > now + APPLICATION_TRIAL_HORIZON_DAYS * ELAPSED_DAY_MS) {
    throw new RangeError("Application expiry exceeds the 730-day horizon")
  }
  // Stripe anchor-based restrictions belong to provider preflight, not this helper.
  return new Date(target)
}

/** Calculate once at preview, persist the result, then confirm that same instant. */
export function freezeTrialExpiry(input: TrialAccessExtensionInput, context: TrialExpiryContext): Date {
  const parsed = validateTrialAccessSource(input, context.source)
  if (parsed.action !== "extend_or_grant") throw new RangeError("Extension input required")
  const now = dateMilliseconds(context.now)
  const current = context.currentEffectiveTrialExpiry === null
    ? now : dateMilliseconds(context.currentEffectiveTrialExpiry)
  const target = parsed.days === undefined
    ? new Date(parsed.expiresAt!)
    : new Date(Math.max(now, current) + parsed.days * ELAPSED_DAY_MS)
  return validateFrozenTrialExpiry(target, context)
}

export interface TrialExpiryPreview {
  expiresAt: string
  localExpiresAt: string
  timeZone: string
  offset: string
}

/** Deterministic server display of the exact UTC-second target, including offset. */
export function formatTrialExpiryPreview(expiresAt: Date, timeZone: string): TrialExpiryPreview {
  const zone = trialAccessTimeZoneSchema.parse(timeZone)
  const milliseconds = Math.floor(dateMilliseconds(expiresAt) / 1000) * 1000
  const offsetSeconds = zoneOffsetSeconds(milliseconds, zone)
  const absolute = Math.abs(offsetSeconds)
  const pad = (value: number): string => String(value).padStart(2, "0")
  const offset = `${offsetSeconds < 0 ? "-" : "+"}${pad(Math.floor(absolute / 3600))}:${pad(Math.floor(absolute % 3600 / 60))}` +
    (absolute % 60 === 0 ? "" : `:${pad(absolute % 60)}`)
  return {
    expiresAt: new Date(milliseconds).toISOString(),
    localExpiresAt: new Date(milliseconds + offsetSeconds * 1000).toISOString().replace(/\.000Z$/, offset),
    timeZone: zone,
    offset,
  }
}