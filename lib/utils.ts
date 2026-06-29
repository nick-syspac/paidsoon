import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { NextRequest } from "next/server"
import { randomUUID } from "crypto"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract client IP address from NextRequest headers.
 * Checks X-Forwarded-For (Vercel, proxies) first, then CF-Connecting-IP (Cloudflare),
 * then falls back to socket.remoteAddress.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }

  const cloudflare = request.headers.get("cf-connecting-ip")
  if (cloudflare) {
    return cloudflare
  }

  return "unknown"
}

/**
 * Extract user agent from NextRequest headers.
 */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get("user-agent") || "unknown"
}

/**
 * Generate a random request ID (UUID v4) for tracing.
 */
export function generateRequestId(): string {
  return randomUUID()
}
