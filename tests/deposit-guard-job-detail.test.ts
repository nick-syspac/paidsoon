import assert from "node:assert/strict"
import test from "node:test"

import { buildDepositGuardTimelineEntries } from "@/lib/depositGuard/jobDetailTimeline"

test("deposit guard timeline entries format payment and reminder events", () => {
  const timeline = buildDepositGuardTimelineEntries([
    {
      id: "event-1",
      eventType: "payment_confirmed",
      jobId: "job-1",
      depositRequestId: "request-1",
      depositPaymentId: "payment-1",
      actorUserId: null,
      metadata: { amountCents: 25_000 },
      createdAt: new Date("2026-09-13T10:15:00.000Z"),
    },
    {
      id: "event-2",
      eventType: "reminder_scheduled",
      jobId: "job-1",
      depositRequestId: "request-1",
      depositPaymentId: null,
      actorUserId: null,
      metadata: { reminderType: "before_due", scheduledFor: "2026-09-20T10:00:00.000Z" },
      createdAt: new Date("2026-09-12T09:00:00.000Z"),
    },
  ])

  assert.equal(timeline[0]?.title, "Payment Confirmed")
  assert.equal(timeline[0]?.description, "Payment $250 confirmed.")
  assert.equal(timeline[0]?.kind, "payment")
  assert.equal(timeline[1]?.title, "Reminder Scheduled")
  assert.match(timeline[1]?.description ?? "", /^Before Due scheduled for /)
  assert.equal(timeline[1]?.kind, "reminder")
})