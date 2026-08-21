import { createHmac, timingSafeEqual } from "crypto"

/**
 * Resend delivers webhook events using the Svix signing scheme: headers
 * `svix-id` / `svix-timestamp` / `svix-signature`, HMAC-SHA256 over
 * `{id}.{timestamp}.{body}` keyed by the base64 portion of the `whsec_...`
 * secret. Verified manually here (no `svix` dependency) since this is the
 * only place that scheme is needed.
 */
const TOLERANCE_SECONDS = 5 * 60

export interface ResendWebhookHeaders {
  "svix-id"?: string | null
  "svix-timestamp"?: string | null
  "svix-signature"?: string | null
}

/**
 * Verifies a Resend/Svix webhook signature against the raw request body.
 * Returns false for any malformed header, expired timestamp, or mismatch —
 * never throws, so callers can treat any falsy result as "reject".
 */
export function verifyResendWebhookSignature(
  payload: string,
  headers: ResendWebhookHeaders,
  secret: string,
): boolean {
  const svixId = headers["svix-id"]
  const svixTimestamp = headers["svix-timestamp"]
  const svixSignature = headers["svix-signature"]
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const timestampSeconds = Number(svixTimestamp)
  if (!Number.isFinite(timestampSeconds)) return false
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > TOLERANCE_SECONDS) return false

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest()

  return svixSignature.split(" ").some((entry) => {
    const [, providedBase64] = entry.split(",")
    if (!providedBase64) return false
    const provided = Buffer.from(providedBase64, "base64")
    return provided.length === expected.length && timingSafeEqual(provided, expected)
  })
}

export type ResendDeliveryEventType =
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | (string & {})

export interface ResendWebhookEvent {
  type: ResendDeliveryEventType
  data: { email_id?: string }
}

const EVENT_TYPE_TO_STATUS: Record<string, "delivered" | "bounced" | "complained"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
}

/** Maps a Resend event type to the `EmailLog.status` value it represents, or null if not a tracked delivery event. */
export function resolveEmailLogStatus(eventType: string): "delivered" | "bounced" | "complained" | null {
  return EVENT_TYPE_TO_STATUS[eventType] ?? null
}
