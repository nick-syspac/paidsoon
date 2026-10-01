import { NextResponse } from "next/server"

import { getSubscriptionTier } from "@/lib/billing"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import {
  getSpendLeakSourceSettings,
  spendLeakSourceSettingsUpdateSchema,
  updateSpendLeakSourceSettings,
} from "@/lib/spendleak/sourceSettings"
import { createClient } from "@/lib/supabase/server"

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessSpendLeak(tier)) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const settings = await getSpendLeakSourceSettings(user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[GET /api/settings/spendleak] Failed to load settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessSpendLeak(tier)) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = spendLeakSourceSettingsUpdateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const settings = await updateSpendLeakSourceSettings(user.id, parsed.data.enabledSourceTypes)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[PUT /api/settings/spendleak] Failed to save settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
