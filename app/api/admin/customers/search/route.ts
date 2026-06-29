/**
 * Support staff customer search endpoint.
 *
 * GET /api/admin/customers/search?q=email
 *
 * Returns a list of customers matching the email query (partial, case-insensitive).
 * Requires platform_admin or platform_support role.
 * All queries are logged as AdminAuditEvent for transparency.
 */

import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminElevation } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { prismaAdmin } from "@/lib/db/admin"
import { createClient } from "@/lib/supabase/server"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CustomerSearchQuerySchema = z.object({
  q: z
    .string()
    .min(3, "Search query must be at least 3 characters")
    .max(255, "Search query must be at most 255 characters")
    .toLowerCase()
    .trim(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
})

export interface CustomerSearchResult {
  userId: string
  email: string
  displayName: string | null
  subscriptionTier: string
  subscriptionStatus: string
  stripeCustomerId: string | null
  createdAt: string
  lastSeenAt: string | null
}

// ---------------------------------------------------------------------------
// Helper: Get most recent admin audit event for a customer
// ---------------------------------------------------------------------------

async function getLastSeenAt(userId: string): Promise<string | null> {
  const event = await prismaAdmin.adminAuditEvent.findFirst({
    where: { targetUserId: userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  return event?.createdAt.toISOString() ?? null
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  const ipAddress = getIpAddress(request)
  const userAgent = getUserAgent(request)

  try {
    // Guard: admin elevation
    let guardContext
    try {
      guardContext = await requireAdminElevation()
    } catch (err) {
      // Elevation failed — 401 is logged automatically by middleware
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get("q")
    const limit = searchParams.get("limit")

    const parsed = CustomerSearchQuerySchema.safeParse({ q, limit })
    if (!parsed.success) {
      // Log failed search attempt
      await logAdminEvent({
        actorUserId: guardContext.userId,
        actorEmail: guardContext.userEmail,
        platformRole: guardContext.platformRole.role,
        adminSessionId: guardContext.adminSession.id,
        action: "customer_search",
        ipAddress,
        userAgent,
        requestId,
        success: false,
        reason: `Invalid search query: ${parsed.error.issues.map((e: { message: string }) => e.message).join(", ")}`,
        details: { query: q },
      })

      return NextResponse.json(
        {
          error: "Invalid search query",
          details: parsed.error.issues,
        },
        { status: 400 }
      )
    }

    const { q: query, limit: queryLimit } = parsed.data

    // Search in Supabase Auth
    const supabase = await createClient()
    const {
      data: { users: authUsers },
      error: authError,
    } = await supabase.auth.admin.listUsers()

    if (authError) {
      throw new Error(`Failed to list users from auth: ${authError.message}`)
    }

    // Filter by email (case-insensitive partial match)
    const matchedAuthUsers = (authUsers || []).filter((user) =>
      user.email?.toLowerCase().includes(query)
    )

    // Look up UserProfiles for matched users
    const userIds = matchedAuthUsers.map((u) => u.id)
    const profiles = await prismaAdmin.userProfile.findMany({
      where: { userId: { in: userIds } },
      take: queryLimit,
    })

    // Build response with lastSeenAt derived from audit events
    const results: CustomerSearchResult[] = await Promise.all(
      profiles.map(async (profile) => ({
        userId: profile.userId,
        email: matchedAuthUsers.find((u) => u.id === profile.userId)?.email || "",
        displayName: profile.displayName,
        subscriptionTier: profile.subscriptionTier,
        subscriptionStatus: profile.subscriptionStatus,
        stripeCustomerId: profile.stripeCustomerId,
        createdAt: profile.createdAt.toISOString(),
        lastSeenAt: await getLastSeenAt(profile.userId),
      }))
    )

    // Log successful search
    await logAdminEvent({
      actorUserId: guardContext.userId,
      actorEmail: guardContext.userEmail,
      platformRole: guardContext.platformRole.role,
      adminSessionId: guardContext.adminSession.id,
      action: "customer_search",
      ipAddress,
      userAgent,
      requestId,
      success: true,
      details: {
        query,
        resultsCount: results.length,
      },
    })

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[customer-search]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
