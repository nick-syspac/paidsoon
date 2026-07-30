import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prismaAdmin } from "@/lib/db/admin"
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/guard"

async function revokeActiveAdminSessionForUser(userId: string) {
  try {
    await prismaAdmin.adminSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  } catch {
    // Non-fatal: sign-out proceeds regardless
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await revokeActiveAdminSessionForUser(user.id)
  }

  await supabase.auth.signOut()

  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)

  redirect("/")
}

// Handle GET for form submissions without JS
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await revokeActiveAdminSessionForUser(user.id)
  }

  await supabase.auth.signOut()

  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)

  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL!))
}
