import "server-only"
import { Resend } from "resend"
import { z } from "zod"
import { isUndeliverableAddress } from "@/lib/email/deliveryGuard"
import type { TrialAccessNotificationPayload } from "@/lib/email/trialAccessNotification"

export type TrialNotificationSendOutcome =
  | { status: "sent"; messageId: string }
  | { status: "not_sent"; code: "invalid_payload" | "invalid_key" | "reserved_recipient" | "missing_configuration" | "provider_rejected" }
  | { status: "unknown"; code: "provider_uncertain" | "invalid_response" }

type Transport = Pick<Resend["emails"], "send">
const keySchema = z.string().regex(/^trial-access\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
const payloadSchema = z.object({
  from: z.string().min(1).max(512).refine((s) => !/[\r\n\u0000]/u.test(s)),
  to: z.email().max(254), subject: z.string().min(1).max(200).refine((s) => !/[\r\n\u0000]/u.test(s)),
  html: z.string().min(1), text: z.string().min(1),
}).strict()
// Explicit rejection evidence only. Conflicts involving an idempotency key may
// mean an earlier request was accepted; HTTP status alone never proves unsent.
const rejectionStatuses: Readonly<Record<string, readonly number[]>> = {
  invalid_idempotency_key: [400], validation_error: [400, 422], missing_api_key: [401],
  restricted_api_key: [401, 403], invalid_api_key: [400, 401, 403], not_found: [404],
  method_not_allowed: [405], invalid_attachment: [400, 422], invalid_from_address: [400, 422],
  invalid_access: [401, 403], invalid_parameter: [400, 422], invalid_region: [400, 422],
  missing_required_field: [400, 422], monthly_quota_exceeded: [429], daily_quota_exceeded: [429],
  rate_limit_exceeded: [429],
}
function providerFailure(error: unknown): TrialNotificationSendOutcome {
  const parsed = z.object({ name: z.string(), statusCode: z.number().int() }).safeParse(error)
  return parsed.success && Object.hasOwn(rejectionStatuses, parsed.data.name) &&
    rejectionStatuses[parsed.data.name].includes(parsed.data.statusCode)
    ? { status: "not_sent", code: "provider_rejected" }
    : { status: "unknown", code: "provider_uncertain" }
}

/** Tenant transactional exception to invoice follow-ups (D8), like digest sends.
 * No DB, EmailLog, claims, retries, key generation, recipient resolution or access
 * mutation. Task 7.3 must durably freeze payload/key and authorize/claim delivery
 * before calling this once. No raw errors, recipients, payloads or keys are logged.
 */
export function createTrialAccessNotificationSender(dependencies?: {
  transport: () => Transport
}): {
  send(payload: Readonly<TrialAccessNotificationPayload>, idempotencyKey: string): Promise<TrialNotificationSendOutcome>
} {
  let resend: Resend | undefined
  return {
    async send(payload, idempotencyKey) {
      const parsed = payloadSchema.safeParse(payload)
      if (!parsed.success) return { status: "not_sent", code: "invalid_payload" }
      if (!keySchema.safeParse(idempotencyKey).success) return { status: "not_sent", code: "invalid_key" }
      if (isUndeliverableAddress(parsed.data.to)) return { status: "not_sent", code: "reserved_recipient" }
      if (!dependencies && !process.env.RESEND_API_KEY?.trim()) return { status: "not_sent", code: "missing_configuration" }
      // Client construction cannot have dispatched. Keep its errors private.
      let transport: Transport
      try { transport = dependencies?.transport() ?? (resend ??= new Resend(process.env.RESEND_API_KEY)).emails }
      catch { return { status: "not_sent", code: "missing_configuration" } }
      try {
        const response = await transport.send(parsed.data, { idempotencyKey })
        if (!response || typeof response !== "object") return { status: "unknown", code: "invalid_response" }
        if (response.error) return response.data != null
          ? { status: "unknown", code: "invalid_response" }
          : providerFailure(response.error)
        const id = response.data?.id
        // A malformed 2xx may already have been accepted: never invent success
        // or a definitive-unsent result, even for a missing/blank message ID.
        if (response.error !== null || typeof id !== "string" || !id.trim() || id !== id.trim() || /[\u0000-\u0020\u007f]/u.test(id)) {
          return { status: "unknown", code: "invalid_response" }
        }
        return { status: "sent", messageId: id }
      } catch (error) { return providerFailure(error) }
    },
  }
}