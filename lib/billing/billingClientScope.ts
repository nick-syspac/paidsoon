import { createHash } from "node:crypto"

/** Server-rendered opaque browser scope, not a user/provider identifier or authority.
 * Use the verified JWT session_id, not global last_sign_in_at (another device can change it).
 * Token rotation preserves session_id. Never pass the input to a client.
 */
export function billingClientScope(userId: string, sessionId: string): string {
  return createHash("sha256").update(`billing-client/v1:${userId}:${sessionId}`).digest("hex")
}