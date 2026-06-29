/**
 * Support staff customer detail endpoint.
 *
 * GET /api/admin/customers/[userId]
 *
 * Returns full customer context for the support console:
 * - UserProfile with subscription details
 * - Invoice summary (active, overdue counts)
 * - Impersonation session history
 * - Last 10 audit events for this customer
 *
 * Requires platform_admin or platform_support role.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdminElevation } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminElevation()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { userId } = await params

  try {
    // Profile
    const profile = await prismaAdmin.userProfile.findUnique({
      where: { userId },
    })

    if (!profile) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Email from Supabase auth
    const supabase = await createClient()
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)
    const email = !authError ? authUser?.user?.email || null : null

    // Invoice summary
    const invoices = await prismaAdmin.trackedInvoice.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        amountDue: true,
        currency: true,
        dueDate: true,
        clientName: true,
      },
      orderBy: { dueDate: "asc" },
    })

    const activeInvoices = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled")
    const overdueInvoices = activeInvoices.filter(
      (inv) => inv.dueDate != null && inv.dueDate < new Date() && inv.status !== "paid"
    )

    // Impersonation session history (last 5)
    const impersonationSessions = await prismaAdmin.adminSession.findMany({
      where: { impersonatedUserId: userId },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        duration: true,
        actionCount: true,
        notifyCustomer: true,
        revokedAt: true,
      },
    })

    // Recent audit events for this customer (last 10)
    const recentAudit = await prismaAdmin.adminAuditEvent.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        success: true,
        reason: true,
        createdAt: true,
      },
    })

    // Invoice connection (stripe connect)
    const invoiceConnection = await prismaAdmin.invoiceConnection.findFirst({
      where: { userId, provider: "stripe" },
      select: { isActive: true, createdAt: true },
    })

    return NextResponse.json({
      profile: {
        userId: profile.userId,
        email,
        displayName: profile.displayName,
        subscriptionTier: profile.subscriptionTier,
        subscriptionStatus: profile.subscriptionStatus,
        stripeCustomerId: profile.stripeCustomerId,
        trialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
        onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
      invoiceSummary: {
        total: invoices.length,
        active: activeInvoices.length,
        overdue: overdueInvoices.length,
        invoices: activeInvoices.map((inv) => ({
          id: inv.id,
          status: inv.status,
          amountDue: inv.amountDue,
          currency: inv.currency,
          dueDate: inv.dueDate?.toISOString() ?? null,
          clientName: inv.clientName,
          isPaused: inv.status === "paused",
        })),
      },
      stripeConnected: !!invoiceConnection?.isActive,
      impersonationSessions: impersonationSessions.map((s) => ({
        id: s.id,
        staffUserId: s.userId,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        duration: s.duration,
        actionCount: s.actionCount,
        notifyCustomer: s.notifyCustomer,
        wasRevoked: !!s.revokedAt,
      })),
      recentAudit: recentAudit.map((e) => ({
        id: e.id,
        action: e.action,
        actorEmail: e.actorEmail,
        success: e.success,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error("[customer-detail]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
