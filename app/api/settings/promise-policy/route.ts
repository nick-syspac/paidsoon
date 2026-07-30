import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"
import { resolvePromiseEscalationPolicy } from "@/lib/promiseEscalationPolicy"

const PromisePolicySchema = z
  .object({
    retryLimit: z.number().int().min(1).max(10),
    escalationThreshold: z.number().int().min(1).max(10),
    timingEscalationEnabled: z.boolean(),
    toneEscalationEnabled: z.boolean(),
  })
  .strict()

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const policy = await withUserContext(user.id, (tx) =>
    tx.promiseEscalationPolicy.findUnique({ where: { userId: user.id } }),
  )

  return NextResponse.json({
    policy: resolvePromiseEscalationPolicy(policy),
  })
}

export async function PUT(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = PromisePolicySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  await withUserContext(user.id, (tx) =>
    tx.promiseEscalationPolicy.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...parsed.data,
      },
      update: parsed.data,
    }),
  )

  return NextResponse.json({ success: true })
}
