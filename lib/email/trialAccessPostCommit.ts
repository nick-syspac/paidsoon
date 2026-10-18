import "server-only"
import type { TrialOperationRequestContext } from "@/lib/billing/trialAccessOperations"
import type { TrialNotificationDeliveryOutcome } from "@/lib/email/trialAccessDelivery"

export type TrialPostCommitDelivery = (userId: string, operationId: string,
  request: TrialOperationRequestContext) => Promise<TrialNotificationDeliveryOutcome | undefined>

/** Access has ALREADY committed. Notification audit/persistence errors propagate
 * through the delivery service, but must never become an access failure/Stripe
 * retry or modify its immutable stored result. Return separate safe uncertainty. */
export async function afterTrialAccessCommit<T extends { operationId: string; status: string; notificationStatus?: string }>(
  userId: string, result: T, request: TrialOperationRequestContext, deliver?: TrialPostCommitDelivery,
): Promise<T & { notification?: TrialNotificationDeliveryOutcome }> {
  if (result.status !== "succeeded" || result.notificationStatus !== "pending") return result
  try {
    const notification = await (deliver ?? (async (tenant, id, context) => {
      const { createTrialAccessSystemDelivery } = await import("@/lib/email/trialAccessDelivery")
      return createTrialAccessSystemDelivery().afterCommit(tenant, id, context)
    }))(userId, result.operationId, request)
    return notification ? { ...result, notification } : result
  } catch {
    return { ...result, notification: { status: "unknown", failureCode: "notification_persistence_unavailable" } }
  }
}