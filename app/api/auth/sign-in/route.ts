import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

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

  const supabase = await createClient()
  // captchaToken is verified by Supabase against the configured Turnstile provider
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: cfToken },
  })

  if (error) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
