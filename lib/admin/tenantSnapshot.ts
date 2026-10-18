/**
 * TenantSnapshot — aggregated view of a single tenant for admin diagnostics.
 *
 * Fetched in one aggregated Prisma pass (+ one Supabase admin API call).
 * All diagnostic checks receive this plain object; none make their own DB calls.
 *
 * Uses `prismaAdmin` (bypasses RLS) — admin-only context.
 * `clientEmail` is explicitly excluded from EmailLog rows (privacy).
 */

import { createClient } from "@supabase/supabase-js"
import { prismaAdmin } from "@/lib/db/admin"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import { EFFECTIVE_ACCESS_GRANT_SELECT, EFFECTIVE_ACCESS_RISK_SELECT } from "@/lib/billing/effectiveAccessSnapshot"
import { safeTrialAccessSnapshot, type SafeTrialPreviewSnapshot } from "@/lib/billing/trialAccessPreview"
import type {
  UserProfile,
  Schedule,
  EmailSettings,
  InvoiceConnection,
  AccountingConnection,
} from "@/lib/generated/prisma/client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceCounts {
  pending: number
  paused: number
  snoozed: number
  sequence_complete: number
  manually_resolved: number
  paid: number
  total: number
}

export interface SafeEmailLog {
  id: string
  stage: number
  sentAt: Date
  resendMessageId: string | null
  fromAddress: string
  subject: string
}

export interface TenantSnapshot {
  profile: UserProfile
  schedule: Schedule | null
  emailSettings: EmailSettings | null
  /** First active Stripe Connect invoice connection, or null if not connected */
  stripeInvoiceConn: InvoiceConnection | null
  accountingConns: AccountingConnection[]
  invoiceCounts: InvoiceCounts
  /** Last 30 days of email logs — clientEmail excluded */
  recentEmailLogs: SafeEmailLog[]
  supabaseEmail: string
  supabaseLastSignIn: string | null
  /** Persisted health facts only; no owner journal/contact/Stripe preflight. */
  subscriptionAccess: SafeTrialPreviewSnapshot | null
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a complete TenantSnapshot for a given userId (Supabase auth UID).
 * Returns null if no UserProfile exists for that userId.
 */
export async function fetchTenantSnapshot(userId: string): Promise<TenantSnapshot | null> {
  // Run all DB queries in parallel
  const [
    profile,
    schedule,
    emailSettings,
    invoiceConns,
    accountingConns,
    invoiceCountRows,
    recentEmailLogRows,
  ] = await Promise.all([
    prismaAdmin.userProfile.findUnique({ where: { userId } }),
    prismaAdmin.schedule.findUnique({ where: { userId } }),
    prismaAdmin.emailSettings.findUnique({ where: { userId } }),
    prismaAdmin.invoiceConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prismaAdmin.accountingConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    // Count tracked invoices by status
    prismaAdmin.trackedInvoice.groupBy({
      by: ["status"],
      where: { userId },
      _count: { id: true },
    }),
    // Last 30 days of email logs — join via trackedInvoice; exclude clientEmail
    prismaAdmin.emailLog.findMany({
      where: {
        trackedInvoice: { userId },
        sentAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        stage: true,
        sentAt: true,
        resendMessageId: true,
        fromAddress: true,
        subject: true,
      },
      orderBy: { sentAt: "desc" },
      take: 200,
    }),
  ])

  if (!profile) return null

  // Narrow privileged health reads for already-authorized admin staff. Select
  // only access facts, never operator reasons, operation IDs or provider IDs.
  // An unavailable access store must not take down the existing health view.
  let subscriptionAccess: SafeTrialPreviewSnapshot | null = null
  try {
    const [grant, billingRisks] = await Promise.all([
      prismaAdmin.tenantTrialGrant.findUnique({ where: { userId }, select: EFFECTIVE_ACCESS_GRANT_SELECT }),
      prismaAdmin.tenantBillingRisk.findMany({ where: { userId }, select: EFFECTIVE_ACCESS_RISK_SELECT }),
    ])
    subscriptionAccess = safeTrialAccessSnapshot(
      resolveEffectiveAccess({ profile, grant, billingRisks, platformOwnerAccess: await readPlatformOwnerAccess(userId) }, new Date()), profile,
    )
  } catch {
    // Null is explicitly unavailable, not an absent grant or an access decision.
  }

  // Build invoice counts
  const invoiceCounts: InvoiceCounts = {
    pending: 0,
    paused: 0,
    snoozed: 0,
    sequence_complete: 0,
    manually_resolved: 0,
    paid: 0,
    total: 0,
  }
  for (const row of invoiceCountRows) {
    const n = row._count.id
    invoiceCounts.total += n
    const s = row.status as keyof typeof invoiceCounts
    if (s in invoiceCounts) invoiceCounts[s] += n
  }

  // First active Stripe Connect connection
  const stripeInvoiceConn =
    invoiceConns.find((c) => c.provider === "stripe" && c.isActive && c.stripeConnectAccountId) ??
    null

  // Fetch Supabase user email + last sign-in (requires service role key)
  let supabaseEmail = ""
  let supabaseLastSignIn: string | null = null
  if (process.env.SUPABASE_SECRET_KEY) {
    try {
      const supabase = createClient(
        getPublicSupabaseEnvironment().publicUrl,
        process.env.SUPABASE_SECRET_KEY
      )
      const { data } = await supabase.auth.admin.getUserById(userId)
      if (data?.user) {
        supabaseEmail = data.user.email ?? ""
        supabaseLastSignIn = data.user.last_sign_in_at ?? null
      }
    } catch {
      // Non-fatal — email unavailable
    }
  }

  return {
    profile,
    schedule,
    emailSettings,
    stripeInvoiceConn,
    accountingConns,
    invoiceCounts,
    recentEmailLogs: recentEmailLogRows,
    supabaseEmail,
    supabaseLastSignIn,
    subscriptionAccess,
  }
}
