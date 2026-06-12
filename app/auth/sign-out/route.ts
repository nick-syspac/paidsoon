import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { redirect } from "next/navigation"

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}

// Handle GET for form submissions without JS
export async function GET() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL!))
}
