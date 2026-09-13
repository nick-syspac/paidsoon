import type { PrismaTx } from "@/lib/db/withUserContext"

import type { DepositReminderType } from "@/lib/generated/prisma/enums"

export interface DepositReminderPolicy {
  autoReminderEnabled: boolean
  initialReminderOffsetDays: number
  beforeDueOffsetDays: number
  overdue3Enabled: boolean
  overdue7Enabled: boolean
}

export interface DepositReminderScheduleEntry {
  reminderType: DepositReminderType
  scheduledFor: Date
}

const REMINDER_TYPE_ORDER: Record<DepositReminderType, number> = {
  initial_request: 0,
  before_due: 1,
  due_today: 2,
  overdue_3_days: 3,
  overdue_7_days: 4,
}

const DAY_MS = 24 * 60 * 60 * 1000

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

function normalizePolicy(policy: DepositReminderPolicy): DepositReminderPolicy {
  return {
    autoReminderEnabled: policy.autoReminderEnabled,
    initialReminderOffsetDays: Math.max(0, Math.trunc(policy.initialReminderOffsetDays)),
    beforeDueOffsetDays: Math.max(0, Math.trunc(policy.beforeDueOffsetDays)),
    overdue3Enabled: policy.overdue3Enabled,
    overdue7Enabled: policy.overdue7Enabled,
  }
}

export function buildDepositReminderSchedule(input: {
  createdAt: Date
  dueDate: Date
  policy: DepositReminderPolicy
}): DepositReminderScheduleEntry[] {
  const policy = normalizePolicy(input.policy)
  if (!policy.autoReminderEnabled) {
    return []
  }

  const entries: DepositReminderScheduleEntry[] = [
    {
      reminderType: "initial_request",
      scheduledFor: addDays(input.createdAt, policy.initialReminderOffsetDays),
    },
    {
      reminderType: "before_due",
      scheduledFor: addDays(input.dueDate, -policy.beforeDueOffsetDays),
    },
    {
      reminderType: "due_today",
      scheduledFor: new Date(input.dueDate),
    },
  ]

  if (policy.overdue3Enabled) {
    entries.push({ reminderType: "overdue_3_days", scheduledFor: addDays(input.dueDate, 3) })
  }

  if (policy.overdue7Enabled) {
    entries.push({ reminderType: "overdue_7_days", scheduledFor: addDays(input.dueDate, 7) })
  }

  return entries.sort((left, right) => {
    const delta = left.scheduledFor.getTime() - right.scheduledFor.getTime()
    if (delta !== 0) return delta
    return REMINDER_TYPE_ORDER[left.reminderType] - REMINDER_TYPE_ORDER[right.reminderType]
  })
}

export async function seedDepositRequestReminders(
  tx: PrismaTx,
  input: {
    userId: string
    requestId: string
    createdAt: Date
    dueDate: Date
    policy: DepositReminderPolicy
    actorUserId?: string | null
  },
): Promise<DepositReminderScheduleEntry[]> {
  const schedule = buildDepositReminderSchedule({
    createdAt: input.createdAt,
    dueDate: input.dueDate,
    policy: input.policy,
  })

  if (schedule.length === 0) {
    return []
  }

  await tx.depositReminder.deleteMany({
    where: { depositRequestId: input.requestId },
  })

  await tx.depositReminder.createMany({
    data: schedule.map((entry) => ({
      userId: input.userId,
      depositRequestId: input.requestId,
      reminderType: entry.reminderType,
      scheduledFor: entry.scheduledFor,
      deliveryStatus: "pending",
    })),
  })

  for (const entry of schedule) {
    await tx.depositGuardEvent.create({
      data: {
        userId: input.userId,
        depositRequestId: input.requestId,
        actorUserId: input.actorUserId ?? null,
        eventType: "reminder_scheduled",
        metadata: {
          reminderType: entry.reminderType,
          scheduledFor: entry.scheduledFor.toISOString(),
        } as never,
      },
    })
  }

  return schedule
}

export async function cancelPendingDepositRequestReminders(
  tx: PrismaTx,
  input: {
    requestId: string
    reason: string
  },
): Promise<number> {
  const result = await tx.depositReminder.updateMany({
    where: {
      depositRequestId: input.requestId,
      deliveryStatus: "pending",
    },
    data: {
      deliveryStatus: "cancelled",
      failureReason: input.reason,
    },
  })

  return result.count
}