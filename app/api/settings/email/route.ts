import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { requirePro } from "@/lib/billing"
import { Resend } from "resend"
import { NextResponse } from "next/server"
import { z } from "zod"

let _resend: Resend | undefined
function getResend(): Resend {
  return _resend ?? (_resend = new Resend(process.env.RESEND_API_KEY!))
}

const updateSchema = z.object({
  fromEmail: z.string().email(),
  fromName: z.string().min(1).max(100),
  replyTo: z.string().email().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let settings = await withUserContext(user.id, (tx) =>
    tx.emailSettings.findUnique({ where: { userId: user.id } }),
  )

  // Poll Resend to detect when sender domain verification completes.
  // Only runs when a custom from-address is configured but not yet verified.
  if (settings?.fromEmail && !settings.resendVerified) {
    try {
      const { data: domains } = await getResend().domains.list()
      const domainName = settings.fromEmail.split("@")[1]
      const match = domains?.data?.find((d) => d.name === domainName)
      if (match?.status === "verified") {
        settings = await withUserContext(user.id, (tx) =>
          tx.emailSettings.update({
            where: { userId: user.id },
            data: { resendVerified: true },
          }),
        )
      }
    } catch {
      // Resend unreachable — return stored settings unchanged
    }
  }

  return NextResponse.json({ settings })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isPro = await requirePro(user.id)
  if (!isPro) {
    return NextResponse.json(
      { error: "Pro subscription required" },
      { status: 403 }
    )
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { fromEmail, fromName, replyTo } = parsed.data

  const emailChanged = await withUserContext(user.id, async (tx) => {
    const existing = await tx.emailSettings.findUnique({
      where: { userId: user.id },
    })
    const changed = existing?.fromEmail !== fromEmail

    await tx.emailSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fromEmail,
        fromName,
        replyTo,
        resendVerified: false,
      },
      update: {
        fromEmail,
        fromName,
        replyTo,
        ...(changed ? { resendVerified: false } : {}),
      },
    })
    return changed
  })

  // Trigger Resend sender verification if email changed
  if (emailChanged) {
    try {
      await getResend().domains.create({
        name: fromEmail.split("@")[1],
        region: "us-east-1",
      })
    } catch {
      // Domain may already exist — that's fine.
      // Resend's sender verification works at the email level.
    }
  }

  return NextResponse.json({ success: true, verificationTriggered: emailChanged })
}
