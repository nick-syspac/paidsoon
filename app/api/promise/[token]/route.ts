import { prismaAdmin as prisma } from "@/lib/db/admin"
import { NextResponse } from "next/server"
import { z } from "zod"
import { sendP2PNotification, resolveFreelancerName } from "@/lib/email/send"
import { createClient } from "@supabase/supabase-js"
import {
  resolvePromiseEscalationPolicy,
  shouldBlockClientPromise,
} from "@/lib/promiseEscalationPolicy"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

// Task 4.3 — Zod schema for the promise submission body
const PromiseBodySchema = z.object({
  promisedPayBy: z.string().datetime(),
  promisedAmount: z.number().int().positive().optional(),
  clientNotes: z.string().max(500).optional(),
}).strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Look up invoice by stable p2p token
  const invoice = await prisma.trackedInvoice.findUnique({
    where: { p2pToken: token },
  })

  if (!invoice) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  // Reject if invoice is already settled
  if (invoice.status === "paid" || invoice.status === "manually_resolved") {
    return NextResponse.json({ error: "Invoice already settled" }, { status: 409 })
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = PromiseBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 }
    )
  }

  const { promisedPayBy, promisedAmount, clientNotes } = parsed.data

  // Public client promise flow only supports full-payment commitments.
  if (promisedAmount != null && promisedAmount !== invoice.amountDue) {
    return NextResponse.json(
      { error: "Only full-payment commitments are allowed for this link" },
      { status: 422 }
    )
  }

  // Reject past dates
  const promisedDate = new Date(promisedPayBy)
  if (promisedDate <= new Date()) {
    return NextResponse.json(
      { error: "promisedPayBy must be a future date" },
      { status: 422 }
    )
  }

  const [policy, brokenCount] = await Promise.all([
    prisma.promiseEscalationPolicy.findUnique({
      where: { userId: invoice.userId },
      select: {
        retryLimit: true,
        escalationThreshold: true,
        timingEscalationEnabled: true,
        toneEscalationEnabled: true,
      },
    }),
    prisma.promiseToPay.count({
      where: {
        userId: invoice.userId,
        status: "broken",
        trackedInvoice: { clientEmail: invoice.clientEmail },
      },
    }),
  ])

  const resolvedPolicy = resolvePromiseEscalationPolicy(policy)
  if (shouldBlockClientPromise(brokenCount, resolvedPolicy.retryLimit)) {
    return NextResponse.json(
      {
        error:
          "This client link can no longer accept new payment commitments. Please contact the freelancer directly.",
      },
      { status: 422 }
    )
  }

  // Atomically: supersede any active promise, then create the new one.
  // prismaAdmin is used here (documented RLS bypass — userId sourced from DB lookup,
  // not from the request body; client has no Supabase session).
  const [, newPromise] = await prisma.$transaction([
    prisma.promiseToPay.updateMany({
      where: { trackedInvoiceId: invoice.id, status: "active" },
      data: { status: "superseded" },
    }),
    prisma.promiseToPay.create({
      data: {
        trackedInvoiceId: invoice.id,
        userId: invoice.userId,
        promisedPayBy: promisedDate,
        promisedAmount: null,
        clientNotes: clientNotes ?? null,
        status: "active",
      },
    }),
  ])

  // Notify freelancer — best-effort, do not fail the request if this errors
  try {
    const supabaseAdmin = createClient(
      getPublicSupabaseEnvironment().publicUrl,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(invoice.userId)
    const freelancerEmail = userData?.user?.email ?? ""
    const profile = await prisma.userProfile.findUnique({
      where: { userId: invoice.userId },
      select: { displayName: true },
    })
    const freelancerName = resolveFreelancerName(
      profile?.displayName,
      userData?.user?.user_metadata?.full_name,
      userData?.user?.email,
    )
    await sendP2PNotification("promise_received", invoice, newPromise, freelancerEmail, freelancerName)
  } catch (err) {
    console.error("P2P notification failed (non-fatal):", err)
  }

  return NextResponse.json({ ok: true })
}
