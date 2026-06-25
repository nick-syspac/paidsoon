import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  cfToken: z.string().min(1),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const parsed = signUpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { email, password, cfToken } = parsed.data

  const supabase = await createClient()
  // captchaToken is verified by Supabase against the configured Turnstile provider
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken: cfToken,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Session is live (email confirmation disabled or auto-confirmed)
  if (data.session) {
    return NextResponse.json({ ok: true, status: "session" })
  }

  // Email confirmation required
  return NextResponse.json({ ok: true, status: "check-email" })
}
