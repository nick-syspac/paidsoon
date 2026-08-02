import { NextResponse } from "next/server"
import { Resend } from "resend"
import { prismaAdmin } from "@/lib/db/admin"

const resend = new Resend(process.env.RESEND_API_KEY)

// Computed from the Railway worker's own heartbeat cadence (this Vercel
// project must be given the SAME DISPATCH_INTERVAL_SECONDS value set on the
// Railway worker — see docs/runbooks/README.md env matrix) times a
// multiplier, rather than a hardcoded constant, so the two can't silently
// drift apart. Defaults reproduce the previous hardcoded 20 minutes exactly
// (120s x 10 = 1200s = 20min). Note: this cron itself only runs once daily
// (Vercel Hobby plan caps cron frequency at once per day — see design.md),
// so an outage can go undetected for up to ~24h; tightening this requires a
// Vercel Pro upgrade.
const DISPATCH_INTERVAL_SECONDS = Number(process.env.DISPATCH_INTERVAL_SECONDS ?? "120")
const STALE_THRESHOLD_MULTIPLIER = Number(process.env.STALE_THRESHOLD_MULTIPLIER ?? "10")
const STALE_THRESHOLD_MINUTES = (DISPATCH_INTERVAL_SECONDS * STALE_THRESHOLD_MULTIPLIER) / 60

/**
 * GET /api/cron/scheduling-watchdog
 *
 * Independent Vercel Cron watchdog (design.md "Vercel Watchdog Alerting").
 * Deliberately does NOT call out to Railway — it only reads the heartbeat
 * row the Celery Beat dispatcher writes to Supabase Postgres on every
 * dispatch cycle, so it can detect an outage even if Railway itself is
 * completely unreachable.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const heartbeat = await prismaAdmin.dispatcherHeartbeat.findUnique({
    where: { dispatcher: "celery-beat" },
  })

  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60_000)
  const isStale = !heartbeat || heartbeat.lastRunAt < staleThreshold

  if (isStale) {
    await sendWatchdogAlert(heartbeat?.lastRunAt ?? null)
  }

  return NextResponse.json({
    ok: true,
    stale: isStale,
    lastRunAt: heartbeat?.lastRunAt ?? null,
  })
}

async function sendWatchdogAlert(lastRunAt: Date | null): Promise<void> {
  const alertRecipient = process.env.OPS_ALERT_EMAIL
  if (!alertRecipient) {
    console.error(
      "[scheduling-watchdog] heartbeat is stale but OPS_ALERT_EMAIL is not set — no alert sent",
    )
    return
  }

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: alertRecipient,
      subject: "PaidSoon: Railway scheduling appears to have stopped",
      text: lastRunAt
        ? `The Railway Celery Beat dispatcher's last heartbeat was at ${lastRunAt.toISOString()}, ` +
          `more than ${STALE_THRESHOLD_MINUTES} minutes ago. Scheduled invoice sync and reminder ` +
          `sends may be delayed or stopped.`
        : `No Railway Celery Beat heartbeat has ever been recorded. Scheduled invoice sync and ` +
          `reminder sends may not be running.`,
    })
  } catch (err) {
    console.error("[scheduling-watchdog] failed to send alert email:", err)
  }
}
