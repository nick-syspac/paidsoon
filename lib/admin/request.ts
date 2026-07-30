import { NextRequest } from "next/server"
import * as crypto from "crypto"

/**
 * Extract IP address from a Next.js request.
 * Vercel sets `x-forwarded-for`; fallback to `x-real-ip`.
 */
export function getIpAddress(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    return xff.split(",")[0].trim()
  }
  return req.headers.get("x-real-ip") ?? "unknown"
}

/**
 * Extract User-Agent from a Next.js request.
 */
export function getUserAgent(req: NextRequest): string {
  return req.headers.get("user-agent") ?? "unknown"
}

/**
 * Generate a short request ID for audit trail correlation.
 */
export function generateRequestId(): string {
  return crypto.randomBytes(8).toString("hex")
}
