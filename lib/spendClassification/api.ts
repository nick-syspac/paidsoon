import "server-only"

import "server-only"

import { createClient } from "@/lib/supabase/server"

export async function getAuthenticatedSpendClassificationUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
