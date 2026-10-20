import { NextResponse } from "next/server"

import { requireFeature } from "@/lib/billing"
import { getCommitGuardSettings, saveCommitGuardSettings } from "@/lib/commitguard/service"
import { CommitGuardSettingsSchema as SettingsSchema } from "@/lib/commitguard/settingsSchema"
import { CommitGuardSettingsImportSchema } from "@/lib/commitguard/settingsTransfer"
import { createClient } from "@/lib/supabase/server"

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
export const PUT = withSubscriptionAccess(PUTHandler)
async function GETHandler(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const settings = await getCommitGuardSettings(user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[GET /api/commitguard/settings] Failed to load settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function PUTHandler(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  // Transfer uses the same authenticated policy endpoint and atomic mutation path,
  // but an untagged imported amount must not inherit the destination's currency.
  const schema = request.headers.get("X-CommitGuard-Settings-Transfer") === "import"
    ? CommitGuardSettingsImportSchema
    : SettingsSchema
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const settings = await saveCommitGuardSettings(user.id, parsed.data)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[PUT /api/commitguard/settings] Failed to save settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
