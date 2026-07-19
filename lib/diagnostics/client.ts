"use client"

import {
  TRACE_COOKIE_NAME,
  TRACE_DEBUG_HEADER,
  TRACE_ID_HEADER,
  createTraceId,
  formatTraceEvent,
  isValidTraceId,
  serialiseTraceEvent,
  type TraceEventInput,
} from "@/lib/diagnostics/shared"

export type ClientTraceState = {
  debugEnabled: boolean
  traceId: string
}

export function createClientTraceState(traceId = createTraceId()): ClientTraceState {
  return { debugEnabled: false, traceId }
}

export function traceRequestHeaders(state: ClientTraceState): HeadersInit {
  return { [TRACE_ID_HEADER]: state.traceId }
}

export function persistClientTraceCookie(traceId: string): void {
  if (typeof document === "undefined" || !isValidTraceId(traceId)) return

  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${TRACE_COOKIE_NAME}=${encodeURIComponent(traceId)}; Max-Age=600; Path=/; SameSite=Lax${secure}`
}

export function updateClientTraceStateFromResponse(state: ClientTraceState, response: Response): ClientTraceState {
  const debugEnabled = response.headers.get(TRACE_DEBUG_HEADER) === "true"
  const responseTraceId = response.headers.get(TRACE_ID_HEADER)
  const traceId = isValidTraceId(responseTraceId) ? responseTraceId : state.traceId

  if (debugEnabled) persistClientTraceCookie(traceId)

  return { debugEnabled, traceId }
}

export function traceClientEvent(state: ClientTraceState, input: Omit<TraceEventInput, "traceId">): void {
  if (!state.debugEnabled) return

  try {
    const event = formatTraceEvent({ ...input, traceId: state.traceId })
    console.info(serialiseTraceEvent(event))
  } catch {
    // Browser diagnostics are best-effort and must never interrupt user flow.
  }
}
