import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"
import { retrieveSubscriptionWithLatestInvoice } from "@/lib/billing/stripeSubscriptions"
import Stripe from "stripe"

const ExtendTrialSchema = z.object({
  days: z.number().int().min(1).max(30),
})

/**
 * POST /api/admin/tenants/[id]/actions/extend-trial
 *
 * Extends the tenant's Stripe trial end date by N days (1–30).
 * Only valid for tenants with a trialing Stripe subscription.
 *
 * Body: { days: number }
 * Requires full admin elevation. Target [id] is the tenant's userId.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: tenantUserId } = await params
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  // Validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = ExtendTrialSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { days } = parsed.data

  // Verify tenant exists and is trialing
  const profile = await prismaAdmin.userProfile.findUnique({
    where: { userId: tenantUserId },
    select: {
      userId: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  })
  if (!profile) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }
  if (profile.subscriptionStatus !== "trialing") {
    return NextResponse.json(
      { error: "Tenant is not in trialing status", subscriptionStatus: profile.subscriptionStatus },
      { status: 409 }
    )
  }

  if (!profile.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "Tenant has no Stripe subscription to extend" },
      { status: 409 },
    )
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
  })

  try {
    const currentSubscription = await retrieveSubscriptionWithLatestInvoice(
      stripe,
      profile.stripeSubscriptionId,
    )
    if (currentSubscription.status !== "trialing") {
      return NextResponse.json(
        {
          error: "Stripe subscription is not in trialing status",
          subscriptionStatus: currentSubscription.status,
        },
        { status: 409 },
      )
    }

    const currentTrialEnd = currentSubscription.trial_end
      ? new Date(currentSubscription.trial_end * 1000)
      : profile.trialEndsAt

    if (!currentTrialEnd) {
      return NextResponse.json(
        { error: "Stripe subscription has no trial end to extend" },
        { status: 409 },
      )
    }

    const newTrialEndsAt = new Date(currentTrialEnd.getTime() + days * 24 * 60 * 60 * 1000)
    const updatedSubscription = await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      trial_end: Math.floor(newTrialEndsAt.getTime() / 1000),
    })

    const effectiveTrialEndsAt = updatedSubscription.trial_end
      ? new Date(updatedSubscription.trial_end * 1000)
      : newTrialEndsAt

    const latestInvoice = currentSubscription.latest_invoice as Stripe.Invoice | null
    const periodStart = latestInvoice?.period_start ? new Date(latestInvoice.period_start * 1000) : null
    const periodEnd = latestInvoice?.period_end ? new Date(latestInvoice.period_end * 1000) : null

    await prismaAdmin.userProfile.update({
      where: { userId: tenantUserId },
      data: {
        trialEndsAt: effectiveTrialEndsAt,
        subscriptionStatus: updatedSubscription.status,
        stripeCustomerId:
          typeof updatedSubscription.customer === "string"
            ? updatedSubscription.customer
            : profile.stripeCustomerId,
        stripePriceId: updatedSubscription.items.data[0]?.price?.id ?? null,
        subscriptionCurrentPeriodStart: periodStart,
        subscriptionCurrentPeriodEnd: periodEnd,
        subscriptionCancelAt: updatedSubscription.cancel_at
          ? new Date(updatedSubscription.cancel_at * 1000)
          : null,
        subscriptionCancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
      },
    })

    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "user_profile",
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: true,
      metadata: {
        action: "extend-trial",
        days,
        previousTrialEndsAt: currentTrialEnd?.toISOString() ?? null,
        newTrialEndsAt: effectiveTrialEndsAt.toISOString(),
        stripeSubscriptionId: profile.stripeSubscriptionId,
      },
    })

    return NextResponse.json({ success: true, newTrialEndsAt: effectiveTrialEndsAt.toISOString() })
  } catch (err) {
    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "user_profile",
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: false,
      reason: err instanceof Error ? err.message : "Unknown error",
      metadata: { action: "extend-trial", days },
    })
    console.error("[POST /api/admin/tenants/[id]/actions/extend-trial] Failed to extend trial", err)
    return NextResponse.json({ error: "Failed to extend trial" }, { status: 500 })
  }
}
