import { withUserContext } from "@/lib/db/withUserContext"
import { getDepositGuardEntitlements } from "@/lib/depositGuard/entitlements"

import type { DepositGuardJobSummary } from "@/lib/depositGuard/jobs"
import type { DepositRequestSummary } from "@/lib/depositGuard/requests"
import type { DepositMilestoneSummary } from "@/lib/depositGuard/milestones"
import {
  buildDepositGuardTimelineEntries,
  type DepositGuardEventSummary,
  type DepositGuardTimelineEntry,
} from "@/lib/depositGuard/jobDetailTimeline"
import {
  depositRequestMatchesAccountCutoff,
  jobMatchesAccountCutoff,
  milestoneMatchesAccountCutoff,
  paymentMatchesAccountCutoff,
} from "@/lib/depositGuard/accountCutoff"

export interface DepositGuardPaymentSummary {
  id: string
  jobId: string
  depositRequestId: string | null
  amountCents: number
  currency: string
  paymentMethod: string
  paymentProvider: string | null
  status: string
  paidAt: Date | null
  recordedBy: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DepositGuardReminderSummary {
  id: string
  depositRequestId: string
  reminderType: string
  scheduledFor: Date
  sentAt: Date | null
  deliveryStatus: string
  providerMessageId: string | null
  failureReason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DepositGuardJobDetail {
  entitlements: Awaited<ReturnType<typeof getDepositGuardEntitlements>>
  job: DepositGuardJobSummary & {
    customerId: string | null
    externalQuoteId: string | null
    externalQuoteNumber: string | null
    accountingProvider: string | null
    quotedAmountCents: number | null
    taxAmountCents: number | null
    depositType: string
    depositPercentage: number | null
    depositFixedAmountCents: number | null
  }
  requests: DepositRequestSummary[]
  milestones: DepositMilestoneSummary[]
  payments: DepositGuardPaymentSummary[]
  reminders: DepositGuardReminderSummary[]
  events: DepositGuardEventSummary[]
  timeline: DepositGuardTimelineEntry[]
}

export async function getDepositGuardJobDetail(
  userId: string,
  jobId: string,
): Promise<DepositGuardJobDetail | null> {
  const entitlements = await getDepositGuardEntitlements(userId)

  return withUserContext(userId, async (tx) => {
    const job = await tx.depositGuardJob.findFirst({
      where: { id: jobId, userId },
      select: {
        id: true,
        customerId: true,
        name: true,
        description: true,
        reference: true,
        currency: true,
        totalAmountCents: true,
        requiredDepositAmountCents: true,
        amountPaidCents: true,
        outstandingAmountCents: true,
        workStatus: true,
        paymentStatus: true,
        commencementBlocked: true,
        externalQuoteId: true,
        externalQuoteNumber: true,
        accountingProvider: true,
        quotedAmountCents: true,
        taxAmountCents: true,
        depositType: true,
        depositPercentage: true,
        depositFixedAmountCents: true,
        expectedStartDate: true,
        expectedCompletionDate: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
      },
    })

    if (!job) {
      return null
    }

    const profile = await tx.userProfile.findUnique({
      where: { userId },
      select: { accountDisplayFromDate: true },
    })
    const cutoffDate = profile?.accountDisplayFromDate ?? null
    if (!jobMatchesAccountCutoff(job, cutoffDate)) {
      return null
    }

    const [requests, milestones, payments, reminders, events] = await Promise.all([
      tx.depositRequest.findMany({
        where: { userId, jobId },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          jobId: true,
          customerId: true,
          requestType: true,
          description: true,
          amountCents: true,
          taxAmountCents: true,
          totalAmountCents: true,
          currency: true,
          dueDate: true,
          status: true,
          sentAt: true,
          firstViewedAt: true,
          lastViewedAt: true,
          paidAt: true,
          cancelledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      tx.paymentMilestone.findMany({
        where: { userId, jobId },
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          userId: true,
          jobId: true,
          name: true,
          description: true,
          sequence: true,
          amountType: true,
          percentage: true,
          fixedAmountCents: true,
          calculatedAmountCents: true,
          triggerType: true,
          targetDate: true,
          status: true,
          depositRequestId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      tx.depositPayment.findMany({
        where: { userId, jobId },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          jobId: true,
          depositRequestId: true,
          amountCents: true,
          currency: true,
          paymentMethod: true,
          paymentProvider: true,
          status: true,
          paidAt: true,
          recordedBy: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      tx.depositReminder.findMany({
        where: { userId, depositRequest: { jobId } },
        orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          depositRequestId: true,
          reminderType: true,
          scheduledFor: true,
          sentAt: true,
          deliveryStatus: true,
          providerMessageId: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      tx.depositGuardEvent.findMany({
        where: { userId, jobId },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          eventType: true,
          jobId: true,
          depositRequestId: true,
          depositPaymentId: true,
          actorUserId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ])

    const eligibleRequestIds = new Set(
      requests.filter((request) => depositRequestMatchesAccountCutoff(request.dueDate, cutoffDate)).map((request) => request.id),
    )
    const eligibleMilestones = milestones.filter((milestone) => milestoneMatchesAccountCutoff(milestone, cutoffDate))
    const eligiblePayments = payments.filter((payment) => paymentMatchesAccountCutoff(payment, cutoffDate))
    const eligibleReminderIds = new Set(
      reminders.filter((reminder) => eligibleRequestIds.has(reminder.depositRequestId)).map((reminder) => reminder.id),
    )
    const eligibleEvents = events.filter((event) => {
      if (event.depositRequestId && !eligibleRequestIds.has(event.depositRequestId)) return false
      if (event.depositPaymentId && !eligiblePayments.some((payment) => payment.id === event.depositPaymentId)) return false
      return true
    })

    return {
      entitlements,
      job: {
        ...job,
        depositPercentage: job.depositPercentage === null ? null : Number(job.depositPercentage),
      },
      requests: requests.filter((request) => eligibleRequestIds.has(request.id)),
      milestones: eligibleMilestones.map((milestone) => ({
        ...milestone,
        percentage: milestone.percentage === null ? null : Number(milestone.percentage),
      })),
      payments: eligiblePayments,
      reminders: reminders.filter((reminder) => eligibleReminderIds.has(reminder.id)).map((reminder) => ({
        ...reminder,
        reminderType: reminder.reminderType,
        deliveryStatus: reminder.deliveryStatus,
      })),
      events: eligibleEvents.map((event) => ({
        ...event,
        metadata: (event.metadata ?? null) as Record<string, unknown> | null,
      })),
      timeline: buildDepositGuardTimelineEntries(
        eligibleEvents.map((event) => ({
          ...event,
          metadata: (event.metadata ?? null) as Record<string, unknown> | null,
        })),
      ),
    }
  })
}