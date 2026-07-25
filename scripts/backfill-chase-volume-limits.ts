/**
 * scripts/backfill-chase-volume-limits.ts
 *
 * One-off backfill for the monthly-chase-volume-limits change
 * (openspec/changes/monthly-chase-volume-limits). Populates the two new
 * columns added by the accompanying migration so the new allowance model has
 * correct historical data to work from:
 *
 *   1. `TrackedInvoice.firstChasedAt` — set from the earliest `EmailLog.sentAt`
 *      for every invoice with `currentStage > 0` (i.e. already chased) that
 *      doesn't have it set yet. Rows with `currentStage === 0` are left null,
 *      which is correct — they have never been chased. Any row with
 *      `currentStage > 0` that resolves no EmailLog row at all is reported
 *      (it means the log was pruned or the row predates email_logs) rather
 *      than silently skipped.
 *
 *   2. `UserProfile.subscriptionCurrentPeriodStart` — set for every account
 *      with a `stripeSubscriptionId` and no `subscriptionCurrentPeriodStart`
 *      yet, by fetching the subscription's latest invoice `period_start`
 *      from Stripe. Accounts with no subscription are left null, so the
 *      trial-window / calendar-month fallback in `resolveAllowancePeriod`
 *      (lib/billing.ts) applies.
 *
 * Idempotent: only touches rows where the target column is still null, so
 * it is safe to re-run.
 *
 * Usage:
 *   node --import tsx scripts/backfill-chase-volume-limits.ts
 *
 * Required env vars: DATABASE_URL, STRIPE_SECRET_KEY
 */
import "./_loadEnv"
import { prismaAdmin } from "@/lib/db/admin"
import Stripe from "stripe"

async function backfillFirstChasedAt() {
  const candidates = await prismaAdmin.trackedInvoice.findMany({
    where: { currentStage: { gt: 0 }, firstChasedAt: null },
    select: { id: true },
  })

  console.log(`firstChasedAt: ${candidates.length} chased invoice(s) missing a timestamp`)

  let updated = 0
  const unresolved: string[] = []

  for (const invoice of candidates) {
    const earliestLog = await prismaAdmin.emailLog.findFirst({
      where: { trackedInvoiceId: invoice.id },
      orderBy: { sentAt: "asc" },
      select: { sentAt: true },
    })

    if (!earliestLog) {
      unresolved.push(invoice.id)
      continue
    }

    await prismaAdmin.trackedInvoice.update({
      where: { id: invoice.id },
      data: { firstChasedAt: earliestLog.sentAt },
    })
    updated++
  }

  console.log(`firstChasedAt: backfilled ${updated} row(s)`)
  if (unresolved.length > 0) {
    console.warn(
      `firstChasedAt: ${unresolved.length} chased invoice(s) resolved no EmailLog row and were left null:`,
      unresolved,
    )
  }
}

async function backfillSubscriptionPeriodStart() {
  const candidates = await prismaAdmin.userProfile.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      subscriptionCurrentPeriodStart: null,
    },
    select: { userId: true, stripeSubscriptionId: true },
  })

  console.log(
    `subscriptionCurrentPeriodStart: ${candidates.length} account(s) with a subscription missing a period start`,
  )

  if (candidates.length === 0) return

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
  })

  let updated = 0
  const failed: string[] = []

  for (const profile of candidates) {
    try {
      const subscription = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId!, {
        expand: ["latest_invoice"],
      })
      const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
      const periodStart = latestInvoice?.period_start
        ? new Date(latestInvoice.period_start * 1000)
        : null

      if (!periodStart) {
        failed.push(profile.userId)
        continue
      }

      await prismaAdmin.userProfile.update({
        where: { userId: profile.userId },
        data: { subscriptionCurrentPeriodStart: periodStart },
      })
      updated++
    } catch (err) {
      console.error(`subscriptionCurrentPeriodStart: failed for ${profile.userId}:`, err)
      failed.push(profile.userId)
    }
  }

  console.log(`subscriptionCurrentPeriodStart: backfilled ${updated} row(s)`)
  if (failed.length > 0) {
    console.warn(
      `subscriptionCurrentPeriodStart: ${failed.length} account(s) left null (no resolvable period start) — the trial/calendar-month fallback applies:`,
      failed,
    )
  }
}

async function main() {
  await backfillFirstChasedAt()
  await backfillSubscriptionPeriodStart()
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prismaAdmin.$disconnect()
  })
