import { createClient } from "@supabase/supabase-js"

import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

export async function fetchOwnersDigestRecipientEmail(userId: string): Promise<string | null> {
  const supabaseAdmin = createClient(
    getPublicSupabaseEnvironment().publicUrl,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}
