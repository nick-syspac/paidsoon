import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDepositReminderSchedule,
  seedDepositRequestReminders,
} from "@/lib/depositGuard/reminders"

test("buildDepositReminderSchedule derives deterministic reminder times", () => {
  const schedule = buildDepositReminderSchedule({
    createdAt: new Date("2026-09-12T10:00:00.000Z"),
    dueDate: new Date("2026-09-20T10:00:00.000Z"),
    policy: {
      autoReminderEnabled: true,
      initialReminderOffsetDays: 2,
      beforeDueOffsetDays: 1,
      overdue3Enabled: true,
      overdue7Enabled: false,
    },
  })

  assert.deepEqual(
    schedule.map((entry) => [entry.reminderType, entry.scheduledFor.toISOString()]),
    [
      ["initial_request", "2026-09-14T10:00:00.000Z"],
      ["before_due", "2026-09-19T10:00:00.000Z"],
      ["due_today", "2026-09-20T10:00:00.000Z"],
      ["overdue_3_days", "2026-09-23T10:00:00.000Z"],
    ],
  )
})

test("buildDepositReminderSchedule returns no reminders when automation is disabled", () => {
  const schedule = buildDepositReminderSchedule({
    createdAt: new Date("2026-09-12T10:00:00.000Z"),
    dueDate: new Date("2026-09-20T10:00:00.000Z"),
    policy: {
      autoReminderEnabled: false,
      initialReminderOffsetDays: 0,
      beforeDueOffsetDays: 1,
      overdue3Enabled: true,
      overdue7Enabled: true,
    },
  })

  assert.deepEqual(schedule, [])
})

test("seedDepositRequestReminders persists scheduled reminders and audit events", async () => {
  const createdRows: unknown[] = []
  const deletedRequestIds: string[] = []
  const auditEvents: Array<{ reminderType: string; scheduledFor: string }> = []

  const tx = {
    depositReminder: {
      deleteMany: async ({ where }: { where: { depositRequestId: string } }) => {
        deletedRequestIds.push(where.depositRequestId)
      },
      createMany: async ({ data }: { data: Array<{ reminderType: string; scheduledFor: Date }> }) => {
        createdRows.push(...data)
      },
    },
    depositGuardEvent: {
      create: async ({ data }: { data: { metadata?: Record<string, unknown> | null } }) => {
        auditEvents.push({
          reminderType: String(data.metadata?.reminderType ?? ""),
          scheduledFor: String(data.metadata?.scheduledFor ?? ""),
        })
      },
    },
  }

  const schedule = await seedDepositRequestReminders(tx as never, {
    userId: "user_1",
    requestId: "req_1",
    createdAt: new Date("2026-09-12T10:00:00.000Z"),
    dueDate: new Date("2026-09-20T10:00:00.000Z"),
    policy: {
      autoReminderEnabled: true,
      initialReminderOffsetDays: 0,
      beforeDueOffsetDays: 1,
      overdue3Enabled: false,
      overdue7Enabled: false,
    },
    actorUserId: "user_1",
  })

  assert.equal(deletedRequestIds[0], "req_1")
  assert.equal(createdRows.length, 3)
  assert.equal(schedule.length, 3)
  assert.equal(auditEvents.length, 3)
  assert.equal(auditEvents[0]?.reminderType, "initial_request")
})
