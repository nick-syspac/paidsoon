import type { Prisma } from "@/lib/generated/prisma/client"

export const COMMIT_GUARD_EVENT_TYPES = {
  COMMITMENT_CREATED: "COMMITMENT_CREATED",
  COMMITMENT_UPDATED: "COMMITMENT_UPDATED",
  COMMITMENT_PAUSED: "COMMITMENT_PAUSED",
  COMMITMENT_RESUMED: "COMMITMENT_RESUMED",
  COMMITMENT_CANCELLED: "COMMITMENT_CANCELLED",
  COMMITMENT_CONFIRMED: "COMMITMENT_CONFIRMED",
  COMMITMENT_CREATED_FROM_DETECTION: "COMMITMENT_CREATED_FROM_DETECTION",
  COMMITMENT_DETECTED: "COMMITMENT_DETECTED",
  COMMITMENT_DETECTED_EDITED: "COMMITMENT_DETECTED_EDITED",
  COMMITMENT_DETECTED_IGNORED: "COMMITMENT_DETECTED_IGNORED",
  COMMITMENT_DETECTED_REJECTED: "COMMITMENT_DETECTED_REJECTED",
  COMMITMENT_DETECTED_CONFIRMED: "COMMITMENT_DETECTED_CONFIRMED",
  COMMITMENT_DUE_SOON: "COMMITMENT_DUE_SOON",
  COMMITMENT_AMOUNT_CHANGED: "COMMITMENT_AMOUNT_CHANGED",
  COMMITMENT_RENEWAL_APPROACHING: "COMMITMENT_RENEWAL_APPROACHING",
  COMMITMENT_NOTICE_PERIOD_APPROACHING: "COMMITMENT_NOTICE_PERIOD_APPROACHING",
  COMMITMENT_SHORTFALL: "COMMITMENT_SHORTFALL",
  COMMITMENT_BUFFER_LOW: "COMMITMENT_BUFFER_LOW",
} as const

export type CommitGuardEventType =
  (typeof COMMIT_GUARD_EVENT_TYPES)[keyof typeof COMMIT_GUARD_EVENT_TYPES]

export interface CommitGuardEventRecordInput {
  userId: string
  commitmentId?: string | null
  detectionCandidateId?: string | null
  eventType: CommitGuardEventType
  severity?: "critical" | "warning" | "watch" | "info"
  title: string
  message: string
  actorId?: string | null
  metadata?: Prisma.InputJsonValue | null
  dedupeKey?: string | null
}

export interface CommitGuardNotificationPlan {
  immediate: Array<{ id: string; eventType: CommitGuardEventType; title: string; message: string }>
  daily: Array<{ id: string; eventType: CommitGuardEventType; title: string; message: string }>
  weekly: Array<{ id: string; eventType: CommitGuardEventType; title: string; message: string }>
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function buildCommitGuardEventDedupeKey(input: {
  eventType: CommitGuardEventType
  commitmentId?: string | null
  detectionCandidateId?: string | null
  date?: Date
  windowDays?: number
  amountCents?: number
  fingerprint?: string | null
}): string | null {
  const date = isoDate(input.date ?? new Date())

  switch (input.eventType) {
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DUE_SOON:
      return input.commitmentId ? `commitguard:due-soon:${input.commitmentId}:${date}` : null
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_AMOUNT_CHANGED:
      return input.commitmentId
        ? `commitguard:amount-changed:${input.commitmentId}:${date}:${input.amountCents ?? 0}`
        : null
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_RENEWAL_APPROACHING:
      return input.commitmentId
        ? `commitguard:renewal-approaching:${input.commitmentId}:${input.windowDays ?? 30}:${date}`
        : null
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_NOTICE_PERIOD_APPROACHING:
      return input.commitmentId
        ? `commitguard:notice-approaching:${input.commitmentId}:${input.windowDays ?? 14}:${date}`
        : null
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED:
      return input.detectionCandidateId
        ? `commitguard:detected:${input.detectionCandidateId}:${input.fingerprint ?? "none"}`
        : null
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_SHORTFALL:
      return `commitguard:shortfall:${date}`
    case COMMIT_GUARD_EVENT_TYPES.COMMITMENT_BUFFER_LOW:
      return `commitguard:buffer-low:${date}`
    default:
      return null
  }
}

export function buildCommitGuardNotificationPlan(
  events: Array<{
    id: string
    eventType: CommitGuardEventType
    title: string
    message: string
    severity?: string | null
  }>,
): CommitGuardNotificationPlan {
  const immediate = events.filter((event) => {
    return (
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_SHORTFALL ||
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_NOTICE_PERIOD_APPROACHING ||
      event.severity === "critical"
    )
  })

  const daily = events.filter((event) => {
    return (
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DUE_SOON ||
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_RENEWAL_APPROACHING ||
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_AMOUNT_CHANGED ||
      event.severity === "warning"
    )
  })

  const immediateIds = new Set(immediate.map((event) => event.id))
  const dailyIds = new Set(daily.map((event) => event.id))

  const weekly = events.filter((event) => {
    if (immediateIds.has(event.id) || dailyIds.has(event.id)) return false
    return (
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED ||
      event.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_BUFFER_LOW ||
      event.severity === "watch" ||
      event.severity === "info" ||
      !event.severity
    )
  })

  return {
    immediate: immediate.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      message: event.message,
    })),
    daily: daily.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      message: event.message,
    })),
    weekly: weekly.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      message: event.message,
    })),
  }
}
