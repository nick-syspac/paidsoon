export const TRACE_ID_HEADER = "x-paidsoon-trace-id"
export const TRACE_DEBUG_HEADER = "x-paidsoon-debug"
export const TRACE_COOKIE_NAME = "paidsoon_trace_id"

export const TRACE_MAX_FIELD_LENGTH = 2_048
export const TRACE_MAX_EVENT_LENGTH = 16_384
export const TRACE_MAX_DEPTH = 8

const REDACTED = "[REDACTED]"
const CIRCULAR = "[Circular]"
const MAX_DEPTH_REACHED = "[MaxDepth]"

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "idtoken",
  "id_token",
  "session",
  "cookie",
  "cookies",
  "authorization",
  "apikey",
  "api_key",
  "secret",
  "clientsecret",
  "client_secret",
  "databaseurl",
  "database_url",
  "directurl",
  "direct_url",
  "supabasesecretkey",
  "supabase_secret_key",
  "stripescretkey",
  "stripe_secret_key",
  "resendapikey",
  "resend_api_key",
  "cftoken",
  "turnstile",
]

export type TraceLevel = "debug" | "info" | "warn" | "error"
export type TraceEventType = "start" | "success" | "failure" | "decision" | "complete"

export type TraceContext = {
  traceId: string
  debugEnabled: boolean
}

export type TraceHttp = {
  method?: string
  route?: string
  status?: number
}

export type TraceNavigation = {
  from?: string
  to?: string
  decision?: string
}

export type TraceEventInput = {
  traceId: string
  level?: TraceLevel
  stage: string
  operation: string
  subsystem: string
  component: string
  event: TraceEventType
  durationMs?: number
  http?: TraceHttp
  navigation?: TraceNavigation
  auth?: unknown
  tenant?: unknown
  inputs?: unknown
  outputs?: unknown
  error?: unknown
}

export type TraceEvent = TraceEventInput & {
  timestamp: string
  message: "paidsoon.trace"
}

export type SafeAuthSummary = {
  hasUser: boolean
  hasEmail?: boolean
  provider?: string
  role?: string
  hasSession?: boolean
  hasAccessCredential?: boolean
  hasRefreshCredential?: boolean
  hasExpiry?: boolean
}

export type SafeErrorSummary = {
  name: string
  message: string
  stack?: string
  cause?: unknown
}

export function createTraceId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID()
  }

  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function isValidTraceId(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(value)
}

export function getTraceIdFromHeaders(headers: Pick<Headers, "get">): string | null {
  const headerValue = headers.get(TRACE_ID_HEADER)
  return isValidTraceId(headerValue) ? headerValue : null
}

export function getTraceIdFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(";").map((part) => part.trim())
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=")
    if (name === TRACE_COOKIE_NAME) {
      const value = decodeURIComponent(valueParts.join("="))
      return isValidTraceId(value) ? value : null
    }
  }
  return null
}

export function createTraceContext(options: {
  debugEnabled: boolean
  traceId?: string | null
  headers?: Pick<Headers, "get">
  cookieHeader?: string | null
}): TraceContext {
  const traceId =
    (isValidTraceId(options.traceId) ? options.traceId : null) ??
    (options.headers ? getTraceIdFromHeaders(options.headers) : null) ??
    getTraceIdFromCookieHeader(options.cookieHeader) ??
    createTraceId()

  return { traceId, debugEnabled: options.debugEnabled }
}

export function buildTraceCookie(traceId: string, secure: boolean): string {
  const encodedTraceId = encodeURIComponent(traceId)
  const securePart = secure ? "; Secure" : ""
  return `${TRACE_COOKIE_NAME}=${encodedTraceId}; Max-Age=600; Path=/; SameSite=Lax${securePart}`
}

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "")
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function truncateForTrace(value: string, maxLength = TRACE_MAX_FIELD_LENGTH): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...[truncated:${value.length - maxLength}]`
}

export function redactForTrace(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet<object>())
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === "string") return truncateForTrace(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return truncateForTrace(value.toString())
  if (typeof value === "symbol") return value.toString()
  if (typeof value === "function") return "[Function]"

  if (depth >= TRACE_MAX_DEPTH) return MAX_DEPTH_REACHED

  if (value instanceof Error) {
    return redactValue(summariseErrorForTrace(value), depth + 1, seen)
  }

  if (typeof value !== "object") return String(value)

  if (seen.has(value)) return CIRCULAR
  seen.add(value)

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactValue(item, depth + 1, seen))
  }

  const output: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactValue(entryValue, depth + 1, seen)
  }
  return output
}

export function summariseAuthForTrace(input: {
  user?: { email?: string | null; app_metadata?: Record<string, unknown>; role?: string | null } | null
  session?: { access_token?: string | null; refresh_token?: string | null; expires_at?: number | null } | null
}): SafeAuthSummary {
  const provider =
    typeof input.user?.app_metadata?.provider === "string"
      ? input.user.app_metadata.provider
      : undefined

  return {
    hasUser: Boolean(input.user),
    hasEmail: input.user ? Boolean(input.user.email) : undefined,
    provider,
    role: input.user?.role ?? undefined,
    hasSession: input.session === undefined ? undefined : Boolean(input.session),
    hasAccessCredential: input.session ? Boolean(input.session.access_token) : undefined,
    hasRefreshCredential: input.session ? Boolean(input.session.refresh_token) : undefined,
    hasExpiry: input.session ? Boolean(input.session.expires_at) : undefined,
  }
}

export function summariseErrorForTrace(error: unknown, depth = 0): SafeErrorSummary {
  if (error instanceof Error) {
    const cause = depth < 4 && "cause" in error ? summariseErrorForTrace(error.cause, depth + 1) : undefined
    return {
      name: error.name || "Error",
      message: truncateForTrace(error.message || "Unknown error"),
      stack: error.stack ? truncateForTrace(error.stack, 4_096) : undefined,
      cause,
    }
  }

  if (typeof error === "object" && error !== null) {
    return {
      name: "NonErrorObject",
      message: "Non-Error object thrown",
      cause: redactForTrace(error),
    }
  }

  return {
    name: "NonError",
    message: truncateForTrace(String(error)),
  }
}

export function formatTraceEvent(input: TraceEventInput): TraceEvent {
  return redactForTrace({
    timestamp: new Date().toISOString(),
    message: "paidsoon.trace",
    level: input.level ?? "info",
    traceId: input.traceId,
    stage: input.stage,
    operation: input.operation,
    subsystem: input.subsystem,
    component: input.component,
    event: input.event,
    durationMs: input.durationMs,
    http: input.http,
    navigation: input.navigation,
    auth: input.auth,
    tenant: input.tenant,
    inputs: input.inputs,
    outputs: input.outputs,
    error: input.error,
  }) as TraceEvent
}

export function serialiseTraceEvent(event: TraceEvent): string {
  const serialised = JSON.stringify(event)
  return serialised.length > TRACE_MAX_EVENT_LENGTH
    ? `${serialised.slice(0, TRACE_MAX_EVENT_LENGTH)}...[event-truncated:${serialised.length - TRACE_MAX_EVENT_LENGTH}]`
    : serialised
}
