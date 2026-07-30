import {
  TRACE_DEBUG_HEADER,
  TRACE_ID_HEADER,
  buildTraceCookie,
  createTraceContext,
  formatTraceEvent,
  serialiseTraceEvent,
  summariseErrorForTrace,
  type TraceContext,
  type TraceEventInput,
} from "@/lib/diagnostics/shared"

let productionDebugWarningEmitted = false

export function parseDebugEnv(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true"
}

export function isDebugEnabled(): boolean {
  return parseDebugEnv(process.env.DEBUG)
}

export function isProductionLikeEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const candidates = [env.VERCEL_ENV, env.NODE_ENV, env.APP_ENV, env.ENVIRONMENT, env.STAGE]
  return candidates.some((value) => {
    const normalized = value?.trim().toLowerCase()
    return normalized === "production" || normalized === "staging"
  })
}

export function createServerTraceContext(options: {
  headers?: Pick<Headers, "get">
  cookieHeader?: string | null
  traceId?: string | null
  debugEnabled?: boolean
} = {}): TraceContext {
  return createTraceContext({
    debugEnabled: options.debugEnabled ?? isDebugEnabled(),
    traceId: options.traceId,
    headers: options.headers,
    cookieHeader: options.cookieHeader,
  })
}

export function applyTraceResponseHeaders(response: { headers: Headers }, context: TraceContext, secure: boolean): void {
  if (!context.debugEnabled) return

  response.headers.set(TRACE_ID_HEADER, context.traceId)
  response.headers.set(TRACE_DEBUG_HEADER, "true")
  response.headers.append("Set-Cookie", buildTraceCookie(context.traceId, secure))
}

export function warnIfProductionDebugEnabled(context?: TraceContext): void {
  if (productionDebugWarningEmitted || !isDebugEnabled() || !isProductionLikeEnvironment()) return

  productionDebugWarningEmitted = true
  traceEvent(() => ({
    traceId: context?.traceId ?? "diagnostic-startup",
    level: "warn",
    stage: "debug.configuration",
    operation: "debug.production_warning",
    subsystem: "diagnostics",
    component: "lib/diagnostics/server",
    event: "decision",
    outputs: {
      warning: "DEBUG=true is enabled in a production-like environment. Use temporarily and disable after diagnosis.",
    },
  }))
}

export function traceEvent(input: TraceEventInput | (() => TraceEventInput), context?: TraceContext): void {
  const debugEnabled = context?.debugEnabled ?? isDebugEnabled()
  if (!debugEnabled) return

  try {
    const eventInput = typeof input === "function" ? input() : input
    const event = formatTraceEvent(eventInput)
    const line = serialiseTraceEvent(event)
    const level = event.level ?? "info"

    if (level === "error") {
      console.error(line)
    } else if (level === "warn") {
      console.warn(line)
    } else {
      console.info(line)
    }
  } catch {
    try {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          message: "paidsoon.trace.failure",
          level: "warn",
          stage: "diagnostics.emit",
          operation: "trace_event",
          subsystem: "diagnostics",
          component: "lib/diagnostics/server",
          event: "failure",
        }),
      )
    } catch {
      // Tracing is best-effort and must never interrupt application flow.
    }
  }
}

export async function traceOperation<T>(
  context: TraceContext,
  input: Omit<TraceEventInput, "event" | "durationMs" | "error"> | (() => Omit<TraceEventInput, "event" | "durationMs" | "error">),
  operation: () => Promise<T>,
  complete?: {
    success?: (result: T) => Partial<TraceEventInput>
    failure?: (error: unknown) => Partial<TraceEventInput>
  },
): Promise<T> {
  if (!context.debugEnabled) {
    return operation()
  }

  const startedAt = Date.now()
  const baseInput = typeof input === "function" ? input() : input

  traceEvent({ ...baseInput, event: "start" }, context)

  try {
    const result = await operation()
    const successInput = complete?.success?.(result) ?? {}
    traceEvent(
      {
        ...baseInput,
        ...successInput,
        event: successInput.event ?? "success",
        durationMs: Date.now() - startedAt,
      },
      context,
    )
    return result
  } catch (error) {
    const failureInput = complete?.failure?.(error) ?? {}
    traceEvent(
      {
        ...baseInput,
        ...failureInput,
        level: failureInput.level ?? "error",
        event: "failure",
        durationMs: Date.now() - startedAt,
        error: failureInput.error ?? summariseErrorForTrace(error),
      },
      context,
    )
    throw error
  }
}
