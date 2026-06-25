import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { verifyTurnstile } from "@/lib/auth/verifyTurnstile"

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  cfToken: z.string().min(1),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const parsed = signInSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { email, password, cfToken } = parsed.data

  const turnstile = await verifyTurnstile(cfToken)
  if (!turnstile.success) {
    return NextResponse.json({ error: turnstile.error }, { status: turnstile.status })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
